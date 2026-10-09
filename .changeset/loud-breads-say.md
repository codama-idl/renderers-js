---
'@codama/renderers-js': minor
---

Public key types now accept `Address | HasAddress` wherever they are encoded from an input — i.e. instruction data arguments, PDA seeds, account data arguments and defined types — so that third-party wrappers such as web3.js's `PublicKey` can be passed directly instead of being converted to an `Address` first. The loose (`*Args` and `*Seeds`) types are widened to `Address | HasAddress` and the encoder unwraps such objects to their address via `transformEncoder(getAddressEncoder(), ...)`, whilst the strict types and decoders keep yielding an `Address`. Remaining accounts backed by an existing public key array argument likewise unwrap each item to its address via `getAddressFromResolvedInstructionAccount`.

Note that code reading public key values from loose types as plain addresses (e.g. passing `seeds.owner` from an `AssociatedTokenSeeds` or `args.mintAuthority` from a resolver scope to a function expecting an `Address`) needs updating since these values may now be address-bearing objects. Types whose loose and strict variants previously coincided because of public keys (e.g. `export type MyTypeArgs = MyType`) are now declared separately.
