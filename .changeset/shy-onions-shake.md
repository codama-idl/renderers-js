---
'@codama/renderers-js': major
---

Escape and validate IDL values written into generated code.

**BREAKING CHANGES**

**Attributes rendered as they are must hold a value of their type.** Sizes, offsets, counts, error codes, account flags, number formats, bytes encodings, strategies, lifecycles, and integer and float values that do not match their type, e.g. a size given as a string, throw `CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE` instead of being rendered as they are. Error codes must be non-negative integers.

Docs escape comment terminators, e.g. `src/**/*.ts`, and addresses, string values and error messages are rendered as escaped string literals.
