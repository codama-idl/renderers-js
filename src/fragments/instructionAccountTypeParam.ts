import { InstructionAccountNode, InstructionInputValueNode } from '@codama/nodes';
import { findInstructionNodeFromPath, getLastNodeFromPath, LinkableDictionary, NodePath } from '@codama/visitors-core';

import { Fragment, fragment, getAccountTypeParamName, getProgramNodeFromPath, RenderScope, use } from '../utils';

/**
 * Renders the type parameter of an instruction account in instruction types, defaulting to
 * the address of the account when it is known statically, e.g. a program or public key default.
 *
 * @param scope - The render scope, the path of the instruction account and whether account
 * metas are accepted as values.
 * @return The fragment of the type parameter.
 */
export function getInstructionAccountTypeParamFragment(
    scope: Pick<RenderScope, 'linkables'> & {
        allowAccountMeta: boolean;
        instructionAccountPath: NodePath<InstructionAccountNode>;
    },
): Fragment {
    const { instructionAccountPath, allowAccountMeta, linkables } = scope;
    const instructionAccountNode = getLastNodeFromPath(instructionAccountPath);
    const instructionNode = findInstructionNodeFromPath(instructionAccountPath)!;
    const programNode = getProgramNodeFromPath(instructionAccountPath);
    const typeParam = getAccountTypeParamName(instructionAccountNode.identifier);
    const accountMeta = allowAccountMeta
        ? fragment` | ${use('type AccountMeta', 'solanaInstructions')}<string>`
        : undefined;

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
            return `"${defaultValue.publicKey}"`;
        case 'programLinkNode':
            const programNode = linkables.get([defaultValue]);
            return programNode ? `"${programNode.publicKey}"` : 'string';
        case 'programIdValueNode':
            return `"${programId}"`;
        default:
            return 'string';
    }
}
