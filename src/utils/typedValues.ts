/**
 * Renders value nodes as the TypeScript values of a given type.
 *
 * Value nodes do not carry their type, so the same integer value may need to render as a
 * `number`, a `bigint` or `Lamports` depending on where it is used. These helpers walk a
 * value along its type to render each nested value accordingly.
 *
 * @packageDocumentation
 */

import { mapFragmentContent } from '@codama/fragments';
import { camelCase } from '@codama/fragments/casing';
import { isNode, TypeNode, ValueNode } from '@codama/nodes';
import { getLastNodeFromPath, LinkableDictionary, NodePath, visit, Visitor } from '@codama/visitors-core';

import { Fragment, fragment, mergeFragments, use } from './fragment';
import type { TypeManifest } from './typeManifest';
import { getBigIntLiteral, isBigIntegerFormat } from './typeNodes';

/**
 * Renders a value node as a TypeScript value of the given type, e.g. `42n` for an
 * integer value of a `u64` type, `some(42n)` for an option of a `u64`, or
 * `lamports(5000n)` for a SOL amount.
 *
 * By default, values are rendered for the strict type, i.e. the decoded one. Values
 * rendered for the loose type, i.e. the input of encoders, keep numbers as they are
 * since loose types accept both numbers and bigints.
 *
 * @param value - The value node to render.
 * @param type - The type of the value, if known. Values of unknown types render as is.
 * @param scope - The type manifest visitor rendering untyped values, the linkables
 * resolving defined type links, the path the type was found at, and whether to
 * render the value for the loose type.
 * @return The fragment of the TypeScript value.
 *
 * @example
 * ```ts
 * getTypedValueFragment(someValueNode(integerValueNode('42')), optionTypeNode(integerTypeNode('u64')), scope);
 * // some(42n)
 * ```
 */
export function getTypedValueFragment(
    value: ValueNode,
    type: TypeNode | undefined,
    scope: {
        linkables: LinkableDictionary;
        loose?: boolean;
        path: NodePath;
        typeManifestVisitor: Visitor<TypeManifest, ValueNode['kind']>;
    },
): Fragment {
    const untyped = () => visit(value, scope.typeManifestVisitor).value;
    const resolved = type ? resolveDefinedTypeLinks(type, scope) : undefined;
    if (!resolved) return untyped();
    const { path } = resolved;
    const typed = (childValue: ValueNode, childType: TypeNode | undefined) =>
        getTypedValueFragment(childValue, childType, { ...scope, path });
    const valueType = resolved.type;

    switch (valueType.kind) {
        case 'integerTypeNode':
            return !scope.loose && isNode(value, 'integerValueNode') && isBigIntegerFormat(valueType.format)
                ? mapFragmentContent(untyped(), getBigIntLiteral)
                : untyped();
        case 'fixedPointTypeNode': {
            const number = typed(value, valueType.number);
            const isSolAmount = valueType.scale === 9 && (valueType.base ?? 10) === 10 && valueType.unit === 'SOL';
            if (!isSolAmount || !isNode(value, 'integerValueNode')) return number;
            return fragment`${use('lamports', 'solanaRpcTypes')}(${mapFragmentContent(number, getBigIntLiteral)})`;
        }
        case 'dateTimeTypeNode':
        case 'durationTypeNode':
            return typed(value, valueType.number);
        case 'optionTypeNode':
        case 'remainderOptionTypeNode':
        case 'zeroableOptionTypeNode':
            return isNode(value, 'someValueNode')
                ? fragment`${use('some', 'solanaOptions')}(${typed(value.value, valueType.item)})`
                : untyped();
        case 'arrayTypeNode':
            return isNode(value, 'arrayValueNode')
                ? mergeFragments(
                      (value.items ?? []).map(item => typed(item, valueType.item)),
                      cs => `[${cs.join(', ')}]`,
                  )
                : untyped();
        case 'setTypeNode':
            return isNode(value, 'setValueNode')
                ? mergeFragments(
                      (value.items ?? []).map(item => typed(item, valueType.item)),
                      cs => `new Set([${cs.join(', ')}])`,
                  )
                : untyped();
        case 'tupleTypeNode':
            return isNode(value, 'tupleValueNode')
                ? mergeFragments(
                      (value.items ?? []).map((item, index) => typed(item, valueType.items?.[index])),
                      cs => `[${cs.join(', ')}]`,
                  )
                : untyped();
        case 'mapTypeNode':
            return isNode(value, 'mapValueNode')
                ? mergeFragments(
                      (value.entries ?? []).map(entry =>
                          mergeFragments(
                              [typed(entry.key, valueType.key), typed(entry.value, valueType.value)],
                              cs => `[${cs.join(', ')}]`,
                          ),
                      ),
                      cs => `new Map([${cs.join(', ')}])`,
                  )
                : untyped();
        case 'structTypeNode':
            return isNode(value, 'structValueNode')
                ? mergeFragments(
                      (value.fields ?? []).map(field => {
                          const fieldType = valueType.fields?.find(f => f.identifier === field.identifier)?.type;
                          return fragment`${camelCase(field.identifier)}: ${typed(field.value, fieldType)}`;
                      }),
                      cs => `{ ${cs.join(', ')} }`,
                  )
                : untyped();
        default:
            return untyped();
    }
}

/**
 * Follows defined type links to the type they refer to, along with the path of that type,
 * from which the links it contains resolve.
 */
function resolveDefinedTypeLinks(
    type: TypeNode,
    scope: { linkables: LinkableDictionary; path: NodePath },
    followed: ReadonlySet<TypeNode> = new Set(),
): { path: NodePath; type: TypeNode } | undefined {
    if (!isNode(type, 'definedTypeLinkNode')) return { path: scope.path, type };
    if (followed.has(type)) return undefined;
    const definedTypePath = scope.linkables.getPath([...scope.path, type]);
    if (!definedTypePath) return undefined;
    const definedType = getLastNodeFromPath(definedTypePath);
    return resolveDefinedTypeLinks(definedType.type, { ...scope, path: definedTypePath }, new Set([...followed, type]));
}
