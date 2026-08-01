// Run with `node ./smoke.ts`. Node executes this file — and the whole generated
// client it pulls in — by stripping types rather than compiling them, which only
// works when every generated construct is erasable (no `enum`, no `namespace`)
// and every relative specifier already carries its real `.ts` extension. That is
// exactly the combination `erasableSyntax` and `importExtension: 'ts'` produce,
// so this script fails loudly if the renderer regresses on either.

import assert from 'node:assert/strict';

import {
  DUMMY_PROGRAM_ADDRESS,
  DummyInstruction,
  getInstruction3Instruction,
  getKeyCodec,
  identifyDummyInstruction,
  Key,
} from './src/index.ts';

assert.equal(DUMMY_PROGRAM_ADDRESS, 'Dummy1111111111111111111111111111111111');

// The scalar enum survives as a `const` object.
assert.equal(Key.Asset, 1);

const codec = getKeyCodec();
assert.equal(codec.decode(codec.encode(Key.Asset)), Key.Asset);

// The program-level instruction enum keeps working through the generated helpers.
assert.equal(
  identifyDummyInstruction(getInstruction3Instruction()),
  DummyInstruction.Instruction3
);

console.log('modern e2e smoke test passed under Node type stripping');
