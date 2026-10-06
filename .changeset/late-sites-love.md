---
'@codama/renderers-js': patch
---

Compare optional-account placeholders against the parsed instruction's program address in generated `parse*Instruction` helpers.

Under the default `programId` optional-account strategy, instruction builders fill an unset optional account with their effective program address — the canonical one or the `programAddress` override they were called with. The generated parse helpers, however, recognised the placeholder by comparing each optional account meta against the program's canonical address constant, so an instruction built against another deployment of the program (e.g. a per-cluster address) parsed its unset optional accounts back as real accounts holding that deployment's address, while a canonical-address meta passed on purpose was dropped. The parse helpers now compare against `instruction.programAddress`, which they already read for the returned `programAddress` field, so build → parse round trips preserve `undefined` optional accounts under any program address. Generated output changes for every instruction with an optional account under the `programId` strategy, so regenerate after upgrading.
