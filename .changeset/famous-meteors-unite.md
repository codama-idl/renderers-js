---
'@codama/renderers-js': major
---

Render instruction builders that previously produced code failing to compile or behaving incorrectly.

**BREAKING CHANGES**

**Default values only fill in missing arguments.** Builders check `args.amount === undefined` instead of `!args.amount`, so given falsy values such as `0` or `false` are no longer replaced by their default.

**Data arguments defaulting to the payer or the identity are required by instruction builders.** Builders have no payer or identity to fill them in with, so their input types require them. The program plugin keeps filling in the payer of its client.

**The program plugin exposes the instructions rendered as pages.** Programs with sub-instructions expose their leaf instructions, along with their parents when `renderParentInstructions` is enabled, instead of their top-level instructions only.

**Inline PDA defaults missing a seed value throw.** They throw `CODAMA_ERROR__VISITORS__INVALID_PDA_SEED_VALUES` instead of deriving another address without that seed.

**Byte deltas of accounts without a fixed size throw.** A byte delta given by an account that has neither a `size` nor a fixed data size throws `CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE`. Accounts whose data has a fixed size now get a size function, e.g. `getCounterSize()`, even without a declared `size`.

Builders also declare the arguments they fill in when every argument is omitted, pass extra arguments to the resolvers of remaining accounts and byte deltas, and fill in the defaults of arguments read by byte deltas. The data of sub-instructions can be extracted with the `customInstructionData` option, and PDA seeds reading an account and a data field of the same name keep both dependencies.
