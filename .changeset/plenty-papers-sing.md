---
'@codama/renderers-js': patch
---

Group type-only imports as `import type { ... }` statements so that generated code no longer leaves empty side-effect imports in JavaScript emitted under `verbatimModuleSyntax`, and fix a missing `type` keyword on PDA seeds type imports in account PDA helpers. Consumers regenerating clients will see cosmetic `import { type A }` → `import type { A }` diffs.
