import { CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE } from '@codama/errors';
import {
    accountNode,
    definedTypeNode,
    errorNode,
    fixedSizeTypeNode,
    instructionAccountNode,
    instructionNode,
    numberTypeNode,
    pdaNode,
    programNode,
    publicKeyValueNode,
    rootNode,
    sizeDiscriminatorNode,
    stringTypeNode,
    structFieldTypeNode,
    structTypeNode,
} from '@codama/nodes';
import { visit } from '@codama/visitors-core';
import { expect, test } from 'vitest';

import { getRenderMapVisitor } from '../src';
import { renderMapContains, renderMapDoesNotContain } from './_setup';

test('it escapes comment terminators in docs', async () => {
    // Given a defined type whose docs contain a glob pattern.
    const node = definedTypeNode({
        docs: ['Glob such as src/**/*.ts'],
        name: 'rule',
        type: structTypeNode([structFieldTypeNode({ name: 'count', type: numberTypeNode('u32') })]),
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the docblock keeps the pattern without ending the comment.
    await renderMapContains(renderMap, 'types/rule.ts', ['/** Glob such as src/**\\/*.ts */']);
});

test('it renders error messages verbatim', async () => {
    // Given an error whose message contains template placeholders, backslashes and backticks.
    const node = programNode({
        errors: [errorNode({ code: 1, message: 'Expected ${amount} \\ got `value`.', name: 'invalidAmount' })],
        name: 'myProgram',
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the message is escaped within its template literal.
    await renderMapContains(renderMap, 'errors/myProgram.ts', ['`Expected \\${amount} \\\\ got \\`value\\`.`']);
});

test('it renders addresses as string literals', async () => {
    // Given a program, a PDA and a default value whose addresses contain quotes.
    const address = "It's";
    const node = rootNode(
        programNode({
            instructions: [
                instructionNode({
                    accounts: [
                        instructionAccountNode({
                            defaultValue: publicKeyValueNode(address),
                            isSigner: false,
                            isWritable: false,
                            name: 'authority',
                        }),
                    ],
                    name: 'initialize',
                }),
            ],
            name: 'myProgram',
            pdas: [pdaNode({ name: 'counter', programId: address, seeds: [] })],
            publicKey: address,
        }),
    );

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then each address is a string literal escaping its quotes.
    await renderMapContains(renderMap, 'programs/myProgram.ts', [`"It's" as Address<"It's">`]);
    await renderMapContains(renderMap, 'pdas/counter.ts', [`"It's" as Address<"It's">`]);
    await renderMapContains(renderMap, 'instructions/initialize.ts', [`"It's" as Address<"It's">`]);
    await renderMapDoesNotContain(renderMap, 'programs/myProgram.ts', [`'It's'`]);
});

test.each([
    ['an account size', () => accountNode({ name: 'counter', size: '1; evil()' as unknown as number })],
    ['an error code', () => errorNode({ code: '1; evil()' as unknown as number, message: 'Oops', name: 'oops' })],
    ['a negative error code', () => errorNode({ code: -1, message: 'Oops', name: 'oops' })],
    ['a fixed size', () => fixedSizeTypeNode(stringTypeNode('utf8'), '1); evil(' as unknown as number)],
    ['a size discriminator', () => sizeDiscriminatorNode('1 || evil()' as unknown as number)],
    [
        'an account flag',
        () =>
            instructionAccountNode({
                isSigner: 'false }); evil(); ({' as unknown as boolean,
                isWritable: false,
                name: 'authority',
            }),
    ],
    [
        'an optional account strategy',
        () => instructionNode({ name: 'initialize', optionalAccountStrategy: "x'); evil(); ('" as 'programId' }),
    ],
])('it fails on %s that does not hold a value of its type', (_, getInvalidNode) => {
    // Given a program holding a node whose attribute does not match its type, as JSON IDLs may.
    const invalidNode = getInvalidNode();
    const program = programNode({ name: 'myProgram', publicKey: '1111' });
    const node = rootNode(
        programNode({
            ...program,
            ...(invalidNode.kind === 'accountNode' ? { accounts: [invalidNode] } : {}),
            ...(invalidNode.kind === 'errorNode' ? { errors: [invalidNode] } : {}),
            ...(invalidNode.kind === 'fixedSizeTypeNode'
                ? { definedTypes: [definedTypeNode({ name: 'symbol', type: invalidNode })] }
                : {}),
            ...(invalidNode.kind === 'sizeDiscriminatorNode'
                ? { accounts: [accountNode({ discriminators: [invalidNode], name: 'counter' })] }
                : {}),
            ...(invalidNode.kind === 'instructionAccountNode'
                ? { instructions: [instructionNode({ accounts: [invalidNode], name: 'initialize' })] }
                : {}),
            ...(invalidNode.kind === 'instructionNode' ? { instructions: [invalidNode] } : {}),
        }),
    );

    // Then rendering it fails on that node.
    expect(() => visit(node, getRenderMapVisitor())).toThrow(
        expect.objectContaining({
            context: expect.objectContaining({ __code: CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE, node: invalidNode }),
        }),
    );
});
