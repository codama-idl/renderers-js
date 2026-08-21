#!/usr/bin/env -S node

const path = require('node:path');
const process = require('node:process');

const { rootNodeFromAnchor } = require('@codama/nodes-from-anchor');
const { readJson } = require('@codama/renderers-core');
const { visit } = require('@codama/visitors-core');

const { renderVisitor } = require('../../dist/index.node.cjs');

const DEFAULT_OPTIONS = { kitImportStrategy: 'rootOnly' };

// Render options per project, falling back to DEFAULT_OPTIONS.
const PROJECT_OPTIONS = {
    'node-esm': { ...DEFAULT_OPTIONS, erasableSyntax: true, importExtension: 'ts' },
};

async function main() {
    const project = process.argv.slice(2)[0] ?? undefined;
    if (project === undefined) {
        throw new Error('Project name is required.');
    }
    await generateProject(project);
}

async function generateProject(project) {
    const packageFolder = path.join(__dirname, project);
    const idl = readJson(path.join(packageFolder, 'idl.json'));
    const node = idl?.metadata?.spec ? rootNodeFromAnchor(idl) : idl;
    const visitor = renderVisitor(packageFolder, PROJECT_OPTIONS[project] ?? DEFAULT_OPTIONS);

    await visit(node, visitor);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
