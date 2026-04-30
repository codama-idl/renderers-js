import {
    CamelCaseString,
    getAllInstructionsWithSubs,
    InstructionAccountNode,
    InstructionArgumentNode,
    InstructionNode,
    isNode,
    ProgramNode,
} from '@codama/nodes';
import { getResolvedInstructionInputsVisitor, visit } from '@codama/visitors-core';

import { Fragment, fragment, hasAsyncFunction, mergeFragments, RenderScope, use } from '../utils';
import { getRenamedArgsMap } from './instructionPage';

export function getProgramPluginFragment(
    scope: Pick<RenderScope, 'asyncResolvers' | 'nameApi' | 'renderParentInstructions'> & { programNode: ProgramNode },
): Fragment | undefined {
    if (
        scope.programNode.accounts.length === 0 &&
        scope.programNode.instructions.length === 0 &&
        scope.programNode.pdas.length === 0
    )
        return;

    const resolvedInstructionInputVisitor = getResolvedInstructionInputsVisitor();
    const asyncInstructions: CamelCaseString[] = scope.programNode.instructions
        .filter(instruction =>
            hasAsyncFunction(instruction, visit(instruction, resolvedInstructionInputVisitor), scope.asyncResolvers),
        )
        .map(i => i.name);

    const extendedScope = { ...scope, asyncInstructions };
    return mergeFragments(
        [
            getProgramPluginTypeFragment(extendedScope),
            getProgramPluginAccountsTypeFragment(scope),
            getProgramPluginInstructionsTypeFragment(extendedScope),
            getProgramPluginPdasTypeFragment(scope),
            getProgramPluginRequirementsTypeFragment(scope),
            getProgramPluginFunctionFragment(extendedScope),
            getMakeOptionalHelperTypeFragment(scope),
        ],
        c => c.join('\n\n'),
    );
}

function hasAccountIdentifier(programNode: ProgramNode): boolean {
    return programNode.accounts.some(account => (account.discriminators ?? []).length > 0);
}

function hasInstructionIdentifier(
    programNode: ProgramNode,
    renderParentInstructions: boolean | undefined,
): boolean {
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
    const programPluginType = nameApi.programPluginType(programNode.name);
    const programPluginAccountsType = nameApi.programPluginAccountsType(programNode.name);
    const programPluginInstructionsType = nameApi.programPluginInstructionsType(programNode.name);
    const programPluginPdasType = nameApi.programPluginPdasType(programNode.name);
    const accountsIdentifierFunction = nameApi.programAccountsIdentifierFunction(programNode.name);
    const instructionsIdentifierFunction = nameApi.programInstructionsIdentifierFunction(programNode.name);
    const instructionsParseFunction = nameApi.programInstructionsParseFunction(programNode.name);

    const fields = mergeFragments(
        [
            programNode.accounts.length > 0 ? fragment`accounts: ${programPluginAccountsType};` : undefined,
            programNode.instructions.length > 0 ? fragment`instructions: ${programPluginInstructionsType};` : undefined,
            programNode.pdas.length > 0 ? fragment`pdas: ${programPluginPdasType};` : undefined,
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
    if (programNode.accounts.length === 0) return;
    const programPluginAccountsType = nameApi.programPluginAccountsType(programNode.name);
    const selfFetchFunctions = use('type SelfFetchFunctions', 'solanaProgramClientCore');

    const fields = mergeFragments(
        programNode.accounts.map(account => {
            const name = nameApi.programPluginAccountKey(account.name);
            const codecFunction = use('type ' + nameApi.codecFunction(account.name), 'generatedAccounts');
            const fromType = use('type ' + nameApi.dataArgsType(account.name), 'generatedAccounts');
            const toType = use('type ' + nameApi.dataType(account.name), 'generatedAccounts');
            return fragment`${name}: ReturnType<typeof ${codecFunction}> & ${selfFetchFunctions}<${fromType}, ${toType}>;`;
        }),
        c => c.join(' '),
    );

    return fragment`export type ${programPluginAccountsType} = { ${fields} }`;
}

function getProgramPluginInstructionsTypeFragment(
    scope: Pick<RenderScope, 'nameApi'> & { asyncInstructions: CamelCaseString[]; programNode: ProgramNode },
): Fragment | undefined {
    const { programNode, asyncInstructions, nameApi } = scope;
    if (programNode.instructions.length === 0) return;
    const programPluginInstructionsType = nameApi.programPluginInstructionsType(programNode.name);
    const selfPlanAndSendFunctions = use('type SelfPlanAndSendFunctions', 'solanaProgramClientCore');

    const fields = mergeFragments(
        programNode.instructions.map(instruction => {
            const name = nameApi.programPluginInstructionKey(instruction.name);
            const isAsync = asyncInstructions.includes(instruction.name);
            let instructionInputType = isAsync
                ? use('type ' + nameApi.instructionAsyncInputType(instruction.name), 'generatedInstructions')
                : use('type ' + nameApi.instructionSyncInputType(instruction.name), 'generatedInstructions');
            const instructionFunction = isAsync
                ? use('type ' + nameApi.instructionAsyncFunction(instruction.name), 'generatedInstructions')
                : use('type ' + nameApi.instructionSyncFunction(instruction.name), 'generatedInstructions');

            const payerDefaultValues = getPayerDefaultValues(instruction);
            if (payerDefaultValues.length > 0) {
                const fieldStringUnion = payerDefaultValues.map(({ name }) => `"${name}"`).join(' | ');
                instructionInputType = fragment`MakeOptional<${instructionInputType}, ${fieldStringUnion}>`;
            }

            return fragment`${name}: (input: ${instructionInputType}) => ReturnType<typeof ${instructionFunction}> & ${selfPlanAndSendFunctions};`;
        }),
        c => c.join(' '),
    );

    return fragment`export type ${programPluginInstructionsType} = { ${fields} }`;
}

function getProgramPluginPdasTypeFragment(
    scope: Pick<RenderScope, 'nameApi'> & { programNode: ProgramNode },
): Fragment | undefined {
    const { programNode, nameApi } = scope;
    if (programNode.pdas.length === 0) return;
    const programPluginPdasType = nameApi.programPluginPdasType(programNode.name);

    const fields = mergeFragments(
        programNode.pdas.map(pda => {
            const name = nameApi.programPluginPdaKey(pda.name);
            const pdaFindFunction = use('type ' + nameApi.pdaFindFunction(pda.name), 'generatedPdas');
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
    if (programNode.pdas.length === 0) return;

    const fields = mergeFragments(
        programNode.pdas.map(pda => {
            const name = nameApi.programPluginPdaKey(pda.name);
            const pdaFindFunction = use(nameApi.pdaFindFunction(pda.name), 'generatedPdas');
            return fragment`${name}: ${pdaFindFunction}`;
        }),
        c => c.join(', '),
    );

    return fragment`pdas: { ${fields} }`;
}

function getProgramPluginRequirementsTypeFragment(
    scope: Pick<RenderScope, 'nameApi'> & { programNode: ProgramNode },
): Fragment {
    const { programNode, nameApi } = scope;
    const programRequirementsType = nameApi.programPluginRequirementsType(programNode.name);
    const clientWithRpc = fragment`${use('type ClientWithRpc', 'solanaPluginInterfaces')}<${use('type GetAccountInfoApi', 'solanaRpcApi')} & ${use('type GetMultipleAccountsApi', 'solanaRpcApi')}>`;
    const clientWithPayer = use('type ClientWithPayer', 'solanaPluginInterfaces');
    const clientWithTransactionPlanning = use('type ClientWithTransactionPlanning', 'solanaPluginInterfaces');
    const clientWithTransactionSending = use('type ClientWithTransactionSending', 'solanaPluginInterfaces');
    const hasAccounts = programNode.accounts.length > 0;
    const hasInstructions = programNode.instructions.length > 0;

    const requirementList = [
        hasAccounts ? clientWithRpc : undefined,
        hasPayerDefaultValues(programNode) ? clientWithPayer : undefined,
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
    scope: Pick<RenderScope, 'nameApi' | 'renderParentInstructions'> & {
        asyncInstructions: CamelCaseString[];
        programNode: ProgramNode;
    },
): Fragment {
    const { programNode, nameApi, renderParentInstructions } = scope;
    const programPluginFunction = nameApi.programPluginFunction(programNode.name);
    const programPluginType = nameApi.programPluginType(programNode.name);
    const programPluginRequirementsType = nameApi.programPluginRequirementsType(programNode.name);
    const programPluginKey = nameApi.programPluginKey(programNode.name);
    const extendClient = use('extendClient', 'solanaPluginCore');

    const accountsIdentifierFunction = nameApi.programAccountsIdentifierFunction(programNode.name);
    const instructionsIdentifierFunction = nameApi.programInstructionsIdentifierFunction(programNode.name);
    const instructionsParseFunction = nameApi.programInstructionsParseFunction(programNode.name);

    const fields = mergeFragments(
        [
            getProgramPluginAccountsObjectFragment(scope),
            getProgramPluginInstructionsObjectFragment(scope),
            getProgramPluginPdasObjectFragment(scope),
            hasAccountIdentifier(programNode)
                ? fragment`identifyAccount: ${accountsIdentifierFunction}`
                : undefined,
            hasInstructionIdentifier(programNode, renderParentInstructions)
                ? fragment`identifyInstruction: ${instructionsIdentifierFunction}, parseInstruction: ${instructionsParseFunction}`
                : undefined,
        ],
        c => c.join(', '),
    );

    return fragment`export function ${programPluginFunction}() {
    return <T extends ${programPluginRequirementsType}>(client: T): Omit<T, "${programPluginKey}"> & { ${programPluginKey}: ${programPluginType} } => {
        return ${extendClient}(client, { ${programPluginKey}: <${programPluginType}>{ ${fields} } });
    };
}`;
}

function getProgramPluginAccountsObjectFragment(
    scope: Pick<RenderScope, 'nameApi'> & { programNode: ProgramNode },
): Fragment | undefined {
    const { programNode, nameApi } = scope;
    if (programNode.accounts.length === 0) return;

    const fields = mergeFragments(
        programNode.accounts.map(account => {
            const name = nameApi.programPluginAccountKey(account.name);
            const addSelfFetchFunctions = use('addSelfFetchFunctions', 'solanaProgramClientCore');
            const codecFunction = use(nameApi.codecFunction(account.name), 'generatedAccounts');
            return fragment`${name}: ${addSelfFetchFunctions}(client, ${codecFunction}())`;
        }),
        c => c.join(', '),
    );

    return fragment`accounts: { ${fields} }`;
}

function getProgramPluginInstructionsObjectFragment(
    scope: Pick<RenderScope, 'nameApi'> & { asyncInstructions: CamelCaseString[]; programNode: ProgramNode },
): Fragment | undefined {
    const { programNode, nameApi, asyncInstructions } = scope;
    if (programNode.instructions.length === 0) return;

    const fields = mergeFragments(
        programNode.instructions.map(instruction => {
            const name = nameApi.programPluginInstructionKey(instruction.name);
            const isAsync = asyncInstructions.includes(instruction.name);
            const instructionFunction = isAsync
                ? use(nameApi.instructionAsyncFunction(instruction.name), 'generatedInstructions')
                : use(nameApi.instructionSyncFunction(instruction.name), 'generatedInstructions');
            const addSelfPlanAndSendFunctions = use('addSelfPlanAndSendFunctions', 'solanaProgramClientCore');
            const payerDefaultValues = getPayerDefaultValues(instruction);

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

            return fragment`${name}: input => ${addSelfPlanAndSendFunctions}(client, ${instructionFunction}(${input}))`;
        }),
        c => c.join(', '),
    );

    return fragment`instructions: { ${fields} }`;
}

function getMakeOptionalHelperTypeFragment(scope: { programNode: ProgramNode }): Fragment | undefined {
    if (!hasPayerDefaultValues(scope.programNode)) return;
    return fragment`type MakeOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;`;
}

function hasPayerDefaultValues(programNode: ProgramNode): boolean {
    return programNode.instructions.some(instruction => getPayerDefaultValueNodes(instruction).length > 0);
}

function getPayerDefaultValues(instructionNode: InstructionNode): { name: string; signer: boolean }[] {
    const renamedArgs = getRenamedArgsMap(instructionNode);
    return getPayerDefaultValueNodes(instructionNode).map(inputNode => {
        return isNode(inputNode, 'instructionAccountNode')
            ? { name: inputNode.name, signer: inputNode.isSigner !== false }
            : { name: renamedArgs.get(inputNode.name) ?? inputNode.name, signer: false };
    });
}

function getPayerDefaultValueNodes(
    instructionNode: InstructionNode,
): (InstructionAccountNode | InstructionArgumentNode)[] {
    return [
        ...instructionNode.accounts.filter(a => !a.isOptional && isNode(a.defaultValue, 'payerValueNode')),
        ...instructionNode.arguments.filter(a => isNode(a.defaultValue, 'payerValueNode')),
    ];
}
