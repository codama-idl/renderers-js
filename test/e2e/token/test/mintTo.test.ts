import { generateKeyPairSigner } from '@solana/kit';
import { expect, test } from 'vitest';

import { createMint, createTestClient, createToken } from '../../_setup.js';

test('it mints tokens to a token account', async () => {
    // Given a mint and a token account.
    const client = await createTestClient();
    const [mintAuthority, owner] = await Promise.all([generateKeyPairSigner(), generateKeyPairSigner()]);
    const mint = await createMint(client, mintAuthority.address);
    const token = await createToken(client, mint, owner.address);

    // When the mint authority mints tokens using the generated plugin.
    await client.token.instructions.mintTo({ mint, token, mintAuthority, amount: 100n }).sendTransaction();

    // Then the generated account plugins fetch the updated state.
    const [mintAccount, tokenAccount] = await Promise.all([
        client.token.accounts.mint.fetch(mint),
        client.token.accounts.token.fetch(token),
    ]);
    expect(mintAccount.data.supply).toBe(100n);
    expect(tokenAccount.data.amount).toBe(100n);
});
