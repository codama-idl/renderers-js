import {
    accountNode,
    accountValueNode,
    instructionAccountNode,
    instructionArgumentNode,
    instructionNode,
    payerValueNode,
    pdaNode,
    pdaSeedValueNode,
    pdaValueNode,
    programNode,
    publicKeyTypeNode,
    variablePdaSeedNode,
} from '@codama/nodes';
import { expect, test } from 'vitest';

import { getProgramPluginFragment } from '../../src/fragments';
import { fragmentContains, fragmentContainsImports, getDefaultScope } from '../_setup';

test('it renders nothing is a program has no accounts or instructions', () => {
    // Given an empty program.
    const node = programNode({
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // Then we expect no plugin fragment to be rendered.
    const fragment = getProgramPluginFragment({ ...getDefaultScope(), programNode: node });
    expect(fragment).toBeUndefined();
});

test('it renders the main program plugin type', async () => {
    // Given a program with accounts and instructions.
    const node = programNode({
        accounts: [accountNode({ name: 'mint' })],
        instructions: [instructionNode({ name: 'initializeMint' })],
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we get the program plugin fragment.
    const fragment = getProgramPluginFragment({ ...getDefaultScope(), programNode: node });

    // Then we expect the following plugin type to be rendered.
    await fragmentContains(fragment, [
        'export type SplTokenPlugin = { accounts: SplTokenPluginAccounts; instructions: SplTokenPluginInstructions; };',
    ]);
});

test('it renders program plugin account types', async () => {
    // Given a program with accounts.
    const node = programNode({
        accounts: [accountNode({ name: 'mint' }), accountNode({ name: 'token' })],
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we get the program plugin fragment.
    const fragment = getProgramPluginFragment({ ...getDefaultScope(), programNode: node });

    // Then we expect the following type to be rendered.
    await fragmentContains(fragment, [
        'export type SplTokenPluginAccounts = {',
        'mint: ReturnType< typeof getMintCodec > & SelfFetchFunctions< MintArgs, Mint >;',
        'token: ReturnType< typeof getTokenCodec > & SelfFetchFunctions< TokenArgs, Token >;',
    ]);

    // And we expect the necessary imports to be included.
    await fragmentContainsImports(fragment, {
        '@solana/program-client-core': ['SelfFetchFunctions'],
    });
});

test('it renders program plugin instruction types', async () => {
    // Given a program with instructions.
    const node = programNode({
        instructions: [instructionNode({ name: 'initializeToken' }), instructionNode({ name: 'initializeMint' })],
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we get the program plugin fragment.
    const fragment = getProgramPluginFragment({ ...getDefaultScope(), programNode: node });

    // Then we expect the following type to be rendered.
    await fragmentContains(fragment, [
        'export type SplTokenPluginInstructions = {',
        'initializeToken: ( input: InitializeTokenInput ) => ReturnType<typeof getInitializeTokenInstruction> & SelfPlanAndSendFunctions;',
        'initializeMint: ( input: InitializeMintInput ) => ReturnType<typeof getInitializeMintInstruction> & SelfPlanAndSendFunctions;',
    ]);

    // And we expect the necessary imports to be included.
    await fragmentContainsImports(fragment, {
        '@solana/program-client-core': ['SelfPlanAndSendFunctions'],
    });
});

test('it renders program plugin instruction types with async builders', async () => {
    // Given a program with an `initializeAssociatedToken` instruction that has an async builder
    // due to having to derive the PDA as a default value.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isSigner: false, isWritable: false, name: 'mint' }),
                    instructionAccountNode({ isSigner: false, isWritable: false, name: 'owner' }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode('associatedTokenAccount', [
                            pdaSeedValueNode('owner', accountValueNode('owner')),
                            pdaSeedValueNode('mint', accountValueNode('mint')),
                        ]),
                        isSigner: false,
                        isWritable: false,
                        name: 'ata',
                    }),
                ],
                name: 'initializeAssociatedToken',
            }),
            instructionNode({ name: 'initializeMint' }),
        ],
        name: 'splToken',
        pdas: [
            pdaNode({
                name: 'associatedTokenAccount',
                seeds: [
                    variablePdaSeedNode('owner', publicKeyTypeNode()),
                    variablePdaSeedNode('mint', publicKeyTypeNode()),
                ],
            }),
        ],
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we get the program plugin fragment.
    const fragment = getProgramPluginFragment({ ...getDefaultScope(), programNode: node });

    // Then we expect the `initializeAssociatedToken` instruction to be using the async input type.
    await fragmentContains(fragment, [
        'export type SplTokenPluginInstructions = {',
        'initializeAssociatedToken: ( input: InitializeAssociatedTokenAsyncInput ) => ReturnType<typeof getInitializeAssociatedTokenInstructionAsync> & SelfPlanAndSendFunctions;',
        'initializeMint: ( input: InitializeMintInput ) => ReturnType<typeof getInitializeMintInstruction> & SelfPlanAndSendFunctions;',
    ]);
});

test('it renders the program plugin requirements', async () => {
    // Given a program with accounts and instructions such that one of them as a payer value node.
    const node = programNode({
        accounts: [accountNode({ name: 'mint' })],
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        defaultValue: payerValueNode(),
                        isSigner: true,
                        isWritable: false,
                        name: 'payer',
                    }),
                ],
                name: 'initializeMint',
            }),
        ],
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we get the program plugin fragment.
    const fragment = getProgramPluginFragment({ ...getDefaultScope(), programNode: node });

    // Then we expect the following requirements.
    await fragmentContains(fragment, [
        'export type SplTokenPluginRequirements = ' +
            'ClientWithRpc< GetAccountInfoApi & GetMultipleAccountsApi > & ' +
            'ClientWithPayer & ' +
            'ClientWithTransactionPlanning & ClientWithTransactionSending',
    ]);

    // And we expect the necessary imports to be included.
    await fragmentContainsImports(fragment, {
        '@solana/kit': [
            'type ClientWithPayer',
            'type ClientWithRpc',
            'type ClientWithTransactionPlanning',
            'type ClientWithTransactionSending',
            'type GetAccountInfoApi',
            'type GetMultipleAccountsApi',
        ],
    });
});

test('it renders the program plugin function', async () => {
    // Given a program with accounts and instructions.
    const node = programNode({
        accounts: [accountNode({ name: 'mint' })],
        instructions: [instructionNode({ name: 'initializeMint' })],
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we get the program plugin fragment.
    const fragment = getProgramPluginFragment({ ...getDefaultScope(), programNode: node });

    // Then we expect the following plugin function.
    await fragmentContains(fragment, [
        'export function splTokenProgram() { return <T extends SplTokenPluginRequirements>(client: T) => { return { ...client, splToken: {',
        'accounts: { mint: addSelfFetchFunctions( client, getMintCodec() ) },',
        'instructions: { initializeMint: ( input: InitializeMintInput ) => addSelfPlanAndSendFunctions( client, getInitializeMintInstruction( input ) ) }',
    ]);

    // And we expect the necessary imports to be included.
    await fragmentContainsImports(fragment, {
        '../accounts': ['getMintCodec'],
        '@solana/program-client-core': ['addSelfFetchFunctions', 'addSelfPlanAndSendFunctions'],
    });
});

test('it fills payer value nodes with the payer (signer) set on the client by default', async () => {
    // Given a program with an instruction that has a payer value node as default value for one of its signer accounts.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        defaultValue: payerValueNode(),
                        isSigner: true,
                        isWritable: false,
                        name: 'rentPayer',
                    }),
                ],
                name: 'initializeMint',
            }),
        ],
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we get the program plugin fragment.
    const fragment = getProgramPluginFragment({ ...getDefaultScope(), programNode: node });

    // Then we expect the following instruction function with a default payer to be rendered.
    await fragmentContains(fragment, [
        'type MakeOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>',
        "instructions: { initializeMint: ( input: MakeOptional<InitializeMintInput, 'rentPayer'> ) => addSelfPlanAndSendFunctions( client, getInitializeMintInstruction( { ...input, rentPayer: input.rentPayer ?? client.payer } ) ) }",
    ]);
});

test('it fills payer value nodes with the payer (address) set on the client by default', async () => {
    // Given a program with an instruction that has a payer value node as default value for one of its non-signer accounts.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        defaultValue: payerValueNode(),
                        isSigner: false,
                        isWritable: false,
                        name: 'rentPayer',
                    }),
                ],
                name: 'initializeMint',
            }),
        ],
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we get the program plugin fragment.
    const fragment = getProgramPluginFragment({ ...getDefaultScope(), programNode: node });

    // Then we expect the following instruction function with a default payer to be rendered.
    await fragmentContains(fragment, [
        'type MakeOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>',
        "instructions: { initializeMint: ( input: MakeOptional<InitializeMintInput, 'rentPayer'> ) => addSelfPlanAndSendFunctions( client, getInitializeMintInstruction( { ...input, rentPayer: input.rentPayer ?? client.payer.address } ) ) }",
    ]);
});

test('it tackles arguments and accounts with conflicting names', async () => {
    // Given a program with an instruction that has a payer value node
    // as default value for an account and an argument with the same name `authority`.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        defaultValue: payerValueNode(),
                        isSigner: false,
                        isWritable: false,
                        name: 'authority',
                    }),
                ],
                arguments: [
                    instructionArgumentNode({
                        defaultValue: payerValueNode(),
                        name: 'authority',
                        type: publicKeyTypeNode(),
                    }),
                ],
                name: 'initializeMint',
            }),
        ],
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we get the program plugin fragment.
    const fragment = getProgramPluginFragment({ ...getDefaultScope(), programNode: node });

    // Then we expect the following instruction function with default payers
    // and renamed conflicting attributes to be rendered.
    await fragmentContains(fragment, [
        "input: MakeOptional< InitializeMintInput, 'authority' | 'authorityArg' >",
        '{ ...input, authority: input.authority ?? client.payer.address, authorityArg: input.authorityArg ?? client.payer.address }',
    ]);
});
