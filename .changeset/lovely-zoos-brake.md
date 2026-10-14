---
'@codama/renderers-js': minor
---

Program address overrides now accept address-bearing objects — i.e. the `programAddress` config of instruction builders (sync and async), `find*Pda` functions and `fetch*FromSeeds` / `fetchMaybe*FromSeeds` helpers — so that third-party wrappers such as web3.js's `PublicKey` can be passed directly instead of being converted to an `Address` first. PDA and fetch helpers widen their override to `Address | HasAddress`, whilst instruction builders widen it to `TProgramAddress | { readonly address: TProgramAddress }`. The override is unwrapped to a plain `Address` once at the top of the generated function, so account metas, PDA derivations, resolvers and the returned instruction keep receiving an `Address`. Instruction types still carry the literal program address — the program constant by default, or the overriding address whether it is passed directly or wrapped — so their inferred types are unchanged for existing callers.
