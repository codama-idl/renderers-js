/**
 * Helpers reading type nodes the way the renderer needs them.
 *
 * @packageDocumentation
 */

import {
    FloatFormat,
    IntegerFormat,
    IntegerTypeNode,
    isNode,
    Node,
    StructFieldTypeNode,
    TransformNode,
    TypeNode,
    ValueNode,
} from '@codama/nodes';
import { getLastNodeFromPath, LinkableDictionary, NodePath } from '@codama/visitors-core';

/**
 * Whether an integer type is the default one for prefixes and sizes, i.e. a
 * little-endian integer of the given format without any transform. The byte
 * order of formats that have none, such as `u8`, is ignored.
 */
export function isDefaultIntegerType(node: IntegerTypeNode, format: IntegerFormat): boolean {
    const isLittleEndian = !hasByteOrder(node.format) || (node.endian ?? 'le') === 'le';
    return node.format === format && isLittleEndian && (node.transforms ?? []).length === 0;
}

/** Whether an integer or float format has a byte order, unlike single-byte and variable-length formats. */
export function hasByteOrder(format: FloatFormat | IntegerFormat): boolean {
    return !['i8', 'shortU16', 'u8'].includes(format);
}

/** The integer formats rendered as `bigint` in TypeScript. */
export function isBigIntegerFormat(format: IntegerFormat): boolean {
    return ['u64', 'u128', 'i64', 'i128'].includes(format);
}

/** The transforms of a type node, innermost first. */
export function getTypeNodeTransforms(node: Node): readonly TransformNode[] {
    return 'transforms' in node && Array.isArray(node.transforms) ? (node.transforms as TransformNode[]) : [];
}

/**
 * The default value of a struct field that its codec fills in, if any.
 *
 * An injected value is resolved from the providers of an enclosing instruction, which
 * instruction builders fill in before encoding. Its codec can therefore only fill in
 * its `fallback`, the value used when nothing is provided — e.g. in account data —
 * and only when no value was given, see {@link isStructFieldCodecDefaultOverridable}.
 */
export function getStructFieldCodecDefault(field: StructFieldTypeNode): ValueNode | undefined {
    if (!field.defaultValue) return undefined;
    if (isNode(field.defaultValue, 'injectedValueNode')) return field.defaultValue.fallback;
    return field.defaultValue;
}

/**
 * Whether a value given for a struct field takes precedence over the default value its
 * codec fills in. That is the case unless the default is omitted from the input, except
 * for injected values, since instruction builders provide them before encoding.
 */
export function isStructFieldCodecDefaultOverridable(field: StructFieldTypeNode): boolean {
    return field.defaultValueStrategy !== 'omitted' || isNode(field.defaultValue, 'injectedValueNode');
}

/**
 * The integer literal of an integer value: a number when it can be represented
 * exactly by a JavaScript number, a `bigint` literal otherwise.
 */
export function getIntegerLiteral(value: string): string {
    return Number.isSafeInteger(Number(value)) ? value : `${value}n`;
}

/**
 * The fields of a type when it is a struct, or no fields otherwise, e.g. to find
 * the field a field discriminator of an account, event or instruction refers to.
 */
export function getStructFields(type: TypeNode | undefined): StructFieldTypeNode[] {
    return type && isNode(type, 'structTypeNode') ? (type.fields ?? []) : [];
}

/** The `bigint` literal of an integer literal, e.g. `42n` for `42`. */
export function getBigIntLiteral(integerLiteral: string): string {
    return integerLiteral.endsWith('n') ? integerLiteral : `${integerLiteral}n`;
}

/**
 * How the data of an enum variant is exposed on the variant object:
 *
 * - `none`: a unit variant, without data.
 * - `struct`: the fields of a struct are spread alongside the discriminator.
 * - `tuple`: the items of a tuple are exposed as the `fields` attribute.
 * - `single`: any other type is exposed as a one-item `fields` tuple, which
 *   encodes to the same bytes, so `Variant(u8)` and `Variant((u8,))` share an API.
 */
export type EnumVariantDataShape = 'none' | 'single' | 'struct' | 'tuple';

/**
 * The shape of the data of an enum variant, following defined type links to
 * their target, through any number of links.
 *
 * A link that cannot be resolved from the linkables, e.g. a type imported from
 * outside the tree through `linkOverrides`, is exposed as a `single` value.
 *
 * @param data - The data of the variant.
 * @param path - The path of the variant, used to resolve defined type links.
 * @param linkables - The linkable nodes of the tree.
 */
export function getEnumVariantDataShape(
    data: TypeNode | undefined,
    path: NodePath,
    linkables: LinkableDictionary,
): EnumVariantDataShape {
    if (!data) return 'none';
    const visited = new Set<TypeNode>();
    let current: TypeNode = data;
    let currentPath: NodePath = path;
    while (isNode(current, 'definedTypeLinkNode') && !visited.has(current)) {
        visited.add(current);
        const linkedPath = linkables.getPath([...currentPath, current]);
        if (!linkedPath) return 'single';
        currentPath = linkedPath;
        current = getLastNodeFromPath(linkedPath).type;
    }
    if (isNode(current, 'structTypeNode')) return 'struct';
    if (isNode(current, 'tupleTypeNode')) return 'tuple';
    return 'single';
}
