---
'@codama/renderers-js': major
---

Render the instructions of the Codama v2 standard. Instruction arguments are read from the fields of the instruction `data`, extra arguments from `codama.extraArgument` plugins, and resolvers from `codama.resolver` plugins on accounts, data fields, extra arguments, remaining accounts and byte deltas, so that IDLs upgraded from v1 render the same instruction builders as before. Defaults injected from the `provides` of an instruction are resolved like any other default, and references to instruction data may point to nested fields, e.g. `args.config?.fee`.

**BREAKING CHANGES**

**Upgraded defaults that mixed a resolver with other values require a new resolver.** When a v1 default could not be expressed without a resolver, e.g. a conditional value whose condition is a resolver, or a byte delta given by an extra argument, `@codama/upgrade` replaces it with a resolver resolving the whole value, named after the instruction and the input, e.g. `resolveCreateByteDelta`. Generated builders call that resolver, which you must provide alongside your existing ones, e.g. through `linkOverrides.resolvers`.

**Malformed plugins and unsupported injections throw.** A `codama.resolver` or `codama.extraArgument` plugin whose payload does not match the spec, instruction data that is neither a struct nor a defined type link, and a value provided for an injected default nested within instruction data, which builders cannot fill in, throw `CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE` with the path of the offending node.
