import { DefinedTypeNode } from '@codama/nodes';
import { NodePath, pipe, visit } from '@codama/visitors-core';

import { Fragment, mergeFragments, removeFragmentImports, RenderScope } from '../utils';
import { getTypeDiscriminatedUnionHelpersFragment } from './typeDiscriminatedUnionHelpers';
import { getTypeWithCodecFragment } from './typeWithCodec';

export function getTypePageFragment(
    scope: Pick<RenderScope, 'erasableSyntax' | 'linkables' | 'nameApi' | 'typeManifestVisitor'> & {
        node: DefinedTypeNode;
        size: number | null;
        typePath: NodePath<DefinedTypeNode>;
    },
): Fragment {
    const node = scope.node;
    const manifest = visit(node, scope.typeManifestVisitor);
    return pipe(
        mergeFragments(
            [
                getTypeWithCodecFragment({
                    ...scope,
                    manifest,
                    name: node.identifier,
                    node: node.type,
                    typeDocs: node.docs,
                }),
                getTypeDiscriminatedUnionHelpersFragment({
                    ...scope,
                    name: node.identifier,
                    typeNode: node.type,
                    typePath: scope.typePath,
                }),
            ],
            cs => cs.join('\n\n'),
        ),
        f =>
            removeFragmentImports(f, 'generatedTypes', [
                scope.nameApi.dataType(node.identifier),
                scope.nameApi.dataArgsType(node.identifier),
                scope.nameApi.encoderFunction(node.identifier),
                scope.nameApi.decoderFunction(node.identifier),
                scope.nameApi.codecFunction(node.identifier),
            ]),
    );
}
