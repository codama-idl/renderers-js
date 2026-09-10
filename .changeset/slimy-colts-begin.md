---
'@codama/renderers-js': minor
---

Remaining accounts provided via the instruction input now accept the same inputs as instruction accounts — i.e. `InstructionAccountInput` for non-signer remaining accounts, `InstructionSignerInput` for signer remaining accounts, and the union of both for remaining accounts that may or may not be signers — and are converted to account metas by the same `getAccountMeta` helper. As a result, addresses are extracted from any address-carrying value (including third-party wrappers such as web3.js's `PublicKey`), explicit account metas override the role derived from the IDL, signers merely carry their address for non-signer remaining accounts, and values that cannot sign are rejected for signer remaining accounts. Remaining accounts backed by an existing instruction argument remain typed by that argument.
