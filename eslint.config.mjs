import solanaConfig from '@solana/eslint-config-solana';
import { defineConfig } from 'eslint/config';

export default defineConfig([
    { ignores: ['**/dist/**', '**/e2e/**/env-shim.ts', '**/e2e/**/tsup.config.ts', '**/e2e/**/test/**'] },
    { files: ['**/*.ts', '**/*.(c|m)?js'], ignores: ['**/e2e/**'], extends: [solanaConfig] },
    {
        files: ['**/e2e/**/*.ts', '**/e2e/**/*.(c|m)?js'],
        extends: [solanaConfig],
        rules: {
            '@typescript-eslint/sort-type-constituents': 'off',
            '@typescript-eslint/no-unnecessary-type-assertion': 'off',
            '@typescript-eslint/no-empty-object-type': 'off',
            'simple-import-sort/imports': 'off',
            'sort-keys-fix/sort-keys-fix': 'off',
            'typescript-sort-keys/interface': 'off',
        },
    },
]);
