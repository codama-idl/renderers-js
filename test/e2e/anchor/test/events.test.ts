import { address } from '@solana/kit';
import { expect, test } from 'vitest';

import {
    GUARD_CREATED_EVENT_DISCRIMINATOR,
    getGuardCreatedEventEncoder,
    identifyWenTransferGuardEvent,
    parseGuardCreatedEvent,
    WenTransferGuardEvent,
} from '../src/index.js';

test('it encodes, identifies and parses a guard created event', () => {
    // Given event data for a created guard.
    const event = {
        guard: address('LockdqYQ9X2kwtWB99ioSbxubAmEi8o9jqYwbXgrrRw'),
        mint: address('11111111111111111111111111111111'),
    };

    // When we encode it using the generated event encoder.
    const bytes = getGuardCreatedEventEncoder().encode(event);

    // Then the encoded bytes start with the event discriminator.
    expect(bytes.slice(0, 8)).toStrictEqual(GUARD_CREATED_EVENT_DISCRIMINATOR);

    // And the program-level helper identifies the event from the raw bytes.
    expect(identifyWenTransferGuardEvent(bytes)).toBe(WenTransferGuardEvent.GuardCreated);

    // And parsing the bytes round-trips the original event data.
    expect(parseGuardCreatedEvent(bytes)).toStrictEqual(event);
});

test('it rejects data that does not match the event discriminator', () => {
    // Given data that does not start with the event discriminator.
    const bytes = new Uint8Array(72);

    // Then parsing it fails loudly.
    expect(() => parseGuardCreatedEvent(bytes)).toThrow(
        'The provided data does not match the "GuardCreatedEvent" event discriminators.',
    );
});
