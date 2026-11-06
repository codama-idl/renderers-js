import {
    accountNode,
    accountValueNode,
    argumentValueNode,
    constantNode,
    constantPdaSeedNodeFromString,
    definedTypeLinkNode,
    definedTypeNode,
    enumEmptyVariantTypeNode,
    enumTypeNode,
    enumValueNode,
    errorNode,
    eventNode,
    fieldDiscriminatorNode,
    instructionAccountNode,
    instructionArgumentNode,
    instructionNode,
    instructionRemainingAccountsNode,
    numberTypeNode,
    numberValueNode,
    payerValueNode,
    pdaLinkNode,
    pdaNode,
    pdaSeedValueNode,
    pdaValueNode,
    programNode,
    publicKeyTypeNode,
    resolverValueNode,
    RootNode,
    rootNode,
    snakeCase,
    structFieldTypeNode,
    structFieldValueNode,
    structTypeNode,
    structValueNode,
    variablePdaSeedNode,
} from '@codama/nodes';
import { getFromRenderMap } from '@codama/renderers-core';
import { visit } from '@codama/visitors-core';
import { expect, test } from 'vitest';

import { getRenderMapVisitor } from '../src';
import { GetRenderMapOptions } from '../src/utils';

/**
 * A program exercising every place where the renderer emits the name of a node:
 * file names, barrel exports, codecs, instruction inputs and their default values,
 * PDA seeds, struct value defaults, discriminator constants, errors, constants,
 * events and the program plugin.
 *
 * Instruction inputs defaulting directly to another input (`accountValueNode` or
 * `argumentValueNode`) are left out on purpose: `@codama/visitors-core@1` rebuilds
 * these references through constructors that re-case names, so it cannot resolve
 * them when names are not camelCase. References within PDA seeds and resolver
 * dependencies are kept as given and are therefore exercised.
 */
function getProgram(): RootNode {
    return rootNode(
        programNode({
            accounts: [
                accountNode({
                    data: structTypeNode([
                        structFieldTypeNode({
                            defaultValue: numberValueNode(1),
                            defaultValueStrategy: 'omitted',
                            name: 'accountKey',
                            type: numberTypeNode('u8'),
                        }),
                        structFieldTypeNode({ name: 'tokenOwner', type: publicKeyTypeNode() }),
                        structFieldTypeNode({
                            defaultValue: structValueNode([structFieldValueNode('maxFee', numberValueNode(42))]),
                            name: 'feeConfig',
                            type: definedTypeLinkNode('feeConfig'),
                        }),
                        structFieldTypeNode({
                            defaultValue: enumValueNode('accountState', 'frozenState'),
                            name: 'accountState',
                            type: definedTypeLinkNode('accountState'),
                        }),
                    ]),
                    discriminators: [fieldDiscriminatorNode('accountKey')],
                    name: 'tokenAccount',
                    pda: pdaLinkNode('tokenAccount'),
                }),
            ],
            constants: [
                constantNode('maxSupply', numberTypeNode('u64'), numberValueNode(1000)),
                constantNode('defaultDecimals', numberTypeNode('u8'), numberValueNode(9)),
            ],
            definedTypes: [
                definedTypeNode({
                    name: 'feeConfig',
                    type: structTypeNode([structFieldTypeNode({ name: 'maxFee', type: numberTypeNode('u16') })]),
                }),
                definedTypeNode({
                    name: 'accountState',
                    type: enumTypeNode([
                        enumEmptyVariantTypeNode('activeState'),
                        enumEmptyVariantTypeNode('frozenState'),
                    ]),
                }),
            ],
            errors: [
                errorNode({ code: 1, message: 'Invalid owner', name: 'invalidOwner' }),
                errorNode({ code: 0, message: 'Account frozen', name: 'accountFrozen' }),
            ],
            events: [
                eventNode({
                    data: structTypeNode([
                        structFieldTypeNode({
                            defaultValue: numberValueNode(7),
                            defaultValueStrategy: 'omitted',
                            name: 'eventKey',
                            type: numberTypeNode('u8'),
                        }),
                        structFieldTypeNode({ name: 'transferredAmount', type: numberTypeNode('u64') }),
                    ]),
                    discriminators: [fieldDiscriminatorNode('eventKey')],
                    name: 'transferEvent',
                }),
            ],
            instructions: [
                instructionNode({
                    accounts: [
                        instructionAccountNode({ isSigner: true, isWritable: true, name: 'tokenOwner' }),
                        instructionAccountNode({
                            defaultValue: payerValueNode(),
                            isSigner: true,
                            isWritable: true,
                            name: 'feePayer',
                        }),
                        instructionAccountNode({
                            defaultValue: pdaValueNode('tokenAccount', [
                                pdaSeedValueNode('tokenOwner', accountValueNode('tokenOwner')),
                            ]),
                            isSigner: false,
                            isWritable: true,
                            name: 'sourceAccount',
                        }),
                        instructionAccountNode({
                            defaultValue: resolverValueNode('resolveDestination', {
                                dependsOn: [accountValueNode('tokenOwner'), argumentValueNode('useAta')],
                            }),
                            isSigner: false,
                            isWritable: true,
                            name: 'destinationAccount',
                        }),
                    ],
                    arguments: [
                        instructionArgumentNode({
                            defaultValue: numberValueNode(3),
                            defaultValueStrategy: 'omitted',
                            name: 'instructionKey',
                            type: numberTypeNode('u8'),
                        }),
                        instructionArgumentNode({ name: 'transferAmount', type: numberTypeNode('u64') }),
                        // Conflicts with the `tokenOwner` account and must be renamed in the input type.
                        instructionArgumentNode({ name: 'tokenOwner', type: numberTypeNode('u64') }),
                    ],
                    discriminators: [fieldDiscriminatorNode('instructionKey')],
                    extraArguments: [instructionArgumentNode({ name: 'useAta', type: numberTypeNode('u8') })],
                    name: 'transferTokens',
                    remainingAccounts: [
                        instructionRemainingAccountsNode(argumentValueNode('extraSigners'), { isSigner: true }),
                    ],
                }),
            ],
            name: 'myProgram',
            pdas: [
                pdaNode({
                    name: 'tokenAccount',
                    seeds: [
                        constantPdaSeedNodeFromString('utf8', 'token'),
                        variablePdaSeedNode('tokenOwner', publicKeyTypeNode()),
                    ],
                }),
            ],
            publicKey: '1111',
        }),
    );
}

/** Rewrites the `name` of every node in the tree to snake_case, references included. */
function withSnakeCaseNames<T>(value: T): T {
    if (Array.isArray(value)) return value.map(withSnakeCaseNames) as T;
    if (typeof value !== 'object' || value === null) return value;
    return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
            key,
            key === 'name' && typeof child === 'string' ? snakeCase(child) : withSnakeCaseNames(child),
        ]),
    ) as T;
}

const options: GetRenderMapOptions = {
    asyncResolvers: ['resolveDestination'],
    internalNodes: ['feeConfig'],
    linkOverrides: { definedTypes: { accountState: 'hooked' } },
    nonScalarEnums: [],
};

test('it renders the same code regardless of how node names are spelled', () => {
    // Given the same program with camelCase names and with snake_case names.
    const camelCaseProgram = getProgram();
    const snakeCaseProgram = withSnakeCaseNames(camelCaseProgram);

    // When we render both.
    const camelCaseRenderMap = visit(camelCaseProgram, getRenderMapVisitor(options));
    const snakeCaseRenderMap = visit(snakeCaseProgram, getRenderMapVisitor(options));

    // Then we expect the same files, with the same content.
    expect([...snakeCaseRenderMap.keys()].sort()).toStrictEqual([...camelCaseRenderMap.keys()].sort());
    camelCaseRenderMap.forEach((_, key) => {
        expect(getFromRenderMap(snakeCaseRenderMap, key).content, `File "${key}" differs.`).toBe(
            getFromRenderMap(camelCaseRenderMap, key).content,
        );
    });
});

test('it emits camelCase names for nodes whose names are not camelCase', () => {
    // Given a program whose names are spelled in snake_case.
    const program = withSnakeCaseNames(getProgram());

    // When we render it.
    const renderMap = visit(program, getRenderMapVisitor(options));

    // Then we expect no snake_case name to leak into the generated code.
    renderMap.forEach(({ content }, key) => {
        expect(content, `File "${key}" leaks a snake_case name.`).not.toMatch(
            /\b(token_owner|fee_config|account_state|max_fee|source_account|transfer_tokens|my_program|transfer_event)\b/,
        );
    });
});
