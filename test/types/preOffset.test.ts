import { addTypeNodeTransforms, definedTypeNode, integerTypeNode, preOffsetTransformNode } from '@codama/nodes';
import { visit } from '@codama/visitors-core';
import { test } from 'vitest';

import { getRenderMapVisitor } from '../../src';
import { renderMapContains, renderMapContainsImports } from '../_setup';

test('it renders relative pre-offset codecs', async () => {
    // Given the following node.
    const node = definedTypeNode({
        identifier: 'myType',
        type: addTypeNodeTransforms(integerTypeNode('u32'), [preOffsetTransformNode(4)]),
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following types and codecs to be exported.
    await renderMapContains(renderMap, 'types/my-type.ts', [
        'export type MyType = number',
        'offsetEncoder( getU32Encoder() , { preOffset: ({ preOffset }) => preOffset + 4 } )',
        'offsetDecoder( getU32Decoder() , { preOffset: ({ preOffset }) => preOffset + 4 } )',
    ]);

    // And we expect the following codec imports.
    await renderMapContainsImports(renderMap, 'types/my-type.ts', {
        '@solana/kit': ['offsetEncoder', 'offsetDecoder'],
    });
});

test('it renders negative relative pre-offset codecs', async () => {
    // Given the following node.
    const node = definedTypeNode({
        identifier: 'myType',
        type: addTypeNodeTransforms(integerTypeNode('u32'), [preOffsetTransformNode(-4)]),
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following types and codecs to be exported.
    await renderMapContains(renderMap, 'types/my-type.ts', [
        'export type MyType = number',
        'offsetEncoder( getU32Encoder() , { preOffset: ({ preOffset }) => preOffset - 4 } )',
        'offsetDecoder( getU32Decoder() , { preOffset: ({ preOffset }) => preOffset - 4 } )',
    ]);

    // And we expect the following codec imports.
    await renderMapContainsImports(renderMap, 'types/my-type.ts', {
        '@solana/kit': ['offsetEncoder', 'offsetDecoder'],
    });
});

test('it renders absolute pre-offset codecs', async () => {
    // Given the following node.
    const node = definedTypeNode({
        identifier: 'myType',
        type: addTypeNodeTransforms(integerTypeNode('u32'), [preOffsetTransformNode(4, { strategy: 'absolute' })]),
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following types and codecs to be exported.
    await renderMapContains(renderMap, 'types/my-type.ts', [
        'export type MyType = number',
        'offsetEncoder( getU32Encoder() , { preOffset: () => 4 } )',
        'offsetDecoder( getU32Decoder() , { preOffset: () => 4 } )',
    ]);

    // And we expect the following codec imports.
    await renderMapContainsImports(renderMap, 'types/my-type.ts', {
        '@solana/kit': ['offsetEncoder', 'offsetDecoder'],
    });
});

test('it renders negative absolute pre-offset codecs', async () => {
    // Given the following node.
    const node = definedTypeNode({
        identifier: 'myType',
        type: addTypeNodeTransforms(integerTypeNode('u32'), [preOffsetTransformNode(-4, { strategy: 'absolute' })]),
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following types and codecs to be exported.
    await renderMapContains(renderMap, 'types/my-type.ts', [
        'export type MyType = number',
        'offsetEncoder( getU32Encoder() , { preOffset: ({ wrapBytes }) => wrapBytes(-4) } )',
        'offsetDecoder( getU32Decoder() , { preOffset: ({ wrapBytes }) => wrapBytes(-4) } )',
    ]);

    // And we expect the following codec imports.
    await renderMapContainsImports(renderMap, 'types/my-type.ts', {
        '@solana/kit': ['offsetEncoder', 'offsetDecoder'],
    });
});

test('it renders padded pre-offset codecs', async () => {
    // Given the following node.
    const node = definedTypeNode({
        identifier: 'myType',
        type: addTypeNodeTransforms(integerTypeNode('u32'), [preOffsetTransformNode(4, { strategy: 'padded' })]),
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following types and codecs to be exported.
    await renderMapContains(renderMap, 'types/my-type.ts', [
        'export type MyType = number',
        'padLeftEncoder( getU32Encoder() , 4 )',
        'padLeftDecoder( getU32Decoder() , 4 )',
    ]);

    // And we expect the following codec imports.
    await renderMapContainsImports(renderMap, 'types/my-type.ts', {
        '@solana/kit': ['padLeftEncoder', 'padLeftDecoder'],
    });
});
