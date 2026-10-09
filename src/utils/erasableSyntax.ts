/**
 * Renders the body of a numeric TypeScript enum declaration.
 *
 * When `erasableSyntax` is enabled, the object mirrors exactly what a numeric `enum`
 * compiles to: the reverse mapping from value to variant name followed by the forward
 * entries. This matters because `@solana/codecs` derives an enum's keys and values by
 * inspecting that runtime shape.
 *
 * @param variantNames - The variant names, in declaration order.
 * @param erasableSyntax - Whether to render the runtime object used for erasable enums.
 * @returns The object body, without the surrounding braces.
 *
 * @example
 * ```ts
 * getEnumBody(['Uninitialized', 'Asset'], true);
 * // "0: 'Uninitialized', 1: 'Asset', Uninitialized: 0, Asset: 1"
 *
 * getEnumBody(['First', 'Fifth'], false, [1, 5]);
 * // "First = 1, Fifth = 5"
 * // "0: 'Uninitialized', 1: 'Asset', Uninitialized: 0, Asset: 1"
 * ```
 */
export function getEnumBody(variantNames: string[], erasableSyntax: boolean, values?: number[]): string {
    if (!erasableSyntax) {
        if (!values) return variantNames.join(', ');
        return variantNames.map((name, index) => `${name} = ${values[index]}`).join(', ');
    }

    const resolvedValues = values ?? variantNames.map((_, index) => index);
    const reverseEntries = variantNames.map((name, index) => `${resolvedValues[index]}: '${name}'`);
    const forwardEntries = variantNames.map((name, index) => `${name}: ${resolvedValues[index]}`);
    return [...reverseEntries, ...forwardEntries].join(', ');
}
