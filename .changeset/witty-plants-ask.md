---
'@codama/renderers-js': patch
---

Fix the `preferRoot` kit import strategy leaking into subsequent renders within the same process. Resolving imports with that strategy used to mutate the shared default module map, so that any later render using the `rootOnly` strategy would import program client helpers from `@solana/program-client-core` instead of `@solana/kit/program-client-core`.
