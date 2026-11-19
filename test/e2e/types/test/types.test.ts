import { getUtf8Encoder, isNone, lamports, some } from '@solana/kit';
import { expect, test } from 'vitest';

import {
    Direction,
    getNumbersEncoder,
    getOptionsCodec,
    getSettingsCodec,
    getVaultCodec,
    identifyTypesEvent,
    type OptionsArgs,
    RENT_EXEMPTION,
    TypesEvent,
    VAULT_DISCRIMINATOR,
} from '../src/index.js';

test('it fills in nested fields named like the discriminator with their own default value', () => {
    // When we encode a vault without any discriminator.
    const bytes = getVaultCodec().encode({
        balance: lamports(1n),
        inlineSettings: {},
        settings: { direction: Direction.Down, mode: { __kind: 'Slow' } },
    });

    // Then the vault discriminator and the nested `discriminator` fields get their own values.
    const vault = getVaultCodec().decode(bytes);
    expect(vault.discriminator).toBe(VAULT_DISCRIMINATOR);
    expect(vault.settings.discriminator).toBe(99);
    expect(vault.inlineSettings.discriminator).toBe(99);
});

test('it encodes scalar enums nested within structs as data unions', () => {
    // When we encode settings whose inline mode enum is a data union.
    const bytes = getSettingsCodec().encode({ direction: Direction.Up, mode: { __kind: 'Slow' } });

    // Then the variant index, the custom u16 direction discriminator and the default discriminator are encoded.
    expect(bytes).toStrictEqual(new Uint8Array([1, 1, 0, 99]));
    expect(getSettingsCodec().decode(bytes).mode).toStrictEqual({ __kind: 'Slow' });
});

test('it ignores the byte order of single-byte formats', () => {
    // When we encode numbers whose u8 and u32 are big-endian.
    const bytes = getNumbersEncoder().encode({
        basisPoints: 0,
        beBool: true,
        beF64: 0,
        beI8: -1,
        beShortU16: 0,
        beU32: 1,
        beU8: 2,
        binaryFixed: 0,
        createdAt: 0,
        i128: 0,
        lamports: lamports(0n),
        lockup: 0,
        u128: 0,
        u16Bool: false,
    });

    // Then single-byte formats are encoded as is, and multi-byte ones in big-endian order.
    expect(bytes.slice(0, 7)).toStrictEqual(new Uint8Array([2, 255, 0, 0, 0, 0, 1]));
});

test('it encodes zeroable options with a custom zero value', () => {
    // When we encode an absent custom zeroable option.
    const options: OptionsArgs = {
        customZeroableOption: null,
        defaultOption: null,
        fixedOption: null,
        u32PrefixedOption: null,
        zeroableOption: null,
    };
    const bytes = getOptionsCodec().encode(options);

    // Then it is encoded as its zero value, on the size of its item.
    expect(bytes.slice(-2)).toStrictEqual(new Uint8Array([255, 255]));
    expect(isNone(getOptionsCodec().decode(bytes).customZeroableOption)).toBe(true);
    expect(
        getOptionsCodec().decode(getOptionsCodec().encode({ ...options, customZeroableOption: some(5) })),
    ).toMatchObject({ customZeroableOption: some(5) });
});

test('it identifies events whose constant discriminators are not raw bytes', () => {
    // Then events are identified by the encoded bytes of their discriminators.
    expect(identifyTypesEvent(new Uint8Array([7, 1]))).toBe(TypesEvent.Pinged);
    expect(identifyTypesEvent(new Uint8Array([...getUtf8Encoder().encode('NAME'), 1]))).toBe(TypesEvent.Named);
    expect(identifyTypesEvent(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 1]))).toBe(TypesEvent.Hashed);
});

test('it renders constants of their declared types', () => {
    // Then SOL amounts are lamports.
    expect(RENT_EXEMPTION).toBe(lamports(890880n));
});
