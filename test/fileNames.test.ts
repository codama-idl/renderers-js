import {
    accountNode,
    constantNode,
    definedTypeLinkNode,
    definedTypeNode,
    enumEmptyVariantTypeNode,
    enumTypeNode,
    enumValueNode,
    errorNode,
    eventNode,
    instructionAccountNode,
    instructionNode,
    numberTypeNode,
    pdaLinkNode,
    pdaNode,
    programNode,
    publicKeyTypeNode,
    rootNode,
    structFieldTypeNode,
    structTypeNode,
} from '@codama/nodes';
import { visit } from '@codama/visitors-core';
import { expect, test } from 'vitest';

import { getRenderMapVisitor } from '../src';
import { renderMapContains } from './_setup';

const node = rootNode(
    programNode({
        accounts: [
            accountNode({
                data: structTypeNode([
                    structFieldTypeNode({ name: 'authority', type: publicKeyTypeNode() }),
                    structFieldTypeNode({ name: 'status', type: definedTypeLinkNode('accountStatus') }),
                ]),
                name: 'counterAccount',
                pda: pdaLinkNode('counterAccount'),
            }),
        ],
        constants: [
            constantNode(
                'defaultStatus',
                definedTypeLinkNode('accountStatus'),
                enumValueNode('accountStatus', 'active'),
            ),
        ],
        definedTypes: [
            definedTypeNode({
                name: 'accountStatus',
                type: enumTypeNode([enumEmptyVariantTypeNode('active'), enumEmptyVariantTypeNode('paused')]),
            }),
        ],
        errors: [errorNode({ code: 0, message: 'Invalid authority', name: 'invalidAuthority' })],
        events: [
            eventNode({
                data: structTypeNode([structFieldTypeNode({ name: 'count', type: numberTypeNode('u64') })]),
                name: 'counterIncremented',
            }),
        ],
        instructions: [
            instructionNode({
                accounts: [instructionAccountNode({ isSigner: false, isWritable: true, name: 'counterAccount' })],
                name: 'incrementCounter',
            }),
        ],
        name: 'myProgram',
        pdas: [pdaNode({ name: 'counterAccount', seeds: [] })],
        publicKey: '1111',
    }),
);

test('it names generated files in camelCase by default', () => {
    // When we render the program without overriding the file name transformer.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect every generated file to be named in camelCase.
    expect([...renderMap.keys()].sort()).toStrictEqual([
        'accounts/counterAccount.ts',
        'accounts/index.ts',
        'constants/index.ts',
        'constants/myProgram.ts',
        'errors/index.ts',
        'errors/myProgram.ts',
        'events/counterIncremented.ts',
        'events/index.ts',
        'index.ts',
        'instructions/incrementCounter.ts',
        'instructions/index.ts',
        'pdas/counterAccount.ts',
        'pdas/index.ts',
        'programs/index.ts',
        'programs/myProgram.ts',
        'types/accountStatus.ts',
        'types/index.ts',
    ]);
});

test('it names generated files and their re-exports using the fileName transformer', async () => {
    // When we render the program using kebab-case file names.
    const renderMap = visit(
        node,
        getRenderMapVisitor({ nameTransformers: { fileName: (name, { kebabCase }) => kebabCase(name) } }),
    );

    // Then we expect every generated file to be named in kebab-case.
    expect([...renderMap.keys()].sort()).toStrictEqual([
        'accounts/counter-account.ts',
        'accounts/index.ts',
        'constants/index.ts',
        'constants/my-program.ts',
        'errors/index.ts',
        'errors/my-program.ts',
        'events/counter-incremented.ts',
        'events/index.ts',
        'index.ts',
        'instructions/increment-counter.ts',
        'instructions/index.ts',
        'pdas/counter-account.ts',
        'pdas/index.ts',
        'programs/index.ts',
        'programs/my-program.ts',
        'types/account-status.ts',
        'types/index.ts',
    ]);

    // And we expect the barrels to re-export the renamed files.
    await renderMapContains(renderMap, 'accounts/index.ts', "export * from './counter-account';");
    await renderMapContains(renderMap, 'constants/index.ts', "export * from './my-program';");
    await renderMapContains(renderMap, 'errors/index.ts', "export * from './my-program';");
    await renderMapContains(renderMap, 'events/index.ts', "export * from './counter-incremented';");
    await renderMapContains(renderMap, 'instructions/index.ts', "export * from './increment-counter';");
    await renderMapContains(renderMap, 'pdas/index.ts', "export * from './counter-account';");
    await renderMapContains(renderMap, 'programs/index.ts', "export * from './my-program';");
    await renderMapContains(renderMap, 'types/index.ts', "export * from './account-status';");

    // And we expect the generated code itself to be unchanged.
    await renderMapContains(renderMap, 'accounts/counter-account.ts', [
        'export type CounterAccount = ',
        "from '../pdas'",
        "from '../types'",
    ]);
});
