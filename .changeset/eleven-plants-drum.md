---
'@codama/renderers-js': major
---

Render IDLs of the Codama v2 standard. The renderer now depends on the v2 releases of `@codama/nodes`, `@codama/visitors-core` and `@codama/errors`, and on `@codama/fragments` instead of `@codama/renderers-core`.

**BREAKING CHANGES**

**Codama v2 IDLs are required.** The renderer only accepts trees of the v2 standard. Upgrade v1 IDLs with the `codama upgrade` command, or with the `upgrade` function or `upgradeToLatestVisitor` of `@codama/upgrade`, e.g. as a `before` visitor of your Codama configuration.

```json
{
    "idl": "program/idl.json",
    "before": ["@codama/upgrade"],
    "scripts": { "js": { "from": "@codama/renderers-js", "args": ["clients/js"] } }
}
```

**Names are derived from the spec's word split.** Node identifiers keep their original casing in v2, and every generated name is derived from the words of the identifier as the spec defines them, through the casing helpers of `@codama/fragments/casing`. Identifiers made of consecutive capitals now keep acronyms as single words, e.g. `getURL` becomes `getUrl` rather than `getURL`.

**Unrenderable nodes report their path.** Errors thrown for nodes that cannot be rendered carry the `path` of the node in their context instead of the node itself, as Codama v2 errors do, and nodes visited outside of a program throw `CODAMA_ERROR__NODE_PATH_PROGRAM_MISSING`.
