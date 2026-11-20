/**
 * Validation of the node attributes written into generated code as they are.
 *
 * @packageDocumentation
 */

import { CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE, CodamaError } from '@codama/errors';
import { decimalString, integerString, isNode, type Node, type NodeKind } from '@codama/nodes';
import type { NodePath } from '@codama/visitors-core';

import { EXTRA_ARGUMENT_PLUGIN } from './instructionInputs';
import { isNodeObject } from './nodePaths';

type AttributeRule = (value: unknown) => boolean;

const isInteger: AttributeRule = value => Number.isSafeInteger(value);
const isNonNegativeInteger: AttributeRule = value => Number.isSafeInteger(value) && (value as number) >= 0;
const isBoolean: AttributeRule = value => typeof value === 'boolean';
const isBooleanOrEither: AttributeRule = value => typeof value === 'boolean' || value === 'either';
const isOneOf =
    (...values: unknown[]): AttributeRule =>
    value =>
        values.includes(value);
const matches =
    (assertString: (value: string) => unknown): AttributeRule =>
    value => {
        if (typeof value !== 'string') return false;
        try {
            assertString(value);
            return true;
        } catch {
            return false;
        }
    };

const BYTES_ENCODINGS = ['base16', 'base58', 'base64', 'utf8'];
const DEFAULT_VALUE_STRATEGIES = ['omitted', 'optional'];
const ENDIANNESSES = ['be', 'le'];
const INTEGER_FORMATS = ['i8', 'i16', 'i32', 'i64', 'i128', 'shortU16', 'u8', 'u16', 'u32', 'u64', 'u128'];

/**
 * The attributes of nodes that are written into generated code as they are, e.g. numbers
 * and booleans, along with the values they may hold. Strings written into generated code,
 * such as docs, messages and addresses, are escaped where they are rendered instead, and
 * identifiers go through casing helpers that only keep letters and digits.
 */
const ATTRIBUTE_RULES: Partial<Record<NodeKind, Record<string, AttributeRule>>> = {
    accountNode: { size: isNonNegativeInteger },
    booleanValueNode: { boolean: isBoolean },
    bytesValueNode: { encoding: isOneOf(...BYTES_ENCODINGS) },
    constantDiscriminatorNode: { offset: isNonNegativeInteger },
    enumVariantTypeNode: { discriminator: isInteger },
    errorNode: { code: isNonNegativeInteger },
    fieldDiscriminatorNode: { offset: isNonNegativeInteger },
    fixedCountNode: { value: isNonNegativeInteger },
    fixedSizeTransformNode: { size: isNonNegativeInteger },
    floatTypeNode: { endian: isOneOf(...ENDIANNESSES), format: isOneOf('f32', 'f64') },
    floatValueNode: { value: matches(decimalString) },
    instructionAccountNode: { isOptional: isBoolean, isSigner: isBooleanOrEither, isWritable: isBoolean },
    instructionByteDeltaNode: { subtract: isBoolean, withHeader: isBoolean },
    instructionNode: { optionalAccountStrategy: isOneOf('omitted', 'programId') },
    instructionRemainingAccountsNode: { isOptional: isBoolean, isSigner: isBooleanOrEither, isWritable: isBoolean },
    instructionStatusNode: { lifecycle: isOneOf('archived', 'deprecated', 'draft', 'live') },
    integerTypeNode: { endian: isOneOf(...ENDIANNESSES), format: isOneOf(...INTEGER_FORMATS) },
    integerValueNode: { value: matches(integerString) },
    optionTypeNode: { fixed: isBoolean },
    postOffsetTransformNode: { offset: isInteger, strategy: isOneOf('absolute', 'padded', 'preOffset', 'relative') },
    preOffsetTransformNode: { offset: isInteger, strategy: isOneOf('absolute', 'padded', 'relative') },
    sentinelCountNode: { strategy: isOneOf('omitted', 'optional', 'required') },
    sizeDiscriminatorNode: { size: isNonNegativeInteger },
    stringTypeNode: { encoding: isOneOf(...BYTES_ENCODINGS) },
    structFieldTypeNode: { defaultValueStrategy: isOneOf(...DEFAULT_VALUE_STRATEGIES) },
};

/**
 * Asserts that the attributes of a tree written into generated code as they are hold the
 * values their types allow, e.g. that a size is an integer rather than an arbitrary string.
 *
 * IDLs are loaded from JSON without validation, so their attributes may hold any value
 * regardless of their types. Rendering them as they are could produce code that does not
 * compile or, worse, code that was not described by the IDL.
 *
 * @param node - The root of the tree to validate, e.g. a root node.
 * @param path - The path of the node, to report errors at.
 * @throws `CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE` with the path of the first node holding
 * an invalid attribute.
 *
 * @example
 * ```ts
 * assertValidRenderedAttributes(root);
 * ```
 */
export function assertValidRenderedAttributes(node: Node, path: NodePath = []): void {
    const nodePath: NodePath = [...path, node];
    const rules = ATTRIBUTE_RULES[node.kind] ?? {};
    Object.entries(rules).forEach(([key, rule]) => {
        const value = (node as unknown as Record<string, unknown>)[key];
        if (value !== undefined && !rule(value)) {
            throw new CodamaError(CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE, { path: nodePath });
        }
    });
    getRenderedChildren(node)
        .filter(isNodeObject)
        .forEach(child => assertValidRenderedAttributes(child, nodePath));
}

/**
 * The values of a node that may hold child nodes: its attributes and, for the plugins this
 * renderer renders, their payload. The payloads of other plugins are opaque and left alone.
 */
function getRenderedChildren(node: Node): unknown[] {
    if (isNode(node, 'pluginNode')) {
        if (node.namespace !== EXTRA_ARGUMENT_PLUGIN) return node.plugins ?? [];
        // The type and default value of extra arguments are written into instruction builders.
        const payload = node.payload as { defaultValue?: unknown; type?: unknown } | undefined;
        return [...(node.plugins ?? []), payload?.type, payload?.defaultValue];
    }
    return Object.values(node).flatMap(value => (Array.isArray(value) ? value : [value]));
}
