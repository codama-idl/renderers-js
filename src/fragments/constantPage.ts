import { camelCase } from '@codama/fragments/casing';
import { ConstantNode, isNode, ProgramNode } from '@codama/nodes';
import { NodePath, visit } from '@codama/visitors-core';

import {
    containsDataUnionValue,
    Fragment,
    fragment,
    getDocblockFragment,
    getTypedValueFragment,
    mergeFragments,
    RenderScope,
} from '../utils';

/**
 * Renders program constants as TypeScript value declarations.
 *
 * @param scope - The rendering scope and constants to render.
 * @returns The generated constants page fragment, if constants exist.
 */
export function getConstantsPageFragment(
    scope: Pick<RenderScope, 'linkables' | 'nameApi' | 'nonScalarEnums' | 'typeManifestVisitor'> & {
        nodes: ConstantNode[];
        programPath: NodePath<ProgramNode>;
    },
): Fragment | undefined {
    if (scope.nodes.length === 0) return;

    return mergeFragments(
        [...scope.nodes]
            .sort((a, b) => camelCase(a.identifier).localeCompare(camelCase(b.identifier)))
            .map(node => getConstantFragment(node, scope)),
        constants => constants.join('\n\n'),
    );
}

function getConstantFragment(
    node: ConstantNode,
    scope: Pick<RenderScope, 'linkables' | 'nameApi' | 'nonScalarEnums' | 'typeManifestVisitor'> & {
        programPath: NodePath<ProgramNode>;
    },
): Fragment {
    const { linkables, programPath, typeManifestVisitor } = scope;
    const typeManifest = visit(node.type, typeManifestVisitor);
    const value = getTypedValueFragment(node.value, node.type, { linkables, path: programPath, typeManifestVisitor });
    // Data union helpers return the loose type of their union, so such values are typed as loose.
    const valueType = isNode(node.value, 'stringValueNode')
        ? fragment`string`
        : containsDataUnionValue(node.value, programPath, scope)
          ? typeManifest.looseType
          : typeManifest.strictType;
    const docs = getDocblockFragment(node.docs, true);

    return fragment`${docs}export const ${scope.nameApi.constant(node.identifier)}: ${valueType} = ${value};`;
}
