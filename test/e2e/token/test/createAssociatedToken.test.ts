import { generateKeyPairSigner, none, type Address, type HasAddress } from '@solana/kit';
import { expect, expectTypeOf, test } from 'vitest';

import { createMint, createTestClient } from '../../_setup.js';
import {
    ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    AccountState,
    TOKEN_PROGRAM_ADDRESS,
    fetchMaybeTokenFromSeeds,
    fetchTokenFromSeeds,
    findAssociatedTokenPda,
    type AssociatedTokenSeeds,
} from '../src/index.js';

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

test('it accepts address-bearing objects as PDA program address overrides', async () => {
    // Given a mint, a token owner and the associated token program address wrapped in an object.
    const client = await createTestClient();
    const [mintAuthority, owner] = await Promise.all([generateKeyPairSigner(), generateKeyPairSigner()]);
    const mint = await createMint(client, mintAuthority.address);
    const seeds = { mint, owner: owner.address, tokenProgram: TOKEN_PROGRAM_ADDRESS };
    const programWrapper: HasAddress<typeof ASSOCIATED_TOKEN_PROGRAM_ADDRESS> = {
        address: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    };

    // When we derive the associated token PDA with and without a program address override.
    const [ataFromDefault] = await findAssociatedTokenPda(seeds);
    const [ataFromAddress] = await findAssociatedTokenPda(seeds, { programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS });
    const [ataFromWrapper] = await findAssociatedTokenPda(seeds, { programAddress: programWrapper });

    // Then the wrapper is unwrapped to the same program address.
    expect(ataFromAddress).toBe(ataFromDefault);
    expect(ataFromWrapper).toBe(ataFromDefault);
    expectTypeOf(findAssociatedTokenPda)
        .parameter(1)
        .toEqualTypeOf<{ programAddress?: Address | HasAddress | undefined } | undefined>();
});

test('it accepts address-bearing objects as program address overrides when fetching from seeds', async () => {
    // Given an existing associated token account and its program address wrapped in an object.
    const client = await createTestClient();
    const [mintAuthority, owner] = await Promise.all([generateKeyPairSigner(), generateKeyPairSigner()]);
    const mint = await createMint(client, mintAuthority.address);
    await client.associatedToken.instructions.createAssociatedToken({ mint, owner: owner.address }).sendTransaction();
    const seeds = { mint, owner: owner.address, tokenProgram: TOKEN_PROGRAM_ADDRESS };
    const programWrapper: HasAddress<typeof ASSOCIATED_TOKEN_PROGRAM_ADDRESS> = {
        address: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    };

    // When we fetch it from its seeds with and without a program address override.
    const fromDefault = await fetchTokenFromSeeds(client.rpc, seeds);
    const fromAddress = await fetchTokenFromSeeds(client.rpc, seeds, {
        programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    });
    const fromWrapper = await fetchMaybeTokenFromSeeds(client.rpc, seeds, { programAddress: programWrapper });

    // Then the wrapper is unwrapped to the same program address.
    const [ata] = await findAssociatedTokenPda(seeds);
    expect(fromDefault.address).toBe(ata);
    expect(fromAddress).toStrictEqual(fromDefault);
    expect(fromWrapper).toStrictEqual({ ...fromDefault, exists: true });
    expectTypeOf<NonNullable<Parameters<typeof fetchTokenFromSeeds>[2]>['programAddress']>().toEqualTypeOf<
        Address | HasAddress | undefined
    >();
    expectTypeOf<NonNullable<Parameters<typeof fetchMaybeTokenFromSeeds>[2]>['programAddress']>().toEqualTypeOf<
        Address | HasAddress | undefined
    >();
});
