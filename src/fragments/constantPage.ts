import { ConstantNode, isNode } from '@codama/nodes';
import { visit } from '@codama/visitors-core';

import { Fragment, fragment, getDocblockFragment, mergeFragments, RenderScope } from '../utils';

/**
 * Renders program constants as TypeScript value declarations.
 *
 * @param scope - The rendering scope and constants to render.
 * @returns The generated constants page fragment, if constants exist.
 */
export function getConstantsPageFragment(
    scope: Pick<RenderScope, 'nameApi' | 'typeManifestVisitor'> & { nodes: ConstantNode[] },
): Fragment | undefined {
    if (scope.nodes.length === 0) return;

    return mergeFragments(
        [...scope.nodes].sort((a, b) => a.name.localeCompare(b.name)).map(node => getConstantFragment(node, scope)),
        constants => constants.join('\n\n'),
    );
}

function getConstantFragment(
    node: ConstantNode,
    scope: Pick<RenderScope, 'nameApi' | 'typeManifestVisitor'>,
): Fragment {
    const typeManifest = visit(node.type, scope.typeManifestVisitor);
    const rawValue = visit(node.value, scope.typeManifestVisitor).value;
    const isNumberValue = isNode(node.value, 'numberValueNode');
    const isNumberType = isNode(node.type, 'numberTypeNode');
    const isSafeNumberType = isNumberType && ['u8', 'u16', 'u32'].includes(node.type.format);
    const useBigInt = isNumberValue && isNumberType && !isSafeNumberType;
    const value = useBigInt ? fragment`${rawValue}n` : rawValue;
    const valueType = isNode(node.value, 'stringValueNode')
        ? fragment`string`
        : useBigInt
          ? fragment`bigint`
          : typeManifest.strictType;
    const docs = getDocblockFragment(node.docs ?? [], true);

    return fragment`${docs}export const ${scope.nameApi.constant(node.name)}: ${valueType} = ${value};`;
}
