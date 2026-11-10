import { camelCase } from '@codama/fragments/casing';
import { getAllInstructionsWithSubs, InstructionNode, isNode, isNodeFilter, PdaNode, ProgramNode } from '@codama/nodes';
import { NodePath } from '@codama/visitors-core';

import {
    Fragment,
    fragment,
    getInstructionDataFields,
    getResolvedInstructionInputs,
    hasAsyncFunction,
    mergeFragments,
    RenderScope,
    ResolvedInstructionInput,
    use,
} from '../utils';
import { getInstructionFunctionInputFlags } from './instructionFunction';
import { getRenamedArgsMap } from './instructionPage';

export function getProgramPluginFragment(
    scope: Pick<
        RenderScope,
        | 'asyncResolvers'
        | 'customInstructionData'
        | 'erasableSyntax'
        | 'linkables'
        | 'nameApi'
        | 'renderParentInstructions'
    > & {
        programNode: ProgramNode;
        programPath: NodePath<ProgramNode>;
    },
): Fragment | undefined {
    if (
        (scope.programNode.accounts ?? []).length === 0 &&
        (scope.programNode.instructions ?? []).length === 0 &&
        (scope.programNode.pdas ?? []).length === 0
    )
        return;

    const resolvedInputsByInstruction = new Map(
        (scope.programNode.instructions ?? []).map(instruction => [
            instruction.identifier,
            getResolvedInstructionInputs([...scope.programPath, instruction], scope.linkables),
        ]),
    );
    const asyncInstructions: string[] = (scope.programNode.instructions ?? [])
        .filter(instruction =>
            hasAsyncFunction(
                instruction,
                resolvedInputsByInstruction.get(instruction.identifier)!,
                scope.asyncResolvers,
            ),
        )
        .map(i => i.identifier);

    const extendedScope = { ...scope, asyncInstructions, resolvedInputsByInstruction };
    return mergeFragments(
        [
            getProgramPluginTypeFragment(extendedScope),
            getProgramPluginAccountsTypeFragment(scope),
            getProgramPluginInstructionsTypeFragment(extendedScope),
            getProgramPluginPdasTypeFragment(scope),
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
    const allInstructions = getAllInstructionsWithSubs(programNode, {
        leavesOnly: !renderParentInstructions,
        subInstructionsFirst: true,
    });
    return allInstructions.some(instruction => (instruction.discriminators ?? []).length > 0);
}

function getProgramPluginTypeFragment(
    scope: Pick<RenderScope, 'nameApi' | 'renderParentInstructions'> & { programNode: ProgramNode },
): Fragment {
    const { programNode, nameApi, renderParentInstructions } = scope;
    const programPluginType = nameApi.programPluginType(programNode.identifier);
    const programPluginAccountsType = nameApi.programPluginAccountsType(programNode.identifier);
    const programPluginInstructionsType = nameApi.programPluginInstructionsType(programNode.identifier);
    const programPluginPdasType = nameApi.programPluginPdasType(programNode.identifier);
    const accountsIdentifierFunction = nameApi.programAccountsIdentifierFunction(programNode.identifier);
    const instructionsIdentifierFunction = nameApi.programInstructionsIdentifierFunction(programNode.identifier);
    const instructionsParseFunction = nameApi.programInstructionsParseFunction(programNode.identifier);

    const fields = mergeFragments(
        [
            (programNode.accounts ?? []).length > 0 ? fragment`accounts: ${programPluginAccountsType};` : undefined,
            (programNode.instructions ?? []).length > 0
                ? fragment`instructions: ${programPluginInstructionsType};`
                : undefined,
            (programNode.pdas ?? []).length > 0 ? fragment`pdas: ${programPluginPdasType};` : undefined,
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
    scope: Pick<RenderScope, 'nameApi'> & { programNode: ProgramNode },
): Fragment | undefined {
    const { programNode, nameApi } = scope;
    if ((programNode.accounts ?? []).length === 0) return;
    const programPluginAccountsType = nameApi.programPluginAccountsType(programNode.identifier);
    const selfFetchFunctions = use('type SelfFetchFunctions', 'solanaProgramClientCore');

    const fields = mergeFragments(
        (programNode.accounts ?? []).map(account => {
            const name = nameApi.programPluginAccountKey(account.identifier);
            const codecFunction = use('type ' + nameApi.codecFunction(account.identifier), 'generatedAccounts');
            const fromType = use('type ' + nameApi.dataArgsType(account.identifier), 'generatedAccounts');
            const toType = use('type ' + nameApi.dataType(account.identifier), 'generatedAccounts');
            return fragment`${name}: ReturnType<typeof ${codecFunction}> & ${selfFetchFunctions}<${fromType}, ${toType}>;`;
        }),
        c => c.join(' '),
    );

    return fragment`export type ${programPluginAccountsType} = { ${fields} }`;
}

function getProgramPluginInstructionsTypeFragment(
    scope: Pick<RenderScope, 'nameApi'> & {
        asyncInstructions: string[];
        programNode: ProgramNode;
        resolvedInputsByInstruction: ResolvedInputsByInstruction;
    },
): Fragment | undefined {
    const { programNode, asyncInstructions, nameApi } = scope;
    if ((programNode.instructions ?? []).length === 0) return;
    const programPluginInstructionsType = nameApi.programPluginInstructionsType(programNode.identifier);
    const selfPlanAndSendFunctions = use('type SelfPlanAndSendFunctions', 'solanaProgramClientCore');
    const programAddressType = fragment`${use('type Address', 'solanaAddresses')} | ${use('type HasAddress', 'solanaAddresses')}`;

    const fields = mergeFragments(
        (programNode.instructions ?? []).map(instruction => {
            const name = nameApi.programPluginInstructionKey(instruction.identifier);
            const isAsync = asyncInstructions.includes(instruction.identifier);
            let instructionInputType = isAsync
                ? use('type ' + nameApi.instructionAsyncInputType(instruction.identifier), 'generatedInstructions')
                : use('type ' + nameApi.instructionSyncInputType(instruction.identifier), 'generatedInstructions');
            const instructionFunction = isAsync
                ? use('type ' + nameApi.instructionAsyncFunction(instruction.identifier), 'generatedInstructions')
                : use('type ' + nameApi.instructionSyncFunction(instruction.identifier), 'generatedInstructions');

            const payerDefaultValues = getPayerDefaultValues(instruction, scope.resolvedInputsByInstruction);
            if (payerDefaultValues.length > 0) {
                const fieldStringUnion = payerDefaultValues.map(({ name }) => `"${name}"`).join(' | ');
                instructionInputType = fragment`MakeOptional<${instructionInputType}, ${fieldStringUnion}>`;
            }

            return fragment`${name}: (input: ${instructionInputType}, config?: { programAddress?: ${programAddressType} }) => ReturnType<typeof ${instructionFunction}> & ${selfPlanAndSendFunctions};`;
        }),
        c => c.join(' '),
    );

    return fragment`export type ${programPluginInstructionsType} = { ${fields} }`;
}

function getProgramPluginPdasTypeFragment(
    scope: Pick<RenderScope, 'nameApi'> & { programNode: ProgramNode },
): Fragment | undefined {
    const { programNode, nameApi } = scope;
    if ((programNode.pdas ?? []).length === 0) return;
    const programPluginPdasType = nameApi.programPluginPdasType(programNode.identifier);

    const fields = mergeFragments(
        (programNode.pdas ?? []).map(pda => {
            const name = nameApi.programPluginPdaKey(pda.identifier);
            const pdaFindFunction = use('type ' + nameApi.pdaFindFunction(pda.identifier), 'generatedPdas');
            return fragment`${name}: typeof ${pdaFindFunction};`;
        }),
        c => c.join(' '),
    );

    return fragment`export type ${programPluginPdasType} = { ${fields} }`;
}

function getProgramPluginPdasObjectFragment(
    scope: Pick<RenderScope, 'nameApi'> & { programNode: ProgramNode },
): Fragment | undefined {
    const { programNode, nameApi } = scope;
    if ((programNode.pdas ?? []).length === 0) return;

    const fields = mergeFragments(
        (programNode.pdas ?? []).map(pda => {
            const name = nameApi.programPluginPdaKey(pda.identifier);
            const pdaFindFunction = use(nameApi.pdaFindFunction(pda.identifier), 'generatedPdas');
            if (!isPdaDerivedFromProgram(pda, programNode)) return fragment`${name}: ${pdaFindFunction}`;
            return hasVariableSeeds(pda)
                ? fragment`${name}: (seeds, pdaConfig) => ${pdaFindFunction}(seeds, { programAddress: pdaConfig?.programAddress ?? config.programAddress })`
                : fragment`${name}: pdaConfig => ${pdaFindFunction}({ programAddress: pdaConfig?.programAddress ?? config.programAddress })`;
        }),
        c => c.join(', '),
    );

    return fragment`pdas: { ${fields} }`;
}

function getProgramPluginRequirementsTypeFragment(
    scope: Pick<RenderScope, 'nameApi'> & {
        programNode: ProgramNode;
        resolvedInputsByInstruction: ResolvedInputsByInstruction;
    },
): Fragment {
    const { programNode, nameApi } = scope;
    const programRequirementsType = nameApi.programPluginRequirementsType(programNode.identifier);
    const clientWithRpc = fragment`${use('type ClientWithRpc', 'solanaPluginInterfaces')}<${use('type GetAccountInfoApi', 'solanaRpcApi')} & ${use('type GetMultipleAccountsApi', 'solanaRpcApi')}>`;
    const clientWithPayer = use('type ClientWithPayer', 'solanaPluginInterfaces');
    const clientWithTransactionPlanning = use('type ClientWithTransactionPlanning', 'solanaPluginInterfaces');
    const clientWithTransactionSending = use('type ClientWithTransactionSending', 'solanaPluginInterfaces');
    const hasAccounts = (programNode.accounts ?? []).length > 0;
    const hasInstructions = (programNode.instructions ?? []).length > 0;

    const requirementList = [
        hasAccounts ? clientWithRpc : undefined,
        hasPayerDefaultValues(programNode, scope.resolvedInputsByInstruction) ? clientWithPayer : undefined,
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
    scope: Pick<
        RenderScope,
        'asyncResolvers' | 'customInstructionData' | 'erasableSyntax' | 'nameApi' | 'renderParentInstructions'
    > & {
        asyncInstructions: string[];
        programNode: ProgramNode;
        resolvedInputsByInstruction: ResolvedInputsByInstruction;
    },
): Fragment {
    const { programNode, nameApi, renderParentInstructions, erasableSyntax } = scope;
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
        (programNode.instructions ?? []).length > 0 ||
        (programNode.pdas ?? []).some(pda => isPdaDerivedFromProgram(pda, programNode));
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
    scope: Pick<RenderScope, 'nameApi'> & { programNode: ProgramNode },
): Fragment | undefined {
    const { programNode, nameApi } = scope;
    if ((programNode.accounts ?? []).length === 0) return;

    const fields = mergeFragments(
        (programNode.accounts ?? []).map(account => {
            const name = nameApi.programPluginAccountKey(account.identifier);
            const addSelfFetchFunctions = use('addSelfFetchFunctions', 'solanaProgramClientCore');
            const codecFunction = use(nameApi.codecFunction(account.identifier), 'generatedAccounts');
            return fragment`${name}: ${addSelfFetchFunctions}(client, ${codecFunction}())`;
        }),
        c => c.join(', '),
    );

    return fragment`accounts: { ${fields} }`;
}

function getProgramPluginInstructionsObjectFragment(
    scope: Pick<RenderScope, 'asyncResolvers' | 'customInstructionData' | 'nameApi'> & {
        asyncInstructions: string[];
        programNode: ProgramNode;
        resolvedInputsByInstruction: ResolvedInputsByInstruction;
    },
): Fragment | undefined {
    const { programNode, nameApi, asyncInstructions } = scope;
    if ((programNode.instructions ?? []).length === 0) return;

    const fields = mergeFragments(
        (programNode.instructions ?? []).map(instruction => {
            const name = nameApi.programPluginInstructionKey(instruction.identifier);
            const isAsync = asyncInstructions.includes(instruction.identifier);
            const instructionFunction = isAsync
                ? use(nameApi.instructionAsyncFunction(instruction.identifier), 'generatedInstructions')
                : use(nameApi.instructionSyncFunction(instruction.identifier), 'generatedInstructions');
            const addSelfPlanAndSendFunctions = use('addSelfPlanAndSendFunctions', 'solanaProgramClientCore');
            const payerDefaultValues = getPayerDefaultValues(instruction, scope.resolvedInputsByInstruction);

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
            const resolvedInputs = scope.resolvedInputsByInstruction.get(instruction.identifier)!;
            const { hasInput } = getInstructionFunctionInputFlags(instruction, {
                ...scope,
                resolvedInputs,
                useAsync: isAsync,
            });
            if (!hasInput) {
                return fragment`${name}: (_input, instructionConfig) => ${addSelfPlanAndSendFunctions}(client, ${instructionFunction}(${mergedConfig}))`;
            }

            return fragment`${name}: (input, instructionConfig) => ${addSelfPlanAndSendFunctions}(client, ${instructionFunction}(${input}, ${mergedConfig}))`;
        }),
        c => c.join(', '),
    );

    return fragment`instructions: { ${fields} }`;
}

function isPdaDerivedFromProgram(pdaNode: PdaNode, programNode: ProgramNode): boolean {
    return pdaNode.programId === undefined || pdaNode.programId === programNode.publicKey;
}

function hasVariableSeeds(pdaNode: PdaNode): boolean {
    return (pdaNode.seeds ?? []).some(isNodeFilter('variablePdaSeedNode'));
}

function getMakeOptionalHelperTypeFragment(scope: {
    programNode: ProgramNode;
    resolvedInputsByInstruction: ResolvedInputsByInstruction;
}): Fragment | undefined {
    if (!hasPayerDefaultValues(scope.programNode, scope.resolvedInputsByInstruction)) return;
    return fragment`type MakeOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;`;
}

type ResolvedInputsByInstruction = Map<string, ResolvedInstructionInput[]>;

function hasPayerDefaultValues(programNode: ProgramNode, resolvedInputs: ResolvedInputsByInstruction): boolean {
    return (programNode.instructions ?? []).some(
        instruction => getPayerDefaultValues(instruction, resolvedInputs).length > 0,
    );
}

/**
 * Lists the inputs of an instruction defaulting to the payer, once injected values
 * are resolved, with the camelCase name under which each one is exposed in the
 * instruction input type. Optional accounts and extra arguments are left out.
 */
function getPayerDefaultValues(
    instructionNode: InstructionNode,
    resolvedInputs: ResolvedInputsByInstruction,
): { name: string; signer: boolean }[] {
    const inputs = (resolvedInputs.get(instructionNode.identifier) ?? []).filter(input =>
        isNode(input.resolvedDefaultValue, 'payerValueNode'),
    );
    const isPayerInput = (identifier: string, kind: ResolvedInstructionInput['kind']) =>
        inputs.some(input => input.kind === kind && input.node.identifier === identifier);
    const renamedArgs = getRenamedArgsMap(instructionNode);
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
