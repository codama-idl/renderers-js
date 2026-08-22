import { generateKeyPairSigner, none } from '@solana/kit';
import { expect, test } from 'vitest';

import { AccountState, TOKEN_PROGRAM_ADDRESS } from '../src/index.js';
import { createMint, createTestClient } from '../../_setup.js';

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
