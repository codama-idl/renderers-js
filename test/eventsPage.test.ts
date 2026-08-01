import {
    bytesTypeNode,
    bytesValueNode,
    constantDiscriminatorNode,
    constantValueNode,
    eventNode,
    fixedSizeTypeNode,
    hiddenPrefixTypeNode,
    type ProgramNode,
    programNode,
    rootNode,
    sizeDiscriminatorNode,
    structTypeNode,
} from '@codama/nodes';
import { visit } from '@codama/visitors-core';
import { expect, test } from 'vitest';

import { getRenderMapVisitor } from '../src';
import { renderMapContains, renderMapDoesNotContain } from './_setup';

function fixedBytesDiscriminator(hex: string, size: number, offset = 0) {
    return constantDiscriminatorNode(
        constantValueNode(fixedSizeTypeNode(bytesTypeNode(), size), bytesValueNode('base16', hex)),
        offset,
    );
}

test('it renders an event with an 8-byte constant discriminator', async () => {
    const discriminator = fixedBytesDiscriminator('0a0b0c0d0e0f1011', 8);
    const node = programNode({
        events: [
            eventNode({
                data: hiddenPrefixTypeNode(structTypeNode([]), [discriminator.constant]),
                discriminators: [discriminator],
                name: 'offerCancelled',
            }),
        ],
        name: 'offerbook',
        publicKey: '1111',
    });

    const renderMap = visit(node, getRenderMapVisitor());

    await renderMapContains(renderMap, 'events/offerCancelled.ts', [
        /export const OFFER_CANCELLED_DISCRIMINATOR: ReadonlyUint8Array = new Uint8Array\(\s*\[\s*10, 11, 12, 13, 14, 15, 16, 17\s*\]\s*\);/,
        'export function getOfferCancelledDiscriminatorBytes(): ReadonlyUint8Array',
        'getConstantDecoder(OFFER_CANCELLED_DISCRIMINATOR)',
        /export type OfferCancelled = \{\s*\};/,
        /function getOfferCancelledDecoder\(\): Decoder<OfferCancelled>/,
        /export function parseOfferCancelled\(\s*data: Uint8Array\s*\): OfferCancelled/,
    ]);
});

test('it renders multiple events with distinct discriminators', async () => {
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([]),
                discriminators: [fixedBytesDiscriminator('0102', 2)],
                name: 'eventOne',
            }),
            eventNode({
                data: structTypeNode([]),
                discriminators: [fixedBytesDiscriminator('a0b0', 2)],
                name: 'eventTwo',
            }),
        ],
        name: 'myProgram',
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
            events: [eventNode({ data: structTypeNode([]), name: 'heartbeat' })],
            name: 'myProgram',
            publicKey: '1111',
        }),
    );

    const renderMap = visit(node, getRenderMapVisitor());

    await renderMapContains(renderMap, 'events/heartbeat.ts', [
        'export type Heartbeat = {};',
        'export function parseHeartbeat(data: Uint8Array): Heartbeat',
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
                name: 'compositeEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '1111',
    });

    const renderMap = visit(node, getRenderMapVisitor());

    await renderMapContains(renderMap, 'events/compositeEvent.ts', [
        /export const COMPOSITE_EVENT_DISCRIMINATOR: ReadonlyUint8Array = new Uint8Array\(\s*\[\s*17, 34\s*\]\s*\);/,
        'export const COMPOSITE_EVENT_DISCRIMINATOR2: ReadonlyUint8Array = new Uint8Array([51, 68, 85]);',
    ]);
});

test('it applies custom name transformations to event discriminator APIs', async () => {
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([]),
                discriminators: [fixedBytesDiscriminator('01020304', 4)],
                name: 'renamedEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '1111',
    });

    const renderMap = visit(
        node,
        getRenderMapVisitor({
            nameTransformers: {
                constant: name => `constant_${name}`,
                constantFunction: name => `bytes_${name}`,
            },
        }),
    );

    await renderMapContains(renderMap, 'events/renamedEvent.ts', [
        'export const constant_renamedEventDiscriminator: ReadonlyUint8Array',
    ]);
});

test('it exports public events while keeping internal events private', async () => {
    const publicEvent = eventNode({
        data: structTypeNode([]),
        discriminators: [fixedBytesDiscriminator('01', 1)],
        name: 'publicEvent',
    });
    const internalEvent = eventNode({
        data: structTypeNode([]),
        discriminators: [fixedBytesDiscriminator('02', 1)],
        name: 'internalEvent',
    });
    const node = rootNode(programNode({ events: [publicEvent], name: 'mainProgram', publicKey: '1111' }), [
        programNode({ events: [internalEvent], name: 'otherProgram', publicKey: '2222' }),
    ]);

    const renderMap = visit(node, getRenderMapVisitor({ internalNodes: ['internalEvent'] }));

    expect(renderMap.has('events/internalEvent.ts')).toBe(true);
    await renderMapContains(renderMap, 'events/index.ts', "export * from './publicEvent';");
    await renderMapDoesNotContain(renderMap, 'events/index.ts', './internalEvent');
    await renderMapContains(renderMap, 'index.ts', "export * from './events';");
});

test('it omits event barrels for programs with no events', async () => {
    const legacyProgram = {
        ...programNode({ name: 'emptyProgram', publicKey: '1111' }),
        events: undefined,
    } as unknown as ProgramNode;
    const node = rootNode(legacyProgram);

    const renderMap = visit(node, getRenderMapVisitor());

    expect(renderMap.has('events/index.ts')).toBe(false);
    await renderMapDoesNotContain(renderMap, 'index.ts', './events');
});

test('it rejects event discriminator conditions that are not static bytes', () => {
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([]),
                discriminators: [sizeDiscriminatorNode(8)],
                name: 'dynamicEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '1111',
    });

    expect(() => visit(node, getRenderMapVisitor())).toThrowError(
        'Cannot render event "dynamicEvent": unsupported sizeDiscriminatorNode.',
    );
});
