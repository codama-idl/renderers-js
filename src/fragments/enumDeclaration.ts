import { Fragment, fragment, getErasableEnumBody, RenderScope } from '../utils';

/**
 * Renders an enum declaration whose variants are numbered sequentially from zero.
 *
 * @param scope - The exported name, the variant names and the render scope.
 * @returns A {@link Fragment} declaring the enum.
 *
 * @see {@link getEnumDeclarationFromBodyFragment}
 */
export function getEnumDeclarationFragment(
    scope: Pick<RenderScope, 'erasableSyntax'> & {
        name: string;
        variantNames: string[];
    },
): Fragment {
    const { variantNames, erasableSyntax = false } = scope;
    const body = erasableSyntax ? getErasableEnumBody(variantNames) : variantNames.join(', ');
    return getEnumDeclarationFromBodyFragment({ ...scope, body: fragment`{ ${body} }` });
}

/**
 * Renders an enum declaration from an already-rendered object body.
 *
 * When `erasableSyntax` is enabled, the `enum` keyword is replaced with a `const` object
 * and a union type of the same name so the declaration can be erased by a type-stripping
 * compiler. The object is aliased through a local lookup constant whose numeric keys are
 * then dropped with `Omit`, which makes `typeof Name` model the enum the same way
 * TypeScript models a real one while leaving the reverse mapping in place at runtime.
 *
 * @param scope - The exported name, the object body, an optional docblock and the render scope.
 * @returns A {@link Fragment} declaring the enum.
 *
 * @example
 * ```ts
 * getEnumDeclarationFromBodyFragment({
 *     body: fragment`{ 0: 'A', 1: 'B', A: 0, B: 1 }`,
 *     erasableSyntax: true,
 *     name: 'Key',
 * });
 * // const KeyLookup = { 0: 'A', 1: 'B', A: 0, B: 1 } as const;
 * // export const Key: Omit<typeof KeyLookup, number> = KeyLookup;
 * // export type Key = (typeof Key)[keyof typeof Key];
 * ```
 */
export function getEnumDeclarationFromBodyFragment(
    scope: Pick<RenderScope, 'erasableSyntax'> & {
        body: Fragment;
        docblock?: Fragment;
        name: string;
    },
): Fragment {
    const { name, body, docblock = fragment``, erasableSyntax = false } = scope;

    if (!erasableSyntax) {
        return fragment`${docblock}export enum ${name} ${body}`;
    }

    const lookupName = `${name}Lookup`;
    return fragment`const ${lookupName} = ${body} as const;\n\n${docblock}export const ${name}: Omit<typeof ${lookupName}, number> = ${lookupName};\n\nexport type ${name} = (typeof ${name})[keyof typeof ${name}];`;
}
