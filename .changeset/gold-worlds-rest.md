---
'@codama/renderers-js': minor
---

Add a new `importExtension` option that appends explicit extensions to relative imports in generated code — `.js`/`.ts` for generated files and `/index.js`/`/index.ts` for generated directories. This enables consumers using Node ESM resolution, Deno, Node type stripping, or TypeScript's `allowImportingTsExtensions`/`rewriteRelativeImportExtensions` options.
