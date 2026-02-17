---
'@codama/renderers-js': major
---

Refactor `renderVisitor` to accept `packageFolder` as its primary argument instead of the generated output path. The generated folder is now derived from the package folder using the new `generatedFolder` option (defaults to `'src/generated'`). The `syncPackageJson` option now defaults to `true` and no longer requires a separate `packageFolder` option.

**BREAKING CHANGES**

**`renderVisitor` first argument changed.** The first argument is now the package folder (where `package.json` lives) instead of the direct path to the generated output directory.

```diff
- const visitor = renderVisitor('clients/js/src/generated', { packageFolder: 'clients/js' });
+ const visitor = renderVisitor('clients/js');
```

**`packageFolder` option removed.** It is no longer needed since the package folder is now the primary argument.

**`syncPackageJson` now defaults to `true`.** Previously it defaulted to `false` and required `packageFolder` to be set.

```diff
- renderVisitor('clients/js/src/generated', { packageFolder: 'clients/js', syncPackageJson: true });
+ renderVisitor('clients/js');
```

**New `generatedFolder` option.** If your generated folder is not at `src/generated` relative to the package folder, use the new `generatedFolder` option.

```diff
- renderVisitor('clients/js/custom/output');
+ renderVisitor('clients/js', { generatedFolder: 'custom/output' });
```
