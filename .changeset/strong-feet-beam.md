---
'@codama/renderers-js': minor
---

Generated account fetchers now accept `Address | HasAddress` — i.e. `fetchX` and `fetchMaybeX` accept `Address<TAddress> | HasAddress<TAddress>` whilst `fetchAllX` and `fetchAllMaybeX` accept `Array<Address | HasAddress>` — so that third-party wrappers such as web3.js's `PublicKey` or a `TransactionSigner` can be passed directly instead of being converted to an `Address` first. The fetchers unwrap such objects to their address before calling `fetchEncodedAccount` and `fetchEncodedAccounts` from `@solana/kit`, and the `TAddress` type parameter is still inferred from the provided object. The returned accounts keep exposing a plain `Address`.
