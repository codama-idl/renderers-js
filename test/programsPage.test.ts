import {
    accountNode,
    constantDiscriminatorNode,
    constantValueNodeFromBytes,
    fieldDiscriminatorNode,
    instructionArgumentNode,
    instructionNode,
    numberTypeNode,
    numberValueNode,
    programNode,
    sizeDiscriminatorNode,
    structFieldTypeNode,
    structTypeNode,
} from '@codama/nodes';
import { visit } from '@codama/visitors-core';
import { expect, test } from 'vitest';

import { getRenderMapVisitor } from '../src';
import { renderMapContains, renderMapContainsImports, renderMapDoesNotContain } from './_setup';

test('it renders the program address constant', async () => {
    // Given the following program.
    const node = programNode({
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following program address constant.
    await renderMapContains(renderMap, 'programs/splToken.ts', [
        "export const SPL_TOKEN_PROGRAM_ADDRESS = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' as Address<'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'>;",
    ]);

    // And we expect the following imports.
    await renderMapContainsImports(renderMap, 'programs/splToken.ts', {
        '@solana/kit': ['Address'],
    });
});

test('it renders an enum of all available accounts for a program', async () => {
    // Given the following program.
    const node = programNode({
        accounts: [accountNode({ name: 'mint' }), accountNode({ name: 'token' })],
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following program account enum.
    await renderMapContains(renderMap, 'programs/splToken.ts', ['export enum SplTokenAccount { Mint, Token }']);
});

test('it renders an function that identifies accounts in a program', async () => {
    // Given the following program with 3 accounts. Two of which have discriminators.
    const node = programNode({
        accounts: [
            // Field discriminator.
            accountNode({
                data: structTypeNode([
                    structFieldTypeNode({
                        defaultValue: numberValueNode(5),
                        name: 'key',
                        type: numberTypeNode('u8'),
                    }),
                ]),
                discriminators: [fieldDiscriminatorNode('key')],
                name: 'metadata',
            }),
            // Size and byte discriminators.
            accountNode({
                discriminators: [
                    sizeDiscriminatorNode(72),
                    constantDiscriminatorNode(constantValueNodeFromBytes('base16', '010203'), 4),
                ],
                name: 'token',
            }),
            // No discriminator.
            accountNode({ discriminators: [], name: 'mint' }),
        ],
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following identifier function to be rendered.
    // Notice it does not include the `mint` account because it has no discriminators.
    await renderMapContains(renderMap, 'programs/splToken.ts', [
        `export function identifySplTokenAccount( account: { data: ReadonlyUint8Array } | ReadonlyUint8Array ): SplTokenAccount { ` +
            `const data = 'data' in account ? account.data : account; ` +
            `if ( containsBytes(data, getU8Encoder().encode(5), 0) ) { return SplTokenAccount.Metadata; } ` +
            `if ( data.length === 72 && containsBytes(data, new Uint8Array([1, 2, 3]), 4) ) { return SplTokenAccount.Token; } ` +
            `throw new SolanaError( SOLANA_ERROR__PROGRAM_CLIENTS__FAILED_TO_IDENTIFY_ACCOUNT, { accountData: data, programName: 'splToken' } ); ` +
            `}`,
    ]);

    // And we expect the following imports.
    await renderMapContainsImports(renderMap, 'programs/splToken.ts', {
        '@solana/kit': [
            'containsBytes',
            'ReadonlyUint8Array',
            'SolanaError',
            'SOLANA_ERROR__PROGRAM_CLIENTS__FAILED_TO_IDENTIFY_ACCOUNT',
        ],
    });
});

test('it renders an enum of all available instructions for a program', async () => {
    // Given the following program.
    const node = programNode({
        instructions: [
            instructionNode({ name: 'mintTokens' }),
            instructionNode({ name: 'transferTokens' }),
            instructionNode({ name: 'updateAuthority' }),
        ],
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following program instruction enum.
    await renderMapContains(renderMap, 'programs/splToken.ts', [
        'export enum SplTokenInstruction { MintTokens, TransferTokens, UpdateAuthority }',
    ]);
});

test('it renders an function that identifies instructions in a program', async () => {
    // Given the following program with 3 instructions. Two of which have discriminators.
    const node = programNode({
        instructions: [
            // Field discriminator.
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
            // Size and byte discriminators.
            instructionNode({
                discriminators: [
                    sizeDiscriminatorNode(72),
                    constantDiscriminatorNode(constantValueNodeFromBytes('base16', '010203'), 4),
                ],
                name: 'transferTokens',
            }),
            // No discriminator.
            instructionNode({ discriminators: [], name: 'updateAuthority' }),
        ],
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following identifier function to be rendered.
    // Notice it does not include the `updateAuthority` instruction because it has no discriminators.
    await renderMapContains(renderMap, 'programs/splToken.ts', [
        `export function identifySplTokenInstruction ( instruction: { data: ReadonlyUint8Array } | ReadonlyUint8Array ): SplTokenInstruction { ` +
            `const data = 'data' in instruction ? instruction.data : instruction; ` +
            `if ( containsBytes(data, getU8Encoder().encode(1), 0) ) { return SplTokenInstruction.MintTokens; } ` +
            `if ( data.length === 72 && containsBytes(data, new Uint8Array([1, 2, 3]), 4) ) { return SplTokenInstruction.TransferTokens; } ` +
            `throw new SolanaError( SOLANA_ERROR__PROGRAM_CLIENTS__FAILED_TO_IDENTIFY_INSTRUCTION, { instructionData: data, programName: 'splToken' } ); ` +
            `}`,
    ]);

    // And we expect the following imports.
    await renderMapContainsImports(renderMap, 'programs/splToken.ts', {
        '@solana/kit': ['containsBytes', 'ReadonlyUint8Array'],
    });
});

test('it checks the discriminator of sub-instructions before their parents.', async () => {
    // Given the following program with a parent instruction and a sub-instruction.
    const node = programNode({
        instructions: [
            // Parent instruction.
            instructionNode({
                arguments: [
                    instructionArgumentNode({
                        defaultValue: numberValueNode(1),
                        name: 'parentDiscriminator',
                        type: numberTypeNode('u8'),
                    }),
                    instructionArgumentNode({
                        name: 'subDiscriminator',
                        type: numberTypeNode('u32'),
                    }),
                ],
                discriminators: [fieldDiscriminatorNode('parentDiscriminator')],
                name: 'mintTokens',
                subInstructions: [
                    // Sub instruction.
                    instructionNode({
                        arguments: [
                            instructionArgumentNode({
                                defaultValue: numberValueNode(1),
                                name: 'parentDiscriminator',
                                type: numberTypeNode('u8'),
                            }),
                            instructionArgumentNode({
                                defaultValue: numberValueNode(1),
                                name: 'subDiscriminator',
                                type: numberTypeNode('u32'),
                            }),
                        ],
                        discriminators: [
                            fieldDiscriminatorNode('parentDiscriminator'),
                            fieldDiscriminatorNode('subDiscriminator', 1),
                        ],
                        name: 'mintTokensV1',
                    }),
                ],
            }),
        ],
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we render it whilst making sure we render both the parent and sub-instruction.
    const renderMap = visit(node, getRenderMapVisitor({ renderParentInstructions: true }));

    // Then we expect the sub-instruction condition to be rendered before the parent instruction condition.
    await renderMapContains(renderMap, 'programs/splToken.ts', [
        `if ( containsBytes(data, getU8Encoder().encode(1), 0) && containsBytes(data, getU32Encoder().encode(1), 1) ) ` +
            `{ return SplTokenInstruction.MintTokensV1; } ` +
            `if ( containsBytes(data, getU8Encoder().encode(1), 0) ) ` +
            `{ return SplTokenInstruction.MintTokens; }`,
    ]);
});

test('it renders a parsed union type of all available instructions for a program', async () => {
    // Given the following program.
    const node = programNode({
        instructions: [
            instructionNode({ name: 'mintTokens' }),
            instructionNode({ name: 'transferTokens' }),
            instructionNode({ name: 'updateAuthority' }),
        ],
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following program parsed instruction union type.
    await renderMapContains(renderMap, 'programs/splToken.ts', [
        "export type ParsedSplTokenInstruction < TProgram extends string = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' >",
        '| ({ instructionType: SplTokenInstruction.MintTokens; } & ParsedMintTokensInstruction<TProgram>)',
        '| ({ instructionType: SplTokenInstruction.TransferTokens; } & ParsedTransferTokensInstruction<TProgram>)',
        '| ({ instructionType: SplTokenInstruction.UpdateAuthority; } & ParsedUpdateAuthorityInstruction<TProgram>)',
    ]);
});

test('it renders a function that parses instructions in a program', async () => {
    // Given the following program with instructions that have discriminators.
    const node = programNode({
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
            instructionNode({
                arguments: [
                    instructionArgumentNode({
                        defaultValue: numberValueNode(2),
                        name: 'discriminator',
                        type: numberTypeNode('u8'),
                    }),
                ],
                discriminators: [fieldDiscriminatorNode('discriminator')],
                name: 'transferTokens',
            }),
        ],
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following parse function to be rendered.
    await renderMapContains(renderMap, 'programs/splToken.ts', [
        'export function parseSplTokenInstruction',
        'TProgram extends string',
        'instruction: Instruction',
        'InstructionWithData',
        'ParsedSplTokenInstruction',
        'const instructionType = identifySplTokenInstruction(instruction)',
        'switch (instructionType)',
        'case SplTokenInstruction.MintTokens',
        'parseMintTokensInstruction(instruction)',
        'case SplTokenInstruction.TransferTokens',
        'parseTransferTokensInstruction(instruction)',
    ]);

    // And we expect the following imports.
    await renderMapContainsImports(renderMap, 'programs/splToken.ts', {
        '@solana/kit': ['Instruction', 'InstructionWithData', 'ReadonlyUint8Array'],
    });
});

test('the program plugin re-exposes identifyAccount, identifyInstruction and parseInstruction when discriminators exist', async () => {
    // Given a program where one account and one instruction carry discriminators.
    const node = programNode({
        accounts: [
            accountNode({
                data: structTypeNode([
                    structFieldTypeNode({
                        defaultValue: numberValueNode(5),
                        name: 'key',
                        type: numberTypeNode('u8'),
                    }),
                ]),
                discriminators: [fieldDiscriminatorNode('key')],
                name: 'metadata',
            }),
        ],
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

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the plugin type wires the helpers as `typeof` references...
    await renderMapContains(renderMap, 'programs/splToken.ts', [
        'identifyAccount: typeof identifySplTokenAccount;',
        'identifyInstruction: typeof identifySplTokenInstruction;',
        'parseInstruction: typeof parseSplTokenInstruction;',
    ]);

    // ...and the plugin function exposes them on the extended client.
    await renderMapContains(renderMap, 'programs/splToken.ts', [
        'identifyAccount: identifySplTokenAccount',
        'identifyInstruction: identifySplTokenInstruction',
        'parseInstruction: parseSplTokenInstruction',
    ]);
});

test('the program plugin exposes identifyInstruction/parseInstruction when only a sub-instruction has a discriminator', async () => {
    // Given a program whose top-level instruction has no discriminator,
    // but whose sub-instruction does. The leaves-only walk in
    // getProgramInstructionsFragment still emits identify*/parse*.
    const node = programNode({
        instructions: [
            instructionNode({
                arguments: [
                    instructionArgumentNode({
                        defaultValue: numberValueNode(1),
                        name: 'subDiscriminator',
                        type: numberTypeNode('u8'),
                    }),
                ],
                discriminators: [],
                name: 'mintTokens',
                subInstructions: [
                    instructionNode({
                        arguments: [
                            instructionArgumentNode({
                                defaultValue: numberValueNode(1),
                                name: 'subDiscriminator',
                                type: numberTypeNode('u8'),
                            }),
                        ],
                        discriminators: [fieldDiscriminatorNode('subDiscriminator')],
                        name: 'mintTokensV2',
                    }),
                ],
            }),
        ],
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the plugin must expose the helpers even though the top-level
    // instruction itself has no discriminator.
    await renderMapContains(renderMap, 'programs/splToken.ts', [
        'identifyInstruction: typeof identifySplTokenInstruction;',
        'parseInstruction: typeof parseSplTokenInstruction;',
        'identifyInstruction: identifySplTokenInstruction',
        'parseInstruction: parseSplTokenInstruction',
    ]);
});

test('the program plugin omits identify/parse keys when no node carries a discriminator', async () => {
    // Given a program with accounts and instructions but no discriminators.
    const node = programNode({
        accounts: [accountNode({ discriminators: [], name: 'mint' })],
        instructions: [instructionNode({ discriminators: [], name: 'mintTokens' })],
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the program file does not reference any of the new plugin keys.
    await renderMapDoesNotContain(renderMap, 'programs/splToken.ts', [
        'identifyAccount',
        'identifyInstruction',
        'parseInstruction',
    ]);
});

test('the program plugin honors renderParentInstructions when deciding whether to expose identify/parse', async () => {
    // Given a program whose parent instruction has a discriminator but the
    // sub-instruction does not. Without renderParentInstructions the parent
    // is filtered out by the leaves-only walk, so no identifier is emitted.
    const node = programNode({
        instructions: [
            instructionNode({
                arguments: [
                    instructionArgumentNode({
                        defaultValue: numberValueNode(1),
                        name: 'parentDiscriminator',
                        type: numberTypeNode('u8'),
                    }),
                ],
                discriminators: [fieldDiscriminatorNode('parentDiscriminator')],
                name: 'mintTokens',
                subInstructions: [
                    instructionNode({
                        arguments: [
                            instructionArgumentNode({
                                defaultValue: numberValueNode(1),
                                name: 'parentDiscriminator',
                                type: numberTypeNode('u8'),
                            }),
                        ],
                        discriminators: [],
                        name: 'mintTokensV1',
                    }),
                ],
            }),
        ],
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we render with renderParentInstructions: true, the parent is
    // included in the walk and its discriminator drives identifier emission.
    const renderMap = visit(node, getRenderMapVisitor({ renderParentInstructions: true }));

    // Then the plugin exposes identifyInstruction/parseInstruction.
    await renderMapContains(renderMap, 'programs/splToken.ts', [
        'identifyInstruction: typeof identifySplTokenInstruction;',
        'parseInstruction: typeof parseSplTokenInstruction;',
        'identifyInstruction: identifySplTokenInstruction',
        'parseInstruction: parseSplTokenInstruction',
    ]);
});

test('it does not render parse function when no instructions have discriminators', async () => {
    // Given the following program with instructions without discriminators.
    const node = programNode({
        instructions: [
            instructionNode({ discriminators: [], name: 'mintTokens' }),
            instructionNode({ discriminators: [], name: 'transferTokens' }),
        ],
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the parse function NOT to be rendered.
    await renderMapContains(renderMap, 'programs/splToken.ts', [
        'export enum SplTokenInstruction { MintTokens, TransferTokens }',
    ]);

    // And we do NOT expect the parse function.
    const programFile = renderMap.get('programs/splToken.ts');
    expect(programFile).not.toContain('parseSplTokenInstruction');
});
