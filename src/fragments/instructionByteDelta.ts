import { CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE, CodamaError } from '@codama/errors';
import { mapFragmentContent } from '@codama/fragments';
import { assertIsNode, InstructionByteDeltaNode, InstructionNode } from '@codama/nodes';
import { getLastNodeFromPath, NodePath, pipe } from '@codama/visitors-core';

import {
    Fragment,
    fragment,
    getAccountSize,
    getByteDeltaResolver,
    getDataPathExpression,
    mergeFragments,
    RenderScope,
    use,
} from '../utils';
import { getInstructionResolverCallFragment } from './instructionResolver';

/**
 * Renders the `byteDelta` variable of an instruction builder, summing the bytes each byte
 * delta of the instruction creates or reallocates.
 *
 * @param scope - The render scope, the path of the instruction and whether the builder is asynchronous.
 * @return The fragment declaring `byteDelta`, if the instruction has byte deltas.
 * @throws `CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE` when a byte delta is given by an
 * account without a fixed size.
 */
export function getInstructionByteDeltaFragment(
    scope: Pick<RenderScope, 'asyncResolvers' | 'getImportFrom' | 'linkables' | 'nameApi'> & {
        instructionPath: NodePath<InstructionNode>;
        useAsync: boolean;
    },
): Fragment | undefined {
    const { byteDeltas } = getLastNodeFromPath(scope.instructionPath);
    const fragments = (byteDeltas ?? []).flatMap(c => getByteDeltaFragment(c, scope));
    if (fragments.length === 0) return;
    return mergeFragments(
        fragments,
        c =>
            `// Bytes created or reallocated by the instruction.\n` +
            `const byteDelta: number = [${c.join(',')}].reduce((a, b) => a + b, 0);`,
    );
}

function getByteDeltaFragment(
    byteDelta: InstructionByteDeltaNode,
    scope: Pick<RenderScope, 'asyncResolvers' | 'getImportFrom' | 'linkables' | 'nameApi'> & {
        instructionPath: NodePath<InstructionNode>;
        useAsync: boolean;
    },
): Fragment[] {
    let bytesFragment = ((): Fragment | undefined => {
        const resolver = getByteDeltaResolver(byteDelta);
        if (resolver) {
            return getInstructionResolverCallFragment(resolver, scope);
        }
        switch (byteDelta.value.kind) {
            case 'integerValueNode':
                return fragment`${byteDelta.value.value}`;
            case 'dataValueNode':
                return fragment`Number(${getDataPathExpression(byteDelta.value.path)})`;
            case 'accountLinkNode':
                return getAccountLinkNodeFragment(byteDelta, scope);
            default:
                throw new CodamaError(CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE, {
                    path: [...scope.instructionPath, byteDelta, byteDelta.value satisfies never],
                });
        }
    })();

    // Asynchronous resolvers have no byte delta in synchronous builders.
    if (!bytesFragment) return [];

    if (byteDelta.withHeader) {
        bytesFragment = fragment`${bytesFragment} + ${use('BASE_ACCOUNT_SIZE', 'solanaAccounts')}`;
    }

    if (byteDelta.subtract) {
        bytesFragment = pipe(bytesFragment, f => mapFragmentContent(f, c => `- (${c})`));
    }

    return [bytesFragment];
}

/**
 * Renders the size of a linked account through its size function, e.g. `getCounterSize()`.
 *
 * @throws `CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE` when the account is in the tree but
 * has no fixed size, so no size function is rendered for it.
 */
function getAccountLinkNodeFragment(
    byteDelta: InstructionByteDeltaNode,
    scope: Pick<RenderScope, 'getImportFrom' | 'linkables' | 'nameApi'> & {
        instructionPath: NodePath<InstructionNode>;
    },
): Fragment {
    const link = byteDelta.value;
    assertIsNode(link, 'accountLinkNode');
    const linkPath = [...scope.instructionPath, byteDelta, link] as const;
    const accountPath = scope.linkables.getPath(linkPath);
    if (accountPath && getAccountSize(accountPath, scope.linkables) === null) {
        throw new CodamaError(CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE, { path: linkPath });
    }
    const functionName = use(scope.nameApi.accountGetSizeFunction(link.identifier), scope.getImportFrom(link));
    return fragment`${functionName}()`;
}
