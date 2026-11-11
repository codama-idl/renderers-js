import {
    CODAMA_ERROR__DISCRIMINATOR_FIELD_HAS_NO_DEFAULT_VALUE,
    CODAMA_ERROR__DISCRIMINATOR_FIELD_NOT_FOUND,
    CodamaError,
} from '@codama/errors';
import {
    addTypeNodeTransforms,
    bytesTypeNode,
    bytesValueNode,
    constantDiscriminatorNode,
    constantValueNode,
    enumTypeNode,
    enumVariantTypeNode,
    eventNode,
    fieldDiscriminatorNode,
    fixedSizeTransformNode,
    hiddenPrefixTransformNode,
    integerTypeNode,
    integerValueNode,
    pathString,
    programNode,
    rootNode,
    sizeDiscriminatorNode,
    structFieldTypeNode,
    structTypeNode,
} from '@codama/nodes';
import { visit } from '@codama/visitors-core';
import { expect, test } from 'vitest';

import { getRenderMapVisitor } from '../src';
import { renderMapContains, renderMapDoesNotContain } from './_setup';

function fixedBytesDiscriminator(hex: string, size: number, offset = 0) {
    return constantDiscriminatorNode(
        constantValueNode(
            addTypeNodeTransforms(bytesTypeNode(), [fixedSizeTransformNode(size)]),
            bytesValueNode('base16', hex),
        ),
        { offset: offset },
    );
}

test('it renders an event with an 8-byte constant discriminator', async () => {
    // Given an Anchor-style event whose discriminator is a hidden prefix of its data.
    const discriminator = fixedBytesDiscriminator('0a0b0c0d0e0f1011', 8);
    const node = programNode({
        events: [
            eventNode({
                data: addTypeNodeTransforms(structTypeNode([]), [hiddenPrefixTransformNode([discriminator.constant])]),
                discriminators: [discriminator],
                identifier: 'offerCancelled',
            }),
        ],
        identifier: 'offerbook',
        publicKey: '1111',
    });

    // When we render the event page.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the discriminator constants, data type, codec functions and parse helper.
    await renderMapContains(renderMap, 'events/offerCancelled.ts', [
        /export const OFFER_CANCELLED_EVENT_DISCRIMINATOR: ReadonlyUint8Array =\s*new Uint8Array\(\s*\[\s*10, 11, 12, 13, 14, 15, 16, 17\s*\]\s*\);/,
        'export function getOfferCancelledEventDiscriminatorBytes(): ReadonlyUint8Array',
        /export type OfferCancelledEvent = \{\s*\};/,
        'export type OfferCancelledEventArgs = OfferCancelledEvent;',
        /export function getOfferCancelledEventEncoder\(\): FixedSizeEncoder<OfferCancelledEventArgs>/,
        /export function getOfferCancelledEventDecoder\(\): FixedSizeDecoder<OfferCancelledEvent>/,
        /export function getOfferCancelledEventCodec\(\): FixedSizeCodec<\s*OfferCancelledEventArgs,\s*OfferCancelledEvent\s*>/,
        /export function parseOfferCancelledEvent\(\s*data: ReadonlyUint8Array \| Uint8Array\s*\): OfferCancelledEvent/,
    ]);
});

test('it references the discriminator constant inside the event codec functions', async () => {
    // Given an event whose data hides its constant discriminator as a prefix.
    const discriminator = fixedBytesDiscriminator('0a0b0c0d0e0f1011', 8);
    const node = programNode({
        events: [
            eventNode({
                data: addTypeNodeTransforms(structTypeNode([]), [hiddenPrefixTransformNode([discriminator.constant])]),
                discriminators: [discriminator],
                identifier: 'offerCancelled',
            }),
        ],
        identifier: 'offerbook',
        publicKey: '1111',
    });

    // When we render the event page.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the codec functions reference the constant instead of inlining the bytes.
    await renderMapContains(renderMap, 'events/offerCancelled.ts', [
        'getConstantEncoder(OFFER_CANCELLED_EVENT_DISCRIMINATOR)',
        'getConstantDecoder(OFFER_CANCELLED_EVENT_DISCRIMINATOR)',
        /containsBytes\(\s*data,\s*OFFER_CANCELLED_EVENT_DISCRIMINATOR,\s*0\s*\)/,
    ]);
});

test('it renders multiple events with distinct discriminators', async () => {
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([]),
                discriminators: [fixedBytesDiscriminator('0102', 2)],
                identifier: 'eventOne',
            }),
            eventNode({
                data: structTypeNode([]),
                discriminators: [fixedBytesDiscriminator('a0b0', 2)],
                identifier: 'eventTwo',
            }),
        ],
        identifier: 'myProgram',
        publicKey: '1111',
    });

    const renderMap = visit(node, getRenderMapVisitor());

    await renderMapContains(renderMap, 'events/eventOne.ts', /new Uint8Array\(\s*\[\s*1, 2\s*\]\s*\)/);
    await renderMapDoesNotContain(renderMap, 'events/eventOne.ts', /new Uint8Array\(\s*\[\s*160, 176\s*\]\s*\)/);
    await renderMapContains(renderMap, 'events/eventTwo.ts', /new Uint8Array\(\s*\[\s*160, 176\s*\]\s*\)/);
});

test('it renders a valid module for an event with no discriminator', async () => {
    const node = rootNode(
        programNode({
            events: [eventNode({ data: structTypeNode([]), identifier: 'heartbeat' })],
            identifier: 'myProgram',
            publicKey: '1111',
        }),
    );

    const renderMap = visit(node, getRenderMapVisitor());

    // Then the parse function decodes without any discriminator validation.
    await renderMapContains(renderMap, 'events/heartbeat.ts', [
        /export type HeartbeatEvent = \{\s*\};/,
        /export function parseHeartbeatEvent\(\s*data: ReadonlyUint8Array \| Uint8Array\s*\): HeartbeatEvent \{\s*return getHeartbeatEventDecoder\(\)\.decode\(data\);\s*\}/,
    ]);
    await renderMapContains(renderMap, 'events/index.ts', "export * from './heartbeat';");
    await renderMapContains(renderMap, 'index.ts', "export * from './events';");
});

test('it preserves offsets and multiple constant discriminator conditions', async () => {
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([]),
                discriminators: [fixedBytesDiscriminator('1122', 2, 2), fixedBytesDiscriminator('334455', 3, 9)],
                identifier: 'composite',
            }),
        ],
        identifier: 'myProgram',
        publicKey: '1111',
    });

    const renderMap = visit(node, getRenderMapVisitor());

    await renderMapContains(renderMap, 'events/composite.ts', [
        /export const COMPOSITE_EVENT_DISCRIMINATOR: ReadonlyUint8Array =\s*new Uint8Array\(\s*\[\s*17, 34\s*\]\s*\);/,
        /export const COMPOSITE_EVENT_DISCRIMINATOR2: ReadonlyUint8Array =\s*new Uint8Array\(\s*\[\s*51, 68, 85\s*\]\s*\);/,
        /containsBytes\(\s*data,\s*COMPOSITE_EVENT_DISCRIMINATOR,\s*2\s*\)\s*&&/,
        /containsBytes\(\s*data,\s*COMPOSITE_EVENT_DISCRIMINATOR2,\s*9\s*\)/,
    ]);
});

test('it supports size discriminators when parsing events', async () => {
    // Given an event discriminated by the size of its data.
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([structFieldTypeNode({ identifier: 'value', type: integerTypeNode('u64') })]),
                discriminators: [sizeDiscriminatorNode(8)],
                identifier: 'sized',
            }),
        ],
        identifier: 'myProgram',
        publicKey: '1111',
    });

    // When we render the event page.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the parse function validates the data length.
    await renderMapContains(renderMap, 'events/sized.ts', [
        'if (data.length === 8) {',
        'return getSizedEventDecoder().decode(data);',
    ]);
});

test('it renders events with non-struct payloads', async () => {
    // Given an event whose payload is an enum rather than a struct.
    const node = programNode({
        events: [
            eventNode({
                data: enumTypeNode([enumVariantTypeNode('opened'), enumVariantTypeNode('closed')]),
                discriminators: [fixedBytesDiscriminator('ff', 1)],
                identifier: 'stateChange',
            }),
        ],
        identifier: 'myProgram',
        publicKey: '1111',
    });

    // When we render the event page.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the enum type and its codec functions are rendered.
    await renderMapContains(renderMap, 'events/stateChange.ts', [
        /export enum StateChangeEvent \{\s*Opened,\s*Closed,?\s*\}/,
        'export function parseStateChangeEvent(',
    ]);
});

test('it references field discriminator constants in the event encoder', async () => {
    // Given an event discriminated by a field with a default value.
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([
                    structFieldTypeNode({
                        defaultValue: integerValueNode('42'),
                        defaultValueStrategy: 'omitted',
                        identifier: 'key',
                        type: integerTypeNode('u8'),
                    }),
                ]),
                discriminators: [fieldDiscriminatorNode('key')],
                identifier: 'keyed',
            }),
        ],
        identifier: 'myProgram',
        publicKey: '1111',
    });

    // When we render the event page.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the constant is rendered and referenced by the encoder's default value.
    await renderMapContains(renderMap, 'events/keyed.ts', [
        'export const KEYED_EVENT_KEY = 42;',
        'key: KEYED_EVENT_KEY',
    ]);
});

test('it renders program-level event identification helpers', async () => {
    // Given a program with two discriminated events.
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([]),
                discriminators: [fixedBytesDiscriminator('0102', 2)],
                identifier: 'eventOne',
            }),
            eventNode({
                data: structTypeNode([]),
                discriminators: [fixedBytesDiscriminator('a0b0', 2)],
                identifier: 'eventTwo',
            }),
        ],
        identifier: 'myProgram',
        publicKey: '1111',
    });

    // When we render the program page.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then it exposes an event enum and an identifier function.
    await renderMapContains(renderMap, 'programs/myProgram.ts', [
        /export enum MyProgramEvent \{\s*EventOne,\s*EventTwo,?\s*\}/,
        /export function identifyMyProgramEvent\(\s*event: \{ data: ReadonlyUint8Array \} \| ReadonlyUint8Array\s*\): MyProgramEvent/,
        'return MyProgramEvent.EventOne;',
        'return MyProgramEvent.EventTwo;',
    ]);
});

test('it omits the event identifier function when no event has discriminators', async () => {
    const node = programNode({
        events: [eventNode({ data: structTypeNode([]), identifier: 'heartbeat' })],
        identifier: 'myProgram',
        publicKey: '1111',
    });

    const renderMap = visit(node, getRenderMapVisitor());

    await renderMapContains(renderMap, 'programs/myProgram.ts', /export enum MyProgramEvent \{\s*Heartbeat,?\s*\}/);
    await renderMapDoesNotContain(renderMap, 'programs/myProgram.ts', 'identifyMyProgramEvent');
});

test('it applies custom name transformations to the event APIs', async () => {
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([]),
                discriminators: [fixedBytesDiscriminator('01020304', 4)],
                identifier: 'renamed',
            }),
        ],
        identifier: 'myProgram',
        publicKey: '1111',
    });

    const renderMap = visit(
        node,
        getRenderMapVisitor({
            nameTransformers: {
                constantFunction: (name, { pascalCase }) => `bytes${pascalCase(name)}`,
                eventDataType: (name, { pascalCase }) => `${pascalCase(name)}Payload`,
                eventParseFunction: name => `read_${name}`,
            },
        }),
    );

    await renderMapContains(renderMap, 'events/renamed.ts', [
        'export const RENAMED_PAYLOAD_DISCRIMINATOR',
        'export function bytesRenamedPayloadDiscriminator(): ReadonlyUint8Array',
        'export type RenamedPayload',
        'export function read_renamed(',
    ]);
});

test('it exports public events while keeping internal events private', async () => {
    const publicEvent = eventNode({
        data: structTypeNode([]),
        discriminators: [fixedBytesDiscriminator('01', 1)],
        identifier: 'publicEvent',
    });
    const internalEvent = eventNode({
        data: structTypeNode([]),
        discriminators: [fixedBytesDiscriminator('02', 1)],
        identifier: 'internalEvent',
    });
    const node = rootNode(programNode({ events: [publicEvent], identifier: 'mainProgram', publicKey: '1111' }), {
        additionalPrograms: [programNode({ events: [internalEvent], identifier: 'otherProgram', publicKey: '2222' })],
    });

    const renderMap = visit(node, getRenderMapVisitor({ internalNodes: ['internalEvent'] }));

    expect(renderMap.has('events/internalEvent.ts')).toBe(true);
    await renderMapContains(renderMap, 'events/index.ts', "export * from './publicEvent';");
    await renderMapDoesNotContain(renderMap, 'events/index.ts', './internalEvent');
    await renderMapContains(renderMap, 'index.ts', "export * from './events';");
});

test('it fails loudly when a field discriminator has no matching payload field', () => {
    // Given an event with a non-struct payload and a field discriminator that
    // can therefore never resolve to a payload field.
    const discriminator = fieldDiscriminatorNode('key');
    const node = programNode({
        events: [
            eventNode({
                data: enumTypeNode([enumVariantTypeNode('opened')]),
                discriminators: [discriminator],
                identifier: 'broken',
            }),
        ],
        identifier: 'myProgram',
        publicKey: '1111',
    });

    // Then rendering fails at generation time with a clear error.
    expect(() => visit(node, getRenderMapVisitor())).toThrow(
        new CodamaError(CODAMA_ERROR__DISCRIMINATOR_FIELD_NOT_FOUND, {
            field: pathString('key'),
            path: [discriminator],
        }),
    );
});

test('it fails loudly when a field discriminator has no default value', () => {
    // Given an event whose field discriminator points to a field without a default value.
    const keyField = structFieldTypeNode({ identifier: 'key', type: integerTypeNode('u8') });
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([keyField]),
                discriminators: [fieldDiscriminatorNode('key')],
                identifier: 'broken',
            }),
        ],
        identifier: 'myProgram',
        publicKey: '1111',
    });

    // Then rendering fails at generation time with a clear error.
    expect(() => visit(node, getRenderMapVisitor())).toThrow(
        new CodamaError(CODAMA_ERROR__DISCRIMINATOR_FIELD_HAS_NO_DEFAULT_VALUE, { path: [keyField] }),
    );
});

test('it omits event barrels for programs with no events', async () => {
    const node = rootNode(programNode({ identifier: 'emptyProgram', publicKey: '1111' }));

    const renderMap = visit(node, getRenderMapVisitor());

    expect(renderMap.has('events/index.ts')).toBe(false);
    await renderMapDoesNotContain(renderMap, 'index.ts', './events');
});
