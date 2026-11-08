---
'@codama/renderers-js': minor
---

Add a `fileName` name transformer controlling the names of generated files and their re-exports from the barrel files. It defaults to the camelCase name used so far, so nothing changes unless it is overridden, e.g. `nameTransformers: { fileName: (name, { kebabCase }) => kebabCase(name) }` writes `my-account.ts` instead of `myAccount.ts`. Documentation blocks also now split their items on line breaks, so multi-line documentation strings render as several lines rather than a single line containing a line break.
