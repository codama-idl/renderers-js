/**
 * Which instructions of a program the generated client includes.
 *
 * Every part of the client listing instructions, e.g. pages, barrels, program helpers and
 * the program plugin, goes through these helpers so that they always agree.
 *
 * @packageDocumentation
 */

import { getTextNodeContent, InstructionNode, ProgramNode } from '@codama/nodes';
import { getLastNodeFromPath, NodePath } from '@codama/visitors-core';

/**
 * Whether an instruction is archived, i.e. kept in the IDL for historical reference only
 * and left out of client SDKs, along with its sub-instructions.
 *
 * @param instruction - The instruction.
 */
export function isArchivedInstruction(instruction: InstructionNode): boolean {
    return instruction.status?.lifecycle === 'archived';
}

/**
 * The paths of the instructions of a program rendered as instruction pages: the leaves of
 * the instruction tree, along with the parent instructions when `renderParentInstructions`
 * is enabled. Archived instructions are left out, along with their sub-instructions. Paths
 * go through parent instructions, so their `provides` remain visible.
 *
 * @param programPath - The path of the program.
 * @param options - Whether parent instructions are rendered, and whether to list
 * sub-instructions before their parent, e.g. to match the most specific discriminators first.
 * @return The paths of the rendered instructions.
 *
 * @example
 * ```ts
 * getRenderedInstructionPaths([root, program], { renderParentInstructions: false });
 * // [[root, program, parent, child], ...]
 * ```
 */
export function getRenderedInstructionPaths(
    programPath: NodePath<ProgramNode>,
    options: { renderParentInstructions: boolean; subInstructionsFirst?: boolean },
): NodePath<InstructionNode>[] {
    const visitInstructions = (
        parentPath: NodePath,
        instructions: readonly InstructionNode[],
    ): NodePath<InstructionNode>[] =>
        instructions
            .filter(instruction => !isArchivedInstruction(instruction))
            .flatMap(instruction => {
                const path: NodePath<InstructionNode> = [...parentPath, instruction];
                const subInstructions = instruction.subInstructions ?? [];
                const isRendered = subInstructions.length === 0 || options.renderParentInstructions;
                const self = isRendered ? [path] : [];
                const subPaths = visitInstructions(path, subInstructions);
                return options.subInstructionsFirst ? [...subPaths, ...self] : [...self, ...subPaths];
            });
    return visitInstructions(programPath, getLastNodeFromPath(programPath).instructions ?? []);
}

/**
 * The instructions of a program rendered as instruction pages. See {@link getRenderedInstructionPaths}.
 *
 * @param programNode - The program.
 * @param options - Whether parent instructions are rendered, and whether to list
 * sub-instructions before their parent.
 * @return The rendered instructions.
 */
export function getRenderedInstructions(
    programNode: ProgramNode,
    options: { renderParentInstructions: boolean; subInstructionsFirst?: boolean },
): InstructionNode[] {
    return getRenderedInstructionPaths([programNode], options).map(path => getLastNodeFromPath(path));
}

/**
 * The documentation of the builders of an instruction: its docs followed by its lifecycle
 * status, as a TSDoc `@deprecated` tag for deprecated instructions, so that editors flag
 * their usages, and an `@experimental` tag for draft ones.
 *
 * @param instruction - The instruction.
 * @return The lines of the documentation, empty when there is nothing to document.
 *
 * @example
 * ```ts
 * getInstructionDocs(instructionNode({ status: instructionStatusNode('deprecated', 'Use `transfer`.') }));
 * // ['@deprecated Use `transfer`.']
 * ```
 */
export function getInstructionDocs(instruction: InstructionNode): string[] {
    const docs = instruction.docs ? [getTextNodeContent(instruction.docs)] : [];
    const status = instruction.status;
    const message = status?.message ? getTextNodeContent(status.message) : undefined;
    const statusLines = ((): string[] => {
        switch (status?.lifecycle) {
            case 'deprecated':
                return [message ? `@deprecated ${message}` : '@deprecated'];
            case 'draft':
                return [message ?? 'This instruction is a draft and may change.', '', '@experimental'];
            default:
                return [];
        }
    })();
    if (docs.length === 0 || statusLines.length === 0) return [...docs, ...statusLines];
    return [...docs, '', ...statusLines];
}
