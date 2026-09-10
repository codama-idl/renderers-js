import {
    camelCase,
    InstructionAccountNode,
    InstructionArgumentNode,
    InstructionNode,
    isNode,
    isNodeFilter,
    pascalCase,
} from '@codama/nodes';
import { mapFragmentContent } from '@codama/renderers-core';
import {
    findProgramNodeFromPath,
    getLastNodeFromPath,
    NodePath,
    pipe,
    ResolvedInstructionAccount,
    ResolvedInstructionInput,
} from '@codama/visitors-core';

import {
    Fragment,
    fragment,
    getInstructionDependencies,
    hasAsyncFunction,
    hasRemainingAccountInputs,
    isAsyncDefaultValue,
    mergeFragments,
    RenderScope,
    TypeManifest,
    use,
} from '../utils';
import { NameApi } from '../utils/nameTransformers';
import { getInstructionByteDeltaFragment } from './instructionByteDelta';
import { getInstructionInputResolvedFragment } from './instructionInputResolved';
import { getInstructionAccountInputConstraintFragment, getInstructionInputTypeFragment } from './instructionInputType';
import { getInstructionRemainingAccountsFragment } from './instructionRemainingAccounts';

export function getInstructionFunctionFragment(
    scope: Pick<
        RenderScope,
        'asyncResolvers' | 'customInstructionData' | 'getImportFrom' | 'linkables' | 'nameApi' | 'typeManifestVisitor'
    > & {
        dataArgsManifest: TypeManifest;
        extraArgsManifest: TypeManifest;
        instructionPath: NodePath<InstructionNode>;
        renamedArgs: Map<string, string>;
        resolvedInputs: ResolvedInstructionInput[];
        useAsync: boolean;
    },
): Fragment | undefined {
    const { useAsync, instructionPath, resolvedInputs, renamedArgs, asyncResolvers, nameApi, customInstructionData } =
        scope;
    const instructionNode = getLastNodeFromPath(instructionPath);
    const programNode = findProgramNodeFromPath(instructionPath)!;
    if (useAsync && !hasAsyncFunction(instructionNode, resolvedInputs, asyncResolvers)) return;

    const customData = customInstructionData.get(instructionNode.name);
    const hasAccounts = (instructionNode.accounts ?? []).length > 0;
    const instructionDependencies = getInstructionDependencies(instructionNode, asyncResolvers, useAsync);
    const argDependencies = instructionDependencies.filter(isNodeFilter('argumentValueNode')).map(node => node.name);
    const hasData = !!customData || (instructionNode.arguments ?? []).length > 0;
    const argIsNotOmitted = (arg: InstructionArgumentNode) =>
        !(arg.defaultValue && arg.defaultValueStrategy === 'omitted');
    const argIsDependent = (arg: InstructionArgumentNode) => argDependencies.includes(arg.name);
    const argHasDefaultValue = (arg: InstructionArgumentNode) => {
        if (!arg.defaultValue) return false;
        if (useAsync) return true;
        return !isAsyncDefaultValue(arg.defaultValue, asyncResolvers);
    };
    const hasDataArgs = !!customData || (instructionNode.arguments ?? []).filter(argIsNotOmitted).length > 0;
    const hasExtraArgs =
        (instructionNode.extraArguments ?? []).filter(
            field => argIsNotOmitted(field) && (argIsDependent(field) || argHasDefaultValue(field)),
        ).length > 0;
    const hasRemainingAccountArgs =
        (instructionNode.remainingAccounts ?? []).filter(({ value }) => isNode(value, 'argumentValueNode')).length > 0;
    const hasAnyArgs = hasDataArgs || hasExtraArgs || hasRemainingAccountArgs;
    const hasInput = hasAccounts || hasAnyArgs;
    const programAddressConstant = use(nameApi.programAddressConstant(programNode.name), 'generatedPrograms');

    const functionName = useAsync
        ? nameApi.instructionAsyncFunction(instructionNode.name)
        : nameApi.instructionSyncFunction(instructionNode.name);

    // Input.
    const resolvedInputsFragment = getInstructionInputResolvedFragment(scope);
    const remainingAccountsFragment = getInstructionRemainingAccountsFragment(scope);
    const byteDeltaFragment = getInstructionByteDeltaFragment(scope);
    const resolvedInputFragment = mergeFragments(
        [resolvedInputsFragment, remainingAccountsFragment, byteDeltaFragment],
        content => content.join('\n\n'),
    );
    const hasRemainingAccounts = !!remainingAccountsFragment;
    const hasByteDeltas = !!byteDeltaFragment;
    const hasResolver = resolvedInputFragment.features.has('instruction:resolverScopeVariable');
    const instructionTypeFragment = getInstructionTypeFragment(scope);

    const typeParams = getTypeParamsFragment(instructionNode, programAddressConstant);
    const returnType = getReturnTypeFragment(instructionTypeFragment, hasByteDeltas, useAsync);
    const inputType = getInstructionInputTypeFragment(scope);
    const inputArg = mapFragmentContent(getInputTypeCallFragment(scope), c => (hasInput ? `input: ${c}, ` : ''));
    const functionBody = mergeFragments(
        [
            getProgramAddressInitializationFragment(programAddressConstant),
            getAccountMetaHelperFragment(instructionNode, hasAccounts || hasRemainingAccountInputs(instructionNode)),
            getAccountsInitializationFragment(instructionNode, resolvedInputs),
            getArgumentsInitializationFragment(hasAnyArgs, renamedArgs),
            getResolverScopeInitializationFragment(hasResolver, hasAccounts, hasAnyArgs),
            resolvedInputFragment,
            getReturnStatementFragment({
                ...scope,
                hasByteDeltas,
                hasData,
                hasDataArgs,
                hasRemainingAccounts,
                instructionNode,
                syncReturnTypeFragment: getReturnTypeFragment(instructionTypeFragment, hasByteDeltas, false),
            }),
        ],
        cs => cs.join('\n\n'),
    );

    return fragment`${inputType}\n\nexport ${useAsync ? 'async ' : ''}function ${functionName}${typeParams}(${inputArg}config?: { programAddress?: TProgramAddress } ): ${returnType} {
  ${functionBody}
}`;
}

function getProgramAddressInitializationFragment(programAddressConstant: Fragment): Fragment {
    return fragment`// Program address.
const programAddress = config?.programAddress ?? ${programAddressConstant};`;
}

/**
 * Renders the `getAccountMeta` helper used to convert both the instruction's accounts and
 * its remaining accounts into account metas, so that they share the same semantics.
 */
function getAccountMetaHelperFragment(
    instructionNode: InstructionNode,
    hasAccountMetas: boolean,
): Fragment | undefined {
    if (!hasAccountMetas) return;
    const optionalAccountStrategy = instructionNode.optionalAccountStrategy ?? 'programId';
    return fragment`// Account meta helper.
const getAccountMeta = ${use('getAccountMetaFactory', 'solanaProgramClientCore')}(programAddress, '${optionalAccountStrategy}');`;
}

function getAccountsInitializationFragment(
    instructionNode: InstructionNode,
    resolvedInputs: ResolvedInstructionInput[],
): Fragment | undefined {
    if ((instructionNode.accounts ?? []).length === 0) return;

    const accounts = mergeFragments(
        (instructionNode.accounts ?? []).map(account => {
            const name = camelCase(account.name);
            const isWritable = account.isWritable ? 'true' : 'false';
            const isSigner = getRuntimeIsSignerFlag(account, resolvedInputs);
            return fragment`${name}: { value: input.${name} ?? null, isSigner: ${isSigner}, isWritable: ${isWritable} }`;
        }),
        cs => cs.join(', '),
    );

    return fragment` // Original accounts.
const originalAccounts = { ${accounts} }
const accounts = originalAccounts as Record<keyof typeof originalAccounts, ${use('type ResolvedInstructionAccount', 'solanaProgramClientCore')}>;
`;
}

/**
 * Renders the `isSigner` flag forwarded to `getAccountMetaFactory` for an account.
 *
 * The flag declared by the IDL is used, except that a signer account whose default value
 * may not be a signer (e.g. a signer account defaulting to a PDA) is downgraded to `'either'`
 * so that the default value does not fail the signer requirement. A non-signer account is
 * never upgraded, even when it defaults to a signer account, so that any signer provided for
 * it merely carries its address.
 */
function getRuntimeIsSignerFlag(account: InstructionAccountNode, resolvedInputs: ResolvedInstructionInput[]): string {
    if (account.isSigner === false) return 'false';
    const resolvedAccount = resolvedInputs.find(
        (input): input is ResolvedInstructionAccount =>
            input.kind === 'instructionAccountNode' && input.name === account.name,
    );
    const resolvedIsSigner = resolvedAccount?.resolvedIsSigner ?? account.isSigner;
    return resolvedIsSigner === true ? 'true' : "'either'";
}

function getArgumentsInitializationFragment(
    hasAnyArgs: boolean,
    renamedArgs: Map<string, string>,
): Fragment | undefined {
    if (!hasAnyArgs) return;
    const renamedArgsText = [...renamedArgs.entries()].map(([k, v]) => `${k}: input.${v}`).join(', ');

    return fragment`// Original args.
const args = { ...input, ${renamedArgsText} };
`;
}

function getResolverScopeInitializationFragment(
    hasResolver: boolean,
    hasAccounts: boolean,
    hasAnyArgs: boolean,
): Fragment | undefined {
    if (!hasResolver) return;

    const resolverAttributes = [
        'programAddress',
        ...(hasAccounts ? ['accounts'] : []),
        ...(hasAnyArgs ? ['args'] : []),
    ].join(', ');

    return fragment`// Resolver scope.
const resolverScope = { ${resolverAttributes} };`;
}

function getReturnStatementFragment(
    scope: Pick<RenderScope, 'customInstructionData' | 'nameApi'> & {
        dataArgsManifest: TypeManifest;
        hasByteDeltas: boolean;
        hasData: boolean;
        hasDataArgs: boolean;
        hasRemainingAccounts: boolean;
        instructionNode: InstructionNode;
        syncReturnTypeFragment: Fragment;
    },
): Fragment {
    const { instructionNode, hasByteDeltas, hasData, hasDataArgs, hasRemainingAccounts, nameApi } = scope;
    const hasAccounts = (instructionNode.accounts ?? []).length > 0;
    const hasLegacyOptionalAccounts =
        instructionNode.optionalAccountStrategy === 'omitted' &&
        (instructionNode.accounts ?? []).some(account => account.isOptional);

    // Accounts.
    const accountItems = [
        ...(instructionNode.accounts ?? []).map(
            account => `getAccountMeta("${camelCase(account.name)}", accounts.${camelCase(account.name)})`,
        ),
        ...(hasRemainingAccounts ? ['...remainingAccounts'] : []),
    ].join(', ');
    let accounts: Fragment | undefined;
    if (hasAccounts && hasLegacyOptionalAccounts) {
        accounts = fragment`accounts: [${accountItems}].filter(<T>(x: T | undefined): x is T => x !== undefined)`;
    } else if (hasAccounts) {
        accounts = fragment`accounts: [${accountItems}]`;
    } else if (hasRemainingAccounts) {
        accounts = fragment`accounts: remainingAccounts`;
    }

    // Data.
    const customData = scope.customInstructionData.get(instructionNode.name);
    const instructionDataName = nameApi.instructionDataType(instructionNode.name);
    const encoderFunctionFragment = customData
        ? scope.dataArgsManifest.encoder
        : `${nameApi.encoderFunction(instructionDataName)}()`;
    const argsTypeFragment = customData ? scope.dataArgsManifest.looseType : nameApi.dataArgsType(instructionDataName);
    let data: Fragment | undefined;
    if (hasDataArgs) {
        data = fragment`data: ${encoderFunctionFragment}.encode(args as ${argsTypeFragment})`;
    } else if (hasData) {
        data = fragment`data: ${encoderFunctionFragment}.encode({})`;
    }

    // Instruction.
    const instructionAttributes = pipe(
        [accounts, hasByteDeltas ? fragment`byteDelta` : undefined, data, fragment`programAddress`],
        fs => mergeFragments(fs, cs => cs.join(', ')),
    );

    return fragment`return Object.freeze({ ${instructionAttributes} } as ${scope.syncReturnTypeFragment});`;
}

function getReturnTypeFragment(instructionTypeFragment: Fragment, hasByteDeltas: boolean, useAsync: boolean): Fragment {
    return pipe(
        instructionTypeFragment,
        f => (hasByteDeltas ? fragment`${f} & ${use('type InstructionWithByteDelta', 'solanaProgramClientCore')}` : f),
        f => (useAsync ? fragment`Promise<${f}>` : f),
    );
}

/**
 * Instruction builders declare one type parameter per account, holding the input value
 * provided for that account, so that the account metas of the returned instruction can be
 * derived from the exact values provided (see {@link getInstructionTypeFragment}). Since the
 * `input` parameter remains a concrete object type once these are inferred, TypeScript keeps
 * performing excess property checks on it — e.g. a misspelled optional account is a compile
 * error rather than silently falling back to its default value.
 */
function getTypeParamsFragment(instructionNode: InstructionNode, programAddressConstant: Fragment): Fragment {
    return mergeFragments(
        [
            ...(instructionNode.accounts ?? []).map(
                account =>
                    fragment`TAccount${pascalCase(account.name)} extends ${getInstructionAccountInputConstraintFragment(account)}`,
            ),
            fragment`TProgramAddress extends ${use('type Address', 'solanaAddresses')} = typeof ${programAddressConstant}`,
        ],
        cs => `<${cs.join(', ')}>`,
    );
}

/**
 * Renders the instruction type returned by an instruction builder. Each account's type
 * parameter is resolved from the provided input using the `ResolvedInstructionAccountMeta`
 * helper: explicit role overrides are preserved, signers provided for optional signer
 * accounts upgrade the account to a signer meta, and any other input resolves to the
 * account's address type parameter — which the instruction type then maps to the account
 * meta declared by the program's IDL.
 */
function getInstructionTypeFragment(scope: { instructionPath: NodePath<InstructionNode>; nameApi: NameApi }): Fragment {
    const { instructionPath, nameApi } = scope;
    const instructionNode = getLastNodeFromPath(instructionPath);
    const instructionTypeName = nameApi.instructionType(instructionNode.name);
    const accountTypeParamsFragments = (instructionNode.accounts ?? []).map(account => {
        const resolvedMeta = use('type ResolvedInstructionAccountMeta', 'solanaProgramClientCore');
        const inputAddress = use('type InstructionAccountInputAddress', 'solanaProgramClientCore');
        const input = `TAccount${pascalCase(account.name)}`;
        const address = fragment`${inputAddress}<${input}>`;

        if (account.isSigner === 'either') {
            const signerRole = use(
                account.isWritable ? 'type WritableSignerAccount' : 'type ReadonlySignerAccount',
                'solanaInstructions',
            );
            const signerMeta = use('type AccountSignerMeta', 'solanaSigners');
            return fragment`${resolvedMeta}<${input}, ${address}, ${signerRole}<${address}> & ${signerMeta}<${address}>>`;
        }

        return fragment`${resolvedMeta}<${input}, ${address}>`;
    });

    return pipe(
        mergeFragments([fragment`TProgramAddress`, ...accountTypeParamsFragments], c => c.join(', ')),
        f => mapFragmentContent(f, c => `${instructionTypeName}<${c}>`),
    );
}

function getInputTypeCallFragment(scope: {
    instructionPath: NodePath<InstructionNode>;
    nameApi: NameApi;
    useAsync: boolean;
}): Fragment {
    const { instructionPath, useAsync, nameApi } = scope;
    const instructionNode = getLastNodeFromPath(instructionPath);
    const inputTypeName = useAsync
        ? nameApi.instructionAsyncInputType(instructionNode.name)
        : nameApi.instructionSyncInputType(instructionNode.name);
    if ((instructionNode.accounts ?? []).length === 0) return fragment`${inputTypeName}`;
    const accountTypeParams = (instructionNode.accounts ?? [])
        .map(account => `TAccount${pascalCase(account.name)}`)
        .join(', ');

    return fragment`${inputTypeName}<${accountTypeParams}>`;
}
