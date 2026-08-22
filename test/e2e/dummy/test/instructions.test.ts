import { expect, test } from 'vitest';

import {
    DummyInstruction,
    DUMMY_PROGRAM_ADDRESS,
    dummyProgram,
    getInstruction1Instruction,
    getInstruction10Instruction,
    getInstruction3Instruction,
    identifyDummyInstruction,
    parseDummyInstruction,
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
