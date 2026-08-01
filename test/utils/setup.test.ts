import { describe, test } from 'vitest';

import { codeContainsImports, codeDoesNotContainImports } from '../_setup';

describe('import assertion helpers', () => {
    test('`type MyType` requires a type-only import', async () => {
        const expectedImports = { 'my-module': ['type MyType'] };
        await codeContainsImports("import { type MyType } from 'my-module';", expectedImports);
        await codeContainsImports("import type { MyType } from 'my-module';", expectedImports);
        await codeDoesNotContainImports("import { MyType } from 'my-module';", {
            'my-module': ['type MyType'],
        });
    });

    test('`MyType` requires a value import', async () => {
        const expectedImports = { 'my-module': ['MyType'] };
        await codeContainsImports("import { MyType } from 'my-module';", expectedImports);
        await codeDoesNotContainImports("import type { MyType } from 'my-module';", {
            'my-module': ['MyType'],
        });
    });
});
