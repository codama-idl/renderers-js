---
'@codama/renderers-js': major
---

Fix generated code that did not compile or behaved incorrectly in edge cases.

**BREAKING CHANGES**

**Internal nodes are not exposed by the program plugin.** Accounts, instructions and PDAs listed in `internalNodes` are left out of the program plugin, as they are left out of barrels. Generated code using them, e.g. an instruction defaulting to an internal PDA, imports them from their own file, e.g. `../pdas/secret-pda`.

**Inputs that synchronous builders cannot fill in are required there.** Data fields filled in by an asynchronous resolver, and omitted data fields defaulting to the payer or the identity, are required in the input of synchronous builders. Asynchronous builders and the program plugin keep filling them in.

**Conditional default values compare their condition loosely or throw.** Integer conditions are compared as `bigint`s, e.g. `BigInt(args.amount) === 5n`, account conditions by address, and conditions on values that cannot be compared with `===`, such as options or structs, throw `CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE`.

**Kit number codecs keep their names.** The `encoderFunction` and `decoderFunction` name transformers no longer rename the number codecs imported from Kit, e.g. `getU64Encoder`, which only exist under those names.

Field discriminators of data linked to a defined type are supported.
