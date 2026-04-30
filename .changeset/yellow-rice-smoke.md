---
'@codama/renderers-js': minor
---

Expose `identifyAccount`, `identifyInstruction`, and `parseInstruction` on generated program plugins. When a program has accounts or instructions with discriminators, the plugin object now surfaces the corresponding identifier and parser helpers as `client.myProgram.identifyAccount(...)`, `client.myProgram.identifyInstruction(...)`, and `client.myProgram.parseInstruction(...)`, making it easier to build indexers without re-importing the per-function helpers.
