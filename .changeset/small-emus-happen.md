---
'@codama/renderers-js': minor
---

Forward the program address to linked PDA default values in async instruction builders

Instruction accounts defaulting to a linked PDA were derived by calling the generated `find*Pda()` function with no config, so the derivation always used the address baked into that function and silently ignored the `programAddress` passed to the instruction builder. Programs deployed at different addresses per cluster produced instructions aimed at the overridden program with PDAs derived from the original one.

Async builders now pass `{ programAddress }` through to the find function when the PDA is derived from the instruction's own program, matching what the generated `fetch*FromSeeds` account helpers already did. PDAs owned by another program, or pinned to an explicit program ID, keep their own address.

This changes generated output for any client with a same-program linked PDA default, so regenerate after upgrading. PDA finders supplied through `linkOverrides.pdas` are called with the same signature as generated ones, so they must accept a trailing `config: { programAddress?: Address }` argument.
