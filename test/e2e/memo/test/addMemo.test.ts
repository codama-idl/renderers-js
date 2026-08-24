import { expect, test } from 'vitest';

import { createTestClient } from '../../_setup.js';

const isTransactionMetadata = (value: unknown): value is { logs: () => readonly string[] } => {
    return typeof value === 'object' && value !== null && 'logs' in value && typeof value.logs === 'function';
};

test('it adds custom text to the transaction logs', async () => {
    // Given a funded LiteSVM client with the generated Memo Program plugin.
    const client = await createTestClient();

    // When we send a memo using the generated program plugin.
    const result = await client.memo.instructions.addMemo({ memo: 'Hello world!' }).sendTransaction();

    // Then the LiteSVM transaction metadata contains our memo.
    const transactionMetadata = result.context['transactionMetadata'];
    expect(isTransactionMetadata(transactionMetadata)).toBe(true);
    if (isTransactionMetadata(transactionMetadata)) {
        expect(transactionMetadata.logs().some(log => log.includes('Hello world!'))).toBe(true);
    }
});
