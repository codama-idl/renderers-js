import { CODAMA_ERROR__INJECTED_VALUE_NOT_PROVIDED, CodamaError } from '@codama/errors';
import { getFromRenderMap } from '@codama/fragments';
import {
    accountValueNode,
    addTypeNodeTransforms,
    arrayTypeNode,
    booleanTypeNode,
    booleanValueNode,
    constantDiscriminatorNode,
    constantPdaSeedNodeFromString,
    constantValueNode,
    constantValueNodeFromBytes,
    dataValueNode,
    definedTypeLinkNode,
    definedTypeNode,
    enumTypeNode,
    enumValueNode,
    enumVariantTypeNode,
    fieldDiscriminatorNode,
    fixedSizeTransformNode,
    identifierString,
    injectedValueNode,
    instructionAccountNode,
    instructionNode,
    instructionRemainingAccountsNode,
    integerTypeNode,
    integerValueNode,
    pdaLinkNode,
    pdaNode,
    pdaSeedValueNode,
    pdaValueNode,
    pluginNode,
    prefixedCountNode,
    programLinkNode,
    programNode,
    providedNode,
    publicKeyTypeNode,
    rootNode,
    stringTypeNode,
    stringValueNode,
    structFieldTypeNode,
    structTypeNode,
    variablePdaSeedNode,
} from '@codama/nodes';
import { visit } from '@codama/visitors-core';
import { expect, test } from 'vitest';

import { getRenderMapVisitor } from '../src';
import {
    codeContains,
    codeDoesNotContain,
    renderMapContains,
    renderMapContainsImports,
    renderMapDoesNotContain,
} from './_setup';

test('it renders instruction accounts that can either be signer or non-signer', async () => {
    // Given the following instruction with a signer or non-signer account.
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        identifier: 'myAccount',
                        isSigner: 'either',
                        isWritable: false,
                    }),
                ],
                identifier: 'myInstruction',
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the input to accept either a signer or non-signer input.
    await renderMapContains(renderMap, 'instructions/myInstruction.ts', [
        `export type MyInstructionInput<
            TAccountMyAccount extends InstructionAccountInput | InstructionSignerInput =
                InstructionAccountInput | InstructionSignerInput
        > = { myAccount: TAccountMyAccount; };`,
    ]);

    // And we expect the account to be resolved as a signer meta when a signer is provided.
    await renderMapContains(renderMap, 'instructions/myInstruction.ts', [
        `ResolvedInstructionAccountMeta<
            TAccountMyAccount,
            InstructionAccountInputAddress<TAccountMyAccount>,
            ReadonlySignerAccount<InstructionAccountInputAddress<TAccountMyAccount>> &
                AccountSignerMeta<InstructionAccountInputAddress<TAccountMyAccount>>
        >`,
    ]);

    // And we expect the runtime signer flag to be forwarded to the account meta factory.
    await renderMapContains(renderMap, 'instructions/myInstruction.ts', [
        "myAccount: { value: input.myAccount ?? null, isSigner: 'either', isWritable: false }",
    ]);
});

test('it downgrades the runtime signer flag of signer accounts whose default value may not be a signer', async () => {
    // Given a signer account defaulting to a PDA.
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        defaultValue: pdaValueNode(pdaLinkNode('myPda')),
                        identifier: 'myAccount',
                        isSigner: true,
                        isWritable: false,
                    }),
                ],
                identifier: 'myInstruction',
            }),
        ],
        pdas: [pdaNode({ identifier: 'myPda', seeds: [] })],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the input type to still require a signer.
    await renderMapContains(renderMap, 'instructions/myInstruction.ts', [
        'TAccountMyAccount extends InstructionSignerInput = InstructionSignerInput',
    ]);

    // But we expect the runtime signer flag to be downgraded to 'either' so that
    // the default value does not fail the signer requirement.
    await renderMapContains(renderMap, 'instructions/myInstruction.ts', [
        "myAccount: { value: input.myAccount ?? null, isSigner: 'either', isWritable: false }",
    ]);
});

test('it never upgrades the runtime signer flag of non-signer accounts', async () => {
    // Given a non-signer account defaulting to a signer account.
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        identifier: 'payer',
                        isSigner: true,
                        isWritable: true,
                    }),
                    instructionAccountNode({
                        defaultValue: accountValueNode('payer'),
                        identifier: 'owner',
                        isSigner: false,
                        isWritable: false,
                    }),
                ],
                identifier: 'myInstruction',
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the runtime signer flag of the non-signer account to remain false,
    // so that any signer provided for it merely carries its address.
    await renderMapContains(renderMap, 'instructions/myInstruction.ts', [
        'payer: { value: input.payer ?? null, isSigner: true, isWritable: true }',
        'owner: { value: input.owner ?? null, isSigner: false, isWritable: false }',
    ]);
});

test('it renders extra arguments that default on each other', async () => {
    // Given the following instruction with two extra arguments
    // such that one defaults to the other.
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                identifier: 'create',
                plugins: [
                    pluginNode('codama.extraArgument', {
                        defaultValue: dataValueNode('bar'),
                        identifier: 'foo',
                        type: integerTypeNode('u64'),
                    }),
                    pluginNode('codama.extraArgument', { identifier: 'bar', type: integerTypeNode('u64') }),
                ],
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following code to be rendered.
    await renderMapContains(renderMap, 'instructions/create.ts', [
        'const args = { ...input }',
        "if (!args.foo) { args.foo = getNonNullResolvedInstructionInput ( 'bar', args.bar ); }",
    ]);
});

test('it renders the args variable on the async function only if the extra argument has an async default value', async () => {
    // Given the following instruction with an async resolver and an extra argument.
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                identifier: 'create',
                plugins: [
                    pluginNode(
                        'codama.extraArgument',
                        { identifier: 'foo', type: integerTypeNode('u64') },
                        { plugins: [pluginNode('codama.resolver', { name: 'myAsyncResolver' })] },
                    ),
                ],
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor({ asyncResolvers: ['myAsyncResolver'] }));

    // And split the async and sync functions.
    const [asyncFunction, syncFunction] = getFromRenderMap(renderMap, 'instructions/create.ts').content.split(
        /export\s+function\s+getCreateInstruction/,
    );

    // Then we expect only the async function to contain the args variable.
    await codeContains(asyncFunction, ['// Original args.', 'const args = { ...input }']);
    await codeDoesNotContain(syncFunction, ['// Original args.', 'const args = { ...input }']);
});

test('it only renders the args variable on the async function if the extra argument is used in an async default value', async () => {
    // Given the following instruction with an async resolver depending on
    // an extra argument such that the instruction has no data arguments.
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        identifier: 'foo',
                        isSigner: false,
                        isWritable: false,
                        plugins: [pluginNode('codama.resolver', { dependsOn: ['data.bar'], name: 'myAsyncResolver' })],
                    }),
                ],
                identifier: 'create',
                plugins: [pluginNode('codama.extraArgument', { identifier: 'bar', type: integerTypeNode('u64') })],
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor({ asyncResolvers: ['myAsyncResolver'] }));

    // And split the async and sync functions.
    const [asyncFunction, syncFunction] = getFromRenderMap(renderMap, 'instructions/create.ts').content.split(
        /export\s+function\s+getCreateInstruction/,
    );

    // Then we expect only the async function to contain the args variable.
    await codeContains(asyncFunction, ['// Original args.', 'const args = { ...input }']);
    await codeDoesNotContain(syncFunction, ['// Original args.', 'const args = { ...input }']);
});

test('it renders instruction accounts with linked PDAs as default value', async () => {
    // Given the following program with a PDA node and an instruction account using it as default value.
    const node = programNode({
        identifier: 'counter',
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        identifier: 'authority',
                        isSigner: true,
                        isWritable: false,
                    }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode('counter', {
                            seeds: [pdaSeedValueNode('authority', accountValueNode('authority'))],
                        }),
                        identifier: 'counter',
                        isSigner: false,
                        isWritable: false,
                    }),
                ],
                identifier: 'increment',
            }),
        ],
        pdas: [
            pdaNode({
                identifier: 'counter',
                seeds: [
                    constantPdaSeedNodeFromString('utf8', 'counter'),
                    variablePdaSeedNode('authority', publicKeyTypeNode()),
                ],
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following default value to be rendered.
    await renderMapContains(renderMap, 'instructions/increment.ts', [
        'if (!accounts.counter.value) { ' +
            "accounts.counter.value = await findCounterPda( { authority: getAddressFromResolvedInstructionAccount ( 'authority', accounts.authority.value ) }, { programAddress } ); " +
            '}',
    ]);
    await renderMapContainsImports(renderMap, 'instructions/increment.ts', {
        '../pdas': ['findCounterPda'],
    });
});

test('it renders instruction accounts with linked PDA default values that point to another account as the program', async () => {
    // Given the following program with a PDA node and an instruction account using it as default value
    // such that the program used to derive the PDA is another account in the instruction.
    const node = programNode({
        identifier: 'counter',
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        identifier: 'authority',
                        isSigner: true,
                        isWritable: false,
                    }),
                    instructionAccountNode({
                        identifier: 'myProgram',
                        isSigner: false,
                        isWritable: false,
                    }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode('counter', {
                            programId: accountValueNode('myProgram'),
                            seeds: [pdaSeedValueNode('authority', accountValueNode('authority'))],
                        }),
                        identifier: 'counter',
                        isSigner: false,
                        isWritable: false,
                    }),
                ],
                identifier: 'increment',
            }),
        ],
        pdas: [
            pdaNode({
                identifier: 'counter',
                seeds: [
                    constantPdaSeedNodeFromString('utf8', 'counter'),
                    variablePdaSeedNode('authority', publicKeyTypeNode()),
                ],
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following default value to be rendered.
    await renderMapContains(renderMap, 'instructions/increment.ts', [
        'if (!accounts.counter.value) { ' +
            "accounts.counter.value = await findCounterPda( { authority: getAddressFromResolvedInstructionAccount ( 'authority', accounts.authority.value ) }, { programAddress: getAddressFromResolvedInstructionAccount ( 'myProgram', accounts.myProgram.value ) } ); " +
            '}',
    ]);
    await renderMapContainsImports(renderMap, 'instructions/increment.ts', {
        '../pdas': ['findCounterPda'],
    });
});

test('it does not render the program address for linked PDA default values that belong to another program', async () => {
    // Given the following program with an instruction account using a PDA from another program as default value.
    const node = rootNode(
        programNode({
            identifier: 'myProgram',
            instructions: [
                instructionNode({
                    accounts: [
                        instructionAccountNode({
                            defaultValue: pdaValueNode(
                                pdaLinkNode('counter', { program: programLinkNode('myOtherProgram') }),
                            ),
                            identifier: 'counter',
                            isSigner: false,
                            isWritable: false,
                        }),
                    ],
                    identifier: 'increment',
                }),
            ],
            publicKey: '1111',
        }),
        {
            additionalPrograms: [
                programNode({
                    identifier: 'myOtherProgram',
                    pdas: [pdaNode({ identifier: 'counter', seeds: [] })],
                    publicKey: '2222',
                }),
            ],
        },
    );

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the PDA function to keep its own program address.
    await renderMapContains(renderMap, 'instructions/increment.ts', [
        'if (!accounts.counter.value) { accounts.counter.value = await findCounterPda(); }',
    ]);
});

test('it does not render the program address for linked PDA default values with an explicit program ID', async () => {
    // Given the following program with a PDA node pinned to an explicit program ID.
    const node = programNode({
        identifier: 'counter',
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        defaultValue: pdaValueNode('counter'),
                        identifier: 'counter',
                        isSigner: false,
                        isWritable: false,
                    }),
                ],
                identifier: 'increment',
            }),
        ],
        pdas: [pdaNode({ identifier: 'counter', programId: '2222', seeds: [] })],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the PDA function to keep its own program address.
    await renderMapContains(renderMap, 'instructions/increment.ts', [
        'if (!accounts.counter.value) { accounts.counter.value = await findCounterPda(); }',
    ]);
});

test('it renders instruction arguments with linked PDA default values that forward the program address', async () => {
    // Given the following program with an instruction argument using a PDA as default value.
    const node = programNode({
        identifier: 'counter',
        instructions: [
            instructionNode({
                data: structTypeNode([
                    structFieldTypeNode({
                        defaultValue: injectedValueNode({ key: 'counterAddress' }),
                        identifier: 'counterAddress',
                        type: publicKeyTypeNode(),
                    }),
                ]),
                identifier: 'increment',
                provides: [providedNode('counterAddress', pdaValueNode('counter'))],
            }),
        ],
        pdas: [pdaNode({ identifier: 'counter', seeds: [] })],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the argument default to use the program address of the instruction.
    await renderMapContains(renderMap, 'instructions/increment.ts', [
        'if (!args.counterAddress) { args.counterAddress = await findCounterPda({ programAddress }); }',
    ]);
});

test('it renders the seeds argument of linked PDA default values that provide no seed values', async () => {
    // Given the following program with a PDA node whose seeds are not filled by the default value.
    const node = programNode({
        identifier: 'counter',
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        defaultValue: pdaValueNode('counter'),
                        identifier: 'counter',
                        isSigner: false,
                        isWritable: false,
                    }),
                ],
                identifier: 'increment',
            }),
        ],
        pdas: [
            pdaNode({
                identifier: 'counter',
                seeds: [variablePdaSeedNode('authority', publicKeyTypeNode())],
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the seeds argument to keep its position before the program address.
    await renderMapContains(renderMap, 'instructions/increment.ts', [
        'if (!accounts.counter.value) { accounts.counter.value = await findCounterPda({}, { programAddress }); }',
    ]);
});

test('it renders instruction accounts with inlined PDAs as default value', async () => {
    // Given the following instruction with an inlined PDA default value.
    const node = programNode({
        identifier: 'counter',
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        identifier: 'authority',
                        isSigner: true,
                        isWritable: false,
                    }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(
                            pdaNode({
                                identifier: 'counter',
                                seeds: [
                                    constantPdaSeedNodeFromString('utf8', 'counter'),
                                    variablePdaSeedNode('authority', publicKeyTypeNode()),
                                ],
                            }),
                            { seeds: [pdaSeedValueNode('authority', accountValueNode('authority'))] },
                        ),
                        identifier: 'counter',
                        isSigner: false,
                        isWritable: false,
                    }),
                ],
                identifier: 'increment',
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following default value to be rendered.
    await renderMapContains(renderMap, 'instructions/increment.ts', [
        'if (!accounts.counter.value) { ' +
            'accounts.counter.value = await getProgramDerivedAddress( { ' +
            '  programAddress, ' +
            '  seeds: [ ' +
            "    getUtf8Encoder().encode('counter'), " +
            "    getAddressEncoder().encode( getAddressFromResolvedInstructionAccount ( 'authority', accounts.authority.value ) ) " +
            '  ] ' +
            '} ); ' +
            '}',
    ]);
    await renderMapContainsImports(renderMap, 'instructions/increment.ts', {
        '@solana/kit': ['getProgramDerivedAddress'],
    });
});

test('it renders instruction accounts with inlined PDA default values that point to another account as the program', async () => {
    // Given the following instruction with an inlined PDA default value
    // such that the program used to derive the PDA is another account in the instruction.
    const node = programNode({
        identifier: 'counter',
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        identifier: 'authority',
                        isSigner: true,
                        isWritable: false,
                    }),
                    instructionAccountNode({
                        identifier: 'myProgram',
                        isSigner: false,
                        isWritable: false,
                    }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(
                            pdaNode({
                                identifier: 'counter',
                                seeds: [
                                    constantPdaSeedNodeFromString('utf8', 'counter'),
                                    variablePdaSeedNode('authority', publicKeyTypeNode()),
                                ],
                            }),
                            {
                                programId: accountValueNode('myProgram'),
                                seeds: [pdaSeedValueNode('authority', accountValueNode('authority'))],
                            },
                        ),
                        identifier: 'counter',
                        isSigner: false,
                        isWritable: false,
                    }),
                ],
                identifier: 'increment',
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following default value to be rendered.
    await renderMapContains(renderMap, 'instructions/increment.ts', [
        'if (!accounts.counter.value) { ' +
            'accounts.counter.value = await getProgramDerivedAddress( { ' +
            "  programAddress: getAddressFromResolvedInstructionAccount ( 'myProgram', accounts.myProgram.value ), " +
            '  seeds: [ ' +
            "    getUtf8Encoder().encode('counter'), " +
            "    getAddressEncoder().encode( getAddressFromResolvedInstructionAccount ( 'authority', accounts.authority.value ) ) " +
            '  ] ' +
            '} ); ' +
            '}',
    ]);
    await renderMapContainsImports(renderMap, 'instructions/increment.ts', {
        '@solana/kit': ['getProgramDerivedAddress'],
    });
});

test('it renders instruction accounts with inlined PDAs from another program as default value', async () => {
    // Given the following instruction with an inlined PDA default value from another program.
    const node = programNode({
        identifier: 'counter',
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        identifier: 'authority',
                        isSigner: true,
                        isWritable: false,
                    }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(
                            pdaNode({
                                identifier: 'counter',
                                programId: '2222',
                                seeds: [
                                    constantPdaSeedNodeFromString('utf8', 'counter'),
                                    variablePdaSeedNode('authority', publicKeyTypeNode()),
                                ],
                            }),
                            { seeds: [pdaSeedValueNode('authority', accountValueNode('authority'))] },
                        ),
                        identifier: 'counter',
                        isSigner: false,
                        isWritable: false,
                    }),
                ],
                identifier: 'increment',
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following default value to be rendered.
    await renderMapContains(renderMap, 'instructions/increment.ts', [
        'if (!accounts.counter.value) { ' +
            'accounts.counter.value = await getProgramDerivedAddress( { ' +
            "  programAddress: '2222' as Address<'2222'>, " +
            '  seeds: [ ' +
            "    getUtf8Encoder().encode('counter'), " +
            "    getAddressEncoder().encode( getAddressFromResolvedInstructionAccount ( 'authority', accounts.authority.value ) ) " +
            '  ] ' +
            '} ); ' +
            '}',
    ]);
    await renderMapContainsImports(renderMap, 'instructions/increment.ts', {
        '@solana/kit': ['type Address', 'getProgramDerivedAddress'],
    });
});

test('it renders constants for instruction field discriminators', async () => {
    // Given the following instruction with a field discriminator.
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                data: structTypeNode([
                    structFieldTypeNode({
                        defaultValue: integerValueNode('42'),
                        defaultValueStrategy: 'omitted',
                        identifier: 'myDiscriminator',
                        type: integerTypeNode('u8'),
                    }),
                ]),
                discriminators: [fieldDiscriminatorNode('myDiscriminator')],
                identifier: 'myInstruction',
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following constant and function to be rendered
    // And we expect the field default value to use that constant.
    await renderMapContains(renderMap, 'instructions/myInstruction.ts', [
        'export const MY_INSTRUCTION_MY_DISCRIMINATOR = 42;',
        'export function getMyInstructionMyDiscriminatorBytes(): ReadonlyUint8Array { return getU8Encoder().encode(MY_INSTRUCTION_MY_DISCRIMINATOR); }',
        '(value) => ({ ...value, myDiscriminator: MY_INSTRUCTION_MY_DISCRIMINATOR })',
    ]);
});

test('it renders constants for boolean field discriminators', async () => {
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                data: structTypeNode([
                    structFieldTypeNode({
                        defaultValue: booleanValueNode(true),
                        defaultValueStrategy: 'omitted',
                        identifier: 'myDiscriminator',
                        type: booleanTypeNode(),
                    }),
                ]),
                discriminators: [fieldDiscriminatorNode('myDiscriminator')],
                identifier: 'myInstruction',
            }),
        ],
        publicKey: '1111',
    });
    const renderMap = visit(node, getRenderMapVisitor());
    await renderMapContains(renderMap, 'instructions/myInstruction.ts', [
        'export const MY_INSTRUCTION_MY_DISCRIMINATOR = true;',
    ]);
});

test('it renders constants for string field discriminators', async () => {
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                data: structTypeNode([
                    structFieldTypeNode({
                        defaultValue: stringValueNode('hello'),
                        defaultValueStrategy: 'omitted',
                        identifier: 'myDiscriminator',
                        type: addTypeNodeTransforms(stringTypeNode('utf8'), [fixedSizeTransformNode(5)]),
                    }),
                ]),
                discriminators: [fieldDiscriminatorNode('myDiscriminator')],
                identifier: 'myInstruction',
            }),
        ],
        publicKey: '1111',
    });
    const renderMap = visit(node, getRenderMapVisitor());
    await renderMapContains(renderMap, 'instructions/myInstruction.ts', [
        "export const MY_INSTRUCTION_MY_DISCRIMINATOR = 'hello';",
    ]);
});

test('it renders constants for enum field discriminators', async () => {
    const node = programNode({
        definedTypes: [
            definedTypeNode({
                identifier: 'key',
                type: enumTypeNode([enumVariantTypeNode('Uninitialized'), enumVariantTypeNode('Asset')]),
            }),
        ],
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                data: structTypeNode([
                    structFieldTypeNode({
                        defaultValue: enumValueNode('key', 'Asset'),
                        defaultValueStrategy: 'omitted',
                        identifier: 'myDiscriminator',
                        type: definedTypeLinkNode('Key'),
                    }),
                ]),
                discriminators: [fieldDiscriminatorNode('myDiscriminator')],
                identifier: 'myInstruction',
            }),
        ],
        publicKey: '1111',
    });
    const renderMap = visit(node, getRenderMapVisitor());
    await renderMapContains(renderMap, 'instructions/myInstruction.ts', [
        'export const MY_INSTRUCTION_MY_DISCRIMINATOR: Key = Key.Asset;',
    ]);
});

test('it renders constants for bigint field discriminators', async () => {
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                data: structTypeNode([
                    structFieldTypeNode({
                        defaultValue: integerValueNode('7'),
                        defaultValueStrategy: 'omitted',
                        identifier: 'myDiscriminator',
                        type: integerTypeNode('u64'),
                    }),
                ]),
                discriminators: [fieldDiscriminatorNode('myDiscriminator')],
                identifier: 'myInstruction',
            }),
        ],
        publicKey: '1111',
    });
    const renderMap = visit(node, getRenderMapVisitor());
    await renderMapContains(renderMap, 'instructions/myInstruction.ts', [
        'export const MY_INSTRUCTION_MY_DISCRIMINATOR = 7n;',
    ]);
});

test('it renders constants for bigint constant discriminators', async () => {
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                discriminators: [
                    constantDiscriminatorNode(constantValueNode(integerTypeNode('u64'), integerValueNode('7'))),
                ],
                identifier: 'myInstruction',
            }),
        ],
        publicKey: '1111',
    });
    const renderMap = visit(node, getRenderMapVisitor());
    await renderMapContains(renderMap, 'instructions/myInstruction.ts', [
        'export const MY_INSTRUCTION_DISCRIMINATOR = 7n;',
    ]);
});

test('it renders large bigint discriminators beyond the safe integer range', async () => {
    // Integer values are stored as decimal strings, so the largest u64 is carried exactly
    // even though it exceeds Number.MAX_SAFE_INTEGER. It must render as a BigInt literal.
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                data: structTypeNode([
                    structFieldTypeNode({
                        defaultValue: integerValueNode('18446744073709551615'),
                        defaultValueStrategy: 'omitted',
                        identifier: 'myDiscriminator',
                        type: integerTypeNode('u64'),
                    }),
                ]),
                discriminators: [fieldDiscriminatorNode('myDiscriminator')],
                identifier: 'myInstruction',
            }),
        ],
        publicKey: '1111',
    });
    const renderMap = visit(node, getRenderMapVisitor());
    await renderMapContains(renderMap, 'instructions/myInstruction.ts', [
        'export const MY_INSTRUCTION_MY_DISCRIMINATOR = 18446744073709551615n;',
    ]);
});

test('it renders constants for instruction constant discriminators', async () => {
    // Given the following instruction with two constant discriminators.
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                discriminators: [
                    constantDiscriminatorNode(constantValueNodeFromBytes('base16', '1111')),
                    constantDiscriminatorNode(constantValueNodeFromBytes('base16', '2222'), { offset: 2 }),
                ],
                identifier: 'myInstruction',
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following constants and functions to be rendered.
    await renderMapContains(renderMap, 'instructions/myInstruction.ts', [
        'export const MY_INSTRUCTION_DISCRIMINATOR: ReadonlyUint8Array = new Uint8Array([ 17, 17 ]);',
        'export function getMyInstructionDiscriminatorBytes(): ReadonlyUint8Array { return getBytesEncoder().encode(MY_INSTRUCTION_DISCRIMINATOR); }',
        'export const MY_INSTRUCTION_DISCRIMINATOR2: ReadonlyUint8Array = new Uint8Array( [34, 34] );',
        'export function getMyInstructionDiscriminator2Bytes(): ReadonlyUint8Array { return getBytesEncoder().encode(MY_INSTRUCTION_DISCRIMINATOR2); }',
    ]);
});

test('it can override the import of a resolver value node', async () => {
    // Given the following node with a resolver value node.
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        identifier: 'myAccount',
                        isSigner: false,
                        isWritable: false,
                        plugins: [pluginNode('codama.resolver', { name: 'myResolver' })],
                    }),
                ],
                identifier: 'myInstruction',
            }),
        ],
        pdas: [pdaNode({ identifier: 'counter', seeds: [] })],
        publicKey: '1111',
    });

    // When we render it using a custom import.
    const renderMap = visit(
        node,
        getRenderMapVisitor({
            linkOverrides: {
                resolvers: { myResolver: 'someModule' },
            },
        }),
    );

    // Then we expect the resolver to be exported.
    await renderMapContains(renderMap, 'instructions/myInstruction.ts', ['myResolver(resolverScope)']);

    // And its import path to be overridden.
    await renderMapContainsImports(renderMap, 'instructions/myInstruction.ts', {
        someModule: ['myResolver'],
    });
});

test('it renders optional config that can override the program address', async () => {
    // Given the following instruction
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                accounts: [],
                identifier: 'myInstruction',
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect an optional config parameter with an optional programAddress field accepting address-bearing objects
    // And we expect this to be unwrapped and used to override programAddress if it is set
    await renderMapContains(renderMap, 'instructions/myInstruction.ts', [
        'config?: { programAddress?: TProgramAddress | { readonly address: TProgramAddress }; }',
        'const programAddressInput = config?.programAddress ?? MY_PROGRAM_PROGRAM_ADDRESS;',
        "const programAddress = typeof programAddressInput === 'string' ? programAddressInput : programAddressInput.address;",
    ]);
});

test('it renders instructions with no accounts and no data', async () => {
    // Given the following instruction with no accounts and no arguments.
    const node = programNode({
        identifier: 'myProgram',
        instructions: [instructionNode({ identifier: 'myInstruction' })],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the instruction input type is generated as an empty object.
    await renderMapContains(renderMap, 'instructions/myInstruction.ts', ['export type MyInstructionInput = {};']);

    // But the instruction function does not use it as an argument.
    await renderMapDoesNotContain(renderMap, 'instructions/myInstruction.ts', ['input: MyInstructionInput']);
});

test('it renders instructions with no accounts but with some omitted data', async () => {
    // Given the following instruction with no accounts but with a discriminator argument.
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                data: structTypeNode([
                    structFieldTypeNode({
                        defaultValue: integerValueNode('42'),
                        defaultValueStrategy: 'omitted',
                        identifier: 'myDiscriminator',
                        type: integerTypeNode('u32'),
                    }),
                ]),
                discriminators: [fieldDiscriminatorNode('myDiscriminator')],
                identifier: 'myInstruction',
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the instruction input type is generated as an empty object.
    await renderMapContains(renderMap, 'instructions/myInstruction.ts', ['export type MyInstructionInput = {};']);

    // But the instruction function does not use it as an argument.
    await renderMapDoesNotContain(renderMap, 'instructions/myInstruction.ts', ['input: MyInstructionInput']);
});

test('it renders instructions with no accounts but with some arguments', async () => {
    // Given the following instruction with no accounts but with a non-omitted argument.
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                data: structTypeNode([
                    structFieldTypeNode({
                        identifier: 'myArgument',
                        type: integerTypeNode('u32'),
                    }),
                ]),
                identifier: 'myInstruction',
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following input type to be rendered
    // and used as an argument of the instruction function.
    await renderMapContains(renderMap, 'instructions/myInstruction.ts', [
        "export type MyInstructionInput = { myArgument: MyInstructionInstructionDataArgs['myArgument']; };",
        'input: MyInstructionInput',
    ]);
});

test('it renders instructions with no arguments but with some accounts', async () => {
    // Given the following instruction with no arguments but with an account.
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        identifier: 'myAccount',
                        isSigner: false,
                        isWritable: false,
                    }),
                ],
                identifier: 'myInstruction',
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following input type to be rendered
    // and used as an argument of the instruction function.
    await renderMapContains(renderMap, 'instructions/myInstruction.ts', [
        `export type MyInstructionInput<
            TAccountMyAccount extends InstructionAccountInput = InstructionAccountInput
        > = { myAccount: TAccountMyAccount; };`,
        `export function getMyInstructionInstruction<
            TAccountMyAccount extends InstructionAccountInput,
            TProgramAddress extends Address = typeof MY_PROGRAM_PROGRAM_ADDRESS
        >(
            input: MyInstructionInput<TAccountMyAccount>,
            config?: { programAddress?: TProgramAddress | { readonly address: TProgramAddress }; }
        ): MyInstructionInstruction<
            TProgramAddress,
            ResolvedInstructionAccountMeta<
                TAccountMyAccount,
                InstructionAccountInputAddress<TAccountMyAccount>
            >
        > {`,
    ]);
});

test("it passes the program address for an unset optional account under the default 'programId' strategy", async () => {
    // Given an instruction with an optional account that is not the last account,
    // so account ordering must be preserved when it is unset.
    // See https://github.com/codama-idl/renderers-js/issues/94
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        identifier: 'group',
                        isOptional: true,
                        isSigner: false,
                        isWritable: false,
                    }),
                    instructionAccountNode({
                        identifier: 'permission',
                        isSigner: false,
                        isWritable: true,
                    }),
                ],
                identifier: 'myInstruction',
                // optionalAccountStrategy left unset, defaulting to 'programId'.
            }),
        ],
        publicKey: '1111',
    });
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the account meta factory uses the 'programId' strategy and every account keeps
    // its slot in declaration order, so an unset optional account is replaced by the program
    // address rather than dropped.
    await renderMapContains(renderMap, 'instructions/myInstruction.ts', [
        "const getAccountMeta = getAccountMetaFactory(programAddress, 'programId');",
        /accounts:\s*\[\s*getAccountMeta\('group', accounts\.group\),\s*getAccountMeta\('permission', accounts\.permission\)\s*\]/,
    ]);
    // And the accounts array is not filtered, so ordering cannot shift.
    await renderMapDoesNotContain(renderMap, 'instructions/myInstruction.ts', [/\.filter\(<T>/]);
});

test("it drops an unset optional account under the legacy 'omitted' strategy", async () => {
    // Given the same instruction but with the legacy 'omitted' strategy, which models
    // Anchor's legacyOptionalAccountsStrategy where unset optional accounts are removed.
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        identifier: 'group',
                        isOptional: true,
                        isSigner: false,
                        isWritable: false,
                    }),
                    instructionAccountNode({
                        identifier: 'permission',
                        isSigner: false,
                        isWritable: true,
                    }),
                ],
                identifier: 'myInstruction',
                optionalAccountStrategy: 'omitted',
            }),
        ],
        publicKey: '1111',
    });
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the account meta factory uses the 'omitted' strategy, the optional account's type
    // parameter accepts undefined, and the accounts array is filtered to remove unset accounts.
    await renderMapContains(renderMap, 'instructions/myInstruction.ts', [
        "const getAccountMeta = getAccountMetaFactory(programAddress, 'omitted');",
        'TAccountGroup extends string | AccountMeta<string> | undefined = undefined',
        /\.filter\(<T,?>\(x: T \| undefined\): x is T => x !== undefined\)/,
    ]);
});

test('it renders remaining accounts that accept the same inputs as instruction accounts', async () => {
    // Given an instruction with non-signer remaining accounts provided as an input argument.
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                identifier: 'myInstruction',
                remainingAccounts: [instructionRemainingAccountsNode('extraAccounts', { isWritable: true })],
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the input to accept any instruction account input.
    await renderMapContains(renderMap, 'instructions/myInstruction.ts', [
        'extraAccounts: Array<InstructionAccountInput>;',
    ]);

    // And we expect the remaining accounts to go through the account meta helper.
    await renderMapContains(renderMap, 'instructions/myInstruction.ts', [
        "const getAccountMeta = getAccountMetaFactory(programAddress, 'programId');",
        `const remainingAccounts: AccountMeta[] = args.extraAccounts.map( (value) =>
            getNonNullResolvedInstructionInput(
                'extraAccounts',
                getAccountMeta('extraAccounts', { value, isSigner: false, isWritable: true } )
            )
        );`,
    ]);
});

test('it renders optional remaining accounts that may be signers', async () => {
    // Given an instruction with optional remaining accounts that may or may not be signers.
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                identifier: 'myInstruction',
                remainingAccounts: [
                    instructionRemainingAccountsNode('extraAccounts', {
                        isOptional: true,
                        isSigner: 'either',
                    }),
                ],
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the input to accept both signer and non-signer inputs.
    await renderMapContains(renderMap, 'instructions/myInstruction.ts', [
        'extraAccounts?: Array<InstructionAccountInput | InstructionSignerInput>;',
    ]);

    // And we expect the signer flag to be forwarded to the account meta helper.
    await renderMapContains(renderMap, 'instructions/myInstruction.ts', [
        `(args.extraAccounts ?? []).map( (value) =>
            getNonNullResolvedInstructionInput(
                'extraAccounts',
                getAccountMeta('extraAccounts', { value, isSigner: 'either', isWritable: false } )
            )
        );`,
    ]);
});

test('it renders remaining accounts backed by an instruction argument as plain addresses', async () => {
    // Given an instruction whose remaining accounts are backed by an
    // existing argument — i.e. an array of addresses encoded in the instruction data.
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                data: structTypeNode([
                    structFieldTypeNode({
                        identifier: 'extraAccounts',
                        type: arrayTypeNode(publicKeyTypeNode(), prefixedCountNode(integerTypeNode('u8'))),
                    }),
                ]),
                identifier: 'myInstruction',
                remainingAccounts: [instructionRemainingAccountsNode('extraAccounts', { isSigner: true })],
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the argument to keep its data type in the input.
    await renderMapContains(renderMap, 'instructions/myInstruction.ts', [
        "extraAccounts: MyInstructionInstructionDataArgs['extraAccounts'];",
    ]);

    // And we expect the remaining accounts to be derived from the IDL flags alone.
    await renderMapContains(renderMap, 'instructions/myInstruction.ts', [
        "const remainingAccounts: AccountMeta[] = args.extraAccounts.map( (value) => ({ address: getAddressFromResolvedInstructionAccount('extraAccounts', value), role: AccountRole.READONLY_SIGNER }) );",
    ]);
    // And we expect the account meta helper to not be declared nor imported since it is not used.
    await renderMapDoesNotContain(renderMap, 'instructions/myInstruction.ts', ['getAccountMeta']);
});

test('it fails loudly on injected default values that are not provided', () => {
    // Given an instruction account defaulting to an injected value that nothing provides.
    const defaultValue = injectedValueNode({ key: 'authority' });
    const node = programNode({
        identifier: 'counter',
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        defaultValue,
                        identifier: 'authority',
                        isSigner: false,
                        isWritable: false,
                    }),
                ],
                identifier: 'increment',
            }),
        ],
        publicKey: '1111',
    });

    // Then rendering fails at generation time with a clear error.
    expect(() => visit(node, getRenderMapVisitor())).toThrow(
        new CodamaError(CODAMA_ERROR__INJECTED_VALUE_NOT_PROVIDED, {
            key: identifierString('authority'),
            path: [defaultValue],
        }),
    );
});

test('it fills in omitted data fields with their resolver without exposing them as inputs', async () => {
    // Given an instruction whose fee is omitted from the input and computed by a resolver.
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                data: structTypeNode([
                    structFieldTypeNode({ identifier: 'amount', type: integerTypeNode('u64') }),
                    structFieldTypeNode({
                        defaultValueStrategy: 'omitted',
                        identifier: 'fee',
                        plugins: [pluginNode('codama.resolver', { dependsOn: ['data.amount'], name: 'resolveFee' })],
                        type: integerTypeNode('u64'),
                    }),
                ]),
                identifier: 'transfer',
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the fee is resolved but not part of the input type.
    await renderMapContains(renderMap, 'instructions/transfer.ts', [
        "export type TransferInput = { amount: TransferInstructionDataArgs['amount']; }",
        'if (!args.fee) { args.fee = resolveFee(resolverScope); }',
    ]);
});

test('it passes linked instruction data to resolvers depending on its fields', async () => {
    // Given an account resolver depending on a field of instruction data linked to a defined type.
    const node = programNode({
        definedTypes: [
            definedTypeNode({
                identifier: 'transferArgs',
                type: structTypeNode([structFieldTypeNode({ identifier: 'amount', type: integerTypeNode('u64') })]),
            }),
        ],
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        identifier: 'vault',
                        isSigner: false,
                        isWritable: true,
                        plugins: [pluginNode('codama.resolver', { dependsOn: ['data.amount'], name: 'resolveVault' })],
                    }),
                ],
                data: definedTypeLinkNode('transferArgs'),
                identifier: 'transfer',
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the linked data is part of the input and reaches the resolver through the args.
    await renderMapContains(renderMap, 'instructions/transfer.ts', [
        '= TransferArgsArgs & { vault?: TAccountVault; }',
        'const args = { ...input };',
        'const resolverScope = { programAddress, accounts, args };',
        'accounts.vault = { ...accounts.vault, ...resolveVault(resolverScope) };',
        'data: getTransferArgsEncoder().encode(args as TransferArgsArgs)',
    ]);
});
