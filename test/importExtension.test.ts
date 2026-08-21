import {
    accountNode,
    constantNode,
    definedTypeLinkNode,
    definedTypeNode,
    enumEmptyVariantTypeNode,
    enumTypeNode,
    enumValueNode,
    instructionAccountNode,
    instructionNode,
    pdaLinkNode,
    pdaNode,
    programNode,
    publicKeyTypeNode,
    rootNode,
    structFieldTypeNode,
    structTypeNode,
} from '@codama/nodes';
import { visit } from '@codama/visitors-core';
import { test } from 'vitest';

import { getRenderMapVisitor } from '../src';
import { renderMapContains, renderMapDoesNotContain } from './_setup';

const node = rootNode(
    programNode({
        accounts: [
            accountNode({
                data: structTypeNode([
                    structFieldTypeNode({ name: 'authority', type: publicKeyTypeNode() }),
                    structFieldTypeNode({ name: 'status', type: definedTypeLinkNode('accountStatus') }),
                ]),
                name: 'counter',
                pda: pdaLinkNode('counter'),
            }),
        ],
        constants: [
            constantNode(
                'defaultStatus',
                definedTypeLinkNode('accountStatus'),
                enumValueNode('accountStatus', 'active'),
            ),
        ],
        definedTypes: [
            definedTypeNode({
                name: 'accountStatus',
                type: enumTypeNode([enumEmptyVariantTypeNode('Active'), enumEmptyVariantTypeNode('Paused')]),
            }),
            definedTypeNode({
                name: 'counterConfig',
                type: structTypeNode([
                    structFieldTypeNode({ name: 'status', type: definedTypeLinkNode('accountStatus') }),
                ]),
            }),
        ],
        instructions: [
            instructionNode({
                accounts: [instructionAccountNode({ isSigner: false, isWritable: true, name: 'counter' })],
                name: 'increment',
            }),
        ],
        name: 'myProgram',
        pdas: [pdaNode({ name: 'counter', seeds: [] })],
        publicKey: '1111',
    }),
);

test('it appends explicit extensions to the relative imports of generated files', async () => {
    // When we render the program using the `js` import extension.
    const renderMap = visit(node, getRenderMapVisitor({ importExtension: 'js' }));

    // Then we expect PDA and defined type imports to point at their folder's index file.
    await renderMapContains(renderMap, 'accounts/counter.ts', ["from '../pdas/index.js'", "from '../types/index.js'"]);

    // And we expect sibling types to import from their own folder's index file.
    await renderMapContains(renderMap, 'types/counterConfig.ts', "from './index.js'");

    // And we expect top-level constants to import linked types from the types index.
    await renderMapContains(renderMap, 'constants.ts', "from './types/index.js'");

    // And we expect instructions to import their program constants the same way.
    await renderMapContains(renderMap, 'instructions/increment.ts', "from '../programs/index.js'");
});

test('it appends explicit extensions to the re-exports of generated barrels', async () => {
    // When we render the program using the `js` import extension.
    const renderMap = visit(node, getRenderMapVisitor({ importExtension: 'js' }));

    // Then we expect the root index to re-export each folder's index file.
    await renderMapContains(renderMap, 'index.ts', [
        "export * from './accounts/index.js';",
        "export * from './constants.js';",
        "export * from './instructions/index.js';",
        "export * from './pdas/index.js';",
        "export * from './programs/index.js';",
        "export * from './types/index.js';",
    ]);

    // And we expect folder barrels to re-export each file directly.
    await renderMapContains(renderMap, 'accounts/index.ts', "export * from './counter.js';");
    await renderMapContains(renderMap, 'types/index.ts', [
        "export * from './accountStatus.js';",
        "export * from './counterConfig.js';",
    ]);
});

test('it supports TypeScript extensions', async () => {
    // When we render the program using the `ts` import extension.
    const renderMap = visit(node, getRenderMapVisitor({ importExtension: 'ts' }));

    // Then we expect every generated specifier to use the `.ts` extension.
    await renderMapContains(renderMap, 'accounts/counter.ts', "from '../pdas/index.ts'");
    await renderMapContains(renderMap, 'index.ts', "export * from './accounts/index.ts';");
    await renderMapContains(renderMap, 'index.ts', "export * from './constants.ts';");
    await renderMapContains(renderMap, 'accounts/index.ts', "export * from './counter.ts';");
});

test('it does not append extensions to external packages', async () => {
    // When we render the program using the `js` import extension.
    const renderMap = visit(node, getRenderMapVisitor({ importExtension: 'js' }));

    // Then we expect `@solana/kit` imports to be left untouched.
    await renderMapContains(renderMap, 'accounts/counter.ts', "from '@solana/kit'");
    await renderMapDoesNotContain(renderMap, 'accounts/counter.ts', "from '@solana/kit/index.js'");
});

test('it does not append extensions by default', async () => {
    // When we render the program without the import extension option.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect extensionless specifiers everywhere.
    await renderMapContains(renderMap, 'accounts/counter.ts', ["from '../pdas'", "from '../types'"]);
    await renderMapContains(renderMap, 'index.ts', "export * from './accounts';");
    await renderMapContains(renderMap, 'accounts/index.ts', "export * from './counter';");
});
