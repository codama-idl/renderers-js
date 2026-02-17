import {
    getAllInstructionsWithSubs,
    InstructionNode,
    ProgramNode,
    structTypeNodeFromInstructionArgumentNodes,
} from '@codama/nodes';

import { Fragment, fragment, mergeFragments, RenderScope, use } from '../utils';
import { getDiscriminatorConditionFragment } from './discriminatorCondition';

export function getProgramInstructionsFragment(
    scope: Pick<RenderScope, 'nameApi' | 'renderParentInstructions' | 'typeManifestVisitor'> & {
        programNode: ProgramNode;
    },
): Fragment | undefined {
    if (scope.programNode.instructions.length === 0) return;

    const allInstructions = getAllInstructionsWithSubs(scope.programNode, {
        leavesOnly: !scope.renderParentInstructions,
        subInstructionsFirst: true,
    });
    const scopeWithInstructions = { ...scope, allInstructions };
    return mergeFragments(
        [
            getProgramInstructionsEnumFragment(scopeWithInstructions),
            getProgramInstructionsIdentifierFunctionFragment(scopeWithInstructions),
            getProgramInstructionsParsedUnionTypeFragment(scopeWithInstructions),
            getProgramInstructionsParseFunctionFragment(scopeWithInstructions),
        ],
        c => c.join('\n\n'),
    );
}

function getProgramInstructionsEnumFragment(
    scope: Pick<RenderScope, 'nameApi'> & {
        allInstructions: InstructionNode[];
        programNode: ProgramNode;
    },
): Fragment {
    const { programNode, allInstructions, nameApi } = scope;
    const programInstructionsEnum = nameApi.programInstructionsEnum(programNode.name);
    const programInstructionsEnumVariants = allInstructions.map(instruction =>
        nameApi.programInstructionsEnumVariant(instruction.name),
    );
    return fragment`export enum ${programInstructionsEnum} { ${programInstructionsEnumVariants.join(', ')} }`;
}

function getProgramInstructionsIdentifierFunctionFragment(
    scope: Pick<RenderScope, 'nameApi' | 'typeManifestVisitor'> & {
        allInstructions: InstructionNode[];
        programNode: ProgramNode;
    },
): Fragment | undefined {
    const { programNode, nameApi, allInstructions } = scope;
    const instructionsWithDiscriminators = allInstructions.filter(
        instruction => (instruction.discriminators ?? []).length > 0,
    );
    const hasInstructionDiscriminators = instructionsWithDiscriminators.length > 0;
    if (!hasInstructionDiscriminators) return;

    const programInstructionsEnum = nameApi.programInstructionsEnum(programNode.name);
    const programInstructionsIdentifierFunction = nameApi.programInstructionsIdentifierFunction(programNode.name);
    const discriminatorsFragment = mergeFragments(
        instructionsWithDiscriminators.map((instruction): Fragment => {
            const variant = nameApi.programInstructionsEnumVariant(instruction.name);
            return getDiscriminatorConditionFragment({
                ...scope,
                dataName: 'data',
                discriminators: instruction.discriminators ?? [],
                ifTrue: `return ${programInstructionsEnum}.${variant};`,
                struct: structTypeNodeFromInstructionArgumentNodes(instruction.arguments),
            });
        }),
        c => c.join('\n'),
    );

    const readonlyUint8Array = use('type ReadonlyUint8Array', 'solanaCodecsCore');
    const solanaError = use('SolanaError', 'solanaErrors');
    const solanaErrorCode = use('SOLANA_ERROR__PROGRAM_CLIENTS__FAILED_TO_IDENTIFY_INSTRUCTION', 'solanaErrors');

    return fragment`export function ${programInstructionsIdentifierFunction}(instruction: { data: ${readonlyUint8Array} } | ${readonlyUint8Array}): ${programInstructionsEnum} {
    const data = 'data' in instruction ? instruction.data : instruction;
    ${discriminatorsFragment}
    throw new ${solanaError}(${solanaErrorCode}, { instructionData: data, programName: "${programNode.name}" });
}`;
}

function getProgramInstructionsParsedUnionTypeFragment(
    scope: Pick<RenderScope, 'nameApi'> & {
        allInstructions: InstructionNode[];
        programNode: ProgramNode;
    },
): Fragment {
    const { programNode, allInstructions, nameApi } = scope;

    const programAddress = programNode.publicKey;
    const programInstructionsType = nameApi.programInstructionsParsedUnionType(programNode.name);
    const programInstructionsEnum = nameApi.programInstructionsEnum(programNode.name);

    const typeVariants = allInstructions.map((instruction): Fragment => {
        const instructionEnumVariant = nameApi.programInstructionsEnumVariant(instruction.name);
        const parsedInstructionType = use(
            `type ${nameApi.instructionParsedType(instruction.name)}`,
            'generatedInstructions',
        );

        return fragment`| { instructionType: ${programInstructionsEnum}.${instructionEnumVariant} } & ${parsedInstructionType}<TProgram>`;
    });

    return mergeFragments(
        [
            fragment`export type ${programInstructionsType}<TProgram extends string = '${programAddress}'> =`,
            ...typeVariants,
        ],
        c => c.join('\n'),
    );
}

function getProgramInstructionsParseFunctionFragment(
    scope: Pick<RenderScope, 'nameApi' | 'typeManifestVisitor'> & {
        allInstructions: InstructionNode[];
        programNode: ProgramNode;
    },
): Fragment | undefined {
    const { programNode, nameApi, allInstructions } = scope;

    // Only generate if there are instructions with discriminators (i.e., identifier function exists)
    const instructionsWithDiscriminators = allInstructions.filter(
        instruction => (instruction.discriminators ?? []).length > 0,
    );
    if (instructionsWithDiscriminators.length === 0) return;

    const programInstructionsEnum = nameApi.programInstructionsEnum(programNode.name);
    const programInstructionsIdentifierFunction = nameApi.programInstructionsIdentifierFunction(programNode.name);
    const programInstructionsParsedUnionType = nameApi.programInstructionsParsedUnionType(programNode.name);
    const parseFunction = nameApi.programInstructionsParseFunction(programNode.name);

    const switchCases = mergeFragments(
        allInstructions.map((instruction): Fragment => {
            const enumVariant = nameApi.programInstructionsEnumVariant(instruction.name);
            const parseFunction = use(nameApi.instructionParseFunction(instruction.name), 'generatedInstructions');
            const assertIsInstructionWithAccounts = use('assertIsInstructionWithAccounts', 'solanaInstructions');
            // Only need accounts assertion since data is guaranteed by the input type
            const hasAccounts = instruction.accounts.length > 0;
            const assertionsCode = hasAccounts
                ? fragment`${assertIsInstructionWithAccounts}(instruction);\n`
                : fragment``;
            return fragment`case ${programInstructionsEnum}.${enumVariant}: { ${assertionsCode}return { instructionType: ${programInstructionsEnum}.${enumVariant}, ...${parseFunction}(instruction) }; }`;
        }),
        c => c.join('\n'),
    );

    const solanaError = use('SolanaError', 'solanaErrors');
    const solanaErrorCode = use('SOLANA_ERROR__PROGRAM_CLIENTS__UNRECOGNIZED_INSTRUCTION_TYPE', 'solanaErrors');

    return fragment`
        export function ${parseFunction}<TProgram extends string>(
            instruction: ${use('type Instruction', 'solanaInstructions')}<TProgram> 
                & ${use('type InstructionWithData', 'solanaInstructions')}<${use('type ReadonlyUint8Array', 'solanaCodecsCore')}>
        ): ${programInstructionsParsedUnionType}<TProgram> {
            const instructionType = ${programInstructionsIdentifierFunction}(instruction);
            switch (instructionType) {
                ${switchCases}
                default: throw new ${solanaError}(${solanaErrorCode}, { instructionType: instructionType as string, programName: "${programNode.name}" });
            }
        }`;
}
