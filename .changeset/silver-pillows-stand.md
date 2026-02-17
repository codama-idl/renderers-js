---
'@codama/renderers-js': patch
---

Fix the generated plugin instruction type to use `ReturnType<typeof instructionFunction>` instead of manually constructing the return type, and make payer default values optional in the plugin's instruction input type.
