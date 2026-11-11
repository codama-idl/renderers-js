import {
    accountNode,
    booleanTypeNode,
    constantDiscriminatorNode,
    constantValueNodeFromBytes,
    definedTypeLinkNode,
    definedTypeNode,
    enumTypeNode,
    enumValueNode,
    enumVariantTypeNode,
    fieldDiscriminatorNode,
    integerTypeNode,
    integerValueNode,
    pdaLinkNode,
    pdaNode,
    programNode,
    publicKeyTypeNode,
    structFieldTypeNode,
    structTypeNode,
    variablePdaSeedNode,
} from '@codama/nodes';
import { visit } from '@codama/visitors-core';
import { test } from 'vitest';

import { getRenderMapVisitor } from '../src';
import { renderMapContains, renderMapContainsImports } from './_setup';

test('it renders PDA helpers for PDA with no seeds', async () => {
    // Given the following program with 1 account and 1 pda with empty seeds.
    const node = programNode({
        accounts: [accountNode({ identifier: 'foo', pda: pdaLinkNode('bar') })],
        identifier: 'myProgram',
        pdas: [pdaNode({ identifier: 'bar', seeds: [] })],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following fetch helper functions accepting RPCs or clients and delegating to findBarPda.
    await renderMapContains(renderMap, 'accounts/foo.ts', [
        'export async function fetchFooFromSeeds',
        'export async function fetchMaybeFooFromSeeds',
        'rpc: | Parameters<typeof fetchEncodedAccount>[0] | ClientWithRpc<GetAccountInfoApi>',
        'config: FetchAccountConfig & { programAddress?: Address | HasAddress } = {}',
        'await findBarPda({ programAddress })',
    ]);
    await renderMapContainsImports(renderMap, 'accounts/foo.ts', {
        '@solana/kit': ['type Address', 'type ClientWithRpc', 'type GetAccountInfoApi', 'type HasAddress'],
    });
});

test('it renders PDA helpers for PDA with variable seeds', async () => {
    // Given the following program with 1 account and 1 pda with a variable seed.
    const node = programNode({
        accounts: [accountNode({ identifier: 'foo', pda: pdaLinkNode('bar') })],
        identifier: 'myProgram',
        pdas: [pdaNode({ identifier: 'bar', seeds: [variablePdaSeedNode('owner', publicKeyTypeNode())] })],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the seeds type to be imported as a type-only import
    // so that the generated code is compatible with `verbatimModuleSyntax`.
    await renderMapContains(renderMap, 'accounts/foo.ts', [
        "import { findBarPda, type BarSeeds } from '../pdas'",
        'seeds: BarSeeds',
        'await findBarPda(seeds, { programAddress })',
    ]);
});

test('it renders fetch helpers accepting address-bearing objects and clients', async () => {
    // Given the following program with 1 account.
    const node = programNode({
        accounts: [accountNode({ identifier: 'foo' })],
        identifier: 'myProgram',
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the fetch helpers to accept RPCs or clients exposing one, and addresses or
    // address-bearing objects, and to unwrap both before fetching the encoded accounts.
    await renderMapContains(renderMap, 'accounts/foo.ts', [
        'export async function fetchFoo<TAddress extends string = string>( rpc: | Parameters<typeof fetchEncodedAccount>[0] | ClientWithRpc<GetAccountInfoApi>, address: Address<TAddress> | HasAddress<TAddress>, config?: FetchAccountConfig ): Promise<Account<Foo, TAddress>>',
        'export async function fetchMaybeFoo<TAddress extends string = string>( rpc: | Parameters<typeof fetchEncodedAccount>[0] | ClientWithRpc<GetAccountInfoApi>, address: Address<TAddress> | HasAddress<TAddress>, config?: FetchAccountConfig ): Promise<MaybeAccount<Foo, TAddress>>',
        "fetchEncodedAccount( 'rpc' in rpc ? rpc.rpc : rpc, typeof address === 'string' ? address : address.address, config )",
        'export async function fetchAllFoo( rpc: | Parameters<typeof fetchEncodedAccounts>[0] | ClientWithRpc<GetMultipleAccountsApi>, addresses: Array<Address | HasAddress>, config?: FetchAccountsConfig ): Promise<Account<Foo>[]>',
        'export async function fetchAllMaybeFoo( rpc: | Parameters<typeof fetchEncodedAccounts>[0] | ClientWithRpc<GetMultipleAccountsApi>, addresses: Array<Address | HasAddress>, config?: FetchAccountsConfig ): Promise<MaybeAccount<Foo>[]>',
        "fetchEncodedAccounts( 'rpc' in rpc ? rpc.rpc : rpc, addresses.map((a) => (typeof a === 'string' ? a : a.address)), config )",
    ]);
    await renderMapContainsImports(renderMap, 'accounts/foo.ts', {
        '@solana/kit': [
            'type Address',
            'type ClientWithRpc',
            'type GetAccountInfoApi',
            'type GetMultipleAccountsApi',
            'type HasAddress',
        ],
    });
});

test('it renders an account with a defined type link as discriminator', async () => {
    // Given the following program with 1 account with a discriminator.
    const node = programNode({
        accounts: [
            accountNode({
                data: structTypeNode([
                    structFieldTypeNode({
                        defaultValue: enumValueNode('key', 'Asset'),
                        defaultValueStrategy: 'omitted',
                        identifier: 'key',
                        type: definedTypeLinkNode('Key'),
                    }),
                    structFieldTypeNode({
                        identifier: 'mutable',
                        type: booleanTypeNode(),
                    }),
                    structFieldTypeNode({
                        identifier: 'owner',
                        type: publicKeyTypeNode(),
                    }),
                ]),
                discriminators: [fieldDiscriminatorNode('key', { offset: 0 })],
                identifier: 'asset',
            }),
        ],
        definedTypes: [
            definedTypeNode({
                identifier: 'key',
                type: enumTypeNode([enumVariantTypeNode('Uninitialized'), enumVariantTypeNode('Asset')]),
            }),
        ],
        identifier: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following import list with a reference to the disciminator type.
    await renderMapContains(renderMap, 'accounts/asset.ts', ['import { getKeyDecoder, getKeyEncoder, Key }']);
});

test('it renders constants for account field discriminators', async () => {
    // Given the following account with a field discriminator.
    const node = programNode({
        accounts: [
            accountNode({
                data: structTypeNode([
                    structFieldTypeNode({
                        defaultValue: integerValueNode('42'),
                        defaultValueStrategy: 'omitted',
                        identifier: 'myDiscriminator',
                        type: integerTypeNode('u8'),
                    }),
                ]),
                discriminators: [fieldDiscriminatorNode('myDiscriminator')],
                identifier: 'myAccount',
            }),
        ],
        identifier: 'myProgram',
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following constant and function to be rendered
    // And we expect the field default value to use that constant.
    await renderMapContains(renderMap, 'accounts/my-account.ts', [
        'export const MY_ACCOUNT_MY_DISCRIMINATOR = 42;',
        'export function getMyAccountMyDiscriminatorBytes(): ReadonlyUint8Array { return getU8Encoder().encode(MY_ACCOUNT_MY_DISCRIMINATOR); }',
        '(value) => ({ ...value, myDiscriminator: MY_ACCOUNT_MY_DISCRIMINATOR })',
    ]);
});

test('it renders constants for bigint account field discriminators', async () => {
    const node = programNode({
        accounts: [
            accountNode({
                data: structTypeNode([
                    structFieldTypeNode({
                        defaultValue: integerValueNode('7'),
                        defaultValueStrategy: 'omitted',
                        identifier: 'myDiscriminator',
                        type: integerTypeNode('u64'),
                    }),
                ]),
                discriminators: [fieldDiscriminatorNode('myDiscriminator')],
                identifier: 'myAccount',
            }),
        ],
        identifier: 'myProgram',
        publicKey: '1111',
    });
    const renderMap = visit(node, getRenderMapVisitor());
    await renderMapContains(renderMap, 'accounts/my-account.ts', [
        'export const MY_ACCOUNT_MY_DISCRIMINATOR = 7n;',
        'export function getMyAccountMyDiscriminatorBytes(): ReadonlyUint8Array { return getU64Encoder().encode(MY_ACCOUNT_MY_DISCRIMINATOR); }',
    ]);
});

test('it renders constants for account constant discriminators', async () => {
    // Given the following account with two constant discriminators.
    const node = programNode({
        accounts: [
            accountNode({
                discriminators: [
                    constantDiscriminatorNode(constantValueNodeFromBytes('base16', '1111')),
                    constantDiscriminatorNode(constantValueNodeFromBytes('base16', '2222'), { offset: 2 }),
                ],
                identifier: 'myAccount',
            }),
        ],
        identifier: 'myProgram',
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following constants and functions to be rendered.
    await renderMapContains(renderMap, 'accounts/my-account.ts', [
        'export const MY_ACCOUNT_DISCRIMINATOR: ReadonlyUint8Array = new Uint8Array([ 17, 17 ]);',
        'export function getMyAccountDiscriminatorBytes(): ReadonlyUint8Array { return getBytesEncoder().encode(MY_ACCOUNT_DISCRIMINATOR); }',
        'export const MY_ACCOUNT_DISCRIMINATOR2: ReadonlyUint8Array = new Uint8Array([ 34, 34 ]);',
        'export function getMyAccountDiscriminator2Bytes(): ReadonlyUint8Array { return getBytesEncoder().encode(MY_ACCOUNT_DISCRIMINATOR2); }',
    ]);
});

test('it can extracts account data and import it from another source', async () => {
    // Given the following account.
    const node = programNode({
        accounts: [
            accountNode({
                data: structTypeNode([structFieldTypeNode({ identifier: 'value', type: integerTypeNode('u32') })]),
                identifier: 'counter',
            }),
        ],
        identifier: 'myProgram',
        publicKey: '1111',
    });

    // When we render it using the following custom account data options.
    const renderMap = visit(
        node,
        getRenderMapVisitor({
            customAccountData: [
                {
                    extract: true,
                    importFrom: 'someModule',
                    name: 'counter',
                },
            ],
        }),
    );

    // Then we expect the account data to be fetched from the hooked directory (by default).
    await renderMapContainsImports(renderMap, 'accounts/counter.ts', {
        someModule: ['getCounterAccountDataDecoder', 'type CounterAccountData'],
    });

    // And we expect the existing account data to be extracted into a new type
    // so it can be imported from the hooked directory.
    await renderMapContains(renderMap, 'types/counter-account-data.ts', [
        'export type CounterAccountData',
        'export type CounterAccountDataArgs',
        'export function getCounterAccountDataEncoder',
        'export function getCounterAccountDataDecoder',
        'export function getCounterAccountDataCodec',
    ]);
});
