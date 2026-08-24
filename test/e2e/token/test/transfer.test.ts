import { generateKeyPairSigner } from '@solana/kit';
import { expect, test } from 'vitest';

import { createMint, createTestClient, createToken, createTokenWithAmount } from '../../_setup.js';

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
