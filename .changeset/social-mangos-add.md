---
'@codama/renderers-js': patch
---

Escape and validate IDL values written into generated code. Docs escape comment terminators, e.g. `src/**/*.ts`, error messages are fully escaped within their template literals, and addresses are rendered as escaped string literals. Attributes rendered as they are, such as sizes, offsets, error codes, account flags and strategies, must hold a value of their type, or rendering throws `CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE`. Attributes given with another type, e.g. a size given as a string, now throw instead of being rendered as they are, and error codes must be non-negative integers.
