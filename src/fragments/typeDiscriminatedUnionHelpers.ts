import { isDataEnum, isNode, TypeNode } from '@codama/nodes';
import { NodePath } from '@codama/visitors-core';

import { Fragment, fragment, getEnumVariantDataShape, mergeFragments, RenderScope, use } from '../utils';

/**
 * Renders the helpers of a data union, e.g. `command('Move', [1, 2])` to create a variant and
 * `isCommand('Move', value)` to narrow one.
 *
 * @param scope - The render scope, the name of the type, the type and its path.
 * @return The fragment of the helpers, if the type is a data union.
 */
export function getTypeDiscriminatedUnionHelpersFragment(
    scope: Pick<RenderScope, 'linkables' | 'nameApi'> & { name: string; typeNode: TypeNode; typePath: NodePath },
): Fragment | undefined {
    const { name, typeNode, typePath, linkables, nameApi } = scope;
    const isDiscriminatedUnion = isNode(typeNode, 'enumTypeNode') && isDataEnum(typeNode);
    if (!isDiscriminatedUnion) return;

    const functionName = nameApi.discriminatedUnionFunction(name);
    const isDiscriminatedUnionFunctionName = nameApi.isDiscriminatedUnionFunction(name);
    const discriminatorName = nameApi.discriminatedUnionDiscriminator(name);
    const strictName = nameApi.dataType(name);
    const looseName = nameApi.dataArgsType(name);

    const getVariantContentType = use('type GetDiscriminatedUnionVariantContent', 'solanaCodecsDataStructures');
    const getVariantType = use('type GetDiscriminatedUnionVariant', 'solanaCodecsDataStructures');
    const variantSignatures = mergeFragments(
        (typeNode.variants ?? []).map(variant => {
            const variantName = nameApi.discriminatedUnionVariant(variant.identifier);
            const shape = getEnumVariantDataShape(variant.data, typePath, linkables);
            if (shape === 'struct') {
                return fragment`export function ${functionName}(kind: '${variantName}', data: ${getVariantContentType}<${looseName}, '${discriminatorName}', '${variantName}'>): ${getVariantType}<${looseName}, '${discriminatorName}', '${variantName}'>;`;
            }
            if (shape !== 'none') {
                return fragment`export function ${functionName}(kind: '${variantName}', data: ${getVariantContentType}<${looseName}, '${discriminatorName}', '${variantName}'>['fields']): ${getVariantType}<${looseName}, '${discriminatorName}', '${variantName}'>;`;
            }
            return fragment`export function ${functionName}(kind: '${variantName}'): ${getVariantType}<${looseName}, '${discriminatorName}', '${variantName}'>;`;
        }),
        cs => (cs.length > 0 ? `${cs.join('\n')}\n` : ''),
    );

    return fragment`// Data Enum Helpers.
${variantSignatures}export function ${functionName}<K extends ${looseName}['${discriminatorName}'], Data>(kind: K, data?: Data) {
  return Array.isArray(data) ? { ${discriminatorName}: kind, fields: data } : { ${discriminatorName}: kind, ...(data ?? {}) };
}

export function ${isDiscriminatedUnionFunctionName}<K extends ${strictName}['${discriminatorName}']>(kind: K, value: ${strictName}): value is ${strictName} & { ${discriminatorName}: K } {
  return value.${discriminatorName} === kind;
};
`;
}
