import { camelCase, EventNode, isNode, resolveNestedTypeNode, structTypeNode } from '@codama/nodes';
import { findProgramNodeFromPath, getLastNodeFromPath, NodePath, visit } from '@codama/visitors-core';

import { Fragment, fragment, mergeFragments, RenderScope, use } from '../utils';
import { getDiscriminatorConditionFragment } from './discriminatorCondition';
import { getDiscriminatorConstantsFragment } from './discriminatorConstants';
import { getTypeWithCodecFragment } from './typeWithCodec';

/**
 * Renders a complete event page: discriminator constants, the event data type,
 * its codec functions and a parse helper validating the event discriminators.
 *
 * @param scope - The render scope with the path to the {@link EventNode} and its byte size.
 * @returns A {@link Fragment} containing the full event page.
 */
export function getEventPageFragment(
    scope: Pick<RenderScope, 'erasableSyntax' | 'nameApi' | 'typeManifestVisitor'> & {
        eventPath: NodePath<EventNode>;
        size: number | null;
    },
): Fragment {
    const node = getLastNodeFromPath(scope.eventPath);
    if (!findProgramNodeFromPath(scope.eventPath)) {
        throw new Error('Event must be visited inside a program.');
    }

    const { nameApi } = scope;
    const typeManifest = visit(node, scope.typeManifestVisitor);
    const eventDataName = nameApi.eventDataType(node.name);
    const resolvedData = resolveNestedTypeNode(node.data);
    const fields = isNode(resolvedData, 'structTypeNode') ? (resolvedData.fields ?? []) : [];

    return mergeFragments(
        [
            getDiscriminatorConstantsFragment({
                ...scope,
                discriminatorNodes: node.discriminators ?? [],
                fields,
                prefix: camelCase(eventDataName),
            }),
            getTypeWithCodecFragment({
                codecDocs: [`Gets the codec for {@link ${nameApi.dataType(eventDataName)}} event data.`],
                decoderDocs: [`Gets the decoder for {@link ${nameApi.dataType(eventDataName)}} event data.`],
                encoderDocs: [`Gets the encoder for {@link ${nameApi.dataArgsType(eventDataName)}} event data.`],
                erasableSyntax: scope.erasableSyntax,
                manifest: typeManifest,
                name: eventDataName,
                nameApi,
                node: node.data,
                size: scope.size,
                typeDocs: node.docs,
            }),
            getEventParseFunctionFragment({ ...scope, node }),
        ],
        cs => cs.join('\n\n'),
    );
}

/**
 * Renders the parse function of an event, which validates the event
 * discriminators before decoding the provided bytes.
 *
 * @param scope - The render scope with the event node and its path.
 * @returns A {@link Fragment} containing the parse function.
 */
function getEventParseFunctionFragment(
    scope: Pick<RenderScope, 'nameApi' | 'typeManifestVisitor'> & {
        eventPath: NodePath<EventNode>;
        node: EventNode;
    },
): Fragment {
    const { nameApi, node } = scope;
    const eventDataName = nameApi.eventDataType(node.name);
    const strictName = nameApi.dataType(eventDataName);
    const parseFunction = nameApi.eventParseFunction(node.name);
    const decoderFunction = nameApi.decoderFunction(eventDataName);
    const readonlyUint8Array = use('type ReadonlyUint8Array', 'solanaCodecsCore');
    const docblock = fragment`/** Parses the provided bytes into {@link ${strictName}} event data. */\n`;

    const discriminators = node.discriminators ?? [];
    if (discriminators.length === 0) {
        return fragment`${docblock}export function ${parseFunction}(data: ${readonlyUint8Array} | Uint8Array): ${strictName} {
    return ${decoderFunction}().decode(data);
}`;
    }

    const resolvedData = resolveNestedTypeNode(node.data);
    const condition = getDiscriminatorConditionFragment({
        ...scope,
        dataName: 'data',
        discriminators,
        ifTrue: `return ${decoderFunction}().decode(data);`,
        programNode: findProgramNodeFromPath(scope.eventPath)!,
        struct: isNode(resolvedData, 'structTypeNode') ? resolvedData : structTypeNode([]),
    });

    return fragment`${docblock}export function ${parseFunction}(data: ${readonlyUint8Array} | Uint8Array): ${strictName} {
    ${condition}
    throw new Error('The provided data does not match the "${strictName}" event discriminators.');
}`;
}
