const oxfmt = require('oxfmt');
const solanaFmt = require('@solana-config/oxc/oxfmt');

module.exports = oxfmt.defineConfig({
    ...solanaFmt,
    // Keep in sync with oxlint.config.ts so both tools reason about the same files.
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
});
