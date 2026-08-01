#!/usr/bin/env -S node

// Runs `smoke.ts` through Node's type stripping, which only exists from Node
// 22.18 / 23.6 onwards. `process.features.typescript` is the runtime's own
// answer to "can I execute a .ts file", so older or flag-disabled versions skip
// the check instead of failing the suite.

const path = require('node:path');
const process = require('node:process');
const { spawnSync } = require('node:child_process');

if (!process.features.typescript) {
    console.log(`Skipping the type-stripping smoke test: Node ${process.versions.node} cannot execute TypeScript.`);
    process.exit(0);
}

const result = spawnSync(process.execPath, [path.join(__dirname, 'smoke.ts')], { stdio: 'inherit' });
process.exit(result.status ?? 1);
