---
'@codama/renderers-js': patch
---

Add support for subpath exports in `ImportMap`. The `getExternalDependencies` function now correctly handles subpath exports (e.g. `@solana/kit/program-client-core`) by extracting the root package name when checking dependencies.
