import { generateKeyPairSigner, none } from '@solana/kit';
import test from 'ava';

import { AccountState, TOKEN_PROGRAM_ADDRESS, getTokenSize } from '../src/index.js';
import { createMint, createTestClient } from './_setup.js';

test('it creates and initialises a new token account', async t => {
    // Given a mint, a token account and its owner.
    const client = await createTestClient();
    const [mintAuthority, token, owner] = await Promise.all([
        generateKeyPairSigner(),
        generateKeyPairSigner(),
        generateKeyPairSigner(),
    ]);
    const mint = await createMint(client, mintAuthority.address);
    const space = BigInt(getTokenSize());
    const rent = await client.rpc.getMinimumBalanceForRentExemption(space).send();

    // When we create and initialise the token account in one transaction.
    await client.sendTransaction([
        client.system.instructions.createAccount({
            newAccount: token,
            lamports: rent,
            space,
            programAddress: TOKEN_PROGRAM_ADDRESS,
        }),
        client.token.instructions.initializeAccount({
            account: token.address,
            mint,
            owner: owner.address,
        }),
    ]);

    // Then the generated account plugin fetches and decodes it.
    const tokenAccount = await client.token.accounts.token.fetch(token.address);
    t.like(tokenAccount, {
        address: token.address,
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
