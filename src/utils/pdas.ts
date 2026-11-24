import { isNodeFilter, type PdaNode, type ProgramNode } from '@codama/nodes';

/**
 * Whether a PDA takes variable seeds, so that its find function takes a `seeds` argument.
 *
 * @param pdaNode - The PDA.
 */
export function hasVariablePdaSeeds(pdaNode: PdaNode): boolean {
    return (pdaNode.seeds ?? []).some(isNodeFilter('variablePdaSeedNode'));
}

/**
 * Whether a PDA is derived from the given program, i.e. it declares no program ID or the
 * address of that program. Its find function then defaults to the address of that program,
 * which callers deploying the program elsewhere override.
 *
 * @param pdaNode - The PDA.
 * @param programNode - The program it may be derived from.
 */
export function isPdaDerivedFromProgram(pdaNode: PdaNode, programNode: ProgramNode): boolean {
    return pdaNode.programId === undefined || pdaNode.programId === programNode.publicKey;
}
