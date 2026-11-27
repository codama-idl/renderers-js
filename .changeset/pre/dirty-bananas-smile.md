---
'@codama/renderers-js': major
---

Report invalid IDLs with `CodamaError`s and document every export of the renderer.

**BREAKING CHANGES**

**The `discriminatedUnionDiscriminator` name transformer receives the identifier of the node owning the union.** It receives the identifier of the defined type, account, event or instruction as written in the IDL, e.g. `my_point`, rather than the camelCase form of its data type, e.g. `myPoint`. Unions of events receive the event identifier, e.g. `pinged` rather than `pingedEvent`, and unions nested within another type receive an empty name instead of their parent's. The default transformer is unaffected.

```ts
nameTransformers: { discriminatedUnionDiscriminator: name => `${name}Kind` };
// type MyPoint = { my_pointKind: 'A' } | ...
```

**Invalid references throw `CodamaError`s.** Data fields and extra arguments sharing a name throw `CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE` instead of a plain `Error`, resolver dependencies must be `accounts.<identifier>` or `data.<path>` references, e.g. `data.config.fees[0]`, and field discriminators referring to a missing field or one without a default value throw instead of leaving out their constant.

Dependency ranges that are not semver ranges, such as `workspace:*`, are kept as they are when syncing the `package.json`, without a warning.
