import {
    InstructionAccountNode,
    InstructionInputValueNode,
    InstructionNode,
    parseOptionalAccountStrategy,
} from '@codama/nodes';
import { getLastNodeFromPath, LinkableDictionary, NodePath } from '@codama/visitors-core';

import {
    findResolvedAccount,
    Fragment,
    fragment,
    getAccountTypeParamName,
    getProgramNodeFromPath,
    getStringLiteral,
    RenderScope,
    ResolvedInstructionInput,
    use,
} from '../utils';

/**
 * Renders the type parameter of an instruction account in instruction types, accepting
 * account metas and defaulting to the address of the account when the builder fills it in
 * with one known statically, e.g. a program or public key default.
 *
 * @param instructionAccountNode - The instruction account.
 * @param scope - The render scope, the path of the instruction and its resolved inputs.
 * @return The fragment of the type parameter.
 */
export function getInstructionAccountTypeParamFragment(
    instructionAccountNode: InstructionAccountNode,
    scope: Pick<RenderScope, 'linkables'> & {
        instructionPath: NodePath<InstructionNode>;
        resolvedInputs: readonly ResolvedInstructionInput[];
    },
): Fragment {
    const { instructionPath, linkables, resolvedInputs } = scope;
    const instructionNode = getLastNodeFromPath(instructionPath);
    const programNode = getProgramNodeFromPath(instructionPath);
    const typeParam = getAccountTypeParamName(instructionAccountNode.identifier);
    const accountMeta = fragment` | ${use('type AccountMeta', 'solanaInstructions')}<string>`;

    const omitsOptionalAccounts = parseOptionalAccountStrategy(instructionNode.optionalAccountStrategy) === 'omitted';
    if (omitsOptionalAccounts && instructionAccountNode.isOptional) {
        return fragment`${typeParam} extends string${accountMeta} | undefined = undefined`;
    }

    // The builder fills in the resolved default, which accounts with a resolver do not have.
    const defaultValue = findResolvedAccount(resolvedInputs, instructionAccountNode)?.resolvedDefaultValue;
    const defaultAddress = getDefaultAddress(defaultValue, programNode.publicKey, linkables);
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
