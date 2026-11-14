---
'@codama/renderers-js': major
---

Render type nodes and values that previously produced code failing to compile or encoding the wrong bytes.

**BREAKING CHANGES**

**Values are rendered for their type.** Constants, default values, PDA seeds and enum payloads render each nested value for the type it is used as, so 64-bit integers nested within options, arrays, tuples, maps, sets or structs are `bigint` literals and SOL amounts are `Lamports`.

```ts
export const OPTIONAL_AMOUNT: Option<bigint> = some(5n); // Was `some(5)`.
export const RENT: Lamports = lamports(890880n); // Was `890880`.
```

Constants holding a value of a data union, e.g. `command('Wait', [30])`, are typed as the loose type of the union, which its helper returns.

**Scalar enums nested within structs render as data unions.** An enum without data defined inline within a struct, rather than as a defined type, has no name to declare a native `enum`, so its values are `{ __kind: 'Fast' }` objects instead of code that did not compile.

**Nested fields named like a field discriminator keep their own default value.** Only the top-level field of the data of an account, event or instruction is filled in with its discriminator constant.

**Event discriminators that are not raw bytes are matched by their encoded bytes.** Codecs and identification helpers call the `get…DiscriminatorBytes()` function of such discriminators, e.g. a `u8` or a string, instead of comparing their value with the event data.

**The byte order of single-byte and variable-length integers is ignored.** Big-endian `u8`, `i8` and `shortU16` integers render the same codecs as little-endian ones, which accept no byte order.

**Zeroable options with a zero value of their item's size are fixed-size.** Their codecs are wrapped in `fixEncoderSize` and `fixDecoderSize`, so that types and accounts holding them keep a fixed size.
