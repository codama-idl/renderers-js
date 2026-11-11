import {
    instructionAccountNode,
    instructionNode,
    pdaNode,
    programLinkNode,
    programNode,
    rootNode,
} from '@codama/nodes';
import { visit } from '@codama/visitors-core';
import { test } from 'vitest';

import { getRenderMapVisitor } from '../../src';
import { renderMapContains, renderMapContainsImports } from '../_setup';

test('it imports constants from the linked program', async () => {
    // Given the following node.
    const node = rootNode(
        programNode({
            identifier: 'myProgram',
            instructions: [
                instructionNode({
                    accounts: [
                        instructionAccountNode({
                            defaultValue: programLinkNode('someOtherProgram'),
                            identifier: 'otherProgram',
                            isSigner: false,
                            isWritable: false,
                        }),
                    ],
                    identifier: 'myInstruction',
                }),
            ],
            pdas: [pdaNode({ identifier: 'counter', seeds: [] })],
            publicKey: '1111',
        }),
        { additionalPrograms: [programNode({ identifier: 'someOtherProgram', publicKey: '2222' })] },
    );

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following to be exported.
    await renderMapContains(renderMap, 'instructions/my-instruction.ts', ['SOME_OTHER_PROGRAM_PROGRAM_ADDRESS']);

    // And we expect the following imports.
    await renderMapContainsImports(renderMap, 'instructions/my-instruction.ts', {
        '../programs': ['SOME_OTHER_PROGRAM_PROGRAM_ADDRESS'],
    });
});

test('it can override the import of a linked account', async () => {
    // Given the following node.
    const node = rootNode(
        programNode({
            identifier: 'myProgram',
            instructions: [
                instructionNode({
                    accounts: [
                        instructionAccountNode({
                            defaultValue: programLinkNode('someOtherProgram'),
                            identifier: 'otherProgram',
                            isSigner: false,
                            isWritable: false,
                        }),
                    ],
                    identifier: 'myInstruction',
                }),
            ],
            pdas: [pdaNode({ identifier: 'counter', seeds: [] })],
            publicKey: '1111',
        }),
        { additionalPrograms: [programNode({ identifier: 'someOtherProgram', publicKey: '2222' })] },
    );

    // When we render it using a custom import.
    const renderMap = visit(
        node,
        getRenderMapVisitor({
            linkOverrides: {
                programs: { someOtherProgram: 'hooked' },
            },
        }),
    );

    // Then we expect the following to be exported.
    await renderMapContains(renderMap, 'instructions/my-instruction.ts', ['SOME_OTHER_PROGRAM_PROGRAM_ADDRESS']);

    // And we expect the imports to be overridden.
    await renderMapContainsImports(renderMap, 'instructions/my-instruction.ts', {
        '../../hooked': ['SOME_OTHER_PROGRAM_PROGRAM_ADDRESS'],
    });
});
