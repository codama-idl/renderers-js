---
'@codama/renderers-js': major
---

Reject IDLs that are not of the Codama v2 standard and resolve the inputs of sub-instructions within their parents.

**BREAKING CHANGES**

**IDLs of another major version throw.** Rendering a root node whose `version` is not a 2.x version throws `CODAMA_ERROR__VERSION_MISMATCH` instead of failing on the first node it cannot read. Upgrade v1 IDLs with the `upgrade` command of the Codama CLI.

```sh
npx @codama/cli upgrade program/idl.json
```

**References within the IDL match identifiers exactly.** Field discriminator paths, PDA seed values and remaining accounts backed by a data field now find their target by its exact identifier, as data paths and resolver dependencies already did and as Codama core does. Option keys referencing nodes, such as `linkOverrides` or `internalNodes`, are still compared by their camelCase form.

**Sub-instructions see the values provided by their parents.** Injected defaults of a sub-instruction resolve against the `provides` of its parent instructions, rather than only its own.

**Data paths entering account data throw.** A default value, resolver dependency or byte delta whose data path enters the data of a linked account, e.g. `mint.data.decimals`, throws `CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE`, as `accountDataValueNode` defaults do, since instruction builders only receive account addresses.
