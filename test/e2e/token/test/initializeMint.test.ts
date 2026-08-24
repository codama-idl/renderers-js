import { generateKeyPairSigner, none, some } from '@solana/kit';
import { expect, test } from 'vitest';

import { TOKEN_PROGRAM_ADDRESS, getMintSize } from '../src/index.js';
import { createTestClient } from './_setup.js';

test('it creates and initialises a new mint account', async () => {
    // Given an authority and a mint account.
    const client = await createTestClient();
    const [authority, mint] = await Promise.all([generateKeyPairSigner(), generateKeyPairSigner()]);
    const space = BigInt(getMintSize());
    const rent = await client.rpc.getMinimumBalanceForRentExemption(space).send();

    // When we create and initialise the mint account.
    await client.sendTransaction([
        client.system.instructions.createAccount({
            newAccount: mint,
            lamports: rent,
            space,
            programAddress: TOKEN_PROGRAM_ADDRESS,
        }),
        client.token.instructions.initializeMint({
            mint: mint.address,
            decimals: 2,
            mintAuthority: authority.address,
        }),
    ]);

    // Then the generated account plugin fetches and decodes it.
    const mintAccount = await client.token.accounts.mint.fetch(mint.address);
    expect(mintAccount).toMatchObject({
        address: mint.address,
        data: {
            mintAuthority: some(authority.address),
            supply: 0n,
            decimals: 2,
            isInitialized: true,
            freezeAuthority: none(),
        },
    });
});

test('it creates a new mint account with a freeze authority', async () => {
    // Given distinct mint and freeze authorities.
    const client = await createTestClient();
    const [mintAuthority, freezeAuthority, mint] = await Promise.all([
        generateKeyPairSigner(),
        generateKeyPairSigner(),
        generateKeyPairSigner(),
    ]);
    const space = BigInt(getMintSize());
    const rent = await client.rpc.getMinimumBalanceForRentExemption(space).send();

    // When we create and initialise the mint with both authorities.
    await client.sendTransaction([
        client.system.instructions.createAccount({
            newAccount: mint,
            lamports: rent,
            space,
            programAddress: TOKEN_PROGRAM_ADDRESS,
        }),
        client.token.instructions.initializeMint({
            mint: mint.address,
            decimals: 0,
            mintAuthority: mintAuthority.address,
            freezeAuthority: freezeAuthority.address,
        }),
    ]);

    // Then both authorities are decoded correctly.
    const mintAccount = await client.token.accounts.mint.fetch(mint.address);
    expect(mintAccount.data).toMatchObject({
        mintAuthority: some(mintAuthority.address),
        freezeAuthority: some(freezeAuthority.address),
    });
});
