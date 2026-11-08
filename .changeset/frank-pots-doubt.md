---
'@codama/renderers-js': patch
---

Throw `CodamaError`s instead of plain errors when an IDL cannot be rendered, so that callers can identify them by code: `CODAMA_ERROR__DISCRIMINATOR_FIELD_NOT_FOUND` and `CODAMA_ERROR__DISCRIMINATOR_FIELD_HAS_NO_DEFAULT_VALUE` for field discriminators that do not match a field with a default value (previously a single plain error), and `CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE` for instruction input default values the renderer does not support yet, i.e. `accountFieldValueNode` and `injectedValueNode`. The messages of these errors change accordingly.
