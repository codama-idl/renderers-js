---
'@codama/renderers-js': major
---

Replace the `useGranularImports` boolean option with a new `kitImportStrategy` option that accepts `'granular'`, `'preferRoot'` (default), or `'rootOnly'`. This provides finer control over how generated code imports from `@solana/kit` versus granular packages like `@solana/addresses` or `@solana/codecs-strings`. The new `'preferRoot'` default imports from `@solana/kit` when possible but falls back to granular packages for symbols not exported from the root entrypoint. The `'rootOnly'` strategy exclusively uses `@solana/kit` (including subpath exports like `@solana/kit/program-client-core`).

**BREAKING CHANGES**

- The `useGranularImports` option has been removed. Use `kitImportStrategy: 'granular'` instead of `useGranularImports: true`, and `kitImportStrategy: 'rootOnly'` instead of `useGranularImports: false`.
- The default import behavior has changed from resolving everything to `@solana/kit` to `'preferRoot'`, which falls back to granular packages for symbols not available on the root `@solana/kit` entrypoint (e.g. `@solana/program-client-core`).
