// Imported through `linkOverrides.resolvers` rather than from the `hooked` barrel.

/** Resolves the bytes allocated by the instruction from its space argument. */
export function resolveByteDelta(scope: { args: { space: number | bigint } }): number {
    return Number(scope.args.space);
}
