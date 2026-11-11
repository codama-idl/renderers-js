import { getFromRenderMap } from '@codama/fragments';
import { snakeCase } from '@codama/fragments/casing';
import {
    accountNode,
    accountValueNode,
    constantNode,
    constantPdaSeedNodeFromString,
    dataValueNode,
    definedTypeLinkNode,
    definedTypeNode,
    enumTypeNode,
    enumValueNode,
    enumVariantTypeNode,
    errorNode,
    eventNode,
    fieldDiscriminatorNode,
    instructionAccountNode,
    instructionNode,
    instructionRemainingAccountsNode,
    integerTypeNode,
    integerValueNode,
    payerValueNode,
    pdaLinkNode,
    pdaNode,
    pdaSeedValueNode,
    pdaValueNode,
    pluginNode,
    programNode,
    publicKeyTypeNode,
    rootNode,
    type RootNode,
    structFieldTypeNode,
    structFieldValueNode,
    structTypeNode,
    structValueNode,
    variablePdaSeedNode,
} from '@codama/nodes';
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
 * References between nodes, such as PDA seeds, injection keys, discriminator paths and
 * resolver dependencies, are snake-cased along with the nodes they point to.
 */
function getProgram(): RootNode {
    return rootNode(
        programNode({
            accounts: [
                accountNode({
                    data: structTypeNode([
                        structFieldTypeNode({
                            defaultValue: integerValueNode('1'),
                            defaultValueStrategy: 'omitted',
                            identifier: 'accountKey',
                            type: integerTypeNode('u8'),
                        }),
                        structFieldTypeNode({ identifier: 'tokenOwner', type: publicKeyTypeNode() }),
                        structFieldTypeNode({
                            defaultValue: structValueNode([structFieldValueNode('maxFee', integerValueNode('42'))]),
                            identifier: 'feeConfig',
                            type: definedTypeLinkNode('feeConfig'),
                        }),
                        structFieldTypeNode({
                            defaultValue: enumValueNode('accountState', 'frozenState'),
                            identifier: 'accountState',
                            type: definedTypeLinkNode('accountState'),
                        }),
                        // Links to a type outside the tree, so its scalar-ness comes from `nonScalarEnums`.
                        structFieldTypeNode({
                            defaultValue: enumValueNode('externalState', 'pendingState'),
                            identifier: 'externalState',
                            type: definedTypeLinkNode('externalState'),
                        }),
                    ]),
                    discriminators: [fieldDiscriminatorNode('accountKey')],
                    identifier: 'tokenAccount',
                    pda: pdaLinkNode('tokenAccount'),
                }),
            ],
            constants: [
                constantNode('maxSupply', integerTypeNode('u64'), integerValueNode('1000')),
                constantNode('defaultDecimals', integerTypeNode('u8'), integerValueNode('9')),
            ],
            definedTypes: [
                definedTypeNode({
                    identifier: 'feeConfig',
                    type: structTypeNode([structFieldTypeNode({ identifier: 'maxFee', type: integerTypeNode('u16') })]),
                }),
                definedTypeNode({
                    identifier: 'accountState',
                    type: enumTypeNode([enumVariantTypeNode('activeState'), enumVariantTypeNode('frozenState')]),
                }),
            ],
            errors: [
                errorNode({ code: 1, identifier: 'invalidOwner', message: 'Invalid owner' }),
                errorNode({ code: 0, identifier: 'accountFrozen', message: 'Account frozen' }),
            ],
            events: [
                eventNode({
                    data: structTypeNode([
                        structFieldTypeNode({
                            defaultValue: integerValueNode('7'),
                            defaultValueStrategy: 'omitted',
                            identifier: 'eventKey',
                            type: integerTypeNode('u8'),
                        }),
                        structFieldTypeNode({ identifier: 'transferredAmount', type: integerTypeNode('u64') }),
                    ]),
                    discriminators: [fieldDiscriminatorNode('eventKey')],
                    identifier: 'transferEvent',
                }),
            ],
            identifier: 'myProgram',
            instructions: [
                instructionNode({
                    accounts: [
                        instructionAccountNode({ identifier: 'tokenOwner', isSigner: true, isWritable: true }),
                        instructionAccountNode({
                            defaultValue: payerValueNode(),
                            identifier: 'feePayer',
                            isSigner: true,
                            isWritable: true,
                        }),
                        instructionAccountNode({
                            defaultValue: pdaValueNode('tokenAccount', {
                                seeds: [pdaSeedValueNode('tokenOwner', accountValueNode('tokenOwner'))],
                            }),
                            identifier: 'sourceAccount',
                            isSigner: false,
                            isWritable: true,
                        }),
                        instructionAccountNode({
                            identifier: 'destinationAccount',
                            isSigner: false,
                            isWritable: true,
                            plugins: [
                                pluginNode('codama.resolver', {
                                    dependsOn: ['accounts.tokenOwner', 'data.useAta'],
                                    name: 'resolveDestination',
                                }),
                            ],
                        }),
                        instructionAccountNode({
                            defaultValue: accountValueNode('tokenOwner'),
                            identifier: 'closeAuthority',
                            isSigner: false,
                            isWritable: false,
                        }),
                    ],
                    data: structTypeNode([
                        structFieldTypeNode({
                            defaultValue: integerValueNode('3'),
                            defaultValueStrategy: 'omitted',
                            identifier: 'instructionKey',
                            type: integerTypeNode('u8'),
                        }),
                        structFieldTypeNode({ identifier: 'transferAmount', type: integerTypeNode('u64') }),
                        // Conflicts with the `tokenOwner` account and must be renamed in the input type.
                        structFieldTypeNode({ identifier: 'tokenOwner', type: integerTypeNode('u64') }),
                    ]),
                    discriminators: [fieldDiscriminatorNode('instructionKey')],
                    identifier: 'transferTokens',
                    plugins: [
                        pluginNode('codama.extraArgument', { identifier: 'useAta', type: integerTypeNode('u8') }),
                        pluginNode('codama.extraArgument', {
                            defaultValue: dataValueNode('transferAmount'),
                            identifier: 'expectedAmount',
                            type: integerTypeNode('u64'),
                        }),
                    ],
                    remainingAccounts: [instructionRemainingAccountsNode('extraSigners', { isSigner: true })],
                }),
            ],
            pdas: [
                pdaNode({
                    identifier: 'tokenAccount',
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

/**
 * Rewrites every identifier of the tree to snake_case, references included: node
 * identifiers, injection keys, resolver names, data and discriminator paths, and
 * resolver dependencies such as `accounts.tokenOwner`.
 */
function withSnakeCaseNames<T>(value: T): T {
    if (Array.isArray(value)) return value.map(withSnakeCaseNames) as T;
    if (typeof value !== 'object' || value === null) return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, withSnakeCaseName(key, child)])) as T;
}

function withSnakeCaseName(key: string, value: unknown): unknown {
    if (typeof value === 'string' && ['identifier', 'key', 'name'].includes(key)) return snakeCase(value);
    if (typeof value === 'string' && key === 'path') return value.split('.').map(snakeCase).join('.');
    if (key === 'dependsOn' && Array.isArray(value)) {
        return value.map((dependency: string) => {
            const [root, ...rest] = dependency.split('.');
            return [root, ...rest.map(snakeCase)].join('.');
        });
    }
    return withSnakeCaseNames(value);
}

const options: GetRenderMapOptions = {
    asyncResolvers: ['resolveDestination'],
    internalNodes: ['feeConfig'],
    linkOverrides: { definedTypes: { accountState: 'hooked', externalState: 'hooked' } },
    nonScalarEnums: ['externalState'],
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
            /\b(token_owner|fee_config|account_state|external_state|max_fee|source_account|transfer_tokens|my_program|transfer_event|close_authority|expected_amount|transfer_amount)\b/,
        );
    });
});
