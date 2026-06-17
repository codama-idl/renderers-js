---
'@codama/renderers-js': minor
---

Support `@solana/kit` 6.10.0 in generated program plugins. The generated `xxxProgram()` factory previously annotated its return type as `Omit<T, 'xxx'> & { xxx: XxxPlugin }`, which is no longer assignable to the value returned by `extendClient` now that the latter returns the homomorphic `ExtendedClient<T, TAdditions>` type. The factory now annotates its return type with `ExtendedClient` directly, and the default `@solana/*` dependency versions written into a generated client's `package.json` (via `syncPackageJson`) are bumped to `^6.10.0` so that `ExtendedClient` is available.
