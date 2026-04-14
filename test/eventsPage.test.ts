import {
    bytesTypeNode,
    bytesValueNode,
    camelCase,
    constantDiscriminatorNode,
    constantValueNode,
    eventNode,
    fixedSizeTypeNode,
    hiddenPrefixTypeNode,
    numberTypeNode,
    numberValueNode,
    programNode,
    publicKeyTypeNode,
    rootNode,
    structFieldTypeNode,
    structTypeNode,
} from '@codama/nodes';
import { visit } from '@codama/visitors-core';
import { test } from 'vitest';

import { getRenderMapVisitor } from '../src';
import { renderMapContains, renderMapContainsImports, renderMapDoesNotContain } from './_setup';

test('it renders an event with a constant discriminator', async () => {
    const discriminator = constantValueNode(
        fixedSizeTypeNode(bytesTypeNode(), 8),
        bytesValueNode('base16', 'c80c5f2c6b0b021f'),
    );
    const node = programNode({
        events: [
            eventNode({
                data: hiddenPrefixTypeNode(
                    structTypeNode([
                        structFieldTypeNode({ name: 'guard', type: publicKeyTypeNode() }),
                        structFieldTypeNode({ name: 'mint', type: publicKeyTypeNode() }),
                    ]),
                    [discriminator],
                ),
                discriminators: [constantDiscriminatorNode(discriminator)],
                name: 'guardCreatedEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '1111',
    });

    const renderMap = visit(node, getRenderMapVisitor());

    await renderMapContains(renderMap, 'events/guardCreatedEvent.ts', [
        'export type GuardCreatedEvent',
        'export function getGuardCreatedEventDecoder()',
    ]);
    await renderMapDoesNotContain(renderMap, 'events/guardCreatedEvent.ts', [
        'getGuardCreatedEventEncoder',
        'getGuardCreatedEventCodec',
        'GuardCreatedEventArgs',
    ]);
    await renderMapContains(renderMap, 'events/guardCreatedEvent.ts', [
        'export const GUARD_CREATED_EVENT_DISCRIMINATOR',
        'export function getGuardCreatedEventDiscriminatorBytes()',
    ]);
    await renderMapContains(renderMap, 'events/guardCreatedEvent.ts', [
        'export function decodeGuardCreatedEvent',
        'data: ReadonlyUint8Array',
        /containsBytes\(.*data,.*GUARD_CREATED_EVENT_DISCRIMINATOR,.*0\)/s,
        /getGuardCreatedEventDecoder\(\)\.decode\(\s*data,\s*GUARD_CREATED_EVENT_DISCRIMINATOR\.length/s,
    ]);
});

test('it renders an event without a discriminator', async () => {
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') })]),
                name: 'simpleEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '1111',
    });

    const renderMap = visit(node, getRenderMapVisitor());

    await renderMapContains(renderMap, 'events/simpleEvent.ts', [
        'export type SimpleEvent',
        'export function getSimpleEventDecoder()',
    ]);
    await renderMapDoesNotContain(renderMap, 'events/simpleEvent.ts', [
        'getSimpleEventEncoder',
        'getSimpleEventCodec',
        'SimpleEventArgs',
    ]);
});

test('it renders events in the events index', async () => {
    const node = rootNode(
        programNode({
            events: [
                eventNode({
                    data: structTypeNode([structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') })]),
                    name: 'myEvent',
                }),
            ],
            name: 'myProgram',
            publicKey: '1111',
        }),
    );

    const renderMap = visit(node, getRenderMapVisitor());

    await renderMapContains(renderMap, 'events/index.ts', ["export * from './myEvent'"]);
});

test('it renders events in the root index', async () => {
    const node = rootNode(
        programNode({
            events: [
                eventNode({
                    data: structTypeNode([structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') })]),
                    name: 'myEvent',
                }),
            ],
            name: 'myProgram',
            publicKey: '1111',
        }),
    );

    const renderMap = visit(node, getRenderMapVisitor());

    await renderMapContains(renderMap, 'index.ts', ["export * from './events'"]);
});

test('it does not render events module when there are no events', async () => {
    const node = rootNode(
        programNode({
            name: 'myProgram',
            publicKey: '1111',
        }),
    );

    const renderMap = visit(node, getRenderMapVisitor());

    await renderMapDoesNotContain(renderMap, 'index.ts', ["export * from './events'"]);
});

test('it renders correct imports for event with discriminator', async () => {
    const discriminator = constantValueNode(
        fixedSizeTypeNode(bytesTypeNode(), 8),
        bytesValueNode('base16', 'aabbccdd11223344'),
    );
    const node = programNode({
        events: [
            eventNode({
                data: hiddenPrefixTypeNode(
                    structTypeNode([structFieldTypeNode({ name: 'value', type: numberTypeNode('u64') })]),
                    [discriminator],
                ),
                discriminators: [constantDiscriminatorNode(discriminator)],
                name: 'tradeEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '1111',
    });

    const renderMap = visit(node, getRenderMapVisitor());

    await renderMapContainsImports(renderMap, 'events/tradeEvent.ts', {
        '@solana/kit': ['containsBytes', 'ReadonlyUint8Array'],
    });
});

test('it renders event docs', async () => {
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([structFieldTypeNode({ name: 'value', type: numberTypeNode('u32') })]),
                docs: ['Some documentation.', 'Second line.'],
                name: 'documentedEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '1111',
    });

    const renderMap = visit(node, getRenderMapVisitor());

    await renderMapContains(renderMap, 'events/documentedEvent.ts', [
        /\* Some documentation\./,
        /\* Second line\./,
        'export type DocumentedEvent',
    ]);
});

test('it does not render decode function for events without discriminator', async () => {
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') })]),
                name: 'simpleEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '1111',
    });

    const renderMap = visit(node, getRenderMapVisitor());

    await renderMapDoesNotContain(renderMap, 'events/simpleEvent.ts', ['DISCRIMINATOR', 'decodeSimpleEvent']);
});

test('it renders field discriminator constants on events', async () => {
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([
                    structFieldTypeNode({
                        defaultValue: numberValueNode(7),
                        name: 'eventType',
                        type: numberTypeNode('u8'),
                    }),
                    structFieldTypeNode({ name: 'value', type: numberTypeNode('u64') }),
                ]),
                discriminators: [
                    {
                        kind: 'fieldDiscriminatorNode' as const,
                        name: camelCase('eventType'),
                        offset: 0,
                    },
                ],
                name: 'typedEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '1111',
    });

    const renderMap = visit(node, getRenderMapVisitor());

    await renderMapContains(renderMap, 'events/typedEvent.ts', ['TYPED_EVENT_EVENT_TYPE']);
    await renderMapDoesNotContain(renderMap, 'events/typedEvent.ts', ['decodeTypedEvent']);
});

test('it renders an event with an empty struct', async () => {
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([]),
                name: 'emptyEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '1111',
    });

    const renderMap = visit(node, getRenderMapVisitor());

    await renderMapContains(renderMap, 'events/emptyEvent.ts', [
        'export type EmptyEvent',
        'export function getEmptyEventDecoder()',
    ]);
    await renderMapDoesNotContain(renderMap, 'events/emptyEvent.ts', [
        'getEmptyEventEncoder',
        'getEmptyEventCodec',
        'EmptyEventArgs',
    ]);
    await renderMapDoesNotContain(renderMap, 'events/emptyEvent.ts', ['DISCRIMINATOR', 'decodeEmptyEvent']);
});

test('it renders an event with a nested struct field', async () => {
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([
                    structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') }),
                    structFieldTypeNode({
                        name: 'metadata',
                        type: structTypeNode([
                            structFieldTypeNode({ name: 'label', type: numberTypeNode('u8') }),
                            structFieldTypeNode({ name: 'version', type: numberTypeNode('u16') }),
                        ]),
                    }),
                ]),
                name: 'complexEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '1111',
    });

    const renderMap = visit(node, getRenderMapVisitor());

    await renderMapContains(renderMap, 'events/complexEvent.ts', [
        'export type ComplexEvent',
        'metadata: { label: number; version: number }',
    ]);
});

test('it skips decode for constant discriminator without hidden prefix', async () => {
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([
                    structFieldTypeNode({
                        defaultValue: numberValueNode(7),
                        name: 'eventType',
                        type: numberTypeNode('u8'),
                    }),
                    structFieldTypeNode({ name: 'value', type: numberTypeNode('u64') }),
                ]),
                discriminators: [
                    {
                        kind: 'fieldDiscriminatorNode' as const,
                        name: camelCase('eventType'),
                        offset: 0,
                    },
                    constantDiscriminatorNode(
                        constantValueNode(
                            fixedSizeTypeNode(bytesTypeNode(), 8),
                            bytesValueNode('base16', 'aabbccdd11223344'),
                        ),
                    ),
                ],
                name: 'mixedEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '1111',
    });

    const renderMap = visit(node, getRenderMapVisitor());

    await renderMapContains(renderMap, 'events/mixedEvent.ts', ['MIXED_EVENT_EVENT_TYPE', 'MIXED_EVENT_DISCRIMINATOR']);
    await renderMapDoesNotContain(renderMap, 'events/mixedEvent.ts', ['decodeMixedEvent']);
});

test('it validates all constant discriminators in decode function', async () => {
    const discriminator1 = constantValueNode(
        fixedSizeTypeNode(bytesTypeNode(), 8),
        bytesValueNode('base16', 'aabbccdd11223344'),
    );
    const discriminator2 = constantValueNode(
        fixedSizeTypeNode(bytesTypeNode(), 4),
        bytesValueNode('base16', '11223344'),
    );
    const node = programNode({
        events: [
            eventNode({
                data: hiddenPrefixTypeNode(
                    structTypeNode([structFieldTypeNode({ name: 'value', type: numberTypeNode('u64') })]),
                    [discriminator1],
                ),
                discriminators: [
                    constantDiscriminatorNode(discriminator1),
                    constantDiscriminatorNode(discriminator2, 12),
                ],
                name: 'multiDiscEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '1111',
    });

    const renderMap = visit(node, getRenderMapVisitor());

    await renderMapContains(renderMap, 'events/multiDiscEvent.ts', [
        'export function decodeMultiDiscEvent',
        /containsBytes\(.*data,.*MULTI_DISC_EVENT_DISCRIMINATOR,.*0\)/s,
        /containsBytes\(.*data,.*MULTI_DISC_EVENT_DISCRIMINATOR2,.*12\)/s,
        'MULTI_DISC_EVENT_DISCRIMINATOR.length',
    ]);
});

test('it renders decode function with non-zero discriminator offset', async () => {
    const discriminator = constantValueNode(
        fixedSizeTypeNode(bytesTypeNode(), 8),
        bytesValueNode('base16', 'aabbccdd11223344'),
    );
    const node = programNode({
        events: [
            eventNode({
                data: hiddenPrefixTypeNode(
                    structTypeNode([structFieldTypeNode({ name: 'value', type: numberTypeNode('u64') })]),
                    [discriminator],
                ),
                discriminators: [constantDiscriminatorNode(discriminator, 4)],
                name: 'offsetEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '1111',
    });

    const renderMap = visit(node, getRenderMapVisitor());

    await renderMapContains(renderMap, 'events/offsetEvent.ts', [
        'export function decodeOffsetEvent',
        /containsBytes\(.*data,.*OFFSET_EVENT_DISCRIMINATOR,.*4\)/s,
    ]);
});

test('it renders decode function with multiple hidden prefixes using summed offset', async () => {
    const prefix1 = constantValueNode(
        fixedSizeTypeNode(bytesTypeNode(), 8),
        bytesValueNode('base16', 'aabbccdd11223344'),
    );
    const prefix2 = constantValueNode(fixedSizeTypeNode(bytesTypeNode(), 4), bytesValueNode('base16', '55667788'));
    const node = programNode({
        events: [
            eventNode({
                data: hiddenPrefixTypeNode(
                    structTypeNode([structFieldTypeNode({ name: 'value', type: numberTypeNode('u64') })]),
                    [prefix1, prefix2],
                ),
                discriminators: [constantDiscriminatorNode(prefix1)],
                name: 'multiPrefixEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '1111',
    });

    const renderMap = visit(node, getRenderMapVisitor());

    await renderMapContains(renderMap, 'events/multiPrefixEvent.ts', [
        'export function decodeMultiPrefixEvent',
        /getMultiPrefixEventDecoder\(\)\.decode\(\s*data,\s*12\s*\)/s,
    ]);
});
