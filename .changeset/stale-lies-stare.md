---
'@codama/renderers-js': minor
---

Use `extendClient` from `@solana/plugin-core` in generated program plugins instead of manually spreading the client object. This improves type narrowing when composing plugins with overlapping keys. Bump minimum `@solana/kit` dependency to `^6.4.0`.
