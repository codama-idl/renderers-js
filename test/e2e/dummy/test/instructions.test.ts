import { address, AccountRole } from '@solana/kit';
import { expect, test } from 'vitest';

import {
    DummyInstruction,
    DUMMY_PROGRAM_ADDRESS,
    dummyProgram,
    getInstruction1Instruction,
    getInstruction10Instruction,
    getInstruction11Instruction,
    getInstruction3Instruction,
    identifyDummyInstruction,
    parseDummyInstruction,
    parseInstruction11Instruction,
    type DummyPluginRequirements,
} from '../src/index.js';

test('it can create instruction 1', () => {
    // When we create a dummy instruction.
    const instruction = getInstruction1Instruction();

    // Then we expect the instruction to have the correct program address.
    expect(instruction.programAddress).toBe(DUMMY_PROGRAM_ADDRESS);
});

test('identifyDummyInstruction recognizes a real instruction built by the generator', () => {
    // Given two instructions built by the generated builders.
    const ix3 = getInstruction3Instruction();
    const ix10 = getInstruction10Instruction();

    // Then identifying the encoded data round-trips back to the right variant.
    expect(identifyDummyInstruction(ix3)).toBe(DummyInstruction.Instruction3);
    expect(identifyDummyInstruction(ix10)).toBe(DummyInstruction.Instruction10);
});

test('parseDummyInstruction returns the matching parsed variant', () => {
    // Given an instruction built by the generator.
    const ix3 = getInstruction3Instruction();

    // When we parse it.
    const parsed = parseDummyInstruction(ix3);

    // Then we get the parsed variant tagged with the right enum value.
    expect(parsed.instructionType).toBe(DummyInstruction.Instruction3);
    expect(parsed.programAddress).toBe(DUMMY_PROGRAM_ADDRESS);
});

test('an unset optional account is replaced by the program address and preserves account order', () => {
    // Given an instruction with an optional account followed by a required account,
    // built with the optional account left unset.
    // See https://github.com/codama-idl/renderers-js/issues/94
    const requiredAccount = address('So11111111111111111111111111111111111111112');
    const instruction = getInstruction11Instruction({ requiredAccount });

    // Then both account slots are kept in declaration order: the unset optional
    // account is filled with the program address (an Anchor-style placeholder)
    // rather than being dropped, so the required account stays at index 1.
    expect(instruction.accounts).toHaveLength(2);
    expect(instruction.accounts[0]).toStrictEqual({
        address: DUMMY_PROGRAM_ADDRESS,
        role: AccountRole.READONLY,
    });
    expect(instruction.accounts[1].address).toBe(requiredAccount);
});

test('parsing an instruction with an unset optional account round-trips back to undefined', () => {
    // Given an instruction built with an unset optional account.
    const requiredAccount = address('So11111111111111111111111111111111111111112');
    const instruction = getInstruction11Instruction({ requiredAccount });

    // When we parse it back.
    const parsed = parseInstruction11Instruction(instruction);

    // Then the placeholder is recognised as an unset optional account, and the
    // required account is still correctly resolved from its position.
    expect(parsed.accounts.optionalAccount).toBeUndefined();
    expect(parsed.accounts.requiredAccount.address).toBe(requiredAccount);
});

test('a set optional account is passed through and round-trips on parse', () => {
    // Given an instruction built with both accounts set.
    const optionalAccount = address('SysvarRent111111111111111111111111111111111');
    const requiredAccount = address('So11111111111111111111111111111111111111112');
    const instruction = getInstruction11Instruction({ optionalAccount, requiredAccount });

    // Then both addresses are passed in order and parse restores the optional account.
    expect(instruction.accounts[0].address).toBe(optionalAccount);
    expect(instruction.accounts[1].address).toBe(requiredAccount);
    const parsed = parseInstruction11Instruction(instruction);
    expect(parsed.accounts.optionalAccount?.address).toBe(optionalAccount);
    expect(parsed.accounts.requiredAccount.address).toBe(requiredAccount);
});

test('the dummy program plugin re-exposes identifyInstruction and parseInstruction', () => {
    // Given the plugin applied to a stub client. The new identify/parse fields
    // are bare references that don't read from the client, so a stub is fine.
    const client = dummyProgram()({} as DummyPluginRequirements);

    // And an instruction built by the generated builder.
    const instruction = getInstruction3Instruction();

    // Then the plugin's identify/parse helpers behave identically to the
    // standalone helpers when given the same generator-built instruction.
    expect(client.dummy.identifyInstruction(instruction)).toBe(identifyDummyInstruction(instruction));
    expect(client.dummy.parseInstruction(instruction)).toStrictEqual(parseDummyInstruction(instruction));
});
