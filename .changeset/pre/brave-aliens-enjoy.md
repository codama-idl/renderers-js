---
'@codama/renderers-js': major
---

Require Node.js 22.12.0 or later, as Codama v2 does.

**BREAKING CHANGES**

**Node.js 20 is no longer supported.** The package now declares `"engines": { "node": ">=22.12.0" }`, the first Node.js 22 release that supports `require(esm)` by default. Node.js 20 reached its end of life in April 2026. This only concerns the environment running the renderer: generated clients are unaffected.
