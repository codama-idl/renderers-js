import { assertIsNode, camelCase, InstructionNode, InstructionRemainingAccountsNode, isNode } from '@codama/nodes';
import { getLastNodeFromPath, NodePath, pipe } from '@codama/visitors-core';

import {
    addFragmentFeatures,
    addFragmentImports,
    Fragment,
    fragment,
    isRemainingAccountsBackedByArgument,
    mergeFragments,
    RenderScope,
    use,
} from '../utils';

export function getInstructionRemainingAccountsFragment(
    scope: Pick<RenderScope, 'asyncResolvers' | 'getImportFrom' | 'nameApi'> & {
        instructionPath: NodePath<InstructionNode>;
        useAsync: boolean;
    },
): Fragment | undefined {
    const { remainingAccounts } = getLastNodeFromPath(scope.instructionPath);
    const fragments = (remainingAccounts ?? []).flatMap(a => getRemainingAccountsFragment(a, scope));
    if (fragments.length === 0) return;
    return pipe(
        mergeFragments(
            fragments,
            c =>
                `// Remaining accounts.\n` +
                `const remainingAccounts: AccountMeta[] = ${c.length === 1 ? c[0] : `[...${c.join(', ...')}]`}`,
        ),
        f => addFragmentImports(f, 'solanaInstructions', ['type AccountMeta']),
    );
}

function getRemainingAccountsFragment(
    remainingAccounts: InstructionRemainingAccountsNode,
    scope: Pick<RenderScope, 'asyncResolvers' | 'getImportFrom' | 'nameApi'> & {
        instructionPath: NodePath<InstructionNode>;
        useAsync: boolean;
    },
): Fragment[] {
    const remainingAccountsFragment = ((): Fragment | null => {
        if (isNode(remainingAccounts.value, 'argumentValueNode')) {
            return getArgumentValueNodeFragment(remainingAccounts, scope);
        }
        if (isNode(remainingAccounts.value, 'resolverValueNode')) {
            return getResolverValueNodeFragment(remainingAccounts, scope);
        }
        return null;
    })();

    if (remainingAccountsFragment === null) return [];
    return [remainingAccountsFragment];
}

function getArgumentValueNodeFragment(
    remainingAccounts: InstructionRemainingAccountsNode,
    scope: { instructionPath: NodePath<InstructionNode> },
): Fragment {
    const instructionNode = getLastNodeFromPath(scope.instructionPath);
    assertIsNode(remainingAccounts.value, 'argumentValueNode');
    const argumentName = camelCase(remainingAccounts.value.name);
    const isOptional = remainingAccounts.isOptional ?? false;
    const isSigner = remainingAccounts.isSigner ?? false;
    const isWritable = remainingAccounts.isWritable ?? false;
    const argumentArray = isOptional ? `(args.${argumentName} ?? [])` : `args.${argumentName}`;

    // The argument already exists as an instruction argument — i.e. an `Array<Address>`
    // encoded in the instruction data — so its role is derived from the IDL flags alone.
    if (isRemainingAccountsBackedByArgument(instructionNode, remainingAccounts)) {
        const accountRole = use('AccountRole', 'solanaInstructions');
        const role = (() => {
            if (isSigner === true) return isWritable ? 'WRITABLE_SIGNER' : 'READONLY_SIGNER';
            return isWritable ? 'WRITABLE' : 'READONLY';
        })();
        return fragment`${argumentArray}.map((address) => ({ address, role: ${accountRole}.${role} }))`;
    }

    // Otherwise, the argument was added to the instruction input and accepts the same inputs
    // as instruction accounts, so it goes through the same account meta helper. The helper
    // only yields `undefined` for missing optional accounts, which array items cannot be.
    const getNonNullResolvedInstructionInput = use('getNonNullResolvedInstructionInput', 'solanaProgramClientCore');
    const isSignerFlag = isSigner === 'either' ? "'either'" : String(isSigner);
    return fragment`${argumentArray}.map((value) => ${getNonNullResolvedInstructionInput}("${argumentName}", getAccountMeta("${argumentName}", { value, isSigner: ${isSignerFlag}, isWritable: ${isWritable} })))`;
}

function getResolverValueNodeFragment(
    remainingAccounts: InstructionRemainingAccountsNode,
    scope: Pick<RenderScope, 'asyncResolvers' | 'getImportFrom' | 'nameApi'> & {
        useAsync: boolean;
    },
): Fragment | null {
    assertIsNode(remainingAccounts.value, 'resolverValueNode');
    const isAsync = scope.asyncResolvers.includes(remainingAccounts.value.name);
    if (!scope.useAsync && isAsync) return null;

    const awaitKeyword = scope.useAsync && isAsync ? 'await ' : '';
    const functionName = use(
        scope.nameApi.resolverFunction(remainingAccounts.value.name),
        scope.getImportFrom(remainingAccounts.value),
    );
    return pipe(fragment`${awaitKeyword}${functionName}(resolverScope)`, f =>
        addFragmentFeatures(f, ['instruction:resolverScopeVariable']),
    );
}
