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
 * Whether the discriminator of any variant differs from its position in the enum.
 *
 * Explicit discriminators matching the variant positions, e.g. `A = 0, B = 1`, encode
 * exactly like positional ones, so they do not require custom discriminator handling.
 *
 * @param variants - The variants of the enum, in declaration order.
 */
export function hasCustomEnumVariantDiscriminators(variants: readonly EnumVariantTypeNode[]): boolean {
    return getEnumVariantDiscriminators(variants).some((discriminator, index) => discriminator !== index);
}
