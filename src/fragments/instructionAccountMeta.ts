import { InstructionAccountNode } from '@codama/nodes';

import { Fragment, fragment, getAccountTypeParamName, use } from '../utils';

/**
 * Renders the account meta type of an instruction account in instruction types, e.g.
 * `TAccountMint extends string ? ReadonlyAccount<TAccountMint> : TAccountMint`, according
 * to whether the account is a signer and writable.
 *
 * @param instructionAccountNode - The instruction account.
 * @return The fragment of the account meta type.
 */
export function getInstructionAccountMetaFragment(instructionAccountNode: InstructionAccountNode): Fragment {
    const typeParam = getAccountTypeParamName(instructionAccountNode.identifier);

    // Writable, signer.
    if (instructionAccountNode.isSigner === true && instructionAccountNode.isWritable) {
        return fragment`${use('type WritableSignerAccount', 'solanaInstructions')}<${typeParam}> & ${use('type AccountSignerMeta', 'solanaSigners')}<${typeParam}>`;
    }

    // Readonly, signer.
    if (instructionAccountNode.isSigner === true) {
        return fragment`${use('type ReadonlySignerAccount', 'solanaInstructions')}<${typeParam}> & ${use('type AccountSignerMeta', 'solanaSigners')}<${typeParam}>`;
    }

    // Writable, non-signer or optional signer.
    if (instructionAccountNode.isWritable) {
        return fragment`${use('type WritableAccount', 'solanaInstructions')}<${typeParam}>`;
    }

    // Readonly, non-signer or optional signer.
    return fragment`${use('type ReadonlyAccount', 'solanaInstructions')}<${typeParam}>`;
}
