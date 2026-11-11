// This ensures that we do not rely on `__dirname` in ES modules even when it is polyfilled.
globalThis.__dirname = 'DO_NOT_USE';

import { definedTypeNode, integerTypeNode } from '@codama/nodes';
import { visit } from '@codama/visitors-core';

import { getRenderMapVisitor } from '../../dist/index.node.mjs';

const node = definedTypeNode({ identifier: 'answerToLife', type: integerTypeNode('u8') });
visit(node, getRenderMapVisitor());
