---
'@codama/renderers-js': minor
---

Generated program plugins and `is<Program>Error` helpers can now target a custom program address — e.g. a program deployed at a different address on another cluster or in tests. The plugin factory accepts an optional `{ programAddress }` config, which is forwarded to every instruction builder and to the `find*Pda` functions of PDAs derived from the program, whilst each plugin instruction accepts a per-call config that takes precedence over the plugin one. `is<Program>Error` accepts an optional trailing `{ programAddress }` config that defaults to the program address constant. Both accept `Address | HasAddress`. Calling the plugin without a config behaves exactly as before.
