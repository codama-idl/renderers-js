---
'@codama/renderers-js': major
---

Fix generated code that did not compile or behaved incorrectly in edge cases.

**BREAKING CHANGES**

**Parse functions compare omitted optional accounts with the program address of the instruction.** Instructions built with a custom `programAddress` fill in their omitted optional accounts with that address, so their parse functions now compare against `instruction.programAddress` rather than the address declared in the IDL, which reported those accounts as present.

**Account type parameters default to the address the builder fills in.** An account defaulting to an injected value that resolves to a program or public key now defaults to that address, e.g. `TAccountTokenProgram extends string = '...'`, whilst an account resolved by a resolver defaults to `string` even when it also declares a public key default, since the resolver provides its value.

Recursive defined types listed in `internalNodes` no longer import themselves, constants nesting a data union value within a struct or map are typed as their loose type, negative enum discriminators render as computed keys under `erasableSyntax`, and the `args` of builders no longer redeclare the omitted fields the input already requires.
