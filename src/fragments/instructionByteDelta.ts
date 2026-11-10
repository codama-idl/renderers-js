import { mapFragmentContent } from '@codama/fragments';
import { assertIsNode, InstructionByteDeltaNode, InstructionNode, isNode } from '@codama/nodes';
import { getLastNodeFromPath, NodePath, pipe } from '@codama/visitors-core';

import {
    addFragmentFeatures,
    Fragment,
    fragment,
    getByteDeltaResolver,
    getDataPathExpression,
    InstructionResolver,
    isAsyncResolver,
    mergeFragments,
    RenderScope,
    use,
} from '../utils';

export function getInstructionByteDeltaFragment(
    scope: Pick<RenderScope, 'asyncResolvers' | 'getImportFrom' | 'nameApi'> & {
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
    scope: Pick<RenderScope, 'asyncResolvers' | 'getImportFrom' | 'nameApi'> & {
        useAsync: boolean;
    },
): Fragment[] {
    let bytesFragment = ((): Fragment | null => {
        const resolver = getByteDeltaResolver(byteDelta);
        if (resolver) {
            return getResolverFragment(resolver, scope);
        }
        if (isNode(byteDelta.value, 'integerValueNode')) {
            return fragment`${byteDelta.value.value}`;
        }
        if (isNode(byteDelta.value, 'dataValueNode')) {
            return fragment`Number(${getDataPathExpression(byteDelta.value.path)})`;
        }
        if (isNode(byteDelta.value, 'accountLinkNode')) {
            return getAccountLinkNodeFragment(byteDelta, scope);
        }
        return null;
    })();

    if (bytesFragment === null) return [];

    if (byteDelta.withHeader) {
        bytesFragment = fragment`${bytesFragment} + ${use('BASE_ACCOUNT_SIZE', 'solanaAccounts')}`;
    }

    if (byteDelta.subtract) {
        bytesFragment = pipe(bytesFragment, f => mapFragmentContent(f, c => `- (${c})`));
    }

    return [bytesFragment];
}

function getAccountLinkNodeFragment(
    byteDelta: InstructionByteDeltaNode,
    scope: Pick<RenderScope, 'getImportFrom' | 'nameApi'>,
): Fragment {
    assertIsNode(byteDelta.value, 'accountLinkNode');
    const functionName = use(
        scope.nameApi.accountGetSizeFunction(byteDelta.value.identifier),
        scope.getImportFrom(byteDelta.value),
    );
    return fragment`${functionName}()`;
}

function getResolverFragment(
    resolver: InstructionResolver,
    scope: Pick<RenderScope, 'asyncResolvers' | 'getImportFrom' | 'nameApi'> & {
        useAsync: boolean;
    },
): Fragment | null {
    const isAsync = isAsyncResolver(resolver.name, scope.asyncResolvers);
    if (!scope.useAsync && isAsync) return null;

    const awaitKeyword = scope.useAsync && isAsync ? 'await ' : '';
    const functionName = use(scope.nameApi.resolverFunction(resolver.name), scope.getImportFrom(resolver));
    return pipe(fragment`${awaitKeyword}${functionName}(resolverScope)`, f =>
        addFragmentFeatures(f, ['instruction:resolverScopeVariable']),
    );
}
