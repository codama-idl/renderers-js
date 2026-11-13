---
'@codama/renderers-js': major
---

Name generated files in kebab-case by default, following the identifiers of Codama v2 which keep their original casing.

**BREAKING CHANGES**

**Generated files are named in kebab-case.** Imports from the generated folder barrels are unaffected, but deep imports of individual files must be updated.

```diff
- import { getTransferCheckedInstruction } from './generated/instructions/transferChecked';
+ import { getTransferCheckedInstruction } from './generated/instructions/transfer-checked';
```

To keep the previous camelCase file names, override the `fileName` name transformer.

```ts
renderVisitor(packageFolder, {
    nameTransformers: { fileName: (name, { camelCase }) => camelCase(name) },
});
```
