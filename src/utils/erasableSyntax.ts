/**
 * Renders the body of the object literal that stands in for a numeric TypeScript `enum`
 * when the `erasableSyntax` option is enabled.
 *
 * The object mirrors exactly what a numeric `enum` compiles to — the reverse mapping from
 * value to variant name followed by the forward entries. This matters because
 * `@solana/codecs` derives an enum's keys and values by inspecting that runtime shape.
 *
 * @param variantNames - The variant names, in declaration order.
 * @returns The object body, without the surrounding braces.
 *
 * @example
 * ```ts
 * getErasableEnumBody(['Uninitialized', 'Asset']);
 * // "0: 'Uninitialized', 1: 'Asset', Uninitialized: 0, Asset: 1"
 * ```
 */
export function getErasableEnumBody(variantNames: string[]): string {
    const reverseEntries = variantNames.map((name, index) => `${index}: '${name}'`);
    const forwardEntries = variantNames.map((name, index) => `${name}: ${index}`);
    return [...reverseEntries, ...forwardEntries].join(', ');
}
