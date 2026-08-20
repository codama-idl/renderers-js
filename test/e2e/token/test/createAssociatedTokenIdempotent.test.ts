import { generateKeyPairSigner } from '@solana/kit';
import test from 'ava';

import { TOKEN_PROGRAM_ADDRESS } from '../src/index.js';
import { createMint, createTestClient } from './_setup.js';

test('it creates an associated token account idempotently', async t => {
    // Given a mint, its authority and a token owner.
    const client = await createTestClient();
    const [mintAuthority, owner] = await Promise.all([generateKeyPairSigner(), generateKeyPairSigner()]);
    const mint = await createMint(client, mintAuthority.address);
    const input = { mint, owner: owner.address };

    // When we invoke the idempotent instruction twice.
    await client.associatedToken.instructions.createAssociatedTokenIdempotent(input).sendTransaction();
    client.svm.expireBlockhash();
    await client.associatedToken.instructions.createAssociatedTokenIdempotent(input).sendTransaction();

    // Then a single valid associated token account exists.
    const [ata] = await client.associatedToken.pdas.associatedToken({
        ...input,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    const tokenAccount = await client.token.accounts.token.fetch(ata);
    t.is(tokenAccount.data.mint, mint);
    t.is(tokenAccount.data.owner, owner.address);
});
