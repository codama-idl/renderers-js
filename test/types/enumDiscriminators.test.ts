import {
    definedTypeNode,
    enumEmptyVariantTypeNode,
    enumStructVariantTypeNode,
    enumTupleVariantTypeNode,
    enumTypeNode,
    numberTypeNode,
    structFieldTypeNode,
    structTypeNode,
    tupleTypeNode,
} from '@codama/nodes';
import { visit } from '@codama/visitors-core';
import { test } from 'vitest';

import { getRenderMapVisitor } from '../../src';
import { renderMapContains, renderMapDoesNotContain } from '../_setup';

// Given a scalar enum whose variants carry custom discriminators.
const directionTypeNode = definedTypeNode({
    name: 'direction',
    type: enumTypeNode([
        enumEmptyVariantTypeNode('up'),
        enumEmptyVariantTypeNode('down', 3),
        enumEmptyVariantTypeNode('left', 5),
    ]),
});

// And a data enum whose variants carry custom discriminators.
const eventTypeNode = definedTypeNode({
    name: 'event',
    type: enumTypeNode([
        enumEmptyVariantTypeNode('quit'),
        enumTupleVariantTypeNode('write', tupleTypeNode([numberTypeNode('u32')]), 3),
        enumStructVariantTypeNode(
            'move',
            structTypeNode([structFieldTypeNode({ name: 'x', type: numberTypeNode('u32') })]),
            5,
        ),
    ]),
});

test('it declares scalar enum members with their custom discriminators', async () => {
    // When we render the scalar enum.
    const renderMap = visit(directionTypeNode, getRenderMapVisitor());

    // Then omitted discriminators fall back to the variant position.
    await renderMapContains(renderMap, 'types/direction.ts', [
        'export enum Direction { Up = 0, Down = 3, Left = 5 }',
        'return getEnumEncoder(Direction, { useValuesAsDiscriminators: true });',
        'return getEnumDecoder(Direction, { useValuesAsDiscriminators: true });',
    ]);
});

test('it declares scalar enum members with their custom discriminators when erasableSyntax is enabled', async () => {
    // When we render the scalar enum with the erasableSyntax option.
    const renderMap = visit(directionTypeNode, getRenderMapVisitor({ erasableSyntax: true }));

    // Then both mappings of the const object use the custom discriminators.
    await renderMapContains(renderMap, 'types/direction.ts', [
        "export const Direction = { 0: 'Up', 3: 'Down', 5: 'Left', Up: 0, Down: 3, Left: 5 } as const;",
        'return getEnumEncoder(Direction, { useValuesAsDiscriminators: true });',
        'return getEnumDecoder(Direction as Omit< typeof Direction, number >, { useValuesAsDiscriminators: true });',
    ]);
});

test('it maps the discriminated union prefix to the custom discriminators', async () => {
    // When we render the data enum.
    const renderMap = visit(eventTypeNode, getRenderMapVisitor());

    // Then the prefix codec translates between variant positions and custom values.
    await renderMapContains(renderMap, 'types/event.ts', [
        'size: transformEncoder( getU8Encoder(), (index: bigint | number) => [0, 3, 5][Number(index)] )',
        'size: transformDecoder( getU8Decoder(), (value: bigint | number) => [0, 3, 5].indexOf(Number(value)) )',
    ]);
});

test('it keeps the configured prefix size when mapping custom discriminators', async () => {
    // Given a data enum with a u16 prefix and custom discriminators.
    const node = definedTypeNode({
        name: 'event',
        type: enumTypeNode(
            [
                enumEmptyVariantTypeNode('quit', 300),
                enumTupleVariantTypeNode('write', tupleTypeNode([numberTypeNode('u32')])),
            ],
            { size: numberTypeNode('u16') },
        ),
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the u16 codec is the one being mapped.
    await renderMapContains(renderMap, 'types/event.ts', [
        'size: transformEncoder( getU16Encoder(), (index: bigint | number) => [300, 1][Number(index)] )',
        'size: transformDecoder( getU16Decoder(), (value: bigint | number) => [300, 1].indexOf(Number(value)) )',
    ]);
});

test('it renders enums without custom discriminators as before', async () => {
    // Given scalar and data enums without custom discriminators.
    const scalarNode = definedTypeNode({
        name: 'direction',
        type: enumTypeNode([enumEmptyVariantTypeNode('up'), enumEmptyVariantTypeNode('down')]),
    });
    const dataNode = definedTypeNode({
        name: 'event',
        type: enumTypeNode([
            enumEmptyVariantTypeNode('quit'),
            enumTupleVariantTypeNode('write', tupleTypeNode([numberTypeNode('u32')])),
        ]),
    });

    // When we render them.
    const scalarRenderMap = visit(scalarNode, getRenderMapVisitor());
    const dataRenderMap = visit(dataNode, getRenderMapVisitor());

    // Then no discriminator options are added.
    await renderMapContains(scalarRenderMap, 'types/direction.ts', [
        'export enum Direction { Up, Down }',
        'return getEnumEncoder(Direction);',
    ]);
    await renderMapDoesNotContain(dataRenderMap, 'types/event.ts', ['useValuesAsDiscriminators', 'transformEncoder']);
});
