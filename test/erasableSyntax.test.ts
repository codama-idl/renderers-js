import {
    accountNode,
    definedTypeNode,
    enumEmptyVariantTypeNode,
    enumTypeNode,
    fieldDiscriminatorNode,
    instructionArgumentNode,
    instructionNode,
    numberTypeNode,
    numberValueNode,
    programNode,
} from '@codama/nodes';
import { visit } from '@codama/visitors-core';
import { test } from 'vitest';

import { getRenderMapVisitor } from '../src';
import { renderMapContains, renderMapDoesNotContain } from './_setup';

// Given the following scalar enum.
const keyTypeNode = definedTypeNode({
    name: 'key',
    type: enumTypeNode([enumEmptyVariantTypeNode('uninitialized'), enumEmptyVariantTypeNode('asset')]),
});

// And the following program with accounts and instructions.
const splTokenProgramNode = programNode({
    accounts: [accountNode({ name: 'mint' }), accountNode({ name: 'token' })],
    instructions: [
        instructionNode({
            arguments: [
                instructionArgumentNode({
                    defaultValue: numberValueNode(1),
                    name: 'discriminator',
                    type: numberTypeNode('u8'),
                }),
            ],
            discriminators: [fieldDiscriminatorNode('discriminator')],
            name: 'mintTokens',
        }),
    ],
    name: 'splToken',
    publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
});

test('it renders scalar enums as native enums by default', async () => {
    // When we render a scalar enum without the erasableSyntax option.
    const renderMap = visit(keyTypeNode, getRenderMapVisitor());

    // Then we expect a native enum declaration.
    await renderMapContains(renderMap, 'types/key.ts', [
        'export enum Key { Uninitialized, Asset }',
        'export type KeyArgs = Key;',
    ]);
});

test('it renders scalar enums as const objects when erasableSyntax is enabled', async () => {
    // When we render a scalar enum with the erasableSyntax option.
    const renderMap = visit(keyTypeNode, getRenderMapVisitor({ erasableSyntax: true }));

    // Then we expect a const object aliased through a lookup constant and a union type.
    await renderMapContains(renderMap, 'types/key.ts', [
        "const KeyLookup = { 0: 'Uninitialized', 1: 'Asset', Uninitialized: 0, Asset: 1 } as const;",
        'export const Key: Omit< typeof KeyLookup, number > = KeyLookup;',
        'export type Key = (typeof Key)[keyof typeof Key];',
        'export type KeyArgs = Key;',
    ]);

    // And we expect no enum declaration.
    await renderMapDoesNotContain(renderMap, 'types/key.ts', ['export enum Key']);
});

test('it keeps the enum codec calls unchanged when erasableSyntax is enabled', async () => {
    // When we render a scalar enum with the erasableSyntax option.
    const renderMap = visit(keyTypeNode, getRenderMapVisitor({ erasableSyntax: true }));

    // Then we expect the codecs to be built from the const object as they would from an enum.
    await renderMapContains(renderMap, 'types/key.ts', ['return getEnumEncoder(Key);', 'return getEnumDecoder(Key);']);
});

test('it renders program account enums as const objects when erasableSyntax is enabled', async () => {
    // When we render a program with the erasableSyntax option.
    const renderMap = visit(splTokenProgramNode, getRenderMapVisitor({ erasableSyntax: true }));

    // Then we expect the program account enum to be a const object.
    await renderMapContains(renderMap, 'programs/splToken.ts', [
        "const SplTokenAccountLookup = { 0: 'Mint', 1: 'Token', Mint: 0, Token: 1 } as const;",
        'export const SplTokenAccount: Omit< typeof SplTokenAccountLookup, number > = SplTokenAccountLookup;',
        'export type SplTokenAccount = (typeof SplTokenAccount)[keyof typeof SplTokenAccount];',
    ]);

    // And we expect no enum declaration.
    await renderMapDoesNotContain(renderMap, 'programs/splToken.ts', ['export enum SplTokenAccount']);
});

test('it renders program instruction enums as const objects when erasableSyntax is enabled', async () => {
    // When we render a program with the erasableSyntax option.
    const renderMap = visit(splTokenProgramNode, getRenderMapVisitor({ erasableSyntax: true }));

    // Then we expect the program instruction enum to be a const object.
    await renderMapContains(renderMap, 'programs/splToken.ts', [
        "const SplTokenInstructionLookup = { 0: 'MintTokens', MintTokens: 0 } as const;",
        'export const SplTokenInstruction: Omit< typeof SplTokenInstructionLookup, number > = SplTokenInstructionLookup;',
        'export type SplTokenInstruction = (typeof SplTokenInstruction)[keyof typeof SplTokenInstruction];',
    ]);

    // And we expect no enum declaration.
    await renderMapDoesNotContain(renderMap, 'programs/splToken.ts', ['export enum SplTokenInstruction']);
});

test('it queries instruction enum members with typeof when erasableSyntax is enabled', async () => {
    // When we render a program with the erasableSyntax option.
    const renderMap = visit(splTokenProgramNode, getRenderMapVisitor({ erasableSyntax: true }));

    // Then we expect the parsed instruction union to reach members through a typeof query,
    // since a const object only exists in the value space.
    await renderMapContains(renderMap, 'programs/splToken.ts', [
        'instructionType: typeof SplTokenInstruction.MintTokens;',
    ]);

    // And we expect the identifier function to keep returning the member itself.
    await renderMapContains(renderMap, 'programs/splToken.ts', ['return SplTokenInstruction.MintTokens;']);
});

test('it renders the program plugin object with an as assertion when erasableSyntax is enabled', async () => {
    // When we render a program with the erasableSyntax option.
    const renderMap = visit(splTokenProgramNode, getRenderMapVisitor({ erasableSyntax: true }));

    // Then we expect an `as` assertion, since angle-bracket assertions are not erasable.
    await renderMapContains(renderMap, 'programs/splToken.ts', ['} as SplTokenPlugin }']);
    await renderMapDoesNotContain(renderMap, 'programs/splToken.ts', ['<SplTokenPlugin>{']);
});

test('it renders the program plugin object with an angle-bracket assertion by default', async () => {
    // When we render a program without the erasableSyntax option.
    const renderMap = visit(splTokenProgramNode, getRenderMapVisitor());

    // Then we expect the angle-bracket assertion to be preserved.
    await renderMapContains(renderMap, 'programs/splToken.ts', ['<SplTokenPlugin>{']);
});
