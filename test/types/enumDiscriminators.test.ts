import { getFromRenderMap } from '@codama/fragments';
import {
    definedTypeNode,
    type DefinedTypeNode,
    enumTypeNode,
    enumVariantTypeNode,
    integerTypeNode,
    structFieldTypeNode,
    structTypeNode,
    tupleTypeNode,
} from '@codama/nodes';
import { visit } from '@codama/visitors-core';
import { expect, test } from 'vitest';

import { getRenderMapVisitor } from '../../src';
import { renderMapContains, renderMapDoesNotContain } from '../_setup';

// Given a scalar enum whose variants carry custom discriminators.
const directionTypeNode = definedTypeNode({
    identifier: 'direction',
    type: enumTypeNode([
        enumVariantTypeNode('up'),
        enumVariantTypeNode('down', { discriminator: 3 }),
        enumVariantTypeNode('left', { discriminator: 5 }),
    ]),
});

// And a data enum whose variants carry custom discriminators.
const eventTypeNode = definedTypeNode({
    identifier: 'event',
    type: enumTypeNode([
        enumVariantTypeNode('quit'),
        enumVariantTypeNode('write', { data: tupleTypeNode([integerTypeNode('u32')]), discriminator: 3 }),
        enumVariantTypeNode('move', {
            data: structTypeNode([structFieldTypeNode({ identifier: 'x', type: integerTypeNode('u32') })]),
            discriminator: 5,
        }),
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
        'size: transformEncoder( getU8Encoder(), (index: bigint | number) => [0, 3, 5][Number(index)]! )',
        'size: transformDecoder( getU8Decoder(), (value: bigint | number) => [0, 3, 5].indexOf(Number(value)) )',
    ]);
});

test('it keeps the configured prefix size when mapping custom discriminators', async () => {
    // Given a data enum with a u16 prefix and custom discriminators.
    const node = definedTypeNode({
        identifier: 'event',
        type: enumTypeNode(
            [
                enumVariantTypeNode('quit', { discriminator: 300 }),
                enumVariantTypeNode('write', { data: tupleTypeNode([integerTypeNode('u32')]) }),
            ],
            { size: integerTypeNode('u16') },
        ),
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the u16 codec is the one being mapped.
    await renderMapContains(renderMap, 'types/event.ts', [
        'size: transformEncoder( getU16Encoder(), (index: bigint | number) => [300, 1][Number(index)]! )',
        'size: transformDecoder( getU16Decoder(), (value: bigint | number) => [300, 1].indexOf(Number(value)) )',
    ]);
});

test('it renders enums without custom discriminators as before', async () => {
    // Given scalar and data enums without custom discriminators.
    const scalarNode = definedTypeNode({
        identifier: 'direction',
        type: enumTypeNode([enumVariantTypeNode('up'), enumVariantTypeNode('down')]),
    });
    const dataNode = definedTypeNode({
        identifier: 'event',
        type: enumTypeNode([
            enumVariantTypeNode('quit'),
            enumVariantTypeNode('write', { data: tupleTypeNode([integerTypeNode('u32')]) }),
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

test('it renders explicit discriminators matching the variant positions as positional ones', () => {
    // Given scalar and data enums whose explicit discriminators match the variant positions.
    const scalarNode = (withDiscriminators: boolean) =>
        definedTypeNode({
            identifier: 'direction',
            type: enumTypeNode([
                enumVariantTypeNode('up', { discriminator: withDiscriminators ? 0 : undefined }),
                enumVariantTypeNode('down', { discriminator: withDiscriminators ? 1 : undefined }),
            ]),
        });
    const dataNode = (withDiscriminators: boolean) =>
        definedTypeNode({
            identifier: 'event',
            type: enumTypeNode([
                enumVariantTypeNode('quit', { discriminator: withDiscriminators ? 0 : undefined }),
                enumVariantTypeNode('write', {
                    data: tupleTypeNode([integerTypeNode('u32')]),
                    discriminator: withDiscriminators ? 1 : undefined,
                }),
            ]),
        });

    // When we render them with and without these discriminators.
    const render = (node: DefinedTypeNode, path: string) =>
        getFromRenderMap(visit(node, getRenderMapVisitor()), path).content;

    // Then we expect the exact same code.
    expect(render(scalarNode(true), 'types/direction.ts')).toBe(render(scalarNode(false), 'types/direction.ts'));
    expect(render(dataNode(true), 'types/event.ts')).toBe(render(dataNode(false), 'types/event.ts'));
});
