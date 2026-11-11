const { definedTypeNode, integerTypeNode } = require('@codama/nodes');
const { visit } = require('@codama/visitors-core');

const { getRenderMapVisitor } = require('../../dist/index.node.cjs');

const node = definedTypeNode({ identifier: 'answerToLife', type: integerTypeNode('u8') });
visit(node, getRenderMapVisitor());
