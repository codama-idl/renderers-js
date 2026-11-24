import {
    accountNode,
    constantPdaSeedNodeFromString,
    integerTypeNode,
    optionTypeNode,
    pdaLinkNode,
    pdaNode,
    programNode,
    publicKeyTypeNode,
    rootNode,
    variablePdaSeedNode,
} from '@codama/nodes';
import { visit } from '@codama/visitors-core';
import { expect, test } from 'vitest';

import { getRenderMapVisitor } from '../src';
import {
    renderMapContains,
    renderMapContainsImports,
    renderMapDoesNotContain,
    renderMapDoesNotContainImports,
} from './_setup';

test('it renders a PDA helper function and its input type', async () => {
    // Given the following PDA node.
    const node = programNode({
        identifier: 'myProgram',
        pdas: [
            pdaNode({
                identifier: 'foo',
                seeds: [
                    constantPdaSeedNodeFromString('utf8', 'myPrefix'),
                    variablePdaSeedNode('myAccount', publicKeyTypeNode()),
                    variablePdaSeedNode('myArg', integerTypeNode('u64')),
                ],
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following PDA function using an empty seeds array to derive the address.
    await renderMapContains(renderMap, 'pdas/foo.ts', [
        'export type FooSeeds = { myAccount: Address | HasAddress; myArg: number | bigint; }',
        'export async function findFooPda',
        'config: { programAddress?: Address | HasAddress | undefined } = {}',
        "const { programAddress: programAddressInput = '1111' as Address<'1111'> } = config;",
        "const programAddress = typeof programAddressInput === 'string' ? programAddressInput : programAddressInput.address;",
        "[ getUtf8Encoder().encode('myPrefix'), getAddressEncoder().encode(seeds.myAccount), getU64Encoder().encode(seeds.myArg) ]",
    ]);
});

test('it renders a PDA helper function with a default program address', async () => {
    // Given the following PDA node with a default program address.
    const node = programNode({
        identifier: 'myProgram',
        pdas: [
            pdaNode({
                identifier: 'foo',
                programId: 'myProgramId',
                seeds: [constantPdaSeedNodeFromString('utf8', 'myPrefix')],
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following PDA function using the programId as the default program address.
    await renderMapContains(renderMap, 'pdas/foo.ts', [
        'export async function findFooPda',
        'config: { programAddress?: Address | HasAddress | undefined } = {}',
        "const { programAddress: programAddressInput = 'myProgramId' as Address<'myProgramId'> } = config;",
        "const programAddress = typeof programAddressInput === 'string' ? programAddressInput : programAddressInput.address;",
    ]);
});

test('it renders an empty array of seeds for seedless PDAs', async () => {
    // Given the following program with 1 account and 1 pda with empty seeds.
    const node = programNode({
        identifier: 'myProgram',
        pdas: [pdaNode({ identifier: 'foo', seeds: [] })],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following PDA function using an empty seeds array to derive the address.
    await renderMapContains(renderMap, 'pdas/foo.ts', [
        'export async function findFooPda',
        'getProgramDerivedAddress({ programAddress, seeds: [] })',
    ]);
});

test('it does not import strict types for variable seeds', async () => {
    // Given the following PDA node.
    const node = programNode({
        identifier: 'myProgram',
        pdas: [
            pdaNode({
                identifier: 'foo',
                seeds: [variablePdaSeedNode('myAccount', optionTypeNode(publicKeyTypeNode()))],
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the `Option` string type should not be imported.
    await renderMapDoesNotContainImports(renderMap, 'pdas/foo.ts', {
        '@solana/kit': ['type Option'],
    });

    // But the `OptionOrNullable` loose type should be imported.
    await renderMapContainsImports(renderMap, 'pdas/foo.ts', {
        '@solana/kit': ['type OptionOrNullable'],
    });
});

test('it renders internal PDAs without exporting them', async () => {
    // Given a program with a public and an internal PDA.
    const node = rootNode(
        programNode({
            identifier: 'myProgram',
            pdas: [pdaNode({ identifier: 'publicPda', seeds: [] }), pdaNode({ identifier: 'secretPda', seeds: [] })],
            publicKey: '1111',
        }),
    );

    // When we render it with the second PDA marked as internal.
    const renderMap = visit(node, getRenderMapVisitor({ internalNodes: ['secretPda'] }));

    // Then the internal PDA is rendered but not exported.
    expect(renderMap.has('pdas/secret-pda.ts')).toBe(true);
    await renderMapContains(renderMap, 'pdas/index.ts', "export * from './public-pda';");
    await renderMapDoesNotContain(renderMap, 'pdas/index.ts', 'secret-pda');
});

test('it exports PDAs from the root barrel when they are the only nodes to export', async () => {
    // Given an internal program holding a single PDA.
    const node = rootNode(
        programNode({
            identifier: 'myProgram',
            pdas: [pdaNode({ identifier: 'counter', seeds: [] })],
            publicKey: '1111',
        }),
    );

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor({ internalNodes: ['myProgram'] }));

    // Then the root barrel exports the PDAs.
    await renderMapContains(renderMap, 'index.ts', "export * from './pdas';");
});

test('it imports internal PDAs from their own file and leaves them out of the program plugin', async () => {
    // Given an account whose PDA is internal.
    const node = rootNode(
        programNode({
            accounts: [accountNode({ identifier: 'vault', pda: pdaLinkNode('secretPda') })],
            identifier: 'myProgram',
            pdas: [pdaNode({ identifier: 'secretPda', seeds: [] })],
            publicKey: '1111',
        }),
    );

    // When we render it with the PDA marked as internal.
    const renderMap = visit(node, getRenderMapVisitor({ internalNodes: ['secretPda'] }));

    // Then the account imports the PDA from its own file, and the plugin does not expose it.
    await renderMapContains(renderMap, 'accounts/vault.ts', ["from '../pdas/secret-pda'"]);
    await renderMapDoesNotContain(renderMap, 'programs/my-program.ts', ['secretPda', "from '../pdas'"]);
});

test('it imports the PDAs of accounts through their link overrides', async () => {
    // Given an account whose PDA is imported from another module.
    const node = rootNode(
        programNode({
            accounts: [accountNode({ identifier: 'vault', pda: pdaLinkNode('vault') })],
            identifier: 'myProgram',
            pdas: [pdaNode({ identifier: 'vault', seeds: [] })],
            publicKey: '1111',
        }),
    );

    // When we render it with a link override for that PDA.
    const renderMap = visit(node, getRenderMapVisitor({ linkOverrides: { pdas: { vault: 'hooked' } } }));

    // Then the account PDA helpers import it from that module.
    await renderMapContains(renderMap, 'accounts/vault.ts', ["import { findVaultPda } from '../../hooked'"]);
});
