import { ConstantNode, isNode, ProgramNode, TypeNode } from '@codama/nodes';
import { getLastNodeFromPath, NodePath, visit } from '@codama/visitors-core';

import { Fragment, fragment, getDocblockFragment, mergeFragments, RenderScope } from '../utils';

/**
 * Renders program constants as TypeScript value declarations.
 *
 * @param scope - The rendering scope and constants to render.
 * @returns The generated constants page fragment, if constants exist.
 */
export function getConstantsPageFragment(
    scope: Pick<RenderScope, 'linkables' | 'nameApi' | 'typeManifestVisitor'> & {
        nodes: ConstantNode[];
        programPath: NodePath<ProgramNode>;
    },
): Fragment | undefined {
    if (scope.nodes.length === 0) return;

    return mergeFragments(
        [...scope.nodes].sort((a, b) => a.name.localeCompare(b.name)).map(node => getConstantFragment(node, scope)),
        constants => constants.join('\n\n'),
    );
}

function getConstantFragment(
    node: ConstantNode,
    scope: Pick<RenderScope, 'linkables' | 'nameApi' | 'typeManifestVisitor'> & {
        programPath: NodePath<ProgramNode>;
    },
): Fragment {
    const typeManifest = visit(node.type, scope.typeManifestVisitor);
    const rawValue = visit(node.value, scope.typeManifestVisitor).value;
    const useBigInt = isNode(node.value, 'numberValueNode') && resolvesToBigInt(node.type, scope);
    const value = useBigInt ? fragment`${rawValue}n` : rawValue;
    const valueType = isNode(node.value, 'stringValueNode') ? fragment`string` : typeManifest.strictType;
    const docs = getDocblockFragment(node.docs ?? [], true);

    return fragment`${docs}export const ${scope.nameApi.constant(node.name)}: ${valueType} = ${value};`;
}

function resolvesToBigInt(
    type: TypeNode,
    scope: Pick<RenderScope, 'linkables' | 'typeManifestVisitor'> & { programPath: NodePath<ProgramNode> },
    path: NodePath = scope.programPath,
    visited: ReadonlySet<TypeNode> = new Set(),
): boolean {
    if (visited.has(type)) return false;
    if (visit(type, scope.typeManifestVisitor).strictType.content === 'bigint') return true;
    if (!isNode(type, 'definedTypeLinkNode')) return false;

    const linkedPath = scope.linkables.getPath([...path, type]);
    if (!linkedPath) return false;

    const linkedType = getLastNodeFromPath(linkedPath).type;
    return resolvesToBigInt(linkedType, scope, linkedPath, new Set([...visited, type]));
}
