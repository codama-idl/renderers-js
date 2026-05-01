import test from 'ava';
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

test('it can create instruction 1', (t) => {
  // When we create a dummy instruction.
  const instruction = getInstruction1Instruction();

  // Then we expect the instruction to have the correct program address.
  t.is(instruction.programAddress, DUMMY_PROGRAM_ADDRESS);
});

test('identifyDummyInstruction recognizes a real instruction built by the generator', (t) => {
  // Given two instructions built by the generated builders.
  const ix3 = getInstruction3Instruction();
  const ix10 = getInstruction10Instruction();

  // Then identifying the encoded data round-trips back to the right variant.
  t.is(identifyDummyInstruction(ix3), DummyInstruction.Instruction3);
  t.is(identifyDummyInstruction(ix10), DummyInstruction.Instruction10);
});

test('parseDummyInstruction returns the matching parsed variant', (t) => {
  // Given an instruction built by the generator.
  const ix3 = getInstruction3Instruction();

  // When we parse it.
  const parsed = parseDummyInstruction(ix3);

  // Then we get the parsed variant tagged with the right enum value.
  t.is(parsed.instructionType, DummyInstruction.Instruction3);
  t.is(parsed.programAddress, DUMMY_PROGRAM_ADDRESS);
});

test('the dummy program plugin re-exposes identifyInstruction and parseInstruction', (t) => {
  // Given the plugin applied to a stub client. The new identify/parse fields
  // are bare references that don't read from the client, so a stub is fine.
  const client = dummyProgram()({} as DummyPluginRequirements);

  // And an instruction built by the generated builder.
  const instruction = getInstruction3Instruction();

  // Then the plugin's identify/parse helpers behave identically to the
  // standalone helpers when given the same generator-built instruction.
  t.is(
    client.dummy.identifyInstruction(instruction),
    identifyDummyInstruction(instruction)
  );
  t.deepEqual(
    client.dummy.parseInstruction(instruction),
    parseDummyInstruction(instruction)
  );
});
