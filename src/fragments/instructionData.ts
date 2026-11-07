import { InstructionNode } from '@codama/nodes';
import { getLastNodeFromPath, NodePath } from '@codama/visitors-core';

import {
    Fragment,
    getCustomDataOptions,
    getInstructionDataNode,
    hasInstructionData,
    RenderScope,
    TypeManifest,
} from '../utils';
import { getTypeWithCodecFragment } from './typeWithCodec';

export function getInstructionDataFragment(
    scope: Pick<RenderScope, 'customInstructionData' | 'erasableSyntax' | 'nameApi'> & {
        dataArgsManifest: TypeManifest;
        instructionPath: NodePath<InstructionNode>;
        size: number | null;
    },
): Fragment | undefined {
    const { instructionPath, dataArgsManifest, nameApi, customInstructionData } = scope;
    const instructionNode = getLastNodeFromPath(instructionPath);
    if (!hasInstructionData(instructionNode) || getCustomDataOptions(customInstructionData, instructionNode)) return;

    const instructionDataName = nameApi.instructionDataType(instructionNode.name);
    return getTypeWithCodecFragment({
        erasableSyntax: scope.erasableSyntax,
        manifest: dataArgsManifest,
        name: instructionDataName,
        nameApi,
        node: getInstructionDataNode(instructionNode),
        size: scope.size,
    });
}
