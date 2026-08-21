import {
    constantNode,
    definedTypeLinkNode,
    definedTypeNode,
    enumEmptyVariantTypeNode,
    enumTypeNode,
    enumValueNode,
    numberTypeNode,
    numberValueNode,
    programNode,
    rootNode,
    stringValueNode,
} from '@codama/nodes';
import { visit } from '@codama/visitors-core';
import { expect, test } from 'vitest';

import { getRenderMapVisitor } from '../src';
import { renderMapContains, renderMapContainsImports, renderMapDoesNotContainImports } from './_setup';

test('it renders program constants in a top-level constants page', async () => {
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

    await renderMapContains(renderMap, 'constants.ts', [
        '/** Maximum options. */',
        'export const MAX_OPTION: number = 10;',
        'export const MIN_OPTION: number = 1;',
        'export const SIGNED_OPTION: number = -2;',
        'export const TOKEN_AMOUNT: bigint = 42n;',
        'export const WEIGHT: number = 1.5;',
    ]);
    await renderMapContains(renderMap, 'index.ts', "export * from './constants';");

    expect(renderMap.has('constants/index.ts')).toBe(false);
    expect(renderMap.size).toBeGreaterThan(0);
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
        'constants.ts',
        'export const DEFAULT_STATUS: AccountStatus = AccountStatus.Active;',
    );
    await renderMapContainsImports(renderMap, 'constants.ts', {
        './types': ['AccountStatus'],
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

    await renderMapContainsImports(renderMap, 'constants.ts', {
        './types': ['type OptionCountType'],
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

    await renderMapContains(renderMap, 'constants.ts', "export const ABSTAIN_VOTE_INDEX: string = '0';");
    await renderMapDoesNotContainImports(renderMap, 'constants.ts', {
        './types': ['Usize'],
    });
});
