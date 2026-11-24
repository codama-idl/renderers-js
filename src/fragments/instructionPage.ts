import { logWarn } from '@codama/errors';
import { definedTypeNode, InstructionNode } from '@codama/nodes';
import { getLastNodeFromPath, NodePath, visit } from '@codama/visitors-core';

import {
    Fragment,
    getInstructionDataNode,
    getInstructionExtraArgumentsNode,
    getProgramNodeFromPath,
    getRenamedArgsMap,
    getStructFields,
    isInputArgument,
    mergeFragments,
    RenderScope,
    ResolvedInstructionInput,
} from '../utils';
import { getDiscriminatorConstantsFragment } from './discriminatorConstants';
import { getInstructionDataFragment } from './instructionData';
import { getInstructionExtraArgsFragment } from './instructionExtraArgs';
import { getInstructionFunctionFragment } from './instructionFunction';
import { getInstructionParseFunctionFragment } from './instructionParseFunction';
import { getInstructionReturnDataFragment } from './instructionReturnData';
import { getInstructionTypeFragment } from './instructionType';

/**
 * Renders the page of an instruction: its discriminator constants, instruction type, data
 * type and codecs, extra arguments type, return data type and codecs, builders and parse function.
 *
 * @param scope - The render scope, the path of the instruction, its resolved inputs and data size.
 * @return The fragment of the instruction page.
 * @throws `CODAMA_ERROR__NODE_PATH_PROGRAM_MISSING` when the instruction is not within a program.
 */
export function getInstructionPageFragment(
    scope: Pick<
        RenderScope,
        | 'asyncResolvers'
        | 'customInstructionData'
        | 'erasableSyntax'
        | 'getImportFrom'
        | 'getImportPath'
        | 'isInternalNode'
        | 'linkables'
        | 'nameApi'
        | 'nonScalarEnums'
        | 'typeManifestVisitor'
    > & {
        instructionPath: NodePath<InstructionNode>;
        resolvedInputs: ResolvedInstructionInput[];
        size: number | null;
    },
): Fragment {
    const node = getLastNodeFromPath(scope.instructionPath);
    // Asserts that the node belongs to a program.
    getProgramNodeFromPath(scope.instructionPath);

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
        // Synchronous builders accept every input asynchronous ones do, and more.
        renamedArgs: getRenamedArgsMap(scope.instructionPath, arg =>
            isInputArgument(arg, { ...scope, useAsync: false }),
        ),
    };
    if (childScope.renamedArgs.size > 0) {
        logWarn(
            `[JavaScript] Accounts and args of instruction [${node.identifier}] have the following ` +
                `conflicting attributes [${[...childScope.renamedArgs.keys()].join(', ')}]. ` +
                `Thus, the arguments have been renamed to avoid conflicts in the input type.`,
        );
    }

    return mergeFragments(
        [
            getDiscriminatorConstantsFragment({
                ...childScope,
                discriminatorNodes: node.discriminators ?? [],
                fields: getStructFields(getInstructionDataNode(node), scope.instructionPath, scope.linkables),
                path: childScope.instructionPath,
                prefix: node.identifier,
            }),
            getInstructionTypeFragment(childScope),
            getInstructionDataFragment(childScope),
            getInstructionExtraArgsFragment(childScope),
            getInstructionReturnDataFragment(childScope),
            getInstructionFunctionFragment({ ...childScope, useAsync: true }),
            getInstructionFunctionFragment({ ...childScope, useAsync: false }),
            getInstructionParseFunctionFragment(childScope),
        ],
        cs => cs.join('\n\n'),
    );
}
