import {
    bytesTypeNode,
    bytesValueNode,
    constantNode,
    definedTypeLinkNode,
    definedTypeNode,
    enumEmptyVariantTypeNode,
    enumTypeNode,
    enumValueNode,
    numberTypeNode,
    numberValueNode,
    programNode,
    publicKeyTypeNode,
    publicKeyValueNode,
    rootNode,
    stringValueNode,
} from '@codama/nodes';
import { visit } from '@codama/visitors-core';
import { expect, test } from 'vitest';

import { getRenderMapVisitor } from '../src';
import { renderMapContains, renderMapContainsImports, renderMapDoesNotContainImports } from './_setup';

test('it renders program constants in a program-specific constants page', async () => {
    const node = rootNode(
        programNode({
            constants: [
                constantNode('maxOption', numberTypeNode('u8'), numberValueNode(10), ['Maximum options.']),
                constantNode('minOption', numberTypeNode('u8'), numberValueNode(1)),
                constantNode('signedOption', numberTypeNode('i32'), numberValueNode(-2)),
                constantNode('tokenAmount', numberTypeNode('u64'), numberValueNode(42)),
                constantNode('weight', numberTypeNode('f64'), numberValueNode(1.5)),
            ],
            name: 'governance',
            publicKey: 'GovER5Lthms3bLBqWub97yVrQm9WLZ7YgRrxYQYy2P',
        }),
    );

    const renderMap = visit(node, getRenderMapVisitor());

    await renderMapContains(renderMap, 'constants/governance.ts', [
        '/** Maximum options. */',
        'export const MAX_OPTION: number = 10;',
        'export const MIN_OPTION: number = 1;',
        'export const SIGNED_OPTION: number = -2;',
        'export const TOKEN_AMOUNT: bigint = 42n;',
        'export const WEIGHT: number = 1.5;',
    ]);
    await renderMapContains(renderMap, 'index.ts', "export * from './constants';");
    await renderMapContains(renderMap, 'constants/index.ts', "export * from './governance';");

    expect(renderMap.has('constants.ts')).toBe(false);
    expect(renderMap.size).toBeGreaterThan(0);
});

test('it renders one constants file per program', async () => {
    const node = rootNode(
        programNode({
            constants: [constantNode('governanceLimit', numberTypeNode('u8'), numberValueNode(1))],
            name: 'governance',
            publicKey: 'GovER5Lthms3bLBqWub97yVrQm9WLZ7YgRrxYQYy2P',
        }),
        [
            programNode({
                constants: [constantNode('treasuryLimit', numberTypeNode('u8'), numberValueNode(2))],
                name: 'treasury',
                publicKey: '11111111111111111111111111111111',
            }),
        ],
    );

    const renderMap = visit(node, getRenderMapVisitor());

    await renderMapContains(renderMap, 'constants/governance.ts', 'export const GOVERNANCE_LIMIT: number = 1;');
    await renderMapContains(renderMap, 'constants/treasury.ts', 'export const TREASURY_LIMIT: number = 2;');
    await renderMapContains(renderMap, 'constants/index.ts', [
        "export * from './governance';",
        "export * from './treasury';",
    ]);
});

test('it renders values and imports using their declared types', async () => {
    const node = rootNode(
        programNode({
            constants: [
                constantNode(
                    'defaultStatus',
                    definedTypeLinkNode('accountStatus'),
                    enumValueNode('accountStatus', 'active'),
                ),
            ],
            definedTypes: [
                definedTypeNode({
                    name: 'accountStatus',
                    type: enumTypeNode([enumEmptyVariantTypeNode('active'), enumEmptyVariantTypeNode('paused')]),
                }),
            ],
            name: 'governance',
            publicKey: 'GovER5Lthms3bLBqWub97yVrQm9WLZ7YgRrxYQYy2P',
        }),
    );

    const renderMap = visit(node, getRenderMapVisitor());

    await renderMapContains(
        renderMap,
        'constants/governance.ts',
        'export const DEFAULT_STATUS: AccountStatus = AccountStatus.Active;',
    );
    await renderMapContainsImports(renderMap, 'constants/governance.ts', {
        '../types': ['AccountStatus'],
    });
});

test('it imports linked types from the top-level types directory', async () => {
    const node = rootNode(
        programNode({
            constants: [constantNode('optionCount', definedTypeLinkNode('optionCountType'), numberValueNode(10))],
            definedTypes: [definedTypeNode({ name: 'optionCountType', type: numberTypeNode('u8') })],
            name: 'governance',
            publicKey: 'GovER5Lthms3bLBqWub97yVrQm9WLZ7YgRrxYQYy2P',
        }),
    );

    const renderMap = visit(node, getRenderMapVisitor());

    await renderMapContainsImports(renderMap, 'constants/governance.ts', {
        '../types': ['type OptionCountType'],
    });
});

test('it renders bigint literals for linked bigint types', async () => {
    const node = rootNode(
        programNode({
            constants: [constantNode('maxAmount', definedTypeLinkNode('bigNumber'), numberValueNode(42))],
            definedTypes: [definedTypeNode({ name: 'bigNumber', type: numberTypeNode('u64') })],
            name: 'governance',
            publicKey: 'GovER5Lthms3bLBqWub97yVrQm9WLZ7YgRrxYQYy2P',
        }),
    );

    const renderMap = visit(node, getRenderMapVisitor());

    await renderMapContains(renderMap, 'constants/governance.ts', 'export const MAX_AMOUNT: BigNumber = 42n;');
    await renderMapContainsImports(renderMap, 'constants/governance.ts', {
        '../types': ['type BigNumber'],
    });
});

test('it renders public key and bytes constants', async () => {
    const node = rootNode(
        programNode({
            constants: [
                constantNode(
                    'adminAddress',
                    publicKeyTypeNode(),
                    publicKeyValueNode('11111111111111111111111111111111'),
                ),
                constantNode('seedBytes', bytesTypeNode(), bytesValueNode('base16', '0102ff')),
            ],
            name: 'governance',
            publicKey: 'GovER5Lthms3bLBqWub97yVrQm9WLZ7YgRrxYQYy2P',
        }),
    );

    const renderMap = visit(node, getRenderMapVisitor());

    await renderMapContains(renderMap, 'constants/governance.ts', [
        'export const ADMIN_ADDRESS: Address = address(',
        "'11111111111111111111111111111111'",
        'export const SEED_BYTES: ReadonlyUint8Array = new Uint8Array([1, 2, 255]);',
    ]);
    await renderMapContainsImports(renderMap, 'constants/governance.ts', {
        '@solana/kit': ['address', 'type Address', 'type ReadonlyUint8Array'],
    });
});

test('it renders string constants without importing their declared type', async () => {
    const node = rootNode(
        programNode({
            constants: [constantNode('abstainVoteIndex', definedTypeLinkNode('usize'), stringValueNode('0'))],
            name: 'governance',
            publicKey: 'GovER5Lthms3bLBqWub97yVrQm9WLZ7YgRrxYQYy2P',
        }),
    );

    const renderMap = visit(node, getRenderMapVisitor());

    await renderMapContains(renderMap, 'constants/governance.ts', "export const ABSTAIN_VOTE_INDEX: string = '0';");
    await renderMapDoesNotContainImports(renderMap, 'constants/governance.ts', {
        '../types': ['Usize'],
    });
});
