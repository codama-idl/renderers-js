import { camelCase, EventNode, isNode, isNodeFilter, resolveNestedTypeNode } from '@codama/nodes';
import { mapFragmentContent } from '@codama/renderers-core';
import { visit } from '@codama/visitors-core';

import { Fragment, fragment, mergeFragments, RenderScope, use } from '../utils';
import { getDiscriminatorConstantsFragment } from './discriminatorConstants';

/** Renders a complete event type, decoder, parser, and discriminator API. */
export function getEventPageFragment(
    scope: Pick<RenderScope, 'nameApi' | 'typeManifestVisitor'> & { node: EventNode },
): Fragment {
    const unsupportedDiscriminator = (scope.node.discriminators ?? []).find(
        discriminator => !isNode(discriminator, 'constantDiscriminatorNode') && !isNode(discriminator, 'fieldDiscriminatorNode'),
    );
    if (unsupportedDiscriminator) {
        throw new Error(
            `Cannot render event "${scope.node.name}": unsupported ${unsupportedDiscriminator.kind}.`,
        );
    }
    const resolvedData = resolveNestedTypeNode(scope.node.data);
    const discriminatorFields = new Set(
        (scope.node.discriminators ?? [])
            .filter(isNodeFilter('fieldDiscriminatorNode'))
            .map(discriminator => discriminator.name),
    );
    const publicData = isNode(resolvedData, 'structTypeNode')
        ? { ...resolvedData, fields: (resolvedData.fields ?? []).filter(field => !discriminatorFields.has(field.name)) }
        : resolvedData;
    const publicManifest = visit(publicData, scope.typeManifestVisitor);
    const wireManifest = visit(scope.node.data, scope.typeManifestVisitor);
    const eventName = `${scope.nameApi.dataType(scope.node.name)}Event`;
    const decoderName = `get${eventName}Decoder`;
    const parserName = `parse${eventName}`;
    const discriminators = scope.node.discriminators ?? [];
    const constants = getDiscriminatorConstantsFragment({
        ...scope,
        discriminatorNodes: discriminators,
        fields: isNode(resolvedData, 'structTypeNode') ? (resolvedData.fields ?? []) : [],
        prefix: scope.node.name,
    });
    const constantDiscriminators = discriminators.filter(isNodeFilter('constantDiscriminatorNode'));
    const wireDecoder = constantDiscriminators.reduce((decoder, discriminator, index) => {
        const suffix = index === 0 ? '' : `_${index + 1}`;
        const constantName = scope.nameApi.constant(camelCase(`${scope.node.name}_discriminator${suffix}`));
        const discriminatorValue = visit(discriminator.constant, scope.typeManifestVisitor).value.content;
        return mapFragmentContent(decoder, content => content.replace(discriminatorValue, constantName));
    }, wireManifest.decoder);
    const validations = constantDiscriminators
        .map((discriminator, index) => {
            const suffix = index === 0 ? '' : `_${index + 1}`;
            const constantName = scope.nameApi.constant(camelCase(`${scope.node.name}_discriminator${suffix}`));
            return fragment`if (!${use('containsBytes', 'solanaCodecsCore')}(data, ${constantName}, ${discriminator.offset})) {
    throw new Error('${eventName} discriminator mismatch');
  }`;
        });
    const validation = mergeFragments(validations, contents => contents.join('\n  '));

    return mergeFragments([
        constants,
        fragment`export type ${eventName} = ${publicManifest.strictType};

function ${decoderName}(): ${use('type Decoder', 'solanaCodecsCore')}<${eventName}> {
  return ${wireDecoder} as ${use('type Decoder', 'solanaCodecsCore')}<${eventName}>;
}

export function ${parserName}(data: Uint8Array): ${eventName} {
  ${validation}
  return ${decoderName}().decode(data);
}`,
    ], contents => contents.join('\n\n'));
}
