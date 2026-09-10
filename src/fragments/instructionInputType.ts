import {
    camelCase,
    InstructionAccountNode,
    InstructionArgumentNode,
    InstructionNode,
    isNode,
    pascalCase,
} from '@codama/nodes';
import { mapFragmentContent } from '@codama/renderers-core';
import {
    getLastNodeFromPath,
    NodePath,
    pipe,
    ResolvedInstructionAccount,
    ResolvedInstructionArgument,
    ResolvedInstructionInput,
} from '@codama/visitors-core';

import {
    Fragment,
    fragment,
    getDocblockFragment,
    isAsyncDefaultValue,
    isRemainingAccountsBackedByArgument,
    mergeFragmentImports,
    mergeFragments,
    RenderScope,
    TypeManifest,
    use,
} from '../utils';

export function getInstructionInputTypeFragment(
    scope: Pick<RenderScope, 'asyncResolvers' | 'customInstructionData' | 'nameApi'> & {
        dataArgsManifest: TypeManifest;
        instructionPath: NodePath<InstructionNode>;
        renamedArgs: Map<string, string>;
        resolvedInputs: ResolvedInstructionInput[];
        useAsync: boolean;
    },
): Fragment {
    const { instructionPath, useAsync, nameApi } = scope;
    const instructionNode = getLastNodeFromPath(instructionPath);
    const instructionInputType = useAsync
        ? nameApi.instructionAsyncInputType(instructionNode.name)
        : nameApi.instructionSyncInputType(instructionNode.name);
    const [dataArgumentsFragment, customDataArgumentsFragment] = getDataArgumentsFragments(scope);

    // One type parameter per account, holding the input value provided for that account
    // and defaulting to every input the account accepts.
    const accountTypeParams = mergeFragments(
        (instructionNode.accounts ?? []).map(account => {
            const constraint = getInstructionAccountInputConstraintFragment(account);
            return fragment`TAccount${pascalCase(account.name)} extends ${constraint} = ${constraint}`;
        }),
        cs => (cs.length > 0 ? `<${cs.join(', ')}>` : ''),
    );

    const typeBodyFragment = mergeFragments(
        [
            getAccountsFragment(scope),
            dataArgumentsFragment,
            getExtraArgumentsFragment(scope),
            getRemainingAccountsFragment(instructionNode),
        ],
        c => c.join('\n'),
    );

    return fragment`export type ${instructionInputType}${accountTypeParams} = ${customDataArgumentsFragment} {
  ${typeBodyFragment}
}`;
}

/**
 * Renders the type of the inputs accepted by an instruction account, based on its signer flag:
 * `InstructionSignerInput` for signer accounts, `InstructionAccountInput` for non-signer
 * accounts and the union of both for accounts that may or may not be signers.
 */
export function getInstructionAccountInputConstraintFragment(
    account: Pick<InstructionAccountNode, 'isSigner'>,
): Fragment {
    const accountInput = use('type InstructionAccountInput', 'solanaProgramClientCore');
    const signerInput = use('type InstructionSignerInput', 'solanaProgramClientCore');

    if (account.isSigner === 'either') return fragment`${accountInput} | ${signerInput}`;
    if (account.isSigner) return signerInput;
    return accountInput;
}

function getAccountsFragment(
    scope: Pick<RenderScope, 'asyncResolvers' | 'customInstructionData' | 'nameApi'> & {
        instructionPath: NodePath<InstructionNode>;
        resolvedInputs: ResolvedInstructionInput[];
        useAsync: boolean;
    },
): Fragment {
    const { instructionPath, resolvedInputs, useAsync, asyncResolvers } = scope;
    const instructionNode = getLastNodeFromPath(instructionPath);

    const fragments = (instructionNode.accounts ?? []).map(account => {
        const resolvedAccount = resolvedInputs.find(
            input => input.kind === 'instructionAccountNode' && input.name === account.name,
        ) as ResolvedInstructionAccount;
        const hasDefaultValue =
            !!resolvedAccount.defaultValue &&
            !isNode(resolvedAccount.defaultValue, ['identityValueNode', 'payerValueNode']) &&
            (useAsync || !isAsyncDefaultValue(resolvedAccount.defaultValue, asyncResolvers));
        const docs = getDocblockFragment(account.docs ?? [], true);
        const optionalSign = hasDefaultValue || resolvedAccount.isOptional ? '?' : '';
        return fragment`${docs}${camelCase(account.name)}${optionalSign}: TAccount${pascalCase(account.name)};`;
    });

    return mergeFragments(fragments, c => c.join('\n'));
}

function getDataArgumentsFragments(
    scope: Pick<RenderScope, 'customInstructionData' | 'nameApi'> & {
        dataArgsManifest: TypeManifest;
        instructionPath: NodePath<InstructionNode>;
        renamedArgs: Map<string, string>;
        resolvedInputs: ResolvedInstructionInput[];
    },
): [Fragment | undefined, Fragment] {
    const { instructionPath, nameApi } = scope;
    const instructionNode = getLastNodeFromPath(instructionPath);

    const customData = scope.customInstructionData.get(instructionNode.name);
    if (customData) {
        return [
            undefined,
            pipe(
                fragment`${nameApi.dataArgsType(customData.importAs)}`,
                f => mergeFragmentImports(f, [scope.dataArgsManifest.looseType.imports]),
                f => mapFragmentContent(f, c => `${c} & `),
            ),
        ];
    }

    const instructionDataName = nameApi.instructionDataType(instructionNode.name);
    const dataArgsType = nameApi.dataArgsType(instructionDataName);

    const fragments = (instructionNode.arguments ?? []).flatMap(arg => {
        const argFragment = getArgumentFragment(arg, dataArgsType, scope.resolvedInputs, scope.renamedArgs);
        return argFragment ? [argFragment] : [];
    });

    return [fragments.length === 0 ? undefined : mergeFragments(fragments, c => c.join('\n')), fragment``];
}

function getExtraArgumentsFragment(
    scope: Pick<RenderScope, 'nameApi'> & {
        instructionPath: NodePath<InstructionNode>;
        renamedArgs: Map<string, string>;
        resolvedInputs: ResolvedInstructionInput[];
    },
): Fragment | undefined {
    const { instructionPath, nameApi } = scope;
    const instructionNode = getLastNodeFromPath(instructionPath);
    const instructionExtraName = nameApi.instructionExtraType(instructionNode.name);
    const extraArgsType = nameApi.dataArgsType(instructionExtraName);

    const fragments = (instructionNode.extraArguments ?? []).flatMap(arg => {
        const argFragment = getArgumentFragment(arg, extraArgsType, scope.resolvedInputs, scope.renamedArgs);
        return argFragment ? [argFragment] : [];
    });
    if (fragments.length === 0) return;

    return mergeFragments(fragments, c => c.join('\n'));
}

function getArgumentFragment(
    arg: InstructionArgumentNode,
    argsType: string,
    resolvedInputs: ResolvedInstructionInput[],
    renamedArgs: Map<string, string>,
): Fragment | null {
    const resolvedArg = resolvedInputs.find(
        input => isNode(input, 'instructionArgumentNode') && input.name === arg.name,
    ) as ResolvedInstructionArgument | undefined;
    if (arg.defaultValue && arg.defaultValueStrategy === 'omitted') return null;
    const renamedName = renamedArgs.get(arg.name) ?? arg.name;
    const optionalSign = arg.defaultValue || resolvedArg?.defaultValue ? '?' : '';
    return fragment`${camelCase(renamedName)}${optionalSign}: ${argsType}["${camelCase(arg.name)}"];`;
}

function getRemainingAccountsFragment(instructionNode: InstructionNode): Fragment | undefined {
    const fragments = (instructionNode.remainingAccounts ?? []).flatMap(remainingAccountsNode => {
        if (isNode(remainingAccountsNode.value, 'resolverValueNode')) return [];
        if (isRemainingAccountsBackedByArgument(instructionNode, remainingAccountsNode)) return [];

        const { name } = remainingAccountsNode.value;
        const isSigner = remainingAccountsNode.isSigner ?? false;
        const optionalSign = (remainingAccountsNode.isOptional ?? false) ? '?' : '';
        const typeFragment = getInstructionAccountInputConstraintFragment({ isSigner });

        return fragment`${camelCase(name)}${optionalSign}: Array<${typeFragment}>;`;
    });
    if (fragments.length === 0) return;

    return mergeFragments(fragments, c => c.join('\n'));
}
