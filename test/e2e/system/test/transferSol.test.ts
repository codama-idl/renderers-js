import {
    AccountRole,
    type Address,
    SOLANA_ERROR__FAILED_TO_SEND_TRANSACTION,
    generateKeyPairSigner,
    isSolanaError,
    lamports,
} from '@solana/kit';
import { expect, test } from 'vitest';

import {
    SYSTEM_ERROR__RESULT_WITH_NEGATIVE_LAMPORTS,
    getTransferSolInstruction,
    isSystemError,
    parseTransferSolInstruction,
} from '../src/index.js';
import { createTestClient } from './_setup.js';

test('it transfers SOL from one account to another', async () => {
    // Given a source account with 3 SOL and a destination account with no SOL.
    const client = await createTestClient();
    const [source, destination] = await Promise.all([
        generateKeyPairSigner(),
        generateKeyPairSigner().then(signer => signer.address),
    ]);
    await client.airdrop(source.address, lamports(3_000_000_000n));

    // When the source account transfers 1 SOL to the destination account.
    await client.system.instructions.transferSol({ source, destination, amount: 1_000_000_000 }).sendTransaction();

    // Then the accounts have their exact expected balances.
    const [{ value: sourceBalance }, { value: destinationBalance }] = await Promise.all([
        client.rpc.getBalance(source.address).send(),
        client.rpc.getBalance(destination).send(),
    ]);
    expect(sourceBalance).toBe(lamports(2_000_000_000n));
    expect(destinationBalance).toBe(lamports(1_000_000_000n));
});

test('it exposes generated System Program errors', async () => {
    // Given a source with less SOL than it attempts to transfer.
    const client = await createTestClient();
    const [source, destination] = await Promise.all([
        generateKeyPairSigner(),
        generateKeyPairSigner().then(signer => signer.address),
    ]);
    await client.airdrop(source.address, lamports(1_000_000_000n));
    const transfer = client.system.instructions.transferSol({
        source,
        destination,
        amount: 2_000_000_000,
    });
    const transactionMessage = await transfer.planTransaction();

    // When the transfer fails, the LiteSVM plugin converts it into a Kit error.
    const error = await transfer.sendTransaction().then(
        () => expect.unreachable('expected the transfer to fail'),
        (cause: unknown) => cause,
    );

    // Then the generated error helper identifies its exact program error code.
    expect(
        isSolanaError(error, SOLANA_ERROR__FAILED_TO_SEND_TRANSACTION) &&
            isSystemError(error.cause, transactionMessage, SYSTEM_ERROR__RESULT_WITH_NEGATIVE_LAMPORTS),
    ).toBe(true);
});

test('it parses the accounts and data of a transfer instruction', async () => {
    // Given a transfer instruction with generated accounts and data.
    const source = await generateKeyPairSigner();
    const destination = (await generateKeyPairSigner()).address;
    const transferSol = getTransferSolInstruction({ source, destination, amount: 1_000_000_000 });

    // When we parse the instruction.
    const parsedTransferSol = parseTransferSolInstruction(transferSol);

    // Then its accounts and data round-trip correctly.
    expect(parsedTransferSol.accounts.source.address).toBe(source.address);
    expect(parsedTransferSol.accounts.source.role).toBe(AccountRole.WRITABLE_SIGNER);
    expect(parsedTransferSol.accounts.source.signer).toBe(source);
    expect(parsedTransferSol.accounts.destination.address).toBe(destination);
    expect(parsedTransferSol.accounts.destination.role).toBe(AccountRole.WRITABLE);
    expect(parsedTransferSol.data.amount).toBe(1_000_000_000n);
    expect(parsedTransferSol.programAddress).toBe(
        '11111111111111111111111111111111' as Address<'11111111111111111111111111111111'>,
    );
});
