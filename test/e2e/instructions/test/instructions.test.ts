import { address, BASE_ACCOUNT_SIZE, createNoopSigner } from '@solana/kit';
import { expect, test } from 'vitest';

import { findSecretCounterPda } from '../src/generated/pdas/secret-counter.js';
import {
    findSettingsPda,
    getAllOmittedInstruction,
    getByteDeltasInstruction,
    getChildInstruction,
    getClaimOwnershipInstruction,
    getClaimOwnershipInstructionDataDecoder,
    getConfigureInstructionAsync,
    getContextualDataInstruction,
    getCounterSize,
    getGetBalanceInstructionReturnDataDecoder,
    getGetBalanceInstructionReturnDataEncoder,
    getGetStatsInstructionReturnDataDecoder,
    getInstructionsErrorMessage,
    getLinkVaultInstructionAsync,
    getLinkVaultInstructionDataDecoder,
    getResolvedExtrasInstruction,
    getSetDelegateInstruction,
    getSetDelegateInstructionDataDecoder,
    getSomeOmittedInstruction,
    getSyncLimitsInstruction,
    getSyncLimitsInstructionAsync,
    getSyncLimitsInstructionDataDecoder,
    identifyInstructionsInstruction,
    INSTRUCTIONS_ERROR__TEMPLATED,
    InstructionsInstruction,
    Mode,
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

test('it requires omitted inputs defaulting to the payer in instruction builders', () => {
    // When we build instructions whose only data inputs are omitted fields defaulting to the payer.
    const claim = getClaimOwnershipInstruction({ newOwner: owner });
    const delegate = getSetDelegateInstruction({ delegate: owner, delegateArg: owner });

    // Then the given addresses are encoded.
    expect(getClaimOwnershipInstructionDataDecoder().decode(claim.data).newOwner).toBe(owner);
    expect(getSetDelegateInstructionDataDecoder().decode(delegate.data).delegate).toBe(owner);
});

test('it derives pinned PDAs from the program address and picks conditional defaults from enum arguments', async () => {
    // Given a custom program address and a signer.
    const programAddress = address('Custom1111111111111111111111111111111111111');
    const authority = createNoopSigner(owner);

    // When we build the instruction in strict and relaxed modes.
    const strict = await getConfigureInstructionAsync({ authority, mode: Mode.Strict }, { programAddress });
    const relaxed = await getConfigureInstructionAsync({ authority, mode: Mode.Relaxed }, { programAddress });

    // Then the settings PDA, pinned to the address of the program, is derived from the custom address.
    const [settings] = await findSettingsPda({ programAddress });
    expect(strict.accounts[1].address).toBe(settings);

    // And the recipient follows the mode.
    expect(strict.accounts[2].address).toBe(owner);
    expect(relaxed.accounts[2].address).toBe(settings);
});

test('it fills in omitted data fields named like an account from their PDA', async () => {
    // Given a signer and the vault account.
    const ownerSigner = createNoopSigner(owner);
    const vault = address('Vau1t11111111111111111111111111111111111111');

    // When we build the instruction without the `vault` data field, which is omitted from the input.
    const instruction = await getLinkVaultInstructionAsync({ owner: ownerSigner, vault });

    // Then the data field holds the address of the PDA, not the vault account given as input.
    const [expected] = await findSecretCounterPda({ owner });
    expect(getLinkVaultInstructionDataDecoder().decode(instruction.data).vault).toBe(expected);
    expect(instruction.accounts[1].address).toBe(vault);
});
