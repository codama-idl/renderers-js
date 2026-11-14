import { camelCase } from '@codama/fragments/casing';
import {
    ConstantDiscriminatorNode,
    DiscriminatorNode,
    FieldDiscriminatorNode,
    isNodeFilter,
    StructFieldTypeNode,
    TypeNode,
    ValueNode,
} from '@codama/nodes';
import { NodePath, visit } from '@codama/visitors-core';

import {
    Fragment,
    fragment,
    getFieldDiscriminatorIdentifier,
    getTypedValueFragment,
    mergeFragments,
    NameApi,
    RenderScope,
    use,
} from '../utils';

export function getDiscriminatorConstantsFragment(
    scope: Pick<RenderScope, 'linkables' | 'nameApi' | 'typeManifestVisitor'> & {
        discriminatorNodes: DiscriminatorNode[];
        fields: StructFieldTypeNode[];
        path: NodePath;
        prefix: string;
    },
): Fragment {
    const fragments = scope.discriminatorNodes
        .map(node => getDiscriminatorConstantFragment(node, scope))
        .filter(Boolean) as Fragment[];

    return mergeFragments(fragments, c => c.join('\n\n'));
}

export function getDiscriminatorConstantFragment(
    discriminatorNode: DiscriminatorNode,
    scope: Pick<RenderScope, 'linkables' | 'nameApi' | 'typeManifestVisitor'> & {
        discriminatorNodes: DiscriminatorNode[];
        fields: StructFieldTypeNode[];
        path: NodePath;
        prefix: string;
    },
): Fragment | null {
    switch (discriminatorNode.kind) {
        case 'constantDiscriminatorNode':
            return getConstantDiscriminatorConstantFragment(discriminatorNode, scope);
        case 'fieldDiscriminatorNode':
            return getFieldDiscriminatorConstantFragment(discriminatorNode, scope);
        default:
            return null;
    }
}

/**
 * Derives the camel-case name of the constant rendered for a constant discriminator.
 *
 * The first constant discriminator of a node gets no index suffix, whilst subsequent
 * ones are numbered from 2 — e.g. `myEventDiscriminator` and `myEventDiscriminator2`,
 * since the whole name goes through `camelCase`.
 *
 * @param prefix - The camel-case name of the node owning the discriminator.
 * @param index - The position of the discriminator amongst the node's constant discriminators.
 * @returns The camel-case constant name, before any {@link NameApi.constant} transformation.
 */
export function getConstantDiscriminatorName(prefix: string, index: number): string {
    const suffix = index <= 0 ? '' : `_${index + 1}`;
    return camelCase(`${prefix}_discriminator${suffix}`);
}

/**
 * Derives the camel-case prefix used for an event's discriminator constants.
 *
 * Both the constant declarations on the event page and the codecs referencing
 * them derive the prefix through this helper so the two can never drift apart.
 *
 * @param nameApi - The naming API of the current render scope.
 * @param eventName - The name of the event node.
 * @returns The camel-case prefix to combine with {@link getConstantDiscriminatorName}.
 */
export function getEventDiscriminatorPrefix(nameApi: NameApi, eventName: string): string {
    return camelCase(nameApi.eventDataType(eventName));
}

export function getConstantDiscriminatorConstantFragment(
    discriminatorNode: ConstantDiscriminatorNode,
    scope: Pick<RenderScope, 'linkables' | 'nameApi' | 'typeManifestVisitor'> & {
        discriminatorNodes: DiscriminatorNode[];
        path: NodePath;
        prefix: string;
    },
): Fragment | null {
    const { discriminatorNodes, prefix } = scope;

    const index = discriminatorNodes.filter(isNodeFilter('constantDiscriminatorNode')).indexOf(discriminatorNode);
    const name = getConstantDiscriminatorName(prefix, index);
    const { type, value } = discriminatorNode.constant;
    return getConstantFragment({ ...scope, name, type, value });
}

export function getFieldDiscriminatorConstantFragment(
    discriminatorNode: FieldDiscriminatorNode,
    scope: Pick<RenderScope, 'linkables' | 'nameApi' | 'typeManifestVisitor'> & {
        fields: StructFieldTypeNode[];
        path: NodePath;
        prefix: string;
    },
): Fragment | null {
    const { fields, prefix } = scope;

    const identifier = getFieldDiscriminatorIdentifier(discriminatorNode);
    const field = fields.find(f => f.identifier === identifier);
    if (!field?.defaultValue) {
        return null;
    }

    const name = camelCase(`${prefix}_${identifier}`);
    return getConstantFragment({ ...scope, name, type: field.type, value: field.defaultValue });
}

function getConstantFragment(
    scope: Pick<RenderScope, 'linkables' | 'nameApi' | 'typeManifestVisitor'> & {
        name: string;
        path: NodePath;
        type: TypeNode;
        value: ValueNode;
    },
): Fragment {
    const { linkables, name, nameApi, path, type, typeManifestVisitor } = scope;
    const typeManifest = visit(type, typeManifestVisitor);
    const encoder = typeManifest.encoder;
    const value = getTypedValueFragment(scope.value, type, { linkables, path, typeManifestVisitor });
    // Primitive values are inferred, whilst others are annotated with their strict type.
    const strictType = typeManifest.strictType;
    const isPrimitive = ['string', 'number', 'boolean', 'bigint'].includes(strictType.content);
    const valueType = isPrimitive ? undefined : strictType;
    const constantName = nameApi.constant(name);
    const constantFunction = nameApi.constantFunction(name);
    const readonlyUint8Array = use('type ReadonlyUint8Array', 'solanaCodecsCore');
    const typeAnnotation = valueType ? fragment`: ${valueType}` : fragment``;

    return fragment`export const ${constantName}${typeAnnotation} = ${value};\n\nexport function ${constantFunction}(): ${readonlyUint8Array} { return ${encoder}.encode(${constantName}); }`;
}
