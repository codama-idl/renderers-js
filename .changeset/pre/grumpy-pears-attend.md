---
'@codama/renderers-js': major
---

Fix instruction builders whose data fields are named like an account and filled in by the builder.

**BREAKING CHANGES**

**Data fields defaulting to a PDA hold its address.** Builders filling in a data field from a PDA assign the address of the derived PDA, e.g. `args.vault = (await findVaultPda(...))[0]`, rather than the `[address, bump]` pair returned by the find function, which did not match the type of the field.

Such fields are only renamed in the input of the builder that requires them, e.g. `vaultArg` in the synchronous builder, so asynchronous builders filling them in no longer read an input property that does not exist, and they leave the account of the same name out of the arguments they fill in.
