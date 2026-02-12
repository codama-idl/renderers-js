---
'@codama/renderers-js': major
---

Remove the generated `shared.ts` file from the output. Helper types and functions such as `ResolvedAccount`, `InstructionWithByteDelta`, and `getAccountMetaFactory` are now imported from `@solana/kit/program-client-core`.

**BREAKING CHANGES**

- The `shared` folder is no longer generated. Any imports from `generated/shared` should be updated to import from `@solana/kit/program-client-core`.
- The `getAccountMetaFactory` function now requires the account name as the first argument.
- The `ResolvedAccount` type has been replaced with `ResolvedInstructionAccount`.
- The `expectSome` function has been replaced with `getNonNullResolvedInstructionInput`.
- The `expectAddress` function has been replaced with `getAddressFromResolvedInstructionAccount`.
- The `expectTransactionSigner` function has been replaced with `getResolvedInstructionAccountAsTransactionSigner`.
- The `expectProgramDerivedAddress` function has been replaced with `getResolvedInstructionAccountAsProgramDerivedAddress`.
