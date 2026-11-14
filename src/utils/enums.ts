import { camelCase } from '@codama/fragments/casing';
import {
    DefinedTypeNode,
    EnumTypeNode,
    EnumValueNode,
    EnumVariantTypeNode,
    isNode,
    isScalarEnum,
    Node,
    VALUE_NODE_KINDS,
} from '@codama/nodes';
import { getLastNodeFromPath, LinkableDictionary, NodePath } from '@codama/visitors-core';

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

/**
 * The enum type an enum value refers to, along with the path of its defined type, when
 * that defined type is found and is an enum.
 *
 * @param node - The enum value.
 * @param path - The path the enum value was found at, from which its enum link resolves.
 * @param linkables - The linkable nodes of the tree.
 */
export function getEnumValueType(
    node: EnumValueNode,
    path: NodePath,
    linkables: LinkableDictionary,
): { enumPath: NodePath<DefinedTypeNode>; enumType: EnumTypeNode } | undefined {
    const enumPath = linkables.getPath([...path, node.enum]);
    const enumType = enumPath ? getLastNodeFromPath(enumPath).type : undefined;
    return enumPath && enumType && isNode(enumType, 'enumTypeNode') ? { enumPath, enumType } : undefined;
}

/**
 * Whether an enum value renders as a member of a native enum, e.g. `Direction.Up`,
 * rather than through the helper function of a data union, e.g. `command('Move', [1])`.
 * Enums that are not found in the tree are scalar unless listed in `nonScalarEnums`.
 *
 * @param node - The enum value.
 * @param path - The path the enum value was found at, from which its enum link resolves.
 * @param scope - The linkable nodes of the tree and the camelCase names of non-scalar enums.
 */
export function isScalarEnumValue(
    node: EnumValueNode,
    path: NodePath,
    scope: { linkables: LinkableDictionary; nonScalarEnums: readonly string[] },
): boolean {
    if (node.value) return false;
    const enumType = getEnumValueType(node, path, scope.linkables)?.enumType;
    return enumType ? isScalarEnum(enumType) : !scope.nonScalarEnums.includes(camelCase(node.enum.identifier));
}

/**
 * Whether a value contains an enum value rendered through the helper function of a data
 * union, whose return type is the loose type of that union.
 *
 * @param value - The value to search.
 * @param path - The path the value was found at, from which enum links resolve.
 * @param scope - The linkable nodes of the tree and the camelCase names of non-scalar enums.
 */
export function containsDataUnionValue(
    value: Node,
    path: NodePath,
    scope: { linkables: LinkableDictionary; nonScalarEnums: readonly string[] },
): boolean {
    if (isNode(value, 'enumValueNode') && !isScalarEnumValue(value, path, scope)) return true;
    return Object.values(value).some(child =>
        (Array.isArray(child) ? child : [child]).some(
            item => isNodeObject(item) && isNode(item, VALUE_NODE_KINDS) && containsDataUnionValue(item, path, scope),
        ),
    );
}

function isNodeObject(value: unknown): value is Node {
    return typeof value === 'object' && value !== null && typeof (value as { kind?: unknown }).kind === 'string';
}
