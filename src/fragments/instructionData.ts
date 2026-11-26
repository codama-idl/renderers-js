import { InstructionNode } from '@codama/nodes';
import { getLastNodeFromPath, NodePath } from '@codama/visitors-core';

import {
    Fragment,
    getInstructionDataLink,
    getInstructionDataNode,
    hasInstructionData,
    RenderScope,
    TypeManifest,
} from '../utils';
import { getTypeWithCodecFragment } from './typeWithCodec';

/**
 * Renders the data type and codecs of an instruction, unless its data is linked to a defined
 * type or provided by the `customInstructionData` option.
 *
 * @param scope - The render scope, the path of the instruction, its data type manifest and data size.
 * @return The fragment of the instruction data type and codecs, if the instruction has its own data.
 */
export function getInstructionDataFragment(
    scope: Pick<RenderScope, 'customInstructionData' | 'erasableSyntax' | 'nameApi'> & {
        dataArgsManifest: TypeManifest;
        instructionPath: NodePath<InstructionNode>;
        size: number | null;
    },
): Fragment | undefined {
    const { instructionPath, dataArgsManifest, nameApi, customInstructionData } = scope;
    const instructionNode = getLastNodeFromPath(instructionPath);
    // Linked data is imported rather than rendered.
    if (getInstructionDataLink(instructionNode, customInstructionData)) return;
    if (!hasInstructionData(instructionNode, customInstructionData)) return;

    const instructionDataName = nameApi.instructionDataType(instructionNode.identifier);
    return getTypeWithCodecFragment({
        erasableSyntax: scope.erasableSyntax,
        manifest: dataArgsManifest,
        name: instructionDataName,
        nameApi,
        node: getInstructionDataNode(instructionNode),
        size: scope.size,
    });
}
