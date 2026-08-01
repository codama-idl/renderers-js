import { address } from '@solana/kit';
import test from 'ava';
import {
  WEN_TRANSFER_GUARD_PROGRAM_ADDRESS,
  findGuardPda,
  getTransferAmountRuleCodec,
  transferAmountRule,
} from '../src/index.js';

// These tests deliberately avoid the network so that the NodeNext ESM output is
// exercised at runtime — Node must resolve every `.js` specifier in the
// generated client — without depending on a local validator.

test('it exposes the program address through the generated barrels', (t) => {
  t.is(
    WEN_TRANSFER_GUARD_PROGRAM_ADDRESS,
    address('LockdqYQ9X2kwtWB99ioSbxubAmEi8o9jqYwbXgrrRw')
  );
});

test('it round-trips a generated type codec', (t) => {
  const codec = getTransferAmountRuleCodec();
  const rule = transferAmountRule('Above', [42n]);
  t.deepEqual(codec.decode(codec.encode(rule)), rule);
});

test('it derives a PDA offline', async (t) => {
  const [pda, bump] = await findGuardPda({
    mint: address('So11111111111111111111111111111111111111112'),
  });
  t.true(typeof pda === 'string' && pda.length > 0);
  t.true(bump >= 0 && bump <= 255);
});
