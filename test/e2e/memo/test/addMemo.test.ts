import { createClient, lamports } from '@solana/kit';
import { litesvm } from '@solana/kit-plugin-litesvm';
import { airdropSigner, generatedSigner } from '@solana/kit-plugin-signer';
import test from 'ava';

import { memoProgram } from '../src/index.js';

const isTransactionMetadata = (value: unknown): value is { logs: () => readonly string[] } => {
    return typeof value === 'object' && value !== null && 'logs' in value && typeof value.logs === 'function';
};

test('it adds custom text to the transaction logs', async t => {
    // Given a funded LiteSVM client with the generated Memo Program plugin.
    const client = await createClient()
        .use(generatedSigner())
        .use(litesvm())
        .use(memoProgram())
        .use(airdropSigner(lamports(1_000_000_000n)));

    // When we send a memo using the generated program plugin.
    const result = await client.memo.instructions.addMemo({ memo: 'Hello world!' }).sendTransaction();

    // Then the LiteSVM transaction metadata contains our memo.
    const transactionMetadata = result.context['transactionMetadata'];
    t.true(isTransactionMetadata(transactionMetadata));
    if (isTransactionMetadata(transactionMetadata)) {
        t.true(transactionMetadata.logs().some(log => log.includes('Hello world!')));
    }
});
