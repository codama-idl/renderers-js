import test from 'ava';
import {
  DUMMY_PROGRAM_ADDRESS,
  DummyInstruction,
  dummyProgram,
  getInstruction1Instruction,
  getInstruction10Instruction,
  getInstruction3Instruction,
  getKeyCodec,
  identifyDummyInstruction,
  Key,
  parseDummyInstruction,
  type DummyPluginRequirements,
} from '../src/index.ts';

// These tests run against the JavaScript `tsc` emitted from sources whose
// relative imports are written as `./x.ts`. Reaching them at all proves
// `rewriteRelativeImportExtensions` rewrote those specifiers to `./x.js`; none
// of them need a validator.

test('it can create instruction 1', (t) => {
  const instruction = getInstruction1Instruction();
  t.is(instruction.programAddress, DUMMY_PROGRAM_ADDRESS);
});

test('the scalar enum is a const object rather than an enum declaration', (t) => {
  t.is(Key.Uninitialized, 0);
  t.is(Key.Asset, 1);
});

test('the scalar enum round-trips through its generated codec', (t) => {
  const codec = getKeyCodec();
  t.is(codec.decode(codec.encode(Key.Asset)), Key.Asset);
  t.is(codec.decode(codec.encode(Key.Uninitialized)), Key.Uninitialized);
});

test('identifyDummyInstruction recognizes a real instruction built by the generator', (t) => {
  const ix3 = getInstruction3Instruction();
  const ix10 = getInstruction10Instruction();
  t.is(identifyDummyInstruction(ix3), DummyInstruction.Instruction3);
  t.is(identifyDummyInstruction(ix10), DummyInstruction.Instruction10);
});

test('parseDummyInstruction returns the matching parsed variant', (t) => {
  const parsed = parseDummyInstruction(getInstruction3Instruction());
  t.is(parsed.instructionType, DummyInstruction.Instruction3);
  t.is(parsed.programAddress, DUMMY_PROGRAM_ADDRESS);
});

test('the dummy program plugin re-exposes identifyInstruction and parseInstruction', (t) => {
  const client = dummyProgram()({} as DummyPluginRequirements);
  const instruction = getInstruction3Instruction();
  t.is(
    client.dummy.identifyInstruction(instruction),
    identifyDummyInstruction(instruction)
  );
  t.deepEqual(
    client.dummy.parseInstruction(instruction),
    parseDummyInstruction(instruction)
  );
});
