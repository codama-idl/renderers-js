---
'@codama/renderers-js': minor
---

Honor custom variant discriminators when rendering enums. Scalar enums with a custom `discriminator` on any variant are declared with explicit member values and encoded with `useValuesAsDiscriminators`, and discriminated unions map their prefix to the custom values, so the generated codecs match the on-chain layout instead of numbering variants from zero.
