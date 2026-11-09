import { camelCase } from '@codama/fragments/casing';
import { InstructionNode, InstructionRemainingAccountsNode } from '@codama/nodes';
import { getLastNodeFromPath, NodePath, pipe } from '@codama/visitors-core';

import {
    addFragmentFeatures,
    addFragmentImports,
    Fragment,
    fragment,
    getRemainingAccountsName,
    getRemainingAccountsResolver,
    InstructionResolver,
    isAsyncResolver,
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
        const resolver = getRemainingAccountsResolver(remainingAccounts);
        if (resolver) {
            return getResolverFragment(resolver, scope);
        }
        const name = getRemainingAccountsName(remainingAccounts);
        if (name !== undefined) {
            return getInputFragment(remainingAccounts, name, scope);
        }
        return null;
    })();

    if (remainingAccountsFragment === null) return [];
    return [remainingAccountsFragment];
}

function getInputFragment(
    remainingAccounts: InstructionRemainingAccountsNode,
    name: string,
    scope: { instructionPath: NodePath<InstructionNode> },
): Fragment {
    const instructionNode = getLastNodeFromPath(scope.instructionPath);
    const argumentName = camelCase(name);
    const isOptional = remainingAccounts.isOptional ?? false;
    const isSigner = remainingAccounts.isSigner ?? false;
    const isWritable = remainingAccounts.isWritable ?? false;
    const argumentArray = isOptional ? `(args.${argumentName} ?? [])` : `args.${argumentName}`;

    // The argument already exists as an instruction argument — i.e. an `Array<Address | HasAddress>`
    // encoded in the instruction data — so its role is derived from the IDL flags alone and
    // each item is unwrapped to its address.
    if (isRemainingAccountsBackedByArgument(instructionNode, remainingAccounts)) {
        const accountRole = use('AccountRole', 'solanaInstructions');
        const getAddressFromResolvedInstructionAccount = use(
            'getAddressFromResolvedInstructionAccount',
            'solanaProgramClientCore',
        );
        const role = (() => {
            if (isSigner === true) return isWritable ? 'WRITABLE_SIGNER' : 'READONLY_SIGNER';
            return isWritable ? 'WRITABLE' : 'READONLY';
        })();
        return fragment`${argumentArray}.map((value) => ({ address: ${getAddressFromResolvedInstructionAccount}("${argumentName}", value), role: ${accountRole}.${role} }))`;
    }

    // Otherwise, the argument was added to the instruction input and accepts the same inputs
    // as instruction accounts, so it goes through the same account meta helper. The helper
    // only yields `undefined` for missing optional accounts, which array items cannot be.
    const getNonNullResolvedInstructionInput = use('getNonNullResolvedInstructionInput', 'solanaProgramClientCore');
    const isSignerFlag = isSigner === 'either' ? "'either'" : String(isSigner);
    return fragment`${argumentArray}.map((value) => ${getNonNullResolvedInstructionInput}("${argumentName}", getAccountMeta("${argumentName}", { value, isSigner: ${isSignerFlag}, isWritable: ${isWritable} })))`;
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
