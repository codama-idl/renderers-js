import { describe, expect, test } from 'vitest';

import { addFragmentImports, fragment, getDocblockFragment, use } from '../../src/utils';

describe('getDocblockFragment', () => {
    test('it renders nothing for empty documentation', () => {
        expect(getDocblockFragment(undefined)).toBeUndefined();
        expect(getDocblockFragment([])).toBeUndefined();
    });

    test('it renders a single line on one line', () => {
        expect(getDocblockFragment(['Hello'])?.content).toBe('/** Hello */');
        expect(getDocblockFragment('Hello')?.content).toBe('/** Hello */');
    });

    test('it renders several lines as a block', () => {
        expect(getDocblockFragment(['Hello', '', 'World'])?.content).toBe('/**\n * Hello\n *\n * World\n */');
    });

    test('it splits items on line breaks', () => {
        expect(getDocblockFragment('Hello\n\nWorld\n')?.content).toBe('/**\n * Hello\n *\n * World\n */');
        expect(getDocblockFragment(['Hello\r\nWorld'])?.content).toBe('/**\n * Hello\n * World\n */');
    });

    test('it appends a line jump when requested', () => {
        expect(getDocblockFragment('Hello', true)?.content).toBe('/** Hello */\n');
    });
});

describe('use', () => {
    test('it creates a fragment with an import of the same name', () => {
        expect(use('address', '@solana/addresses')).toStrictEqual(
            addFragmentImports(fragment`address`, '@solana/addresses', ['address']),
        );
    });

    test('it creates a fragment with a type import', () => {
        expect(use('type Address', '@solana/addresses')).toStrictEqual(
            addFragmentImports(fragment`Address`, '@solana/addresses', ['type Address']),
        );
    });

    test('it creates a fragment with an alias', () => {
        expect(use('address as myAddress', '@solana/addresses')).toStrictEqual(
            addFragmentImports(fragment`myAddress`, '@solana/addresses', ['address as myAddress']),
        );
    });

    test('it creates a fragment with a type alias', () => {
        expect(use('type Address as MyAddress', '@solana/addresses')).toStrictEqual(
            addFragmentImports(fragment`MyAddress`, '@solana/addresses', ['type Address as MyAddress']),
        );
    });
});
