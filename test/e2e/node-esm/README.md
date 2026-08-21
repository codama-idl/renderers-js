# `node-esm` e2e fixture

Proves that a generated client can be executed directly by Node versions with
built-in type stripping, with no compilation step in between. That needs two
things at once: every relative import already names a real file, and no
non-erasable TypeScript syntax survives into the output.

The fixture deliberately contains only one scalar enum and one instruction. It
is rendered with `importExtension: 'ts'` and `erasableSyntax: true`, then
compiled under the strictest "modern TypeScript" tsconfig we support:

| Option                            | What it proves about the generated client                                     |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `erasableSyntaxOnly`              | No `enum`, `namespace`, or parameter properties are emitted.                  |
| `allowImportingTsExtensions`      | Relative specifiers may name the real `.ts` file.                             |
| `rewriteRelativeImportExtensions` | Those `.ts` specifiers still compile to runnable `.js`.                       |
| `verbatimModuleSyntax`            | Every type-only import is marked as such.                                     |
| `isolatedDeclarations`            | Every export is annotated well enough to emit declarations without inference. |

The root `pnpm test:e2e` command generates this fixture through its Codama CLI
config, then compiles it using `test/e2e/tsconfig.node-esm.json`. This is the
core proof: it type-checks the generated sources and emits JavaScript whose
`./x.ts` imports have been rewritten to `./x.js`. The command executes the same
compatibility test first from that emitted JavaScript and then, on Node versions
that can strip types, directly from its TypeScript source. This covers scalar
and program-level enums, codecs, instruction identification and parsing, and
the program plugin without needing a validator. The minimal `package.json` in
this directory only marks these files as ESM; all dependencies and scripts are
owned by the root package.

One caveat worth knowing: TypeScript rewrites extensions in emitted JavaScript
but not in emitted declarations, so `dist/**/*.d.ts` still refers to `./x.ts`.
That is a TypeScript limitation rather than a renderer one — see
https://github.com/microsoft/TypeScript/issues/61037 — and it is harmless for
consumers on TypeScript 5.0+, which resolve those specifiers fine. It only
matters if you publish declarations to consumers on older compilers.
