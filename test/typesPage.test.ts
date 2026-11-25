import {
    definedTypeLinkNode,
    definedTypeNode,
    integerTypeNode,
    optionTypeNode,
    programNode,
    structFieldTypeNode,
    structTypeNode,
} from '@codama/nodes';
import { visit } from '@codama/visitors-core';
import { test } from 'vitest';

import { getRenderMapVisitor } from '../src';
import { renderMapContains, renderMapDoesNotContain } from './_setup';

test('it does not import recursive types from themselves, including internal ones', async () => {
    // Given a defined type referring to itself, listed as internal.
    const node = programNode({
        definedTypes: [
            definedTypeNode({
                identifier: 'node',
                type: structTypeNode([
                    structFieldTypeNode({ identifier: 'value', type: integerTypeNode('u8') }),
                    structFieldTypeNode({ identifier: 'next', type: optionTypeNode(definedTypeLinkNode('node')) }),
                ]),
            }),
        ],
        identifier: 'myProgram',
        publicKey: '1111',
    });

    // When we render it as an internal node.
    const renderMap = visit(node, getRenderMapVisitor({ internalNodes: ['node'] }));

    // Then its page does not import itself.
    await renderMapDoesNotContain(renderMap, 'types/node.ts', ["from '../types/node'", "from '.'"]);
    await renderMapContains(renderMap, 'types/node.ts', ['getOptionEncoder(getNodeEncoder())']);
});
