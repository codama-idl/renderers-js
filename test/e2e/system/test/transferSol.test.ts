import {
    AccountRole,
    type Address,
    SOLANA_ERROR__FAILED_TO_SEND_TRANSACTION,
    generateKeyPairSigner,
    isSolanaError,
    lamports,
} from '@solana/kit';
import test from 'ava';

import {
    SYSTEM_ERROR__RESULT_WITH_NEGATIVE_LAMPORTS,
    getTransferSolInstruction,
    isSystemError,
    parseTransferSolInstruction,
} from '../src/index.js';
import { createTestClient } from './_setup.js';

test('it transfers SOL from one account to another', async t => {
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
    t.is(sourceBalance, lamports(2_000_000_000n));
    t.is(destinationBalance, lamports(1_000_000_000n));
});

test('it exposes generated System Program errors', async t => {
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
    const error = await t.throwsAsync(transfer.sendTransaction());

    // Then the generated error helper identifies its exact program error code.
    t.true(
        isSolanaError(error, SOLANA_ERROR__FAILED_TO_SEND_TRANSACTION) &&
            isSystemError(error.cause, transactionMessage, SYSTEM_ERROR__RESULT_WITH_NEGATIVE_LAMPORTS),
    );
});

test('it parses the accounts and data of a transfer instruction', async t => {
    // Given a transfer instruction with generated accounts and data.
    const source = await generateKeyPairSigner();
    const destination = (await generateKeyPairSigner()).address;
    const transferSol = getTransferSolInstruction({ source, destination, amount: 1_000_000_000 });

    // When we parse the instruction.
    const parsedTransferSol = parseTransferSolInstruction(transferSol);

    // Then its accounts and data round-trip correctly.
    t.is(parsedTransferSol.accounts.source.address, source.address);
    t.is(parsedTransferSol.accounts.source.role, AccountRole.WRITABLE_SIGNER);
    t.is(parsedTransferSol.accounts.source.signer, source);
    t.is(parsedTransferSol.accounts.destination.address, destination);
    t.is(parsedTransferSol.accounts.destination.role, AccountRole.WRITABLE);
    t.is(parsedTransferSol.data.amount, 1_000_000_000n);
    t.is(
        parsedTransferSol.programAddress,
        '11111111111111111111111111111111' as Address<'11111111111111111111111111111111'>,
    );
});
