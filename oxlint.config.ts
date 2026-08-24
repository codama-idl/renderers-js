const oxlint = require('oxlint');
const solanaConfig = require('@solana-config/oxc/oxlint');

module.exports = oxlint.defineConfig({
    extends: [solanaConfig],
    // Keep in sync with oxfmt.config.ts so both tools reason about the same files.
    ignorePatterns: [
        '**/dist/**',
        '.agents/**',
        '.changeset/**',
        '.claude/**',
        '.github/workflows/PULL_REQUEST_TEMPLATE.md',
        '.skills-inject.json',
        'AGENTS.md',
        'CHANGELOG.md',
        'CLAUDE.md',
        'pnpm-lock.yaml',
        'skills-lock.json',
        'test/e2e/*/idl.json',
        'test/e2e/*/src/generated/**',
    ],
    options: { typeAware: true },
    overrides: [
        {
            // E2E tests order object keys for readability — e.g. sources before
            // destinations before amounts — rather than alphabetically.
            files: ['test/e2e/**/*.ts'],
            rules: { 'sort-keys': 'off' },
        },
    ],
});
