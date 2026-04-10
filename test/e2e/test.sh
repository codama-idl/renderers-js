#!/usr/bin/env bash
set -eux

function start_validator() {
    if ! lsof -t -i:8899; then
        echo "Starting solana-test-validator"
        solana-test-validator >/dev/null 2>&1 &
    fi
}

function lint_generated() {
    node --input-type=module -e "
import { ESLint } from 'eslint';
import importPlugin from 'eslint-plugin-import-x';
import tseslint from 'typescript-eslint';

const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [{
        files: ['**/*.ts'],
        languageOptions: { parser: tseslint.parser },
        plugins: { 'import-x': importPlugin },
        rules: { 'import-x/extensions': ['error', 'always', { ignorePackages: true }] },
    }],
});

const results = await eslint.lintFiles('test/e2e/$1/src/generated/**/*.ts');
const formatter = await eslint.loadFormatter('stylish');
const text = await formatter.format(results);
if (text) console.log(text);
if (results.some(r => r.errorCount > 0)) process.exit(1);
"
}

function test_project() {
    ./test/e2e/generate.cjs $1
    lint_generated $1
    cd test/e2e/$1
    pnpm install && pnpm build && pnpm test
    cd ../../..
}

start_validator
test_project anchor
test_project system
test_project memo
test_project token
test_project dummy
