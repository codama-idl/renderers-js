import { address, BASE_ACCOUNT_SIZE, createNoopSigner } from '@solana/kit';
import { expect, test } from 'vitest';

import {
    getAllOmittedInstruction,
    getByteDeltasInstruction,
    getChildInstruction,
    getContextualDataInstruction,
    getCounterSize,
    getGetBalanceInstructionReturnDataDecoder,
    getGetBalanceInstructionReturnDataEncoder,
    getGetStatsInstructionReturnDataDecoder,
    getInstructionsErrorMessage,
    getResolvedExtrasInstruction,
    getSomeOmittedInstruction,
    getSyncLimitsInstruction,
    getSyncLimitsInstructionAsync,
    getSyncLimitsInstructionDataDecoder,
    identifyInstructionsInstruction,
    INSTRUCTIONS_ERROR__TEMPLATED,
    InstructionsInstruction,
} from '../src/index.js';

const owner = address('11111111111111111111111111111111');

test('it fills in omitted arguments when no other input is given', () => {
    // When we build an instruction whose inputs are all omitted.
    const instruction = getAllOmittedInstruction();

    // Then the discriminator and the resolved data field are encoded.
    expect(instruction.data).toStrictEqual(new Uint8Array([0, 42]));
});

test('it fills in omitted arguments alongside other inputs', () => {
    // When we build an instruction with omitted arguments and a regular one.
    const instruction = getSomeOmittedInstruction({ amount: 7 });

    // Then both the given and the resolved values are encoded.
    expect(instruction.data).toStrictEqual(new Uint8Array([1, 7, 0, 0, 0, 0, 0, 0, 0, 42]));
});

test('it passes extra arguments to remaining accounts and byte delta resolvers', () => {
    // When we build an instruction whose extra arguments are only read by resolvers.
    const instruction = getResolvedExtrasInstruction({ signerCount: 2, space: 100 });

    // Then its resolvers receive them.
    expect(instruction.accounts).toHaveLength(2);
    expect(instruction.byteDelta).toBe(100 + BASE_ACCOUNT_SIZE);
});

test('it requires data arguments defaulting to the payer or the identity in instruction builders', () => {
    // When we build an instruction whose data defaults to contextual values, which builders cannot fill in.
    const instruction = getContextualDataInstruction({ authority: owner, owner });

    // Then the given addresses are encoded after the discriminator.
    expect(instruction.data).toHaveLength(1 + 32 + 32);
});

test('it fills in the defaults of arguments read by byte deltas', () => {
    // When we build an instruction whose byte delta reads an argument with a default value.
    const instruction = getByteDeltasInstruction({});

    // Then that default is used, along with the size of the linked account.
    expect(instruction.byteDelta).toBe(8 + BASE_ACCOUNT_SIZE + getCounterSize() + BASE_ACCOUNT_SIZE);
});

test('it resolves the injected defaults of sub-instructions against their parents', () => {
    // When we build a sub-instruction whose amount is provided by its parent.
    const instruction = getChildInstruction({ authority: createNoopSigner(owner) });

    // Then the provided amount is encoded.
    expect(instruction.data).toStrictEqual(new Uint8Array([5, 9, 0, 0, 0, 0, 0, 0, 0]));
});

test('it renders error messages verbatim', () => {
    // Then template placeholders, backslashes and backticks are kept as is.
    expect(getInstructionsErrorMessage(INSTRUCTIONS_ERROR__TEMPLATED)).toBe('Expected ${amount} \\ got `value`.');
});

test('it decodes the data returned by instructions', () => {
    // Given the return data of instructions returning a number and a struct.
    const balance = getGetBalanceInstructionReturnDataEncoder().encode(42n);
    const stats = new Uint8Array([7, 1]);

    // Then their decoders read them.
    expect(getGetBalanceInstructionReturnDataDecoder().decode(balance)).toBe(42n);
    expect(getGetStatsInstructionReturnDataDecoder().decode(stats)).toStrictEqual({
        discriminator: 7,
        mode: { __kind: 'Slow' },
    });
});

test('it leaves archived instructions out of the client', () => {
    // Then archived instructions are neither rendered nor identified.
    expect(Object.keys(InstructionsInstruction)).not.toContain('AncientTransfer');
    expect(() => identifyInstructionsInstruction(new Uint8Array([8]))).toThrow();
    expect(identifyInstructionsInstruction(new Uint8Array([6]))).toBe(InstructionsInstruction.OldTransfer);
});

test('it requires the inputs synchronous builders cannot fill in', async () => {
    // Given an owner defaulting to the payer and a fee resolved asynchronously.
    const syncInstruction = getSyncLimitsInstruction({ fee: 7, owner });
    const asyncInstruction = await getSyncLimitsInstructionAsync({ owner });

    // Then the synchronous builder encodes the given fee, and the asynchronous one resolves it.
    expect(getSyncLimitsInstructionDataDecoder().decode(syncInstruction.data).fee).toBe(7n);
    expect(getSyncLimitsInstructionDataDecoder().decode(asyncInstruction.data).fee).toBe(5000n);
});
