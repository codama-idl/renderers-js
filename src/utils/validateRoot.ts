import { CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE, CodamaError } from '@codama/errors';
import type { Node, NodeKind } from '@codama/nodes';

type AttributeRule = (value: unknown) => boolean;

const isInteger: AttributeRule = value => Number.isSafeInteger(value);
const isNonNegativeInteger: AttributeRule = value => Number.isSafeInteger(value) && (value as number) >= 0;
const isNumber: AttributeRule = value => typeof value === 'number' && Number.isFinite(value);
const isBoolean: AttributeRule = value => typeof value === 'boolean';
const isBooleanOrEither: AttributeRule = value => typeof value === 'boolean' || value === 'either';
const isOneOf =
    (...values: string[]): AttributeRule =>
    value =>
        typeof value === 'string' && values.includes(value);

const BYTES_ENCODINGS = ['base16', 'base58', 'base64', 'utf8'];
const DEFAULT_VALUE_STRATEGIES = ['omitted', 'optional'];
const NUMBER_FORMATS = ['f32', 'f64', 'i8', 'i16', 'i32', 'i64', 'i128', 'shortU16', 'u8', 'u16', 'u32', 'u64', 'u128'];

/**
 * The attributes of nodes that are written into generated code as they are, e.g. numbers
 * and booleans, along with the values they may hold. Strings written into generated code,
 * such as docs, messages and addresses, are escaped where they are rendered instead.
 */
const ATTRIBUTE_RULES: Partial<Record<NodeKind, Record<string, AttributeRule>>> = {
    accountNode: { size: isInteger },
    amountTypeNode: { decimals: isInteger },
    booleanValueNode: { boolean: isBoolean },
    bytesValueNode: { encoding: isOneOf(...BYTES_ENCODINGS) },
    constantDiscriminatorNode: { offset: isInteger },
    enumEmptyVariantTypeNode: { discriminator: isInteger },
    enumStructVariantTypeNode: { discriminator: isInteger },
    enumTupleVariantTypeNode: { discriminator: isInteger },
    errorNode: { code: isNonNegativeInteger },
    fieldDiscriminatorNode: { offset: isInteger },
    fixedCountNode: { value: isInteger },
    fixedSizeTypeNode: { size: isInteger },
    instructionAccountNode: { isOptional: isBoolean, isSigner: isBooleanOrEither, isWritable: isBoolean },
    instructionArgumentNode: { defaultValueStrategy: isOneOf(...DEFAULT_VALUE_STRATEGIES) },
    instructionByteDeltaNode: { subtract: isBoolean, withHeader: isBoolean },
    instructionNode: { optionalAccountStrategy: isOneOf('omitted', 'programId') },
    instructionRemainingAccountsNode: { isOptional: isBoolean, isSigner: isBooleanOrEither, isWritable: isBoolean },
    numberTypeNode: { endian: isOneOf('be', 'le'), format: isOneOf(...NUMBER_FORMATS) },
    numberValueNode: { number: isNumber },
    optionTypeNode: { fixed: isBoolean },
    postOffsetTypeNode: { offset: isInteger, strategy: isOneOf('absolute', 'padded', 'preOffset', 'relative') },
    preOffsetTypeNode: { offset: isInteger, strategy: isOneOf('absolute', 'padded', 'relative') },
    sizeDiscriminatorNode: { size: isInteger },
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
 * @throws `CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE` with the first node holding an invalid attribute.
 *
 * @example
 * ```ts
 * assertValidRenderedAttributes(root);
 * ```
 */
export function assertValidRenderedAttributes(node: Node): void {
    const rules = ATTRIBUTE_RULES[node.kind] ?? {};
    Object.entries(node).forEach(([key, value]) => {
        const rule = rules[key];
        if (value !== undefined && rule && !rule(value)) {
            throw new CodamaError(CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE, { kind: node.kind, node });
        }
    });
    Object.values(node).forEach(value => {
        const children: unknown[] = Array.isArray(value) ? value : [value];
        children.filter(isNodeObject).forEach(assertValidRenderedAttributes);
    });
}

function isNodeObject(value: unknown): value is Node {
    return typeof value === 'object' && value !== null && typeof (value as { kind?: unknown }).kind === 'string';
}
