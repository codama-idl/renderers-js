#!/usr/bin/env -S node

const path = require('node:path');
const process = require('node:process');

const { rootNodeFromAnchor } = require('@codama/nodes-from-anchor');
const { readJson } = require('@codama/renderers-core');
const { visit } = require('@codama/visitors-core');

const { renderVisitor } = require('../../dist/index.node.cjs');

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
    const visitor = renderVisitor(
        path.join(packageFolder, 'src', 'generated'),
        { kitImportStrategy: 'rootOnly', packageFolder, syncPackageJson: true },
    );

    await visit(node, visitor);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
