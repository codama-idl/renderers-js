import { CODAMA_ERROR__NODE_PATH_PROGRAM_MISSING, CodamaError } from '@codama/errors';
import { ProgramNode } from '@codama/nodes';
import { findProgramNodeFromPath, NodePath } from '@codama/visitors-core';

/**
 * The program a node belongs to, found along its path.
 *
 * Every page of the generated client belongs to a program, e.g. for its address constant,
 * so nodes visited outside of a program cannot be rendered.
 *
 * @param path - The path of the node, e.g. of an account.
 * @return The closest program of the path.
 * @throws `CODAMA_ERROR__NODE_PATH_PROGRAM_MISSING` when the path has no program.
 *
 * @example
 * ```ts
 * getProgramNodeFromPath([root, program, account]); // program
 * ```
 */
export function getProgramNodeFromPath(path: NodePath): ProgramNode {
    const programNode = findProgramNodeFromPath(path);
    if (!programNode) {
        throw new CodamaError(CODAMA_ERROR__NODE_PATH_PROGRAM_MISSING, { path });
    }
    return programNode;
}
