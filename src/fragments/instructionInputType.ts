import { camelCase, InstructionAccountNode, InstructionNode, isNode, pascalCase } from '@codama/nodes';
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
    getCustomDataOptions,
    getDocblockFragment,
    getInstructionDataFields,
    getInstructionExtraArguments,
    getRemainingAccountsName,
    hasInputDefault,
    InstructionDataField,
    isAsyncInput,
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
            hasInputDefault(resolvedAccount) &&
            !isNode(resolvedAccount.defaultValue, ['identityValueNode', 'payerValueNode']) &&
            (useAsync || !isAsyncInput(resolvedAccount, asyncResolvers));
        const docs = getDocblockFragment(account.docs, true);
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

    const customData = getCustomDataOptions(scope.customInstructionData, instructionNode);
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

    const fragments = getInstructionDataFields(instructionNode).flatMap(arg => {
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

    const fragments = getInstructionExtraArguments(instructionNode).flatMap(arg => {
        const argFragment = getArgumentFragment(arg, extraArgsType, scope.resolvedInputs, scope.renamedArgs);
        return argFragment ? [argFragment] : [];
    });
    if (fragments.length === 0) return;

    return mergeFragments(fragments, c => c.join('\n'));
}

function getArgumentFragment(
    arg: InstructionDataField,
    argsType: string,
    resolvedInputs: ResolvedInstructionInput[],
    renamedArgs: Map<string, string>,
): Fragment | null {
    const resolvedArg = resolvedInputs.find(
        input => isNode(input, 'instructionArgumentNode') && input.name === arg.name,
    ) as ResolvedInstructionArgument | undefined;
    if (hasInputDefault(arg) && arg.defaultValueStrategy === 'omitted') return null;
    const argName = camelCase(arg.name);
    const renamedName = renamedArgs.get(argName) ?? argName;
    const optionalSign = hasInputDefault(arg) || (resolvedArg && hasInputDefault(resolvedArg)) ? '?' : '';
    return fragment`${renamedName}${optionalSign}: ${argsType}["${argName}"];`;
}

function getRemainingAccountsFragment(instructionNode: InstructionNode): Fragment | undefined {
    const fragments = (instructionNode.remainingAccounts ?? []).flatMap(remainingAccountsNode => {
        const name = getRemainingAccountsName(remainingAccountsNode);
        if (name === undefined) return [];
        if (isRemainingAccountsBackedByArgument(instructionNode, remainingAccountsNode)) return [];

        const isSigner = remainingAccountsNode.isSigner ?? false;
        const optionalSign = (remainingAccountsNode.isOptional ?? false) ? '?' : '';
        const typeFragment = getInstructionAccountInputConstraintFragment({ isSigner });

        return fragment`${camelCase(name)}${optionalSign}: Array<${typeFragment}>;`;
    });
    if (fragments.length === 0) return;

    return mergeFragments(fragments, c => c.join('\n'));
}
