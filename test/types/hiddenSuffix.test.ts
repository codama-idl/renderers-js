import {
    addTypeNodeTransforms,
    constantValueNodeFromBytes,
    constantValueNodeFromString,
    definedTypeNode,
    hiddenSuffixTransformNode,
    integerTypeNode,
} from '@codama/nodes';
import { visit } from '@codama/visitors-core';
import { test } from 'vitest';

import { getRenderMapVisitor } from '../../src';
import { renderMapContains, renderMapContainsImports } from '../_setup';

test('it renders hidden suffix codecs', async () => {
    // Given the following node.
    const node = definedTypeNode({
        identifier: 'myType',
        type: addTypeNodeTransforms(integerTypeNode('u32'), [
            hiddenSuffixTransformNode([
                constantValueNodeFromString('utf8', 'hello world'),
                constantValueNodeFromBytes('base16', 'ff'),
            ]),
        ]),
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following types and codecs to be exported.
    await renderMapContains(renderMap, 'types/my-type.ts', [
        'export type MyType = number',
        "getHiddenSuffixEncoder( getU32Encoder() , [ getConstantEncoder( getUtf8Encoder().encode('hello world') ), getConstantEncoder( new Uint8Array([ 255 ]) ) ] )",
        "getHiddenSuffixDecoder( getU32Decoder() , [ getConstantDecoder( getUtf8Encoder().encode('hello world') ), getConstantDecoder( new Uint8Array([ 255 ]) ) ] )",
    ]);

    // And we expect the following codec imports.
    await renderMapContainsImports(renderMap, 'types/my-type.ts', {
        '@solana/kit': [
            'getHiddenSuffixEncoder',
            'getHiddenSuffixDecoder',
            'getConstantEncoder',
            'getConstantDecoder',
            'getUtf8Encoder',
        ],
    });
});
