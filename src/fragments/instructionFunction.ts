import { mapFragmentContent } from '@codama/fragments';
import { camelCase } from '@codama/fragments/casing';
import { InstructionAccountNode, InstructionNode, parseOptionalAccountStrategy } from '@codama/nodes';
import { getLastNodeFromPath, NodePath, pipe, visit } from '@codama/visitors-core';

import {
    findResolvedAccount,
    Fragment,
    fragment,
    getAccountTypeParamName,
    getDocblockFragment,
    getGeneratedNodeModule,
    getInstructionDataLink,
    getInstructionDocs,
    getInstructionFunctionInputFlags,
    getProgramNodeFromPath,
    getRenamedArgsMap,
    hasAsyncFunction,
    hasInstructionData,
    hasRemainingAccountInputs,
    mergeFragments,
    NameApi,
    RenderScope,
    ResolvedInstructionDataField,
    ResolvedInstructionInput,
    TypeManifest,
    use,
} from '../utils';
import { getInstructionByteDeltaFragment } from './instructionByteDelta';
import { getInstructionInputResolvedFragment } from './instructionInputResolved';
import { getInstructionAccountInputConstraintFragment, getInstructionInputTypeFragment } from './instructionInputType';
import { getInstructionRemainingAccountsFragment } from './instructionRemainingAccounts';

/**
 * Renders the synchronous or asynchronous builder of an instruction, e.g.
 * `getTransferInstruction` or `getTransferInstructionAsync`, along with its input type.
 *
 * The builder resolves the default values of its inputs, its remaining accounts and its byte
 * deltas, then returns the instruction with its account metas and encoded data.
 *
 * @param scope - The render scope, the path of the instruction, its resolved inputs and
 * whether to render the asynchronous builder.
 * @return The fragment of the builder, or `undefined` for an asynchronous builder the
 * instruction does not need.
 */
export function getInstructionFunctionFragment(
    scope: Pick<
        RenderScope,
        | 'asyncResolvers'
        | 'customInstructionData'
        | 'getImportFrom'
        | 'getImportPath'
        | 'isInternalNode'
        | 'linkables'
        | 'nameApi'
        | 'nonScalarEnums'
        | 'typeManifestVisitor'
    > & {
        dataArgsManifest: TypeManifest;
        extraArgsManifest: TypeManifest;
        instructionPath: NodePath<InstructionNode>;
        resolvedInputs: readonly ResolvedInstructionInput[];
        useAsync: boolean;
    },
): Fragment | undefined {
    const { useAsync, instructionPath, resolvedInputs, asyncResolvers, nameApi, customInstructionData } = scope;
    const instructionNode = getLastNodeFromPath(instructionPath);
    const programNode = getProgramNodeFromPath(instructionPath);
    if (useAsync && !hasAsyncFunction(instructionNode, resolvedInputs, asyncResolvers)) return;
    const renamedArgs = getRenamedArgsMap(instructionPath, scope);

    const hasAccounts = (instructionNode.accounts ?? []).length > 0;
    const hasData = hasInstructionData(instructionNode, customInstructionData);
    const { hasAnyArgs, hasDataArgs, hasInput, omittedArgs } = getInstructionFunctionInputFlags(instructionNode, scope);
    const programAddressConstant = use(
        nameApi.programAddressConstant(programNode.identifier),
        getGeneratedNodeModule('program', programNode.identifier, scope),
    );

    const functionName = useAsync
        ? nameApi.instructionAsyncFunction(instructionNode.identifier)
        : nameApi.instructionSyncFunction(instructionNode.identifier);

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
    const instructionTypeFragment = getReturnedInstructionTypeFragment(scope);

    const typeParams = getTypeParamsFragment(instructionNode, programAddressConstant);
    const returnType = getReturnTypeFragment(instructionTypeFragment, hasByteDeltas, useAsync);
    const inputType = getInstructionInputTypeFragment({ ...scope, renamedArgs });
    const inputArg = mapFragmentContent(getInputTypeCallFragment(scope), c => (hasInput ? `input: ${c}, ` : ''));
    const functionBody = mergeFragments(
        [
            getProgramAddressInitializationFragment(programAddressConstant),
            getAccountMetaHelperFragment(instructionNode, hasAccounts || hasRemainingAccountInputs(instructionNode)),
            getAccountsInitializationFragment(instructionNode, resolvedInputs),
            getArgumentsInitializationFragment({ ...scope, hasAnyArgs, hasInput, omittedArgs, renamedArgs }),
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

    const docs = getDocblockFragment(getInstructionDocs(instructionNode), true);
    return fragment`${inputType}\n\n${docs}export ${useAsync ? 'async ' : ''}function ${functionName}${typeParams}(${inputArg}config?: { programAddress?: TProgramAddress | { readonly address: TProgramAddress } } ): ${returnType} {
  ${functionBody}
}`;
}

function getProgramAddressInitializationFragment(programAddressConstant: Fragment): Fragment {
    return fragment`// Program address.
const programAddressInput = config?.programAddress ?? ${programAddressConstant};
const programAddress = typeof programAddressInput === 'string' ? programAddressInput : programAddressInput.address;`;
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
    const optionalAccountStrategy = parseOptionalAccountStrategy(instructionNode.optionalAccountStrategy);
    return fragment`// Account meta helper.
const getAccountMeta = ${use('getAccountMetaFactory', 'solanaProgramClientCore')}(programAddress, '${optionalAccountStrategy}');`;
}

function getAccountsInitializationFragment(
    instructionNode: InstructionNode,
    resolvedInputs: readonly ResolvedInstructionInput[],
): Fragment | undefined {
    if ((instructionNode.accounts ?? []).length === 0) return;

    const accounts = mergeFragments(
        (instructionNode.accounts ?? []).map(account => {
            const name = camelCase(account.identifier);
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
function getRuntimeIsSignerFlag(
    account: InstructionAccountNode,
    resolvedInputs: readonly ResolvedInstructionInput[],
): string {
    if (account.isSigner === false) return 'false';
    const resolvedAccount = findResolvedAccount(resolvedInputs, account);
    const resolvedIsSigner = resolvedAccount?.resolvedIsSigner ?? account.isSigner;
    return resolvedIsSigner === true ? 'true' : "'either'";
}

function getArgumentsInitializationFragment(
    scope: Pick<RenderScope, 'typeManifestVisitor'> & {
        hasAnyArgs: boolean;
        hasInput: boolean;
        instructionPath: NodePath<InstructionNode>;
        omittedArgs: ResolvedInstructionDataField[];
        renamedArgs: Map<string, string>;
    },
): Fragment | undefined {
    const { hasAnyArgs, hasInput, instructionPath, omittedArgs, renamedArgs, typeManifestVisitor } = scope;
    if (!hasAnyArgs) return;
    const instructionNode = getLastNodeFromPath(instructionPath);

    // Arguments omitted from the input but filled in by the builder are declared on `args`.
    const omittedArgsType = mergeFragments(
        omittedArgs.map(input => {
            const { looseType } = visit(input.node.type, typeManifestVisitor);
            return fragment`${camelCase(input.node.identifier)}?: ${looseType}`;
        }),
        cs => `{ ${cs.join('; ')} }`,
    );

    if (!hasInput) {
        return fragment`// Original args.
const args: ${omittedArgsType} = {};
`;
    }

    // Arguments renamed in the input, since they are named like an account, are mapped back.
    const renamedArgsText = [...renamedArgs.entries()].map(([k, v]) => `${k}: input.${v}`).join(', ');
    const inputArgs = `{ ...input, ${renamedArgsText} }`;

    // Omitted arguments named like an account would otherwise read the account from the input.
    const accountNames = new Set((instructionNode.accounts ?? []).map(account => camelCase(account.identifier)));
    const shadowedArgsText = omittedArgs
        .map(input => camelCase(input.node.identifier))
        .filter(name => accountNames.has(name))
        .map(name => `${name}: _${name}, `)
        .join('');
    const originalArgs = shadowedArgsText
        ? `{ ${shadowedArgsText}...originalArgs } = ${inputArgs}`
        : `originalArgs = ${inputArgs}`;

    if (omittedArgs.length === 0) {
        return fragment`// Original args.
const args = ${inputArgs};
`;
    }
    return fragment`// Original args.
const ${originalArgs};
const args: typeof originalArgs & ${omittedArgsType} = originalArgs;
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
        parseOptionalAccountStrategy(instructionNode.optionalAccountStrategy) === 'omitted' &&
        (instructionNode.accounts ?? []).some(account => account.isOptional);

    // Accounts.
    const accountItems = [
        ...(instructionNode.accounts ?? []).map(
            account => `getAccountMeta("${camelCase(account.identifier)}", accounts.${camelCase(account.identifier)})`,
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
    const dataLink = getInstructionDataLink(instructionNode, scope.customInstructionData);
    const instructionDataName = nameApi.instructionDataType(instructionNode.identifier);
    const encoderFunctionFragment = dataLink
        ? scope.dataArgsManifest.encoder
        : `${nameApi.encoderFunction(instructionDataName)}()`;
    const argsTypeFragment = dataLink ? scope.dataArgsManifest.looseType : nameApi.dataArgsType(instructionDataName);
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
 * derived from the exact values provided (see {@link getReturnedInstructionTypeFragment}). Since the
 * `input` parameter remains a concrete object type once these are inferred, TypeScript keeps
 * performing excess property checks on it — e.g. a misspelled optional account is a compile
 * error rather than silently falling back to its default value.
 */
function getTypeParamsFragment(instructionNode: InstructionNode, programAddressConstant: Fragment): Fragment {
    return mergeFragments(
        [
            ...(instructionNode.accounts ?? []).map(
                account =>
                    fragment`${getAccountTypeParamName(account.identifier)} extends ${getInstructionAccountInputConstraintFragment(account)}`,
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
function getReturnedInstructionTypeFragment(scope: {
    instructionPath: NodePath<InstructionNode>;
    nameApi: NameApi;
}): Fragment {
    const { instructionPath, nameApi } = scope;
    const instructionNode = getLastNodeFromPath(instructionPath);
    const instructionTypeName = nameApi.instructionType(instructionNode.identifier);
    const accountTypeParamsFragments = (instructionNode.accounts ?? []).map(account => {
        const resolvedMeta = use('type ResolvedInstructionAccountMeta', 'solanaProgramClientCore');
        const inputAddress = use('type InstructionAccountInputAddress', 'solanaProgramClientCore');
        const input = getAccountTypeParamName(account.identifier);
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
        ? nameApi.instructionAsyncInputType(instructionNode.identifier)
        : nameApi.instructionSyncInputType(instructionNode.identifier);
    if ((instructionNode.accounts ?? []).length === 0) return fragment`${inputTypeName}`;
    const accountTypeParams = (instructionNode.accounts ?? [])
        .map(account => getAccountTypeParamName(account.identifier))
        .join(', ');

    return fragment`${inputTypeName}<${accountTypeParams}>`;
}
