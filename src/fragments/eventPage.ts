import { camelCase, definedTypeNode, EventNode, isNode, isNodeFilter, resolveNestedTypeNode } from '@codama/nodes';
import { pipe, visit } from '@codama/visitors-core';

import { Fragment, fragment, getDocblockFragment, mergeFragments, removeFragmentImports, RenderScope } from '../utils';
import { getDiscriminatorConstantsFragment } from './discriminatorConstants';
import { getEventDecodeFragment } from './eventDecode';
import { getTypeDecoderFragment } from './typeDecoder';

export function getEventPageFragment(
    scope: Pick<RenderScope, 'nameApi' | 'typeManifestVisitor'> & { eventNode: EventNode; size: number | null },
): Fragment {
    const node = scope.eventNode;
    const innerType = resolveNestedTypeNode(node.data);
    const syntheticType = definedTypeNode({ docs: node.docs, name: node.name, type: innerType });
    const typeManifest = visit(syntheticType, scope.typeManifestVisitor);

    const discriminatorNodes = node.discriminators ?? [];
    const fields = isNode(innerType, 'structTypeNode') ? innerType.fields : [];
    const hasConstantDiscriminator = discriminatorNodes.some(d => isNode(d, 'constantDiscriminatorNode'));
    const shouldGenerateDecode = hasConstantDiscriminator && isNode(node.data, 'hiddenPrefixTypeNode');

    const constantDiscriminatorImports = discriminatorNodes
        .filter(isNodeFilter('constantDiscriminatorNode'))
        .flatMap((_, index) => {
            const suffix = index <= 0 ? '' : `_${index + 1}`;
            const name = camelCase(`${node.name}_discriminator${suffix}`);
            return [scope.nameApi.constant(name), scope.nameApi.constantFunction(name)];
        });
    const fieldDiscriminatorImports = discriminatorNodes.filter(isNodeFilter('fieldDiscriminatorNode')).flatMap(d => {
        const name = camelCase(`${node.name}_${d.name}`);
        return [scope.nameApi.constant(name), scope.nameApi.constantFunction(name)];
    });
    const discriminatorSelfImports = [...constantDiscriminatorImports, ...fieldDiscriminatorImports];

    const strictName = scope.nameApi.dataType(node.name);
    const docblock = getDocblockFragment(node.docs ?? [], true);

    return pipe(
        mergeFragments(
            [
                getDiscriminatorConstantsFragment({
                    ...scope,
                    discriminatorNodes,
                    fields,
                    prefix: node.name,
                }),
                fragment`${docblock}export type ${strictName} = ${typeManifest.strictType};`,
                getTypeDecoderFragment({
                    ...scope,
                    manifest: typeManifest,
                    name: node.name,
                    node: innerType,
                    size: scope.size,
                }),
                shouldGenerateDecode ? getEventDecodeFragment({ ...scope, eventNode: node }) : undefined,
            ],
            cs => cs.join('\n\n'),
        ),
        f =>
            removeFragmentImports(f, 'generatedEvents', [
                scope.nameApi.dataType(node.name),
                scope.nameApi.decoderFunction(node.name),
                scope.nameApi.eventDecodeFunction(node.name),
                ...discriminatorSelfImports,
            ]),
    );
}
