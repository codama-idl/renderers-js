import { definedTypeNode, InstructionNode } from '@codama/nodes';
import { getByteSizeVisitor, getLastNodeFromPath, NodePath, NodeStack, visit } from '@codama/visitors-core';

import { Fragment, RenderScope } from '../utils';
import { getTypeWithCodecFragment } from './typeWithCodec';

/**
 * Renders the type and codecs of the data an instruction returns to its caller, e.g.
 * `TransferInstructionReturnData` and `getTransferInstructionReturnDataDecoder`, to decode
 * the return data of a transaction calling it.
 *
 * @param scope - The render scope and the path of the instruction.
 * @return The fragment of the return data type and codecs, if the instruction returns data.
 *
 * @example
 * ```ts
 * const amount = getTransferInstructionReturnDataDecoder().decode(returnData);
 * ```
 */
export function getInstructionReturnDataFragment(
    scope: Pick<RenderScope, 'erasableSyntax' | 'linkables' | 'nameApi' | 'typeManifestVisitor'> & {
        instructionPath: NodePath<InstructionNode>;
    },
): Fragment | undefined {
    const { instructionPath, linkables, nameApi, typeManifestVisitor } = scope;
    const instructionNode = getLastNodeFromPath(instructionPath);
    if (!instructionNode.returnData) return;

    // The return data is described as a defined type of its own, so that types nested within
    // it are named after it rather than after the instruction data.
    const returnDataName = nameApi.instructionReturnDataType(instructionNode.identifier);
    const returnDataNode = definedTypeNode({ identifier: returnDataName, type: instructionNode.returnData });
    const stack = new NodeStack(instructionPath);
    return getTypeWithCodecFragment({
        erasableSyntax: scope.erasableSyntax,
        manifest: visit(returnDataNode, typeManifestVisitor),
        name: returnDataName,
        nameApi,
        node: instructionNode.returnData,
        size: visit(returnDataNode, getByteSizeVisitor(linkables, { stack })),
    });
}
