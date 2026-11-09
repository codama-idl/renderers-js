---
'@codama/renderers-js': major
---

Render the type nodes of the Codama v2 standard. Integers and floats render with the same codecs as v1 numbers, and integer values that a JavaScript number cannot represent exactly render as `bigint` literals. Fixed points render as their underlying integer, except SOL amounts (a scale of 9 with a `SOL` unit), which keep rendering as `Lamports`, and date-times and durations render as their underlying integer. The `transforms` of a type node wrap its codecs in order, the first being the innermost, as the v1 wrapper type nodes did, and sentinel counts render as sentinel-sized arrays, sets and maps.

Enum variants render as before when they carry no data, a struct or a tuple, following defined type links to their target. A variant holding a struct through a link spreads its fields, e.g. `{ __kind: 'At' } & Point`, a variant holding a tuple through a link exposes it as its `fields`, and a variant holding any other single type exposes it as a one-item `fields` tuple, e.g. `{ __kind: 'Amount'; fields: readonly [bigint] }`, which encodes to the same bytes. Enum values of such variants pass their value as a one-item tuple, e.g. `command('Amount', [42])`.

Struct field defaults injected from a provider are filled in by instruction builders before encoding. The codec of the struct only fills in their `fallback`, when one is given and no value was, so such fields are optional in the input type of the codec when they have a fallback and required otherwise, as v1 instruction arguments with contextual defaults were.
