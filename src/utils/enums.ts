import type { EnumVariantTypeNode } from '@codama/nodes';

/**
 * Resolves the discriminator value of each variant: its explicit `discriminator` when set,
 * otherwise its position in the enum, starting at zero.
 *
 * @param variants - The variants of the enum, in declaration order.
 * @returns The discriminator value of each variant, in the same order.
 */
export function getEnumVariantDiscriminators(variants: readonly EnumVariantTypeNode[]): number[] {
    return variants.map((variant, index) => variant.discriminator ?? index);
}

/**
 * Whether any variant of the enum declares an explicit `discriminator`.
 *
 * @param variants - The variants of the enum, in declaration order.
 */
export function hasCustomEnumVariantDiscriminators(variants: readonly EnumVariantTypeNode[]): boolean {
    return variants.some(variant => variant.discriminator !== undefined);
}
