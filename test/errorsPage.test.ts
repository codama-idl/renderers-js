import { errorNode, programNode } from '@codama/nodes';
import { visit } from '@codama/visitors-core';
import { test } from 'vitest';

import { getRenderMapVisitor } from '../src';
import { renderMapContains, renderMapContainsImports } from './_setup';

test('it renders an is error function that accepts a custom program address', async () => {
    // Given the following program with an error.
    const node = programNode({
        errors: [errorNode({ code: 42, message: 'Invalid mint', name: 'invalidMint' })],
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the is error function to take an optional program address config
    // that defaults to the program address constant.
    await renderMapContains(renderMap, 'errors/splToken.ts', [
        'code?: TProgramErrorCode, config: { programAddress?: Address | HasAddress } = {}',
        'const programAddressInput = config.programAddress ?? SPL_TOKEN_PROGRAM_ADDRESS;',
        "const programAddress = typeof programAddressInput === 'string' ? programAddressInput : programAddressInput.address;",
        'return isProgramError<TProgramErrorCode>( error, transactionMessage, programAddress, code );',
    ]);

    // And we expect the necessary imports to be included.
    await renderMapContainsImports(renderMap, 'errors/splToken.ts', {
        '@solana/kit': ['type Address', 'type HasAddress', 'isProgramError'],
    });
});
