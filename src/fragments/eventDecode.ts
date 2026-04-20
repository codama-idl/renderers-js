import { camelCase, EventNode, isNode, isNodeFilter } from '@codama/nodes';

import { Fragment, fragment, mergeFragments, RenderScope, use } from '../utils';

export function getEventDecodeFragment(scope: Pick<RenderScope, 'nameApi'> & { eventNode: EventNode }): Fragment {
    const { eventNode, nameApi } = scope;
    const discriminators = eventNode.discriminators ?? [];
    const constantDiscs = discriminators.filter(isNodeFilter('constantDiscriminatorNode'));

    const containsBytes = use('containsBytes', 'solanaCodecsCore');
    const validationChecks = mergeFragments(
        constantDiscs.map((disc, index) => {
            const suffix = index <= 0 ? '' : `_${index + 1}`;
            const name = camelCase(`${eventNode.name}_discriminator${suffix}`);
            const constant = nameApi.constant(name);
            const offset = disc.offset ?? 0;
            return fragment`if (!${containsBytes}(data, ${constant}, ${offset})) {
    throw new Error('Invalid event discriminator for ${eventNode.name}');
  }`;
        }),
        c => c.join('\n  '),
    );

    const decodeFunction = nameApi.eventDecodeFunction(eventNode.name);
    const strictType = nameApi.dataType(eventNode.name);
    const decoderFunction = nameApi.decoderFunction(eventNode.name);

    let skipExpr: string;
    if (isNode(eventNode.data, 'hiddenPrefixTypeNode') && eventNode.data.prefix.length === 1) {
        const firstDiscConstant = nameApi.constant(camelCase(`${eventNode.name}_discriminator`));
        skipExpr = `${firstDiscConstant}.length`;
    } else if (isNode(eventNode.data, 'hiddenPrefixTypeNode')) {
        const totalSize = eventNode.data.prefix.reduce(
            (sum, p) => sum + (isNode(p.type, 'fixedSizeTypeNode') ? p.type.size : 0),
            0,
        );
        skipExpr = String(totalSize);
    } else {
        throw new Error(`Unexpected event data type for ${eventNode.name}`);
    }

    return fragment`export function ${decodeFunction}(data: ${use('type ReadonlyUint8Array', 'solanaCodecsCore')}): ${strictType} {
  ${validationChecks}
  return ${decoderFunction}().decode(data, ${skipExpr});
}`;
}
