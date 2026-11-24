import { InstructionAccountNode, InstructionInputValueNode, InstructionNode } from '@codama/nodes';
import { getLastNodeFromPath, LinkableDictionary, NodePath } from '@codama/visitors-core';

import {
    fragment,
    Fragment,
    getAccountTypeParamName,
    getProgramNodeFromPath,
    getStringLiteral,
    RenderScope,
    use,
} from '../utils';

/**
 * Renders the type parameter of an instruction account in instruction types, accepting
 * account metas and defaulting to the address of the account when it is known statically,
 * e.g. a program or public key default.
 *
 * @param instructionAccountNode - The instruction account.
 * @param scope - The render scope and the path of the instruction.
 * @return The fragment of the type parameter.
 */
export function getInstructionAccountTypeParamFragment(
    instructionAccountNode: InstructionAccountNode,
    scope: Pick<RenderScope, 'linkables'> & { instructionPath: NodePath<InstructionNode> },
): Fragment {
    const { instructionPath, linkables } = scope;
    const instructionNode = getLastNodeFromPath(instructionPath);
    const programNode = getProgramNodeFromPath(instructionPath);
    const typeParam = getAccountTypeParamName(instructionAccountNode.identifier);
    const accountMeta = fragment` | ${use('type AccountMeta', 'solanaInstructions')}<string>`;

    if (instructionNode.optionalAccountStrategy === 'omitted' && instructionAccountNode.isOptional) {
        return fragment`${typeParam} extends string${accountMeta} | undefined = undefined`;
    }

    const defaultAddress = getDefaultAddress(instructionAccountNode.defaultValue, programNode.publicKey, linkables);
    return fragment`${typeParam} extends string${accountMeta} = ${defaultAddress}`;
}

function getDefaultAddress(
    defaultValue: InstructionInputValueNode | undefined,
    programId: string,
    linkables: LinkableDictionary,
): string {
    switch (defaultValue?.kind) {
        case 'publicKeyValueNode':
            return getStringLiteral(defaultValue.publicKey);
        case 'programLinkNode':
            const programNode = linkables.get([defaultValue]);
            return programNode ? getStringLiteral(programNode.publicKey) : 'string';
        case 'programIdValueNode':
            return getStringLiteral(programId);
        default:
            return 'string';
    }
}
