import {
    CODAMA_ERROR__CANNOT_RESOLVE_PATH,
    CODAMA_ERROR__INJECTED_VALUE_NOT_PROVIDED,
    CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE,
    CODAMA_ERROR__VISITORS__INVALID_PDA_SEED_VALUES,
    CodamaError,
} from '@codama/errors';
import { getFromRenderMap } from '@codama/fragments';
import {
    accountLinkNode,
    accountNode,
    accountValueNode,
    addTypeNodeTransforms,
    arrayTypeNode,
    booleanTypeNode,
    booleanValueNode,
    conditionalValueNode,
    type ConditionalValueNode,
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
    instructionByteDeltaNode,
    instructionNode,
    instructionRemainingAccountsNode,
    instructionStatusNode,
    integerTypeNode,
    integerValueNode,
    payerValueNode,
    pdaLinkNode,
    pdaNode,
    pdaSeedValueNode,
    pdaValueNode,
    pluginNode,
    prefixedCountNode,
    programIdValueNode,
    programLinkNode,
    programNode,
    providedNode,
    publicKeyTypeNode,
    publicKeyValueNode,
    rootNode,
    someValueNode,
    stringTypeNode,
    stringValueNode,
    structFieldTypeNode,
    structTypeNode,
    variablePdaSeedNode,
} from '@codama/nodes';
import { getLinkablesFromNode, visit } from '@codama/visitors-core';
import { expect, test } from 'vitest';

import { getRenderMapVisitor } from '../src';
import { getResolvedInstructionInputs } from '../src/utils';
import {
    codeContains,
    codeDoesNotContain,
    getCodamaError,
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
    await renderMapContains(renderMap, 'instructions/my-instruction.ts', [
        `export type MyInstructionInput<
            TAccountMyAccount extends InstructionAccountInput | InstructionSignerInput =
                InstructionAccountInput | InstructionSignerInput
        > = { myAccount: TAccountMyAccount; };`,
    ]);

    // And we expect the account to be resolved as a signer meta when a signer is provided.
    await renderMapContains(renderMap, 'instructions/my-instruction.ts', [
        `ResolvedInstructionAccountMeta<
            TAccountMyAccount,
            InstructionAccountInputAddress<TAccountMyAccount>,
            ReadonlySignerAccount<InstructionAccountInputAddress<TAccountMyAccount>> &
                AccountSignerMeta<InstructionAccountInputAddress<TAccountMyAccount>>
        >`,
    ]);

    // And we expect the runtime signer flag to be forwarded to the account meta factory.
    await renderMapContains(renderMap, 'instructions/my-instruction.ts', [
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
    await renderMapContains(renderMap, 'instructions/my-instruction.ts', [
        'TAccountMyAccount extends InstructionSignerInput = InstructionSignerInput',
    ]);

    // But we expect the runtime signer flag to be downgraded to 'either' so that
    // the default value does not fail the signer requirement.
    await renderMapContains(renderMap, 'instructions/my-instruction.ts', [
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
    await renderMapContains(renderMap, 'instructions/my-instruction.ts', [
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
        "if (args.foo === undefined) { args.foo = getNonNullResolvedInstructionInput ( 'bar', args.bar ); }",
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

    // Then the argument defaults to the address of the PDA derived from the program address of the instruction.
    await renderMapContains(renderMap, 'instructions/increment.ts', [
        'if (args.counterAddress === undefined) { args.counterAddress = (await findCounterPda({ programAddress }))[0]; }',
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

test('it forwards the program address to PDAs pinned to the address of their own program', async () => {
    // Given a PDA whose program ID is the address of the program it belongs to.
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
        pdas: [pdaNode({ identifier: 'counter', programId: '1111', seeds: [] })],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the PDA is derived from the program address of the instruction, as for unpinned PDAs.
    await renderMapContains(renderMap, 'instructions/increment.ts', [
        'if (!accounts.counter.value) { accounts.counter.value = await findCounterPda({ programAddress }); }',
    ]);
});

test('it renders instruction arguments with inlined PDA default values as addresses', async () => {
    // Given an instruction argument defaulting to an inlined PDA.
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
                provides: [
                    providedNode(
                        'counterAddress',
                        pdaValueNode(
                            pdaNode({
                                identifier: 'counter',
                                seeds: [constantPdaSeedNodeFromString('utf8', 'counter')],
                            }),
                        ),
                    ),
                ],
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the argument holds the address of the PDA rather than the address and bump pair.
    await renderMapContains(renderMap, 'instructions/increment.ts', [
        "args.counterAddress = ( await getProgramDerivedAddress({ programAddress, seeds: [getUtf8Encoder().encode('counter')] }) )[0];",
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
    await renderMapContains(renderMap, 'instructions/my-instruction.ts', [
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
    await renderMapContains(renderMap, 'instructions/my-instruction.ts', [
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
    await renderMapContains(renderMap, 'instructions/my-instruction.ts', [
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
    await renderMapContains(renderMap, 'instructions/my-instruction.ts', [
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
    await renderMapContains(renderMap, 'instructions/my-instruction.ts', [
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
    await renderMapContains(renderMap, 'instructions/my-instruction.ts', [
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
    await renderMapContains(renderMap, 'instructions/my-instruction.ts', [
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
    await renderMapContains(renderMap, 'instructions/my-instruction.ts', [
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
    await renderMapContains(renderMap, 'instructions/my-instruction.ts', ['myResolver(resolverScope)']);

    // And its import path to be overridden.
    await renderMapContainsImports(renderMap, 'instructions/my-instruction.ts', {
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
    await renderMapContains(renderMap, 'instructions/my-instruction.ts', [
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
    await renderMapContains(renderMap, 'instructions/my-instruction.ts', ['export type MyInstructionInput = {};']);

    // But the instruction function does not use it as an argument.
    await renderMapDoesNotContain(renderMap, 'instructions/my-instruction.ts', ['input: MyInstructionInput']);
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
    await renderMapContains(renderMap, 'instructions/my-instruction.ts', ['export type MyInstructionInput = {};']);

    // But the instruction function does not use it as an argument.
    await renderMapDoesNotContain(renderMap, 'instructions/my-instruction.ts', ['input: MyInstructionInput']);
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
    await renderMapContains(renderMap, 'instructions/my-instruction.ts', [
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
    await renderMapContains(renderMap, 'instructions/my-instruction.ts', [
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
    await renderMapContains(renderMap, 'instructions/my-instruction.ts', [
        "const getAccountMeta = getAccountMetaFactory(programAddress, 'programId');",
        /accounts:\s*\[\s*getAccountMeta\('group', accounts\.group\),\s*getAccountMeta\('permission', accounts\.permission\)\s*\]/,
    ]);
    // And the accounts array is not filtered, so ordering cannot shift.
    await renderMapDoesNotContain(renderMap, 'instructions/my-instruction.ts', [/\.filter\(<T>/]);
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
    await renderMapContains(renderMap, 'instructions/my-instruction.ts', [
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
    await renderMapContains(renderMap, 'instructions/my-instruction.ts', [
        'extraAccounts: Array<InstructionAccountInput>;',
    ]);

    // And we expect the remaining accounts to go through the account meta helper.
    await renderMapContains(renderMap, 'instructions/my-instruction.ts', [
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
    await renderMapContains(renderMap, 'instructions/my-instruction.ts', [
        'extraAccounts?: Array<InstructionAccountInput | InstructionSignerInput>;',
    ]);

    // And we expect the signer flag to be forwarded to the account meta helper.
    await renderMapContains(renderMap, 'instructions/my-instruction.ts', [
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
    await renderMapContains(renderMap, 'instructions/my-instruction.ts', [
        "extraAccounts: MyInstructionInstructionDataArgs['extraAccounts'];",
    ]);

    // And we expect the remaining accounts to be derived from the IDL flags alone.
    await renderMapContains(renderMap, 'instructions/my-instruction.ts', [
        "const remainingAccounts: AccountMeta[] = args.extraAccounts.map( (value) => ({ address: getAddressFromResolvedInstructionAccount('extraAccounts', value), role: AccountRole.READONLY_SIGNER }) );",
    ]);
    // And we expect the account meta helper to not be declared nor imported since it is not used.
    await renderMapDoesNotContain(renderMap, 'instructions/my-instruction.ts', ['getAccountMeta']);
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
        'if (args.fee === undefined) { args.fee = resolveFee(resolverScope); }',
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

test('it resolves the injected defaults of sub-instructions against the values provided by their parents', async () => {
    // Given a parent instruction providing a value injected into its sub-instruction.
    const node = rootNode(
        programNode({
            identifier: 'myProgram',
            instructions: [
                instructionNode({
                    identifier: 'parent',
                    provides: [providedNode('authority', payerValueNode())],
                    subInstructions: [
                        instructionNode({
                            accounts: [
                                instructionAccountNode({
                                    defaultValue: injectedValueNode({ key: 'authority' }),
                                    identifier: 'authority',
                                    isSigner: true,
                                    isWritable: false,
                                }),
                            ],
                            identifier: 'child',
                        }),
                    ],
                }),
            ],
            publicKey: '1111',
        }),
    );

    // When we render it, with or without parent instructions.
    for (const renderParentInstructions of [false, true]) {
        const renderMap = visit(node, getRenderMapVisitor({ renderParentInstructions }));

        // Then the sub-instruction resolves the value provided by its parent: the payer is a required signer input.
        await renderMapContains(renderMap, 'instructions/child.ts', ['authority: TAccountAuthority;']);
        await renderMapDoesNotContain(renderMap, 'instructions/child.ts', ['authority?:']);
        expect(renderMap.has('instructions/parent.ts')).toBe(renderParentInstructions);
    }
});

/** A program with a `vault` account resolver depending on the given data path of a `transfer` instruction. */
function getProgramWithResolverDependency(dependency: string) {
    const vault = instructionAccountNode({
        identifier: 'vault',
        isSigner: false,
        isWritable: true,
        plugins: [pluginNode('codama.resolver', { dependsOn: [dependency], name: 'resolveVault' })],
    });
    const node = programNode({
        accounts: [
            accountNode({
                data: structTypeNode([structFieldTypeNode({ identifier: 'decimals', type: integerTypeNode('u8') })]),
                identifier: 'mint',
            }),
        ],
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                accounts: [vault],
                data: structTypeNode([
                    structFieldTypeNode({
                        identifier: 'mint',
                        type: publicKeyTypeNode({ accountLink: accountLinkNode('mint') }),
                    }),
                ]),
                identifier: 'transfer',
            }),
        ],
        publicKey: '1111',
    });
    return { node, vault };
}

test('it fails on data paths that enter the data of a linked account', () => {
    // Given an account resolver depending on the data of the account a data field links to.
    const { node, vault } = getProgramWithResolverDependency('data.mint.data.decimals');

    // Then rendering fails on that dependency, reported on the account owning it.
    const error = getCodamaError(CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE, () => visit(node, getRenderMapVisitor()));
    expect(error.context.path.at(-2)).toBe(vault);
    expect(error.context.path.at(-1)).toStrictEqual(dataValueNode('mint.data.decimals'));
});

test('it fails on nested data paths that do not exist', () => {
    // Given an account resolver depending on a nested data path that does not exist.
    const { node } = getProgramWithResolverDependency('data.mint.typo');

    // Then rendering fails to resolve that path.
    const error = getCodamaError(CODAMA_ERROR__CANNOT_RESOLVE_PATH, () => visit(node, getRenderMapVisitor()));
    expect(error.context.pathString).toBe('mint.typo');
});

test('it fails on inline PDA defaults missing a seed value', () => {
    // Given an account defaulting to an inline PDA without a value for its variable seed.
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        defaultValue: pdaValueNode(
                            pdaNode({
                                identifier: 'vault',
                                seeds: [variablePdaSeedNode('owner', publicKeyTypeNode())],
                            }),
                        ),
                        identifier: 'vault',
                        isSigner: false,
                        isWritable: true,
                    }),
                ],
                identifier: 'initialize',
            }),
        ],
        publicKey: '1111',
    });

    // Then rendering fails rather than deriving another address.
    expect(() => visit(node, getRenderMapVisitor())).toThrow(
        expect.objectContaining({
            context: expect.objectContaining({ __code: CODAMA_ERROR__VISITORS__INVALID_PDA_SEED_VALUES }),
        }),
    );
});

test('it extracts the data of sub-instructions as defined types', async () => {
    // Given a sub-instruction whose data is extracted as a defined type.
    const node = rootNode(
        programNode({
            identifier: 'myProgram',
            instructions: [
                instructionNode({
                    identifier: 'parent',
                    subInstructions: [
                        instructionNode({
                            data: structTypeNode([
                                structFieldTypeNode({ identifier: 'amount', type: integerTypeNode('u8') }),
                            ]),
                            identifier: 'child',
                        }),
                    ],
                }),
            ],
            publicKey: '1111',
        }),
    );

    // When we render it.
    const renderMap = visit(
        node,
        getRenderMapVisitor({ customInstructionData: [{ extract: true, identifier: 'child' }] }),
    );

    // Then the extracted type is rendered, so that the hooked data of the sub-instruction can import it.
    await renderMapContains(renderMap, 'types/child-instruction-data.ts', [
        'export type ChildInstructionData = { amount: number }',
    ]);
    await renderMapContains(renderMap, 'instructions/child.ts', ["from '../../hooked'"]);
});

test('it keeps PDA seeds reading an account and a data field of the same name', () => {
    // Given a PDA seeded by both the `mint` account and the `mint` data field.
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ identifier: 'mint', isSigner: false, isWritable: false }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(
                            pdaNode({
                                identifier: 'vault',
                                seeds: [
                                    variablePdaSeedNode('account', publicKeyTypeNode()),
                                    variablePdaSeedNode('data', publicKeyTypeNode()),
                                ],
                            }),
                            {
                                seeds: [
                                    pdaSeedValueNode('account', accountValueNode('mint')),
                                    pdaSeedValueNode('data', dataValueNode('mint')),
                                ],
                            },
                        ),
                        identifier: 'vault',
                        isSigner: false,
                        isWritable: true,
                    }),
                ],
                data: structTypeNode([structFieldTypeNode({ identifier: 'mint', type: publicKeyTypeNode() })]),
                identifier: 'initialize',
            }),
        ],
        publicKey: '1111',
    });

    // When we resolve the dependencies of the vault account.
    const vault = getResolvedInstructionInputs([node, node.instructions![0]], getLinkablesFromNode(node)).find(
        input => input.node.identifier === 'vault',
    );

    // Then both the account and the data field are dependencies.
    expect(vault?.dependsOn).toStrictEqual([accountValueNode('mint'), dataValueNode('mint')]);
});

test('it fails on byte deltas of accounts without a fixed size', () => {
    // Given a byte delta given by an account whose data has a variable size.
    const byteDelta = instructionByteDeltaNode(accountLinkNode('profile'));
    const node = programNode({
        accounts: [
            accountNode({
                data: structTypeNode([structFieldTypeNode({ identifier: 'name', type: stringTypeNode('utf8') })]),
                identifier: 'profile',
            }),
        ],
        identifier: 'myProgram',
        instructions: [instructionNode({ byteDeltas: [byteDelta], identifier: 'createProfile' })],
        publicKey: '1111',
    });

    // Then rendering fails on that byte delta, since no size function exists for the account.
    const error = getCodamaError(CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE, () => visit(node, getRenderMapVisitor()));
    expect(error.context.path.slice(-2)).toStrictEqual([byteDelta, byteDelta.value]);
});

test('it does not rename omitted arguments sharing the name of an account', async () => {
    // Given an omitted data field named like an account, alongside a regular one.
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                accounts: [instructionAccountNode({ identifier: 'mode', isSigner: false, isWritable: false })],
                data: structTypeNode([
                    structFieldTypeNode({
                        defaultValue: integerValueNode('1'),
                        defaultValueStrategy: 'omitted',
                        identifier: 'mode',
                        type: integerTypeNode('u8'),
                    }),
                    structFieldTypeNode({ identifier: 'amount', type: integerTypeNode('u8') }),
                ]),
                identifier: 'configure',
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the omitted argument, absent from the input, is not read from a renamed input.
    await renderMapContains(renderMap, 'instructions/configure.ts', ['const args = { ...input };']);
    await renderMapDoesNotContain(renderMap, 'instructions/configure.ts', ['modeArg']);
});

test('it only extracts the data of rendered instructions', () => {
    // Given a parent instruction whose data is extracted, which is not rendered by default.
    const node = rootNode(
        programNode({
            identifier: 'myProgram',
            instructions: [
                instructionNode({
                    data: structTypeNode([structFieldTypeNode({ identifier: 'amount', type: integerTypeNode('u8') })]),
                    identifier: 'parent',
                    subInstructions: [instructionNode({ identifier: 'child' })],
                }),
            ],
            publicKey: '1111',
        }),
    );
    const options = { customInstructionData: [{ extract: true, identifier: 'parent' }] };

    // Then its data type is only rendered along with the parent instruction.
    expect(visit(node, getRenderMapVisitor(options)).has('types/parent-instruction-data.ts')).toBe(false);
    expect(
        visit(node, getRenderMapVisitor({ ...options, renderParentInstructions: true })).has(
            'types/parent-instruction-data.ts',
        ),
    ).toBe(true);
});

test('it documents instruction builders with their docs and lifecycle status', async () => {
    // Given a documented, deprecated instruction and a draft one.
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                docs: 'Transfers tokens.',
                identifier: 'oldTransfer',
                status: instructionStatusNode('deprecated', { message: 'Use `newTransfer` instead.' }),
            }),
            instructionNode({ identifier: 'newTransfer', status: instructionStatusNode('draft') }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the builders carry the docs and TSDoc tags of their status.
    await renderMapContains(renderMap, 'instructions/old-transfer.ts', [
        /\/\*\*\s*\* Transfers tokens\.\s*\*\s*\* @deprecated Use `newTransfer` instead\.\s*\*\/\s*export function getOldTransferInstruction/,
    ]);
    await renderMapContains(renderMap, 'instructions/new-transfer.ts', [
        /\* This instruction is a draft and may change\.\s*\*\s*\* @experimental\s*\*\/\s*export function getNewTransferInstruction/,
    ]);
});

test('it leaves archived instructions and their sub-instructions out of the client', async () => {
    // Given an archived instruction, with a sub-instruction, next to a live one.
    const node = rootNode(
        programNode({
            identifier: 'myProgram',
            instructions: [
                instructionNode({
                    identifier: 'oldParent',
                    status: instructionStatusNode('archived'),
                    subInstructions: [instructionNode({ identifier: 'oldChild' })],
                }),
                instructionNode({ identifier: 'transfer' }),
            ],
            publicKey: '1111',
        }),
    );

    // When we render it, with or without parent instructions.
    for (const renderParentInstructions of [false, true]) {
        const renderMap = visit(node, getRenderMapVisitor({ renderParentInstructions }));

        // Then neither the archived instruction nor its sub-instruction is rendered, exported or exposed.
        expect([...renderMap.keys()].filter(key => key.startsWith('instructions/')).sort()).toStrictEqual([
            'instructions/index.ts',
            'instructions/transfer.ts',
        ]);
        await renderMapDoesNotContain(renderMap, 'programs/my-program.ts', [
            'OldParent',
            'OldChild',
            'oldParent',
            'oldChild',
        ]);
    }
});

test('it renders the type and codecs of the data returned by instructions', async () => {
    // Given an instruction returning a struct with a field named like its discriminator.
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                data: structTypeNode([
                    structFieldTypeNode({
                        defaultValue: integerValueNode('1'),
                        defaultValueStrategy: 'omitted',
                        identifier: 'discriminator',
                        type: integerTypeNode('u8'),
                    }),
                ]),
                discriminators: [fieldDiscriminatorNode('discriminator')],
                identifier: 'getStats',
                returnData: structTypeNode([
                    structFieldTypeNode({
                        defaultValue: integerValueNode('99'),
                        identifier: 'discriminator',
                        type: integerTypeNode('u8'),
                    }),
                    structFieldTypeNode({ identifier: 'count', type: integerTypeNode('u64') }),
                ]),
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the return data has its own type and codecs, filling in its own default rather than the instruction discriminator.
    await renderMapContains(renderMap, 'instructions/get-stats.ts', [
        'export type GetStatsInstructionReturnData = { discriminator: number; count: bigint; }',
        'export function getGetStatsInstructionReturnDataDecoder(): FixedSizeDecoder<GetStatsInstructionReturnData>',
        'discriminator: value.discriminator ?? 99',
    ]);
});

test('it renders parents whose sub-instructions are all archived as leaves', () => {
    // Given a live parent instruction whose only sub-instruction is archived.
    const node = rootNode(
        programNode({
            identifier: 'myProgram',
            instructions: [
                instructionNode({
                    identifier: 'transfer',
                    subInstructions: [
                        instructionNode({ identifier: 'transferV1', status: instructionStatusNode('archived') }),
                    ],
                }),
            ],
            publicKey: '1111',
        }),
    );

    // When we render it without parent instructions.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the parent is rendered as a leaf, and the archived sub-instruction is left out.
    expect(renderMap.has('instructions/transfer.ts')).toBe(true);
    expect(renderMap.has('instructions/transfer-v1.ts')).toBe(false);
});

/** A `transfer` instruction whose `target` account defaults to the given conditional value. */
function transferWithConditionalTarget(defaultValue: ConditionalValueNode) {
    return instructionNode({
        accounts: [
            instructionAccountNode({ identifier: 'authority', isSigner: 'either', isWritable: false }),
            instructionAccountNode({ identifier: 'fallback', isSigner: false, isWritable: false }),
            instructionAccountNode({ defaultValue, identifier: 'target', isSigner: false, isWritable: false }),
        ],
        identifier: 'transfer',
    });
}

test('it compares integer conditions of default values as bigints', async () => {
    // Given an account defaulting to another one when a u64 argument equals 5.
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ identifier: 'fallback', isSigner: false, isWritable: false }),
                    instructionAccountNode({
                        defaultValue: conditionalValueNode({
                            condition: dataValueNode('amount'),
                            ifTrue: accountValueNode('fallback'),
                            value: integerValueNode('5'),
                        }),
                        identifier: 'target',
                        isSigner: false,
                        isWritable: false,
                    }),
                ],
                data: structTypeNode([structFieldTypeNode({ identifier: 'amount', type: integerTypeNode('u64') })]),
                identifier: 'transfer',
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the condition holds whether the argument is given as a number or a bigint, and not when it is absent.
    await renderMapContains(renderMap, 'instructions/transfer.ts', [
        'if (args.amount != null && BigInt(args.amount) === 5n)',
    ]);
});

test('it compares account conditions of default values by address', async () => {
    // Given an account defaulting to another one when the authority is a given address.
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            transferWithConditionalTarget(
                conditionalValueNode({
                    condition: accountValueNode('authority'),
                    ifTrue: accountValueNode('fallback'),
                    value: publicKeyValueNode('11111111111111111111111111111111'),
                }),
            ),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the authority, which may be a signer or absent, is compared by its address when present.
    await renderMapContains(renderMap, 'instructions/transfer.ts', [
        /accounts\.authority\.value != null &&/,
        /getAddressFromResolvedInstructionAccount\(\s*'authority',\s*accounts\.authority\.value\s*\) === address\(/,
    ]);
});

test('it fails on conditions of default values that cannot be compared', () => {
    // Given an account defaulting to another one when the authority equals an option, which is never identical.
    const conditional = conditionalValueNode({
        condition: accountValueNode('authority'),
        ifTrue: accountValueNode('fallback'),
        value: someValueNode(integerValueNode('5')),
    });
    const node = programNode({
        identifier: 'myProgram',
        instructions: [transferWithConditionalTarget(conditional)],
        publicKey: '1111',
    });

    // Then rendering fails on that conditional value.
    const error = getCodamaError(CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE, () => visit(node, getRenderMapVisitor()));
    expect(error.context.path.at(-1)).toBe(conditional);
});

test('it compares scalar enum conditions of default values as native enum members', async () => {
    // Given an account defaulting to another one when a scalar enum argument holds a given variant.
    const node = programNode({
        definedTypes: [
            definedTypeNode({
                identifier: 'tokenStandard',
                type: enumTypeNode([enumVariantTypeNode('fungible'), enumVariantTypeNode('programmable')]),
            }),
        ],
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ identifier: 'fallback', isSigner: false, isWritable: false }),
                    instructionAccountNode({
                        defaultValue: conditionalValueNode({
                            condition: dataValueNode('standard'),
                            ifTrue: accountValueNode('fallback'),
                            value: enumValueNode('tokenStandard', 'programmable'),
                        }),
                        identifier: 'record',
                        isSigner: false,
                        isWritable: false,
                    }),
                ],
                data: structTypeNode([
                    structFieldTypeNode({ identifier: 'standard', type: definedTypeLinkNode('tokenStandard') }),
                ]),
                identifier: 'mint',
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the argument is compared with the enum member.
    await renderMapContains(renderMap, 'instructions/mint.ts', ['if (args.standard === TokenStandard.Programmable)']);
});

test('it fails on data union conditions of default values', () => {
    // Given a condition comparing an argument with a variant of a data union, whose instances are never identical.
    const conditional = conditionalValueNode({
        condition: dataValueNode('command'),
        ifTrue: accountValueNode('fallback'),
        value: enumValueNode('command', 'wait', { value: integerValueNode('5') }),
    });
    const node = programNode({
        definedTypes: [
            definedTypeNode({
                identifier: 'command',
                type: enumTypeNode([
                    enumVariantTypeNode('stop'),
                    enumVariantTypeNode('wait', { data: integerTypeNode('u8') }),
                ]),
            }),
        ],
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ identifier: 'fallback', isSigner: false, isWritable: false }),
                    instructionAccountNode({
                        defaultValue: conditional,
                        identifier: 'target',
                        isSigner: false,
                        isWritable: false,
                    }),
                ],
                data: structTypeNode([
                    structFieldTypeNode({ identifier: 'command', type: definedTypeLinkNode('command') }),
                ]),
                identifier: 'run',
            }),
        ],
        publicKey: '1111',
    });

    // Then rendering fails on that conditional value.
    const error = getCodamaError(CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE, () => visit(node, getRenderMapVisitor()));
    expect(error.context.path.at(-1)).toBe(conditional);
});

test('it parses omitted optional accounts against the program address of the instruction', async () => {
    // Given an instruction with an optional account filled in with the program address when omitted.
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        identifier: 'authority',
                        isOptional: true,
                        isSigner: false,
                        isWritable: false,
                    }),
                ],
                identifier: 'transfer',
                optionalAccountStrategy: 'programId',
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the parse function compares omitted accounts with the address the instruction was built with.
    await renderMapContains(renderMap, 'instructions/transfer.ts', [
        'return accountMeta.address === instruction.programAddress ? undefined : accountMeta;',
    ]);
});

test('it defaults account type parameters to the addresses builders fill in', async () => {
    // Given an account defaulting to an injected program address, and one with a resolver
    // alongside a public key default.
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        defaultValue: injectedValueNode({ key: 'tokenProgram' }),
                        identifier: 'tokenProgram',
                        isSigner: false,
                        isWritable: false,
                    }),
                    instructionAccountNode({
                        defaultValue: publicKeyValueNode('2222'),
                        identifier: 'vault',
                        isSigner: false,
                        isWritable: true,
                        plugins: [pluginNode('codama.resolver', { name: 'resolveVault' })],
                    }),
                ],
                identifier: 'transfer',
                provides: [providedNode('tokenProgram', programIdValueNode())],
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the injected default is resolved to its address, whilst the resolved account has none.
    await renderMapContains(renderMap, 'instructions/transfer.ts', [
        "TAccountTokenProgram extends string | AccountMeta<string> = '1111'",
        'TAccountVault extends string | AccountMeta<string> = string',
    ]);
});

test('it requires omitted data fields defaulting to the payer in instruction builders', async () => {
    // Given an instruction whose only input is an omitted data field defaulting to the payer.
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                data: structTypeNode([
                    structFieldTypeNode({
                        defaultValue: injectedValueNode({ key: 'owner' }),
                        defaultValueStrategy: 'omitted',
                        identifier: 'owner',
                        type: publicKeyTypeNode(),
                    }),
                ]),
                identifier: 'claim',
                provides: [providedNode('owner', payerValueNode())],
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the builder has no payer to fill the field in with, so it requires it in its input.
    await renderMapContains(renderMap, 'instructions/claim.ts', [
        "export type ClaimInput = { owner: ClaimInstructionDataArgs['owner']; };",
        'input: ClaimInput,',
        'const args = { ...input };',
    ]);
    await renderMapDoesNotContain(renderMap, 'instructions/claim.ts', ['owner?:']);
});

test('it renames arguments named like an account in the builder whose input includes them only', async () => {
    // Given an omitted `vault` data field, filled in from a PDA asynchronously, next to a `vault` account.
    const node = programNode({
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                accounts: [instructionAccountNode({ identifier: 'vault', isSigner: false, isWritable: true })],
                data: structTypeNode([
                    structFieldTypeNode({
                        defaultValue: injectedValueNode({ key: 'vault' }),
                        defaultValueStrategy: 'omitted',
                        identifier: 'vault',
                        type: publicKeyTypeNode(),
                    }),
                ]),
                identifier: 'transfer',
                provides: [providedNode('vault', pdaValueNode('vault'))],
            }),
        ],
        pdas: [pdaNode({ identifier: 'vault', seeds: [] })],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const [asyncFunction, syncFunction] = (renderMap.get('instructions/transfer.ts')?.content ?? '').split(
        'export type TransferInput<',
    );

    // Then the synchronous builder, which requires the field, renames it, whilst the asynchronous
    // builder, which fills it in, leaves its input alone and keeps the account out of the args.
    await codeContains(syncFunction, ['vaultArg: TransferInstructionDataArgs["vault"];', 'vault: input.vaultArg']);
    await codeDoesNotContain(asyncFunction, ['vaultArg']);
    await codeContains(asyncFunction, [
        'const { vault: _vault, ...originalArgs } = { ...input };',
        'args.vault = (await findVaultPda({ programAddress }))[0];',
    ]);
});
