---
'@codama/renderers-js': major
---

Export the types of the renderer options and apply `internalNodes` to PDAs.

**BREAKING CHANGES**

**Custom data options name their node with an `identifier`.** The objects of the `customAccountData` and `customInstructionData` options use `identifier` rather than `name`, as Codama v2 nodes do.

```diff
- customAccountData: [{ name: 'counter', importFrom: 'hooked' }],
+ customAccountData: [{ identifier: 'counter', importFrom: 'hooked' }],
```

**Internal PDAs are not exported.** PDAs listed in `internalNodes` are rendered but no longer exported from the `pdas` barrel, like other internal nodes. A root barrel exporting nothing but PDAs now exports them too.

The package now exports the `CustomDataOptions`, `LinkOverrides`, `PrettierOptions` and `Fragment` types, along with the `ParsedCustomDataOptions` and `GetImportFromFunction` types of its scope.
