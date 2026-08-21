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
 * ```
 */
export function getEnumBody(variantNames: string[], erasableSyntax: boolean): string {
    if (!erasableSyntax) return variantNames.join(', ');

    const reverseEntries = variantNames.map((name, index) => `${index}: '${name}'`);
    const forwardEntries = variantNames.map((name, index) => `${name}: ${index}`);
    return [...reverseEntries, ...forwardEntries].join(', ');
}
