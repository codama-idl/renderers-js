/**
 * Helpers reading type nodes the way the renderer needs them.
 *
 * @packageDocumentation
 */

import {
    IntegerFormat,
    IntegerTypeNode,
    isNode,
    Node,
    StructFieldTypeNode,
    TransformNode,
    TypeNode,
    ValueNode,
} from '@codama/nodes';
import { LinkableDictionary, NodePath } from '@codama/visitors-core';

/**
 * Whether an integer type is the default one for prefixes and sizes, i.e. a
 * little-endian integer of the given format without any transform.
 */
export function isDefaultIntegerType(node: IntegerTypeNode, format: IntegerFormat): boolean {
    return node.format === format && (node.endian ?? 'le') === 'le' && (node.transforms ?? []).length === 0;
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
 * Injected values are resolved from the providers of an enclosing instruction, so
 * they are filled in by instruction builders rather than by the codec of the field.
 */
export function getStructFieldCodecDefault(field: StructFieldTypeNode): ValueNode | undefined {
    if (!field.defaultValue || isNode(field.defaultValue, 'injectedValueNode')) return undefined;
    return field.defaultValue;
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
 * Whether the data of an enum variant is spread into the variant object, i.e. it is a
 * struct, inline or linked, rather than exposed under a `fields` tuple attribute.
 *
 * @param data - The data of the variant.
 * @param path - The path of the variant, used to resolve a linked defined type.
 * @param linkables - The linkable nodes of the tree.
 */
export function isStructEnumVariantData(
    data: TypeNode | undefined,
    path: NodePath,
    linkables: LinkableDictionary,
): boolean {
    if (!data) return false;
    if (isNode(data, 'structTypeNode')) return true;
    if (!isNode(data, 'definedTypeLinkNode')) return false;
    const linkedType = linkables.get([...path, data])?.type;
    return !!linkedType && isNode(linkedType, 'structTypeNode');
}
