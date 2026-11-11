import {
    accountNode,
    constantNode,
    definedTypeLinkNode,
    definedTypeNode,
    enumTypeNode,
    enumValueNode,
    enumVariantTypeNode,
    errorNode,
    eventNode,
    instructionAccountNode,
    instructionNode,
    integerTypeNode,
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
                    structFieldTypeNode({ identifier: 'authority', type: publicKeyTypeNode() }),
                    structFieldTypeNode({ identifier: 'status', type: definedTypeLinkNode('accountStatus') }),
                ]),
                identifier: 'counterAccount',
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
                identifier: 'accountStatus',
                type: enumTypeNode([enumVariantTypeNode('active'), enumVariantTypeNode('paused')]),
            }),
        ],
        errors: [errorNode({ code: 0, identifier: 'invalidAuthority', message: 'Invalid authority' })],
        events: [
            eventNode({
                data: structTypeNode([structFieldTypeNode({ identifier: 'count', type: integerTypeNode('u64') })]),
                identifier: 'counterIncremented',
            }),
        ],
        identifier: 'myProgram',
        instructions: [
            instructionNode({
                accounts: [instructionAccountNode({ identifier: 'counterAccount', isSigner: false, isWritable: true })],
                identifier: 'incrementCounter',
            }),
        ],
        pdas: [pdaNode({ identifier: 'counterAccount', seeds: [] })],
        publicKey: '1111',
    }),
);

test('it names generated files in kebab-case by default', async () => {
    // When we render the program without overriding the file name transformer.
    const renderMap = visit(node, getRenderMapVisitor());

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

    // And we expect the barrels to re-export them.
    await renderMapContains(renderMap, 'accounts/index.ts', "export * from './counter-account';");
    await renderMapContains(renderMap, 'instructions/index.ts', "export * from './increment-counter';");
});

test('it names generated files and their re-exports using the fileName transformer', async () => {
    // When we render the program using camelCase file names.
    const renderMap = visit(
        node,
        getRenderMapVisitor({ nameTransformers: { fileName: (name, { camelCase }) => camelCase(name) } }),
    );

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

    // And we expect the barrels to re-export the renamed files.
    await renderMapContains(renderMap, 'accounts/index.ts', "export * from './counterAccount';");
    await renderMapContains(renderMap, 'constants/index.ts', "export * from './myProgram';");
    await renderMapContains(renderMap, 'errors/index.ts', "export * from './myProgram';");
    await renderMapContains(renderMap, 'events/index.ts', "export * from './counterIncremented';");
    await renderMapContains(renderMap, 'instructions/index.ts', "export * from './incrementCounter';");
    await renderMapContains(renderMap, 'pdas/index.ts', "export * from './counterAccount';");
    await renderMapContains(renderMap, 'programs/index.ts', "export * from './myProgram';");
    await renderMapContains(renderMap, 'types/index.ts', "export * from './accountStatus';");

    // And we expect the generated code itself to be unchanged.
    await renderMapContains(renderMap, 'accounts/counterAccount.ts', [
        'export type CounterAccount = ',
        "from '../pdas'",
        "from '../types'",
    ]);
});
