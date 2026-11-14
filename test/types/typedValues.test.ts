import {
    accountNode,
    arrayTypeNode,
    arrayValueNode,
    constantDiscriminatorNode,
    constantNode,
    constantValueNode,
    definedTypeLinkNode,
    definedTypeNode,
    enumTypeNode,
    enumValueNode,
    enumVariantTypeNode,
    eventNode,
    fieldDiscriminatorNode,
    fixedPointTypeNode,
    integerTypeNode,
    integerValueNode,
    optionTypeNode,
    prefixedCountNode,
    programNode,
    rootNode,
    someValueNode,
    stringTypeNode,
    stringValueNode,
    structFieldTypeNode,
    structTypeNode,
    tupleTypeNode,
    tupleValueNode,
} from '@codama/nodes';
import { visit } from '@codama/visitors-core';
import { test } from 'vitest';

import { getRenderMapVisitor } from '../../src';
import { renderMapContains, renderMapDoesNotContain } from '../_setup';

const u64 = () => integerTypeNode('u64');
const sol = () => fixedPointTypeNode(u64(), { scale: 9, unit: 'SOL' });

test('it renders the values of program constants for their types', async () => {
    // Given constants whose 64-bit integers and SOL amounts are nested within other values.
    const node = rootNode(
        programNode({
            constants: [
                constantNode('optionalAmount', optionTypeNode(u64()), someValueNode(integerValueNode('5'))),
                constantNode(
                    'amounts',
                    arrayTypeNode(u64(), prefixedCountNode(integerTypeNode('u32'))),
                    arrayValueNode([integerValueNode('1')]),
                ),
                constantNode(
                    'pair',
                    tupleTypeNode([integerTypeNode('u8'), u64()]),
                    tupleValueNode([integerValueNode('1'), integerValueNode('2')]),
                ),
                constantNode('rent', sol(), integerValueNode('890880')),
                constantNode('aliasedAmount', definedTypeLinkNode('amount'), integerValueNode('3')),
            ],
            definedTypes: [definedTypeNode({ identifier: 'amount', type: u64() })],
            identifier: 'myProgram',
            publicKey: '1111',
        }),
    );

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then each nested value matches its type.
    await renderMapContains(renderMap, 'constants/my-program.ts', [
        'export const OPTIONAL_AMOUNT: Option<bigint> = some(5n);',
        'export const AMOUNTS: Array<bigint> = [1n];',
        'export const PAIR: readonly [number, bigint] = [1, 2n];',
        'export const RENT: Lamports = lamports(890880n);',
        'export const ALIASED_AMOUNT: Amount = 3n;',
    ]);
});

test('it types constants holding data union values as their loose type', async () => {
    // Given a constant holding a value of a data union, whose helper returns its loose type.
    const node = rootNode(
        programNode({
            constants: [
                constantNode(
                    'defaultCommand',
                    definedTypeLinkNode('command'),
                    enumValueNode('command', 'wait', { value: integerValueNode('30') }),
                ),
            ],
            definedTypes: [
                definedTypeNode({
                    identifier: 'command',
                    type: enumTypeNode([enumVariantTypeNode('stop'), enumVariantTypeNode('wait', { data: u64() })]),
                }),
            ],
            identifier: 'myProgram',
            publicKey: '1111',
        }),
    );

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the constant is typed as the loose type of the union.
    await renderMapContains(renderMap, 'constants/my-program.ts', [
        "export const DEFAULT_COMMAND: CommandArgs = command('Wait', [30]);",
    ]);
});

test('it renders SOL amount defaults as lamports', async () => {
    // Given a struct field defaulting to a SOL amount.
    const node = definedTypeNode({
        identifier: 'budget',
        type: structTypeNode([
            structFieldTypeNode({ defaultValue: integerValueNode('5000'), identifier: 'fee', type: sol() }),
        ]),
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the default is a lamports value.
    await renderMapContains(renderMap, 'types/budget.ts', ['fee: value.fee ?? lamports(5000n)']);
});

test('it annotates the values of nested struct encoders filling in defaults', async () => {
    // Given a struct nested within another, with a default value.
    const node = definedTypeNode({
        identifier: 'outer',
        type: structTypeNode([
            structFieldTypeNode({
                identifier: 'inner',
                type: structTypeNode([
                    structFieldTypeNode({
                        defaultValue: integerValueNode('1'),
                        identifier: 'count',
                        type: integerTypeNode('u8'),
                    }),
                ]),
            }),
        ]),
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the nested encoder annotates its value, which no return type describes.
    await renderMapContains(renderMap, 'types/outer.ts', [
        '(value: { count?: number }) => ({ ...value, count: value.count ?? 1 })',
    ]);
});

test('it only fills in the discriminator of the data of an account', async () => {
    // Given an account whose data nests a field named like its discriminator field.
    const node = programNode({
        accounts: [
            accountNode({
                data: structTypeNode([
                    structFieldTypeNode({
                        defaultValue: integerValueNode('3'),
                        defaultValueStrategy: 'omitted',
                        identifier: 'discriminator',
                        type: integerTypeNode('u8'),
                    }),
                    structFieldTypeNode({
                        identifier: 'nested',
                        type: structTypeNode([
                            structFieldTypeNode({
                                defaultValue: integerValueNode('99'),
                                identifier: 'discriminator',
                                type: integerTypeNode('u8'),
                            }),
                        ]),
                    }),
                ]),
                discriminators: [fieldDiscriminatorNode('discriminator')],
                identifier: 'vault',
            }),
        ],
        identifier: 'myProgram',
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the nested field keeps its own default value.
    await renderMapContains(renderMap, 'accounts/vault.ts', [
        'discriminator: value.discriminator ?? 99',
        '({ ...value, discriminator: VAULT_DISCRIMINATOR })',
    ]);
});

test('it renders scalar enums nested within structs as data unions', async () => {
    // Given a struct with an inline scalar enum, which has no name to declare a native enum.
    const node = definedTypeNode({
        identifier: 'settings',
        type: structTypeNode([
            structFieldTypeNode({
                identifier: 'mode',
                type: enumTypeNode([enumVariantTypeNode('fast'), enumVariantTypeNode('slow')]),
            }),
        ]),
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the enum is a data union.
    await renderMapContains(renderMap, 'types/settings.ts', [
        "mode: { __kind: 'Fast' } | { __kind: 'Slow' }",
        "getDiscriminatedUnionEncoder([ ['Fast', getUnitEncoder()], ['Slow', getUnitEncoder()] ])",
    ]);
    await renderMapDoesNotContain(renderMap, 'types/settings.ts', ['getEnumEncoder']);
});

test('it ignores the byte order of single-byte integers', async () => {
    // Given big-endian single-byte and multi-byte integers.
    const node = definedTypeNode({
        identifier: 'numbers',
        type: tupleTypeNode([
            integerTypeNode('u8', { endian: 'be' }),
            integerTypeNode('shortU16', { endian: 'be' }),
            integerTypeNode('u32', { endian: 'be' }),
        ]),
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then only the multi-byte integer is encoded in big-endian order.
    await renderMapContains(renderMap, 'types/numbers.ts', [
        'getTupleEncoder([ getU8Encoder(), getShortU16Encoder(), getU32Encoder({ endian: Endian.Big }) ])',
    ]);
});

test('it matches event discriminators by their encoded bytes', async () => {
    // Given an event whose constant discriminator is a string rather than raw bytes.
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([]),
                discriminators: [
                    constantDiscriminatorNode(constantValueNode(stringTypeNode('utf8'), stringValueNode('NAME'))),
                ],
                identifier: 'named',
            }),
        ],
        identifier: 'myProgram',
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the event is matched by the encoded bytes of its discriminator.
    await renderMapContains(renderMap, 'events/named.ts', [
        "export const NAMED_EVENT_DISCRIMINATOR = 'NAME';",
        'containsBytes(data, getNamedEventDiscriminatorBytes(), 0)',
    ]);
});
