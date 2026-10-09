import { generateKeyPairSigner, none, type Address, type HasAddress } from '@solana/kit';
import { expect, expectTypeOf, test } from 'vitest';

import { createMint, createTestClient } from '../../_setup.js';
import { AccountState, TOKEN_PROGRAM_ADDRESS, type AssociatedTokenSeeds } from '../src/index.js';

test('it creates a new associated token account', async () => {
    // Given a mint, its authority and a token owner.
    const client = await createTestClient();
    const [mintAuthority, owner] = await Promise.all([generateKeyPairSigner(), generateKeyPairSigner()]);
    const mint = await createMint(client, mintAuthority.address);

    // When we create the associated token account using the generated plugin.
    await client.associatedToken.instructions.createAssociatedToken({ mint, owner: owner.address }).sendTransaction();

    // Then the generated PDA and account plugins find, fetch and decode it.
    const [ata] = await client.associatedToken.pdas.associatedToken({
        mint,
        owner: owner.address,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    const tokenAccount = await client.token.accounts.token.fetch(ata);
    expect(tokenAccount).toMatchObject({
        address: ata,
        data: {
            mint,
            owner: owner.address,
            amount: 0n,
            delegate: none(),
            state: AccountState.Initialized,
            isNative: none(),
            delegatedAmount: 0n,
            closeAuthority: none(),
        },
    });
});

test('it accepts address-bearing objects as PDA seeds', async () => {
    // Given a mint and a token owner.
    const client = await createTestClient();
    const [mintAuthority, owner] = await Promise.all([generateKeyPairSigner(), generateKeyPairSigner()]);
    const mint = await createMint(client, mintAuthority.address);

    // When we derive the associated token PDA from objects exposing their addresses.
    const [ataFromObjects] = await client.associatedToken.pdas.associatedToken({
        mint: { address: mint },
        owner,
        tokenProgram: { address: TOKEN_PROGRAM_ADDRESS },
    });

    // Then it matches the PDA derived from the plain addresses.
    const [ata] = await client.associatedToken.pdas.associatedToken({
        mint,
        owner: owner.address,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    expect(ataFromObjects).toBe(ata);
    expectTypeOf<AssociatedTokenSeeds['owner']>().toEqualTypeOf<Address | HasAddress>();
});
