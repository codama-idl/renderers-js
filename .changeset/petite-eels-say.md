---
'@codama/renderers-js': minor
---

Add a new `erasableSyntax` option that replaces generated `enum` declarations with `const` objects and union types, making generated clients compatible with TypeScript's `erasableSyntaxOnly` option and Node.js type stripping.
