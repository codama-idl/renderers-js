---
'@codama/renderers-js': major
---

Render the docs, lifecycle status and return data of instructions.

**BREAKING CHANGES**

**Archived instructions are left out of the client.** Instructions with an `archived` status, along with their sub-instructions, are no longer rendered, exported, identified or exposed by the program plugin, as the Codama standard specifies. Parents whose sub-instructions are all archived are rendered as leaves.

Instruction builders and program plugin methods are documented with the `docs` of their instruction. Deprecated instructions get a `@deprecated` tag with their status message, so that editors flag their usages, and draft instructions an `@experimental` tag.

```ts
/**
 * Transfers tokens.
 *
 * @deprecated Use `newTransfer` instead.
 */
export function getOldTransferInstruction(...) {}
```

Instructions with `returnData` get a type and codecs to decode the data they return, named through the new `instructionReturnDataType` name transformer, e.g. `getTransferInstructionReturnDataDecoder`.
