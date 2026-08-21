import { address } from '@solana/kit';
import test from 'ava';
import {
  IMPORT_EXTENSIONS_PROGRAM_ADDRESS,
  findCounterPda,
  getCounterValueCodec,
} from '../src/index.js';

// These tests deliberately avoid the network so that the NodeNext ESM output is
// exercised at runtime — Node must resolve every `.js` specifier in the
// generated client — without depending on a local validator.

test('it exposes the program address through the generated barrels', (t) => {
  t.is(
    IMPORT_EXTENSIONS_PROGRAM_ADDRESS,
    address('11111111111111111111111111111111')
  );
});

test('it round-trips a generated type codec', (t) => {
  const codec = getCounterValueCodec();
  const value = { count: 42n };
  t.deepEqual(codec.decode(codec.encode(value)), value);
});

test('it derives a PDA offline', async (t) => {
  const [pda, bump] = await findCounterPda({
    owner: address('So11111111111111111111111111111111111111112'),
  });
  t.true(typeof pda === 'string' && pda.length > 0);
  t.true(bump >= 0 && bump <= 255);
});
