import {
    AccountRole,
    generateKeyPairSigner,
    SOLANA_ERROR__PROGRAM_CLIENTS__RESOLVED_INSTRUCTION_INPUT_MUST_BE_SIGNER,
    SolanaError,
} from '@solana/kit';
import { expect, test } from 'vitest';

import { createMint, createTestClient, createToken, createTokenWithAmount } from '../../_setup.js';
import { getTransferInstruction } from '../src/index.js';

test('it transfers tokens from one account to another', async () => {
    // Given a mint and two token accounts containing 100 and 0 tokens.
    const client = await createTestClient();
    const [mintAuthority, ownerA, ownerB] = await Promise.all([
        generateKeyPairSigner(),
        generateKeyPairSigner(),
        generateKeyPairSigner(),
    ]);
    const mint = await createMint(client, mintAuthority.address);
    const [tokenA, tokenB] = await Promise.all([
        createTokenWithAmount(client, mintAuthority, mint, ownerA.address, 100n),
        createToken(client, mint, ownerB.address),
    ]);

    // When owner A transfers 50 tokens to owner B.
    await client.token.instructions
        .transfer({ source: tokenA, destination: tokenB, authority: ownerA, amount: 50n })
        .sendTransaction();

    // Then the generated account plugins fetch the updated balances.
    const [mintAccount, tokenAccountA, tokenAccountB] = await Promise.all([
        client.token.accounts.mint.fetch(mint),
        client.token.accounts.token.fetch(tokenA),
        client.token.accounts.token.fetch(tokenB),
    ]);
    expect(mintAccount.data.supply).toBe(100n);
    expect(tokenAccountA.data.amount).toBe(50n);
    expect(tokenAccountB.data.amount).toBe(50n);
});

test('it requires multisig signers to be able to sign', async () => {
    // Given a transfer instruction whose multisig signers are provided as signers.
    const [source, destination, multisig, signerA, signerB] = await Promise.all([
        generateKeyPairSigner(),
        generateKeyPairSigner(),
        generateKeyPairSigner(),
        generateKeyPairSigner(),
        generateKeyPairSigner(),
    ]);
    const instruction = getTransferInstruction({
        amount: 1n,
        authority: multisig.address,
        destination: destination.address,
        multiSigners: [signerA, signerB],
        source: source.address,
    });

    // Then the signers are appended to the accounts as readonly signers.
    expect(instruction.accounts.slice(3)).toStrictEqual([
        { address: signerA.address, role: AccountRole.READONLY_SIGNER, signer: signerA },
        { address: signerB.address, role: AccountRole.READONLY_SIGNER, signer: signerB },
    ]);

    // But a value that cannot sign is rejected, at the type level and at runtime.
    expect(() =>
        getTransferInstruction({
            amount: 1n,
            authority: multisig.address,
            destination: destination.address,
            // @ts-expect-error Multisig signers must be able to sign.
            multiSigners: [signerA.address],
            source: source.address,
        }),
    ).toThrow(
        new SolanaError(SOLANA_ERROR__PROGRAM_CLIENTS__RESOLVED_INSTRUCTION_INPUT_MUST_BE_SIGNER, {
            inputName: 'multiSigners',
        }),
    );
});
