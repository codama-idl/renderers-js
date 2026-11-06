---
'@codama/renderers-js': patch
---

Derive every name in generated code from the camelCase form of the node names, so that IDLs whose names are not camelCase — e.g. hand-written JSON IDLs using snake_case — render the same code as their camelCase equivalent. Previously, a few names leaked their raw spelling into generated code (struct value defaults, PDA seed values and the `programName` of identification errors), name conflicts between instruction accounts and arguments were only detected on exact spelling, and errors and constants were sorted by raw name. The keys of the `linkOverrides` option are now matched regardless of their casing too — e.g. `counter_account`, `counterAccount` and `CounterAccount` all refer to the same node — as the `customAccountData`, `customInstructionData`, `internalNodes`, `nonScalarEnums` and `asyncResolvers` options already did.
