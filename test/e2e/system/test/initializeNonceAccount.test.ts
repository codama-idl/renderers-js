import { generateKeyPairSigner } from '@solana/kit';
import test from 'ava';

import { NonceState, NonceVersion } from '../src/index.js';
import { createTestClient, getCreateNonceInstructionPlan } from './_setup.js';

test('it creates and initialises a durable nonce account', async t => {
    // Given a nonce account and authority.
    const client = await createTestClient();
    const [nonce, nonceAuthority] = await Promise.all([generateKeyPairSigner(), generateKeyPairSigner()]);

    // When we create and initialise the nonce account.
    await client.sendTransaction(await getCreateNonceInstructionPlan(client, nonce, nonceAuthority));

    // Then the generated account plugin fetches and decodes the nonce account.
    const nonceAccount = await client.system.accounts.nonce.fetch(nonce.address);
    t.like(nonceAccount, {
        address: nonce.address,
        data: {
            version: NonceVersion.Current,
            state: NonceState.Initialized,
            authority: nonceAuthority.address,
        },
    });
});
