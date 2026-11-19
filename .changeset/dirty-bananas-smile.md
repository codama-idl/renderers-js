---
'@codama/renderers-js': major
---

Report invalid IDLs consistently and document every export of the renderer.

**BREAKING CHANGES**

**The `discriminatedUnionDiscriminator` name transformer receives the identifier of the node owning the union.** Codecs and data union helpers previously received different names for the same union, e.g. `myPoint` and `my_point`, so a custom transformer could make them disagree. Both now receive the identifier of the defined type, account, event or instruction, e.g. `my_point` or `pinged` rather than `pingedEvent`. Unions nested within another type receive an empty name instead of their parent's. The default transformer is unaffected.

```ts
nameTransformers: { discriminatedUnionDiscriminator: name => `${name}Kind` };
// type MyPoint = { my_pointKind: 'A' } | ..., in both its codec and its helpers.
```

**Invalid references throw `CodamaError`s.** Resolver dependencies must be `accounts.<identifier>` or `data.<path>` references, e.g. `data.config.fees[0]`, data fields and extra arguments sharing a name throw `CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE`, and bytes of an unknown encoding throw `CODAMA_ERROR__UNRECOGNIZED_BYTES_ENCODING` instead of being decoded as base64.

Dependency ranges that are not semver ranges, such as `workspace:*`, are kept as they are when syncing the `package.json`, without a warning.
