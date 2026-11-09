import { CODAMA_ERROR__NODE_PATH_PROGRAM_MISSING, CodamaError, logWarn } from '@codama/errors';
import { camelCase } from '@codama/fragments/casing';
import { definedTypeNode, InstructionNode } from '@codama/nodes';
import {
    findProgramNodeFromPath,
    getLastNodeFromPath,
    NodePath,
    ResolvedInstructionInput,
    visit,
} from '@codama/visitors-core';

import {
    Fragment,
    getAllInstructionDataFields,
    getInstructionDataFields,
    getInstructionExtraArgumentsNode,
    mergeFragments,
    RenderScope,
} from '../utils';
import { getDiscriminatorConstantsFragment } from './discriminatorConstants';
import { getInstructionDataFragment } from './instructionData';
import { getInstructionExtraArgsFragment } from './instructionExtraArgs';
import { getInstructionFunctionFragment } from './instructionFunction';
import { getInstructionParseFunctionFragment } from './instructionParseFunction';
import { getInstructionTypeFragment } from './instructionType';

export function getInstructionPageFragment(
    scope: Pick<
        RenderScope,
        | 'asyncResolvers'
        | 'customInstructionData'
        | 'erasableSyntax'
        | 'getImportFrom'
        | 'linkables'
        | 'nameApi'
        | 'typeManifestVisitor'
    > & {
        instructionPath: NodePath<InstructionNode>;
        resolvedInputs: ResolvedInstructionInput[];
        size: number | null;
    },
): Fragment {
    const node = getLastNodeFromPath(scope.instructionPath);
    if (!findProgramNodeFromPath(scope.instructionPath)) {
        throw new CodamaError(CODAMA_ERROR__NODE_PATH_PROGRAM_MISSING, { path: scope.instructionPath });
    }

    const childScope = {
        ...scope,
        dataArgsManifest: visit(node, scope.typeManifestVisitor),
        extraArgsManifest: visit(
            definedTypeNode({
                identifier: scope.nameApi.instructionExtraType(node.identifier),
                type: getInstructionExtraArgumentsNode(node),
            }),
            scope.typeManifestVisitor,
        ),
        renamedArgs: getRenamedArgsMap(node),
    };

    return mergeFragments(
        [
            getDiscriminatorConstantsFragment({
                ...childScope,
                discriminatorNodes: node.discriminators ?? [],
                fields: getInstructionDataFields(node),
                prefix: node.identifier,
            }),
            getInstructionTypeFragment(childScope),
            getInstructionDataFragment(childScope),
            getInstructionExtraArgsFragment(childScope),
            getInstructionFunctionFragment({ ...childScope, useAsync: true }),
            getInstructionFunctionFragment({ ...childScope, useAsync: false }),
            getInstructionParseFunctionFragment(childScope),
        ],
        cs => cs.join('\n\n'),
    );
}

/**
 * Maps the camelCase name of each argument conflicting with an account of the
 * instruction to the camelCase name it is renamed to in the instruction input type.
 *
 * Names are compared by their camelCase form since that is how they are emitted.
 */
export function getRenamedArgsMap(instruction: InstructionNode): Map<string, string> {
    const argNames = getAllInstructionDataFields(instruction).map(a => camelCase(a.name));
    const duplicateArgs = argNames.filter((e, i, a) => a.indexOf(e) !== i);
    if (duplicateArgs.length > 0) {
        throw new Error(
            `Duplicate args found: [${duplicateArgs.join(', ')}] in instruction [${instruction.identifier}].`,
        );
    }

    const allNames = [...(instruction.accounts ?? []).map(account => camelCase(account.identifier)), ...argNames];
    const duplicates = allNames.filter((e, i, a) => a.indexOf(e) !== i);
    if (duplicates.length === 0) return new Map();

    logWarn(
        `[JavaScript] Accounts and args of instruction [${instruction.identifier}] have the following ` +
            `conflicting attributes [${duplicates.join(', ')}]. ` +
            `Thus, the arguments have been renamed to avoid conflicts in the input type.`,
    );

    return new Map(duplicates.map(name => [name, camelCase(`${name}Arg`)]));
}
