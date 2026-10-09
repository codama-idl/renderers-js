import { definedTypeNode, publicKeyTypeNode, structFieldTypeNode, structTypeNode } from '@codama/nodes';
import { visit } from '@codama/visitors-core';
import { test } from 'vitest';

import { getRenderMapVisitor } from '../../src';
import { renderMapContains, renderMapContainsImports } from '../_setup';

test('it renders public key codecs that accept address-bearing objects', async () => {
    // Given the following node.
    const node = definedTypeNode({
        name: 'myType',
        type: publicKeyTypeNode(),
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the encoder to accept addresses and address-bearing objects whilst the decoder yields addresses.
    await renderMapContains(renderMap, 'types/myType.ts', [
        'export type MyType = Address',
        'export type MyTypeArgs = Address | HasAddress',
        "export function getMyTypeEncoder(): FixedSizeEncoder<MyTypeArgs> { return transformEncoder( getAddressEncoder(), (value: Address | HasAddress) => typeof value === 'string' ? value : value.address ); }",
        'export function getMyTypeDecoder(): FixedSizeDecoder<MyType> { return getAddressDecoder(); }',
        'export function getMyTypeCodec(): FixedSizeCodec<MyTypeArgs, MyType> { return combineCodec(getMyTypeEncoder(), getMyTypeDecoder()); }',
    ]);

    // And we expect the following type and codec imports.
    await renderMapContainsImports(renderMap, 'types/myType.ts', {
        '@solana/kit': [
            'getAddressEncoder',
            'getAddressDecoder',
            'transformEncoder',
            'type Address',
            'type HasAddress',
        ],
    });
});

test('it renders public key struct fields that accept address-bearing objects', async () => {
    // Given the following struct with a public key field.
    const node = definedTypeNode({
        name: 'myType',
        type: structTypeNode([structFieldTypeNode({ name: 'owner', type: publicKeyTypeNode() })]),
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect only the loose type to accept address-bearing objects.
    await renderMapContains(renderMap, 'types/myType.ts', [
        'export type MyType = { owner: Address }',
        'export type MyTypeArgs = { owner: Address | HasAddress }',
    ]);
});
