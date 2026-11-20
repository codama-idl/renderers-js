import { CODAMA_ERROR__VERSION_MISMATCH, CodamaError } from '@codama/errors';
import { CODAMA_VERSION, errorNode, programNode, rootNode } from '@codama/nodes';
import { visit } from '@codama/visitors-core';
import { expect, test } from 'vitest';

import { getRenderMapVisitor } from '../src';

test('it renders root nodes of the Codama v2 standard', () => {
    // Given a root node of the current Codama version.
    const node = rootNode(programNode({ identifier: 'myProgram', publicKey: '1111' }));

    // Then we expect it to render.
    expect(visit(node, getRenderMapVisitor()).has('programs/my-program.ts')).toBe(true);
});

test('it rejects root nodes of another major version', () => {
    // Given a root node of the Codama v1 standard.
    const node = {
        ...rootNode(programNode({ identifier: 'myProgram', publicKey: '1111' })),
        version: '1.3.0' as const,
    };

    // Then rendering it fails with a version mismatch.
    expect(() => visit(node as never, getRenderMapVisitor())).toThrow(
        new CodamaError(CODAMA_ERROR__VERSION_MISMATCH, { codamaVersion: CODAMA_VERSION, rootVersion: '1.3.0' }),
    );
});

test('it rejects root nodes of another major version before validating their attributes', () => {
    // Given a root node of the Codama v1 standard whose attributes are not valid v2 attributes.
    const node = {
        ...rootNode(
            programNode({
                errors: [errorNode({ code: 1, identifier: 'oops', message: 'Oops' })],
                identifier: 'myProgram',
                publicKey: '1111',
            }),
        ),
        version: '1.3.0' as const,
    };
    const invalidNode = { ...node, program: { ...node.program, errors: [{ ...node.program.errors![0], code: 'x' }] } };

    // Then rendering it fails with a version mismatch.
    expect(() => visit(invalidNode as never, getRenderMapVisitor())).toThrow(
        new CodamaError(CODAMA_ERROR__VERSION_MISMATCH, { codamaVersion: CODAMA_VERSION, rootVersion: '1.3.0' }),
    );
});
