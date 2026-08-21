// Run with `node ./compatibility.ts`. Node executes this file — and the whole generated
// client it pulls in — by stripping types rather than compiling them, which only
// works when every generated construct is erasable (no `enum`, no `namespace`)
// and every relative specifier already carries its real `.ts` extension. That is
// exactly the combination `erasableSyntax` and `importExtension: 'ts'` produce,
// so this script fails loudly if the renderer regresses on either.

import assert from 'node:assert/strict';

import {
    getKeyCodec,
    getUseKeyInstruction,
    identifyNodeEsmInstruction,
    Key,
    NODE_ESM_PROGRAM_ADDRESS,
    NodeEsmInstruction,
    nodeEsmProgram,
    parseNodeEsmInstruction,
    type NodeEsmPluginRequirements,
} from './src/index.ts';

assert.equal(NODE_ESM_PROGRAM_ADDRESS, 'Dummy1111111111111111111111111111111111');

assert.equal(Key.Asset, 1);
assert.equal(Key[Key.Asset], 'Asset');

const codec = getKeyCodec();
assert.equal(codec.decode(codec.encode(Key.Asset)), Key.Asset);

const instruction = getUseKeyInstruction();
assert.equal(identifyNodeEsmInstruction(instruction), NodeEsmInstruction.UseKey);
assert.equal(parseNodeEsmInstruction(instruction).instructionType, NodeEsmInstruction.UseKey);

const client = nodeEsmProgram()({} as NodeEsmPluginRequirements);
assert.equal(client.nodeEsm.identifyInstruction(instruction), NodeEsmInstruction.UseKey);

console.log('node-esm compatibility test passed');
