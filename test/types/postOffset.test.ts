import { addTypeNodeTransforms, definedTypeNode, integerTypeNode, postOffsetTransformNode } from '@codama/nodes';
import { visit } from '@codama/visitors-core';
import { test } from 'vitest';

import { getRenderMapVisitor } from '../../src';
import { renderMapContains, renderMapContainsImports } from '../_setup';

test('it renders relative post-offset codecs', async () => {
    // Given the following node.
    const node = definedTypeNode({
        identifier: 'myType',
        type: addTypeNodeTransforms(integerTypeNode('u32'), [postOffsetTransformNode(4)]),
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following types and codecs to be exported.
    await renderMapContains(renderMap, 'types/my-type.ts', [
        'export type MyType = number',
        'offsetEncoder( getU32Encoder() , { postOffset: ({ postOffset }) => postOffset + 4 } )',
        'offsetDecoder( getU32Decoder() , { postOffset: ({ postOffset }) => postOffset + 4 } )',
    ]);

    // And we expect the following codec imports.
    await renderMapContainsImports(renderMap, 'types/my-type.ts', {
        '@solana/kit': ['offsetEncoder', 'offsetDecoder'],
    });
});

test('it renders negative relative post-offset codecs', async () => {
    // Given the following node.
    const node = definedTypeNode({
        identifier: 'myType',
        type: addTypeNodeTransforms(integerTypeNode('u32'), [postOffsetTransformNode(-4)]),
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following types and codecs to be exported.
    await renderMapContains(renderMap, 'types/my-type.ts', [
        'export type MyType = number',
        'offsetEncoder( getU32Encoder() , { postOffset: ({ postOffset }) => postOffset - 4 } )',
        'offsetDecoder( getU32Decoder() , { postOffset: ({ postOffset }) => postOffset - 4 } )',
    ]);

    // And we expect the following codec imports.
    await renderMapContainsImports(renderMap, 'types/my-type.ts', {
        '@solana/kit': ['offsetEncoder', 'offsetDecoder'],
    });
});

test('it renders absolute post-offset codecs', async () => {
    // Given the following node.
    const node = definedTypeNode({
        identifier: 'myType',
        type: addTypeNodeTransforms(integerTypeNode('u32'), [postOffsetTransformNode(4, { strategy: 'absolute' })]),
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following types and codecs to be exported.
    await renderMapContains(renderMap, 'types/my-type.ts', [
        'export type MyType = number',
        'offsetEncoder( getU32Encoder() , { postOffset: () => 4 } )',
        'offsetDecoder( getU32Decoder() , { postOffset: () => 4 } )',
    ]);

    // And we expect the following codec imports.
    await renderMapContainsImports(renderMap, 'types/my-type.ts', {
        '@solana/kit': ['offsetEncoder', 'offsetDecoder'],
    });
});

test('it renders negative absolute post-offset codecs', async () => {
    // Given the following node.
    const node = definedTypeNode({
        identifier: 'myType',
        type: addTypeNodeTransforms(integerTypeNode('u32'), [postOffsetTransformNode(-4, { strategy: 'absolute' })]),
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following types and codecs to be exported.
    await renderMapContains(renderMap, 'types/my-type.ts', [
        'export type MyType = number',
        'offsetEncoder( getU32Encoder() , { postOffset: ({ wrapBytes }) => wrapBytes(-4) } )',
        'offsetDecoder( getU32Decoder() , { postOffset: ({ wrapBytes }) => wrapBytes(-4) } )',
    ]);

    // And we expect the following codec imports.
    await renderMapContainsImports(renderMap, 'types/my-type.ts', {
        '@solana/kit': ['offsetEncoder', 'offsetDecoder'],
    });
});

test('it renders padded post-offset codecs', async () => {
    // Given the following node.
    const node = definedTypeNode({
        identifier: 'myType',
        type: addTypeNodeTransforms(integerTypeNode('u32'), [postOffsetTransformNode(4, { strategy: 'padded' })]),
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following types and codecs to be exported.
    await renderMapContains(renderMap, 'types/my-type.ts', [
        'export type MyType = number',
        'padRightEncoder( getU32Encoder() , 4 )',
        'padRightDecoder( getU32Decoder() , 4 )',
    ]);

    // And we expect the following codec imports.
    await renderMapContainsImports(renderMap, 'types/my-type.ts', {
        '@solana/kit': ['padRightEncoder', 'padRightDecoder'],
    });
});

test('it renders post-offset codecs relative to the pre-offset', async () => {
    // Given the following node.
    const node = definedTypeNode({
        identifier: 'myType',
        type: addTypeNodeTransforms(integerTypeNode('u32'), [postOffsetTransformNode(4, { strategy: 'preOffset' })]),
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following types and codecs to be exported.
    await renderMapContains(renderMap, 'types/my-type.ts', [
        'export type MyType = number',
        'offsetEncoder( getU32Encoder() , { postOffset: ({ preOffset }) => preOffset + 4 } )',
        'offsetDecoder( getU32Decoder() , { postOffset: ({ preOffset }) => preOffset + 4 } )',
    ]);

    // And we expect the following codec imports.
    await renderMapContainsImports(renderMap, 'types/my-type.ts', {
        '@solana/kit': ['offsetEncoder', 'offsetDecoder'],
    });
});

test('it renders negative post-offset codecs relative to the pre-offset', async () => {
    // Given the following node.
    const node = definedTypeNode({
        identifier: 'myType',
        type: addTypeNodeTransforms(integerTypeNode('u32'), [postOffsetTransformNode(-4, { strategy: 'preOffset' })]),
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following types and codecs to be exported.
    await renderMapContains(renderMap, 'types/my-type.ts', [
        'export type MyType = number',
        'offsetEncoder( getU32Encoder() , { postOffset: ({ preOffset }) => preOffset - 4 } )',
        'offsetDecoder( getU32Decoder() , { postOffset: ({ preOffset }) => preOffset - 4 } )',
    ]);

    // And we expect the following codec imports.
    await renderMapContainsImports(renderMap, 'types/my-type.ts', {
        '@solana/kit': ['offsetEncoder', 'offsetDecoder'],
    });
});
