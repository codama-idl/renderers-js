import { camelCase } from '@codama/fragments/casing';
import { AccountNode, InstructionNode, isNode, PdaNode, ProgramNode } from '@codama/nodes';
import { getLastNodeFromPath, NodePath } from '@codama/visitors-core';

import {
    fragment,
    Fragment,
    GeneratedNodeModuleScope,
    getDocblockFragment,
    getGeneratedNodeModule,
    getInstructionDataFields,
    getInstructionDocs,
    getInstructionFunctionInputFlags,
    getRenamedArgsMap,
    getRenderedInstructionPaths,
    getRenderedInstructions,
    getResolvedInstructionInputs,
    hasAsyncFunction,
    hasVariablePdaSeeds,
    isPdaDerivedFromProgram,
    mergeFragments,
    RenderScope,
    ResolvedInstructionInput,
    use,
} from '../utils';

/**
 * Renders the Kit plugin of a program, e.g. `splTokenProgram()`, which adds the accounts,
 * instructions and PDAs of the program to a Kit client, along with its plugin types.
 *
 * The plugin exposes the instructions rendered as pages, filling in the inputs defaulting to
 * the payer with the payer of the client.
 *
 * @param scope - The render scope, the program and its path.
 * @return The fragment of the plugin, if the program has accounts, instructions or PDAs.
 */
export function getProgramPluginFragment(
    scope: Pick<
        RenderScope,
        | 'asyncResolvers'
        | 'customInstructionData'
        | 'erasableSyntax'
        | 'getImportPath'
        | 'isInternalNode'
        | 'linkables'
        | 'nameApi'
        | 'renderParentInstructions'
    > & {
        programNode: ProgramNode;
        programPath: NodePath<ProgramNode>;
    },
): Fragment | undefined {
    // The plugin exposes the public accounts, PDAs and rendered instructions of the program,
    // leaving out the ones listed in the `internalNodes` option.
    const isPublic = (node: { identifier: string }) => !scope.isInternalNode(node.identifier);
    const instructionPaths = getRenderedInstructionPaths(scope.programPath, {
        renderParentInstructions: scope.renderParentInstructions,
    }).filter(path => isPublic(getLastNodeFromPath(path)));
    const instructions = instructionPaths.map(path => getPluginInstruction(path, scope));
    const accounts = (scope.programNode.accounts ?? []).filter(isPublic);
    const pdas = (scope.programNode.pdas ?? []).filter(isPublic);
    if (accounts.length === 0 && instructions.length === 0 && pdas.length === 0) return;

    const extendedScope = { ...scope, accounts, instructions, pdas };
    return mergeFragments(
        [
            getProgramPluginTypeFragment(extendedScope),
            getProgramPluginAccountsTypeFragment(extendedScope),
            getProgramPluginInstructionsTypeFragment(extendedScope),
            getProgramPluginPdasTypeFragment(extendedScope),
            getProgramPluginRequirementsTypeFragment(extendedScope),
            getProgramPluginFunctionFragment(extendedScope),
            getMakeOptionalHelperTypeFragment(extendedScope),
        ],
        c => c.join('\n\n'),
    );
}

function hasAccountIdentifier(programNode: ProgramNode): boolean {
    return (programNode.accounts ?? []).some(account => (account.discriminators ?? []).length > 0);
}

function hasInstructionIdentifier(programNode: ProgramNode, renderParentInstructions: boolean | undefined): boolean {
    // Mirrors getProgramInstructionsFragment so the plugin tracks whichever
    // instructions actually flow into identify*/parse* generation.
    const allInstructions = getRenderedInstructions(programNode, {
        renderParentInstructions: !!renderParentInstructions,
    });
    return allInstructions.some(instruction => (instruction.discriminators ?? []).length > 0);
}

function getProgramPluginTypeFragment(
    scope: Pick<RenderScope, 'nameApi' | 'renderParentInstructions'> & {
        instructions: PluginInstruction[];
        accounts: AccountNode[];
        pdas: PdaNode[];
        programNode: ProgramNode;
    },
): Fragment {
    const { pdas, accounts, instructions, programNode, nameApi, renderParentInstructions } = scope;
    const programPluginType = nameApi.programPluginType(programNode.identifier);
    const programPluginAccountsType = nameApi.programPluginAccountsType(programNode.identifier);
    const programPluginInstructionsType = nameApi.programPluginInstructionsType(programNode.identifier);
    const programPluginPdasType = nameApi.programPluginPdasType(programNode.identifier);
    const accountsIdentifierFunction = nameApi.programAccountsIdentifierFunction(programNode.identifier);
    const instructionsIdentifierFunction = nameApi.programInstructionsIdentifierFunction(programNode.identifier);
    const instructionsParseFunction = nameApi.programInstructionsParseFunction(programNode.identifier);

    const fields = mergeFragments(
        [
            accounts.length > 0 ? fragment`accounts: ${programPluginAccountsType};` : undefined,
            instructions.length > 0 ? fragment`instructions: ${programPluginInstructionsType};` : undefined,
            pdas.length > 0 ? fragment`pdas: ${programPluginPdasType};` : undefined,
            hasAccountIdentifier(programNode)
                ? fragment`identifyAccount: typeof ${accountsIdentifierFunction};`
                : undefined,
            hasInstructionIdentifier(programNode, renderParentInstructions)
                ? fragment`identifyInstruction: typeof ${instructionsIdentifierFunction}; parseInstruction: typeof ${instructionsParseFunction};`
                : undefined,
        ],
        c => c.join(' '),
    );

    return fragment`export type ${programPluginType} = { ${fields} }`;
}

function getProgramPluginAccountsTypeFragment(
    scope: GeneratedNodeModuleScope & { accounts: AccountNode[]; programNode: ProgramNode },
): Fragment | undefined {
    const { accounts, programNode, nameApi } = scope;
    if (accounts.length === 0) return;
    const programPluginAccountsType = nameApi.programPluginAccountsType(programNode.identifier);
    const selfFetchFunctions = use('type SelfFetchFunctions', 'solanaProgramClientCore');

    const fields = mergeFragments(
        accounts.map(account => {
            const name = nameApi.programPluginAccountKey(account.identifier);
            const accountModule = getGeneratedNodeModule('account', account.identifier, scope);
            const codecFunction = use('type ' + nameApi.codecFunction(account.identifier), accountModule);
            const fromType = use('type ' + nameApi.dataArgsType(account.identifier), accountModule);
            const toType = use('type ' + nameApi.dataType(account.identifier), accountModule);
            return fragment`${name}: ReturnType<typeof ${codecFunction}> & ${selfFetchFunctions}<${fromType}, ${toType}>;`;
        }),
        c => c.join(' '),
    );

    return fragment`export type ${programPluginAccountsType} = { ${fields} }`;
}

function getProgramPluginInstructionsTypeFragment(
    scope: GeneratedNodeModuleScope & { instructions: PluginInstruction[]; programNode: ProgramNode },
): Fragment | undefined {
    const { instructions, programNode, nameApi } = scope;
    if (instructions.length === 0) return;
    const programPluginInstructionsType = nameApi.programPluginInstructionsType(programNode.identifier);
    const selfPlanAndSendFunctions = use('type SelfPlanAndSendFunctions', 'solanaProgramClientCore');
    const programAddressType = fragment`${use('type Address', 'solanaAddresses')} | ${use('type HasAddress', 'solanaAddresses')}`;

    const fields = mergeFragments(
        instructions.map(({ isAsync, node: instruction, payerDefaultValues }) => {
            const name = nameApi.programPluginInstructionKey(instruction.identifier);
            const instructionModule = getGeneratedNodeModule('instruction', instruction.identifier, scope);
            let instructionInputType = isAsync
                ? use('type ' + nameApi.instructionAsyncInputType(instruction.identifier), instructionModule)
                : use('type ' + nameApi.instructionSyncInputType(instruction.identifier), instructionModule);
            const instructionFunction = isAsync
                ? use('type ' + nameApi.instructionAsyncFunction(instruction.identifier), instructionModule)
                : use('type ' + nameApi.instructionSyncFunction(instruction.identifier), instructionModule);

            if (payerDefaultValues.length > 0) {
                const fieldStringUnion = payerDefaultValues.map(({ name }) => `"${name}"`).join(' | ');
                instructionInputType = fragment`MakeOptional<${instructionInputType}, ${fieldStringUnion}>`;
            }

            const docs = getDocblockFragment(getInstructionDocs(instruction), true);
            return fragment`${docs}${name}: (input: ${instructionInputType}, config?: { programAddress?: ${programAddressType} }) => ReturnType<typeof ${instructionFunction}> & ${selfPlanAndSendFunctions};`;
        }),
        c => c.join('\n'),
    );

    return fragment`export type ${programPluginInstructionsType} = { ${fields} }`;
}

function getProgramPluginPdasTypeFragment(
    scope: GeneratedNodeModuleScope & { pdas: PdaNode[]; programNode: ProgramNode },
): Fragment | undefined {
    const { pdas, programNode, nameApi } = scope;
    if (pdas.length === 0) return;
    const programPluginPdasType = nameApi.programPluginPdasType(programNode.identifier);

    const fields = mergeFragments(
        pdas.map(pda => {
            const name = nameApi.programPluginPdaKey(pda.identifier);
            const pdaFindFunction = use(
                'type ' + nameApi.pdaFindFunction(pda.identifier),
                getGeneratedNodeModule('pda', pda.identifier, scope),
            );
            return fragment`${name}: typeof ${pdaFindFunction};`;
        }),
        c => c.join(' '),
    );

    return fragment`export type ${programPluginPdasType} = { ${fields} }`;
}

function getProgramPluginPdasObjectFragment(
    scope: GeneratedNodeModuleScope & { pdas: PdaNode[]; programNode: ProgramNode },
): Fragment | undefined {
    const { pdas, programNode, nameApi } = scope;
    if (pdas.length === 0) return;

    const fields = mergeFragments(
        pdas.map(pda => {
            const name = nameApi.programPluginPdaKey(pda.identifier);
            const pdaFindFunction = use(
                nameApi.pdaFindFunction(pda.identifier),
                getGeneratedNodeModule('pda', pda.identifier, scope),
            );
            if (!isPdaDerivedFromProgram(pda, programNode)) return fragment`${name}: ${pdaFindFunction}`;
            return hasVariablePdaSeeds(pda)
                ? fragment`${name}: (seeds, pdaConfig) => ${pdaFindFunction}(seeds, { programAddress: pdaConfig?.programAddress ?? config.programAddress })`
                : fragment`${name}: pdaConfig => ${pdaFindFunction}({ programAddress: pdaConfig?.programAddress ?? config.programAddress })`;
        }),
        c => c.join(', '),
    );

    return fragment`pdas: { ${fields} }`;
}

function getProgramPluginRequirementsTypeFragment(
    scope: Pick<RenderScope, 'nameApi'> & {
        instructions: PluginInstruction[];
        accounts: AccountNode[];
        programNode: ProgramNode;
    },
): Fragment {
    const { accounts, instructions, programNode, nameApi } = scope;
    const programRequirementsType = nameApi.programPluginRequirementsType(programNode.identifier);
    const clientWithRpc = fragment`${use('type ClientWithRpc', 'solanaPluginInterfaces')}<${use('type GetAccountInfoApi', 'solanaRpcApi')} & ${use('type GetMultipleAccountsApi', 'solanaRpcApi')}>`;
    const clientWithPayer = use('type ClientWithPayer', 'solanaPluginInterfaces');
    const clientWithTransactionPlanning = use('type ClientWithTransactionPlanning', 'solanaPluginInterfaces');
    const clientWithTransactionSending = use('type ClientWithTransactionSending', 'solanaPluginInterfaces');
    const hasAccounts = accounts.length > 0;
    const hasInstructions = instructions.length > 0;

    const requirementList = [
        hasAccounts ? clientWithRpc : undefined,
        hasPayerDefaultValues(instructions) ? clientWithPayer : undefined,
        hasInstructions ? clientWithTransactionPlanning : undefined,
        hasInstructions ? clientWithTransactionSending : undefined,
    ].filter((r): r is Fragment => r !== undefined);

    if (requirementList.length === 0) {
        return fragment`export type ${programRequirementsType} = object`;
    }

    const requirements = mergeFragments(requirementList, c => c.join(' & '));

    return fragment`export type ${programRequirementsType} = ${requirements}`;
}

function getProgramPluginFunctionFragment(
    scope: GeneratedNodeModuleScope &
        Pick<RenderScope, 'erasableSyntax' | 'renderParentInstructions'> & {
            accounts: AccountNode[];
            instructions: PluginInstruction[];
            pdas: PdaNode[];
            programNode: ProgramNode;
        },
): Fragment {
    const { pdas, instructions, programNode, nameApi, renderParentInstructions, erasableSyntax } = scope;
    const programPluginFunction = nameApi.programPluginFunction(programNode.identifier);
    const programPluginType = nameApi.programPluginType(programNode.identifier);
    const programPluginRequirementsType = nameApi.programPluginRequirementsType(programNode.identifier);
    const programPluginKey = nameApi.programPluginKey(programNode.identifier);
    const extendClient = use('extendClient', 'solanaPluginCore');
    const extendedClient = use('type ExtendedClient', 'solanaPluginCore');
    const programAddressType = fragment`${use('type Address', 'solanaAddresses')} | ${use('type HasAddress', 'solanaAddresses')}`;

    const accountsIdentifierFunction = nameApi.programAccountsIdentifierFunction(programNode.identifier);
    const instructionsIdentifierFunction = nameApi.programInstructionsIdentifierFunction(programNode.identifier);
    const instructionsParseFunction = nameApi.programInstructionsParseFunction(programNode.identifier);

    const fields = mergeFragments(
        [
            getProgramPluginAccountsObjectFragment(scope),
            getProgramPluginInstructionsObjectFragment(scope),
            getProgramPluginPdasObjectFragment(scope),
            hasAccountIdentifier(programNode) ? fragment`identifyAccount: ${accountsIdentifierFunction}` : undefined,
            hasInstructionIdentifier(programNode, renderParentInstructions)
                ? fragment`identifyInstruction: ${instructionsIdentifierFunction}, parseInstruction: ${instructionsParseFunction}`
                : undefined,
        ],
        c => c.join(', '),
    );

    // Angle-bracket assertions are rejected under `erasableSyntaxOnly`, so use the
    // equivalent `as` assertion instead.
    const pluginObject = erasableSyntax
        ? fragment`{ ${fields} } as ${programPluginType}`
        : fragment`<${programPluginType}>{ ${fields} }`;

    const hasProgramAddressConfig =
        instructions.length > 0 || pdas.some(pda => isPdaDerivedFromProgram(pda, programNode));
    const configParameter = hasProgramAddressConfig
        ? fragment`config: { programAddress?: ${programAddressType} } = {}`
        : '';

    return fragment`export function ${programPluginFunction}(${configParameter}) {
    return <T extends ${programPluginRequirementsType}>(client: T): ${extendedClient}<T, { ${programPluginKey}: ${programPluginType} }> => {
        return ${extendClient}(client, { ${programPluginKey}: ${pluginObject} });
    };
}`;
}

function getProgramPluginAccountsObjectFragment(
    scope: GeneratedNodeModuleScope & { accounts: AccountNode[] },
): Fragment | undefined {
    const { accounts, nameApi } = scope;
    if (accounts.length === 0) return;

    const fields = mergeFragments(
        accounts.map(account => {
            const name = nameApi.programPluginAccountKey(account.identifier);
            const addSelfFetchFunctions = use('addSelfFetchFunctions', 'solanaProgramClientCore');
            const codecFunction = use(
                nameApi.codecFunction(account.identifier),
                getGeneratedNodeModule('account', account.identifier, scope),
            );
            return fragment`${name}: ${addSelfFetchFunctions}(client, ${codecFunction}())`;
        }),
        c => c.join(', '),
    );

    return fragment`accounts: { ${fields} }`;
}

function getProgramPluginInstructionsObjectFragment(
    scope: GeneratedNodeModuleScope & { instructions: PluginInstruction[] },
): Fragment | undefined {
    const { instructions, nameApi } = scope;
    if (instructions.length === 0) return;

    const fields = mergeFragments(
        instructions.map(({ hasInput, isAsync, node: instruction, payerDefaultValues }) => {
            const name = nameApi.programPluginInstructionKey(instruction.identifier);
            const instructionModule = getGeneratedNodeModule('instruction', instruction.identifier, scope);
            const instructionFunction = isAsync
                ? use(nameApi.instructionAsyncFunction(instruction.identifier), instructionModule)
                : use(nameApi.instructionSyncFunction(instruction.identifier), instructionModule);
            const addSelfPlanAndSendFunctions = use('addSelfPlanAndSendFunctions', 'solanaProgramClientCore');
            let input = fragment`input`;
            if (payerDefaultValues.length > 0) {
                const fieldOverrides = mergeFragments(
                    payerDefaultValues.map(({ name, signer }) => {
                        const signerDefault = signer ? 'client.payer' : 'client.payer.address';
                        return fragment`${name}: input.${name} ?? ${signerDefault}`;
                    }),
                    c => c.join(', '),
                );
                input = fragment`{ ...input, ${fieldOverrides} }`;
            }

            const mergedConfig = fragment`{ programAddress: instructionConfig?.programAddress ?? config.programAddress }`;
            if (!hasInput) {
                return fragment`${name}: (_input, instructionConfig) => ${addSelfPlanAndSendFunctions}(client, ${instructionFunction}(${mergedConfig}))`;
            }

            return fragment`${name}: (input, instructionConfig) => ${addSelfPlanAndSendFunctions}(client, ${instructionFunction}(${input}, ${mergedConfig}))`;
        }),
        c => c.join(', '),
    );

    return fragment`instructions: { ${fields} }`;
}

function getMakeOptionalHelperTypeFragment(scope: { instructions: PluginInstruction[] }): Fragment | undefined {
    if (!hasPayerDefaultValues(scope.instructions)) return;
    return fragment`type MakeOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;`;
}

/** An instruction exposed by the plugin, with what the plugin needs to know about its builders. */
type PluginInstruction = {
    /** Whether the builder the plugin calls takes an `input` parameter. */
    hasInput: boolean;
    /** Whether the plugin calls the asynchronous builder. */
    isAsync: boolean;
    node: InstructionNode;
    /** The inputs the plugin fills in with the payer of the client. */
    payerDefaultValues: { name: string; signer: boolean }[];
};

function getPluginInstruction(
    path: NodePath<InstructionNode>,
    scope: Pick<RenderScope, 'asyncResolvers' | 'customInstructionData' | 'linkables'>,
): PluginInstruction {
    const node = getLastNodeFromPath(path);
    const resolvedInputs = getResolvedInstructionInputs(path, scope.linkables);
    const isAsync = hasAsyncFunction(node, resolvedInputs, scope.asyncResolvers);
    const builderScope = { ...scope, resolvedInputs, useAsync: isAsync };
    const renamedArgs = getRenamedArgsMap(path, builderScope);
    const { hasInput } = getInstructionFunctionInputFlags(node, builderScope);
    const payerDefaultValues = getPayerDefaultValues(node, resolvedInputs, renamedArgs);
    return { hasInput, isAsync, node, payerDefaultValues };
}

function hasPayerDefaultValues(instructions: readonly PluginInstruction[]): boolean {
    return instructions.some(instruction => instruction.payerDefaultValues.length > 0);
}

/**
 * Lists the inputs of an instruction defaulting to the payer, once injected values
 * are resolved, with the camelCase name under which each one is exposed in the
 * instruction input type. Optional accounts and extra arguments are left out.
 */
function getPayerDefaultValues(
    instructionNode: InstructionNode,
    resolvedInputs: readonly ResolvedInstructionInput[],
    renamedArgs: Map<string, string>,
): { name: string; signer: boolean }[] {
    const inputs = resolvedInputs.filter(input => isNode(input.resolvedDefaultValue, 'payerValueNode'));
    const isPayerInput = (identifier: string, kind: ResolvedInstructionInput['kind']) =>
        inputs.some(input => input.kind === kind && input.node.identifier === identifier);
    return [
        ...(instructionNode.accounts ?? [])
            .filter(account => !account.isOptional && isPayerInput(account.identifier, 'account'))
            .map(account => ({ name: camelCase(account.identifier), signer: account.isSigner !== false })),
        ...getInstructionDataFields(instructionNode)
            .filter(field => isPayerInput(field.identifier, 'data'))
            .map(field => {
                const name = camelCase(field.identifier);
                return { name: renamedArgs.get(name) ?? name, signer: false };
            }),
    ];
}
