---
'@codama/renderers-js': minor
---

Use `SolanaError` for generated errors. Generated program clients now throw `SolanaError` with specific error codes instead of generic `Error` objects. This provides better error handling with structured context including the program name and relevant data.
