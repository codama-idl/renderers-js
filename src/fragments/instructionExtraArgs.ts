import { mapFragmentContent } from '@codama/fragments';
import { InstructionNode } from '@codama/nodes';
import { getLastNodeFromPath, NodePath } from '@codama/visitors-core';

import { Fragment, getInstructionExtraArguments, RenderScope, TypeManifest } from '../utils';

/**
 * Renders the type of the extra arguments of an instruction, i.e. the inputs of its builders
 * that are not part of its data, e.g. `TransferInstructionExtraArgs`.
 *
 * @param scope - The render scope, the path of the instruction and the type manifest of its extra arguments.
 * @return The fragment of the extra arguments type, if the instruction has extra arguments.
 */
export function getInstructionExtraArgsFragment(
    scope: Pick<RenderScope, 'nameApi'> & {
        extraArgsManifest: TypeManifest;
        instructionPath: NodePath<InstructionNode>;
    },
): Fragment | undefined {
    const { instructionPath, extraArgsManifest, nameApi } = scope;
    const instructionNode = getLastNodeFromPath(instructionPath);
    if (getInstructionExtraArguments(instructionNode).length === 0) return;

    const instructionExtraName = nameApi.instructionExtraType(instructionNode.identifier);
    const looseName = nameApi.dataArgsType(instructionExtraName);
    return mapFragmentContent(extraArgsManifest.looseType, c => `export type ${looseName} = ${c};`);
}
