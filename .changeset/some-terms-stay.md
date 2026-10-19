---
'@codama/renderers-js': minor
---

Generated account fetchers now accept clients exposing an `rpc` property — such as Kit clients — alongside raw RPCs — i.e. `fetchX`, `fetchMaybeX`, `fetchXFromSeeds` and `fetchMaybeXFromSeeds` accept `ClientWithRpc<GetAccountInfoApi>` whilst `fetchAllX` and `fetchAllMaybeX` accept `ClientWithRpc<GetMultipleAccountsApi>` — so that `fetchMint(client, address)` works without reaching for `client.rpc`. The fetchers unwrap such clients to their RPC before calling `fetchEncodedAccount` and `fetchEncodedAccounts` from `@solana/kit`. Passing an RPC directly behaves exactly as before.
