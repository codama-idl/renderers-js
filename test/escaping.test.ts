import { CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE } from '@codama/errors';
import {
    accountNode,
    addTypeNodeTransforms,
    arrayTypeNode,
    constantNode,
    constantValueNodeFromBytes,
    definedTypeNode,
    errorNode,
    fixedSizeTransformNode,
    floatTypeNode,
    floatValueNode,
    instructionAccountNode,
    instructionNode,
    instructionStatusNode,
    integerTypeNode,
    integerValueNode,
    type Node,
    pdaNode,
    pluginNode,
    programNode,
    type ProgramNode,
    publicKeyValueNode,
    rootNode,
    sentinelCountNode,
    sizeDiscriminatorNode,
    stringTypeNode,
    stringValueNode,
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
        docs: 'Glob such as src/**/*.ts',
        identifier: 'rule',
        type: structTypeNode([structFieldTypeNode({ identifier: 'count', type: integerTypeNode('u32') })]),
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the docblock keeps the pattern without ending the comment.
    await renderMapContains(renderMap, 'types/rule.ts', ['/** Glob such as src/**\\/*.ts */']);
});

test('it renders error messages as string literals', async () => {
    // Given an error whose message contains template placeholders, backslashes and quotes.
    const node = programNode({
        errors: [errorNode({ code: 1, identifier: 'invalidAmount', message: 'Expected ${amount} \\ got "value".' })],
        identifier: 'myProgram',
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the message is an escaped string literal rather than a template literal.
    await renderMapContains(renderMap, 'errors/my-program.ts', [
        '[MY_PROGRAM_ERROR__INVALID_AMOUNT]: \'Expected ${amount} \\\\ got "value".\'',
    ]);
});

test('it renders string values as string literals', async () => {
    // Given a constant string holding quotes and a line break.
    const node = programNode({
        constants: [constantNode('greeting', stringTypeNode('utf8'), stringValueNode("It's\nfine"))],
        identifier: 'myProgram',
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(rootNode(node), getRenderMapVisitor());

    // Then the value is an escaped string literal.
    await renderMapContains(renderMap, 'constants/my-program.ts', ['export const GREETING: string = "It\'s\\nfine";']);
});

test('it renders addresses as string literals', async () => {
    // Given a program, a PDA and a default value whose addresses contain quotes.
    const address = "It's";
    const node = rootNode(
        programNode({
            identifier: 'myProgram',
            instructions: [
                instructionNode({
                    accounts: [
                        instructionAccountNode({
                            defaultValue: publicKeyValueNode(address),
                            identifier: 'authority',
                            isSigner: false,
                            isWritable: false,
                        }),
                    ],
                    identifier: 'initialize',
                }),
            ],
            pdas: [pdaNode({ identifier: 'counter', programId: address, seeds: [] })],
            publicKey: address,
        }),
    );

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then each address is a string literal escaping its quotes.
    await renderMapContains(renderMap, 'programs/my-program.ts', [`"It's" as Address<"It's">`]);
    await renderMapContains(renderMap, 'pdas/counter.ts', [`"It's" as Address<"It's">`]);
    await renderMapContains(renderMap, 'instructions/initialize.ts', [`"It's" as Address<"It's">`]);
    await renderMapDoesNotContain(renderMap, 'programs/my-program.ts', [`'It's'`]);
});

/** Casts a value to the type of an attribute, as JSON IDLs may hold any value. */
const invalid = <T>(value: unknown): T => value as T;

const invalidNodes: [string, () => Node, (node: never) => Partial<Parameters<typeof programNode>[0]>][] = [
    [
        'an account size',
        () => accountNode({ identifier: 'counter', size: invalid('1; evil()') }),
        node => ({ accounts: [node] }),
    ],
    [
        'an error code',
        () => errorNode({ code: invalid('1; evil()'), identifier: 'oops', message: 'Oops' }),
        node => ({ errors: [node] }),
    ],
    [
        'a negative error code',
        () => errorNode({ code: -1, identifier: 'oops', message: 'Oops' }),
        node => ({ errors: [node] }),
    ],
    [
        'an integer value',
        () => invalid<Node>({ ...integerValueNode('0'), value: '0, evil(), 0' }),
        node => ({ constants: [constantNode('max', integerTypeNode('u8'), node)] }),
    ],
    [
        'a float value',
        () => invalid<Node>({ ...floatValueNode('0'), value: '0, evil()' }),
        node => ({ constants: [constantNode('rate', floatTypeNode('f64'), node)] }),
    ],
    [
        'a fixed size',
        () => fixedSizeTransformNode(invalid('1); evil(')),
        node => ({
            definedTypes: [
                definedTypeNode({ identifier: 'symbol', type: addTypeNodeTransforms(stringTypeNode('utf8'), [node]) }),
            ],
        }),
    ],
    [
        'a sentinel count strategy',
        () =>
            sentinelCountNode(constantValueNodeFromBytes('base16', 'ff'), {
                strategy: invalid("x' }); evil(); ({ a: '"),
            }),
        node => ({
            definedTypes: [definedTypeNode({ identifier: 'items', type: arrayTypeNode(integerTypeNode('u8'), node) })],
        }),
    ],
    [
        'a size discriminator',
        () => sizeDiscriminatorNode(invalid('1 || evil()')),
        node => ({ accounts: [accountNode({ discriminators: [node], identifier: 'counter' })] }),
    ],
    [
        'an account flag',
        () =>
            instructionAccountNode({
                identifier: 'authority',
                isSigner: invalid('false }); evil(); ({'),
                isWritable: false,
            }),
        node => ({ instructions: [instructionNode({ accounts: [node], identifier: 'initialize' })] }),
    ],
    [
        'an optional account strategy',
        () => instructionNode({ identifier: 'initialize', optionalAccountStrategy: invalid("x'); evil(); ('") }),
        node => ({ instructions: [node] }),
    ],
    [
        'an extra argument type',
        () => fixedSizeTransformNode(invalid('1); evil(')),
        node => ({
            instructions: [
                instructionNode({
                    identifier: 'initialize',
                    plugins: [
                        pluginNode('codama.extraArgument', {
                            identifier: 'memo',
                            type: addTypeNodeTransforms(stringTypeNode('utf8'), [node]),
                        }),
                    ],
                }),
            ],
        }),
    ],
    [
        'an extra argument default value',
        () => invalid<Node>({ ...integerValueNode('0'), value: '0, evil()' }),
        node => ({
            instructions: [
                instructionNode({
                    identifier: 'initialize',
                    plugins: [
                        pluginNode('codama.extraArgument', {
                            defaultValue: node,
                            identifier: 'space',
                            type: integerTypeNode('u64'),
                        }),
                    ],
                }),
            ],
        }),
    ],
    [
        'an instruction lifecycle',
        () => instructionStatusNode(invalid('removed')),
        node => ({ instructions: [instructionNode({ identifier: 'initialize', status: node })] }),
    ],
];

test.each(invalidNodes)('it fails on %s that does not hold a value of its type', (_, getInvalidNode, getProgram) => {
    // Given a program holding a node whose attribute does not match its type, as JSON IDLs may.
    const invalidNode = getInvalidNode();
    const program: ProgramNode = programNode({
        identifier: 'myProgram',
        publicKey: '1111',
        ...getProgram(invalidNode as never),
    });

    // Then rendering it fails on that node.
    expect(() => visit(rootNode(program), getRenderMapVisitor())).toThrow(
        expect.objectContaining({
            context: expect.objectContaining({
                __code: CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE,
                path: expect.arrayContaining([invalidNode]),
            }),
        }),
    );
});

test('it leaves the payloads of other plugins alone', () => {
    // Given a plugin of another namespace whose payload holds a node-like object with an invalid size.
    const node = rootNode(
        programNode({
            identifier: 'myProgram',
            instructions: [
                instructionNode({
                    identifier: 'initialize',
                    plugins: [
                        pluginNode('acme.metadata', { kind: 'fixedSizeTransformNode', size: 'not ours to validate' }),
                    ],
                }),
            ],
            publicKey: '1111',
        }),
    );

    // Then it renders, since that payload is opaque to this renderer.
    expect(visit(node, getRenderMapVisitor()).has('instructions/initialize.ts')).toBe(true);
});

test('it escapes comment terminators in instruction docs and status messages', async () => {
    // Given a deprecated instruction whose docs and status message contain glob patterns.
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                docs: 'Closes accounts matching src/**/*.ts',
                identifier: 'close',
                status: instructionStatusNode('deprecated', { message: 'Use `drain` for lib/**/*.ts instead.' }),
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then neither the docs nor the status message end the docblock.
    await renderMapContains(renderMap, 'instructions/close.ts', [
        'Closes accounts matching src/**\\/*.ts',
        '@deprecated Use `drain` for lib/**\\/*.ts instead.',
    ]);
});
