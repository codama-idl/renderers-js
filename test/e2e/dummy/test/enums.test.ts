import { expect, test } from 'vitest';

import { command, getCommandCodec, getPriorityCodec, Priority } from '../src/index.js';

test('scalar enum members carry their custom discriminators', () => {
    // Omitted discriminators fall back to the variant position.
    expect(Priority.Low).toBe(0);
    expect(Priority.Medium).toBe(3);
    expect(Priority.High).toBe(5);

    const codec = getPriorityCodec();
    expect(codec.encode(Priority.High)).toStrictEqual(new Uint8Array([5]));
    expect(codec.decode(new Uint8Array([3]))).toBe(Priority.Medium);
    expect(codec.decode(codec.encode(Priority.Low))).toBe(Priority.Low);
});

test('discriminated unions write their custom discriminators as the prefix', () => {
    const codec = getCommandCodec();

    // A u16 prefix carrying the custom value, followed by the variant data.
    expect(codec.encode(command('Quit'))).toStrictEqual(new Uint8Array([0, 0]));
    expect(codec.encode(command('Write', [9]))).toStrictEqual(new Uint8Array([3, 0, 9, 0, 0, 0]));
    expect(codec.encode(command('Move', { x: 7 }))).toStrictEqual(new Uint8Array([5, 0, 7, 0, 0, 0]));

    // And the prefix maps back to the right variant when decoding.
    expect(codec.decode(new Uint8Array([5, 0, 7, 0, 0, 0]))).toStrictEqual({ __kind: 'Move', x: 7 });
    expect(codec.decode(new Uint8Array([3, 0, 9, 0, 0, 0]))).toStrictEqual({ __kind: 'Write', fields: [9] });
    expect(codec.decode(new Uint8Array([0, 0]))).toStrictEqual({ __kind: 'Quit' });
});

test('discriminated unions reject unknown discriminators', () => {
    expect(() => getCommandCodec().decode(new Uint8Array([1, 0]))).toThrow();
});
