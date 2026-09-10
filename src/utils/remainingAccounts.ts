import { getAllInstructionArguments, InstructionNode, InstructionRemainingAccountsNode, isNode } from '@codama/nodes';

/**
 * Whether the given remaining accounts are backed by an existing instruction argument — i.e.
 * an array of addresses encoded in the instruction data — as opposed to an argument added
 * to the instruction input for the sole purpose of providing these remaining accounts.
 */
export function isRemainingAccountsBackedByArgument(
    instructionNode: InstructionNode,
    remainingAccounts: InstructionRemainingAccountsNode,
): boolean {
    if (!isNode(remainingAccounts.value, 'argumentValueNode')) return false;
    const argumentName = remainingAccounts.value.name;
    return getAllInstructionArguments(instructionNode).some(argument => argument.name === argumentName);
}

/**
 * Whether the given instruction has remaining accounts provided via a dedicated argument
 * added to the instruction input — i.e. remaining accounts that accept the same inputs as
 * instruction accounts and are converted using the same account meta helper.
 */
export function hasRemainingAccountInputs(instructionNode: InstructionNode): boolean {
    return (instructionNode.remainingAccounts ?? []).some(
        remainingAccounts =>
            isNode(remainingAccounts.value, 'argumentValueNode') &&
            !isRemainingAccountsBackedByArgument(instructionNode, remainingAccounts),
    );
}
