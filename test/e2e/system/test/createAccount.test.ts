import { generateKeyPairSigner } from '@solana/kit';
import { expect, test } from 'vitest';

import { SYSTEM_PROGRAM_ADDRESS } from '../src/index.js';
import { createTestClient } from '../../_setup.js';

test('it creates a new empty account', async () => {
    // Given a newly generated account keypair and 42 bytes of space.
    const client = await createTestClient();
    const space = 42n;
    const [newAccount, rent] = await Promise.all([
        generateKeyPairSigner(),
        client.rpc.getMinimumBalanceForRentExemption(space).send(),
    ]);

    // When we create the account using the generated program plugin.
    await client.system.instructions
        .createAccount({ newAccount, lamports: rent, space, programAddress: SYSTEM_PROGRAM_ADDRESS })
        .sendTransaction();

    // Then the account exists with the expected owner, balance and data size.
    const { value: fetchedAccount } = await client.rpc
        .getAccountInfo(newAccount.address, { encoding: 'base64' })
        .send();
    expect(fetchedAccount).toMatchObject({
        executable: false,
        lamports: rent,
        owner: SYSTEM_PROGRAM_ADDRESS,
        space: 42n,
    });
});
