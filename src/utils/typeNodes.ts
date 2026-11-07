import { NestedTypeNode, NumberTypeNode, resolveNestedTypeNode, TypeNode } from '@codama/nodes';

/**
 * Helpers reading type nodes the way the renderer needs them, so that the
 * way the IDL wraps types (e.g. with size prefixes or offsets) is only known here.
 */

/** The innermost type of a possibly wrapped type node. */
export function getInnerTypeNode<T extends TypeNode>(node: NestedTypeNode<T>): T {
    return resolveNestedTypeNode(node);
}

/** Whether a number type is the default one for prefixes and sizes, i.e. a little-endian number of the given format. */
export function isDefaultNumberType(node: NumberTypeNode, format: NumberTypeNode['format']): boolean {
    return node.format === format && node.endian === 'le';
}

/** The number formats rendered as `bigint` in TypeScript. */
export function isBigNumberFormat(format: NumberTypeNode['format']): boolean {
    return ['u64', 'u128', 'i64', 'i128'].includes(format);
}
