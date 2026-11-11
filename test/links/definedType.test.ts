import {
    addTypeNodeTransforms,
    definedTypeLinkNode,
    definedTypeNode,
    enumTypeNode,
    enumValueNode,
    enumVariantTypeNode,
    fixedSizeTransformNode,
    integerTypeNode,
    programNode,
    stringTypeNode,
    structFieldTypeNode,
    structTypeNode,
    tupleTypeNode,
} from '@codama/nodes';
import { visit } from '@codama/visitors-core';
import { test } from 'vitest';

import { getRenderMapVisitor } from '../../src';
import { renderMapContains, renderMapContainsImports } from '../_setup';

test('it imports types and functions from the linked type', async () => {
    // Given the following node.
    const node = programNode({
        definedTypes: [
            definedTypeNode({
                identifier: 'symbol',
                type: addTypeNodeTransforms(stringTypeNode('utf8'), [fixedSizeTransformNode(5)]),
            }),
            definedTypeNode({
                identifier: 'metadata',
                type: structTypeNode([
                    structFieldTypeNode({ identifier: 'identifier', type: definedTypeLinkNode('symbol') }),
                ]),
            }),
        ],
        identifier: 'myProgram',
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following types and codecs to be exported.
    await renderMapContains(renderMap, 'types/metadata.ts', [
        'export type Metadata = { identifier: Symbol }',
        'export type MetadataArgs = { identifier: SymbolArgs }',
        'getSymbolEncoder()',
        'getSymbolDecoder()',
    ]);

    // And we expect the following imports.
    await renderMapContainsImports(renderMap, 'types/metadata.ts', {
        '.': ['type Symbol', 'type SymbolArgs', 'getSymbolEncoder', 'getSymbolDecoder'],
    });
});

test('it can override the import of a linked type', async () => {
    // Given the following node.
    const node = programNode({
        definedTypes: [
            definedTypeNode({
                identifier: 'symbol',
                type: addTypeNodeTransforms(stringTypeNode('utf8'), [fixedSizeTransformNode(5)]),
            }),
            definedTypeNode({
                identifier: 'metadata',
                type: structTypeNode([
                    structFieldTypeNode({ identifier: 'identifier', type: definedTypeLinkNode('symbol') }),
                ]),
            }),
        ],
        identifier: 'myProgram',
        publicKey: '1111',
    });

    // When we render it using a custom import.
    const renderMap = visit(
        node,
        getRenderMapVisitor({
            linkOverrides: {
                definedTypes: { symbol: 'hooked' },
            },
        }),
    );

    // Then we expect the following types and codecs to be exported.
    await renderMapContains(renderMap, 'types/metadata.ts', [
        'export type Metadata = { identifier: Symbol }',
        'export type MetadataArgs = { identifier: SymbolArgs }',
        'getSymbolEncoder()',
        'getSymbolDecoder()',
    ]);

    // And we expect the imports to be overridden.
    await renderMapContainsImports(renderMap, 'types/metadata.ts', {
        '../../hooked': ['type Symbol', 'type SymbolArgs', 'getSymbolEncoder', 'getSymbolDecoder'],
    });
});

test('it knows if an enum value is a scalar enum using link nodes', async () => {
    // Given a program with a scalar enum linked in a default value.
    const node = programNode({
        definedTypes: [
            definedTypeNode({
                identifier: 'person',
                type: structTypeNode([
                    structFieldTypeNode({
                        defaultValue: enumValueNode('direction', 'up'),
                        identifier: 'movement',
                        type: definedTypeLinkNode('direction'),
                    }),
                ]),
            }),
            definedTypeNode({
                identifier: 'direction',
                type: enumTypeNode([
                    enumVariantTypeNode('up'),
                    enumVariantTypeNode('right'),
                    enumVariantTypeNode('down'),
                    enumVariantTypeNode('left'),
                ]),
            }),
        ],
        identifier: 'myProgram',
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the direction enum to be exported as a scalar enum.
    await renderMapContains(renderMap, 'types/person.ts', [
        'movement: value.movement ?? Direction.Up',
        'export type Person = { movement: Direction }',
        'export type PersonArgs = { movement?: DirectionArgs }',
        'getDirectionEncoder()',
        'getDirectionDecoder()',
    ]);

    // And we expect the following imports.
    await renderMapContainsImports(renderMap, 'types/person.ts', {
        '.': ['Direction', 'type DirectionArgs', 'getDirectionEncoder', 'getDirectionDecoder'],
    });
});

test('it knows if an enum value is a data enum using link nodes', async () => {
    // Given a program with a data enum linked in a default value.
    const node = programNode({
        definedTypes: [
            definedTypeNode({
                identifier: 'person',
                type: structTypeNode([
                    structFieldTypeNode({
                        defaultValue: enumValueNode('action', 'stop'),
                        identifier: 'nextAction',
                        type: definedTypeLinkNode('action'),
                    }),
                ]),
            }),
            definedTypeNode({
                identifier: 'action',
                type: enumTypeNode([
                    enumVariantTypeNode('stop'),
                    enumVariantTypeNode('turnRight'),
                    enumVariantTypeNode('turnLeft'),
                    enumVariantTypeNode('moveForward', { data: tupleTypeNode([integerTypeNode('u8')]) }),
                ]),
            }),
        ],
        identifier: 'myProgram',
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the action enum to be exported as a data enum.
    await renderMapContains(renderMap, 'types/person.ts', [
        "nextAction: value.nextAction ?? action('Stop')",
        'export type Person = { nextAction: Action }',
        'export type PersonArgs = { nextAction?: ActionArgs }',
        'getActionEncoder()',
        'getActionDecoder()',
    ]);

    // And we expect the following imports.
    await renderMapContainsImports(renderMap, 'types/person.ts', {
        '.': ['type Action', 'type ActionArgs', 'getActionEncoder', 'getActionDecoder'],
    });
});
