import {
    constantNode,
    definedTypeLinkNode,
    definedTypeNode,
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
                constantNode('signedOption', numberTypeNode('i32'), numberValueNode(2)),
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
        'export const SIGNED_OPTION: bigint = 2n;',
    ]);
    await renderMapContains(renderMap, 'index.ts', "export * from './constants';");

    expect(renderMap.has('constants/index.ts')).toBe(false);
    expect(renderMap.size).toBeGreaterThan(0);
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
        './types': ['OptionCountType'],
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
