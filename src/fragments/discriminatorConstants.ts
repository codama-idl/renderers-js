import {
    camelCase,
    ConstantDiscriminatorNode,
    DiscriminatorNode,
    FieldDiscriminatorNode,
    InstructionArgumentNode,
    isNode,
    isNodeFilter,
    StructFieldTypeNode,
    VALUE_NODES,
} from '@codama/nodes';
import { visit } from '@codama/visitors-core';

import { Fragment, fragment, mergeFragments, RenderScope, use } from '../utils';

export function getDiscriminatorConstantsFragment(
    scope: Pick<RenderScope, 'nameApi' | 'typeManifestVisitor'> & {
        discriminatorNodes: DiscriminatorNode[];
        fields: InstructionArgumentNode[] | StructFieldTypeNode[];
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
    scope: Pick<RenderScope, 'nameApi' | 'typeManifestVisitor'> & {
        discriminatorNodes: DiscriminatorNode[];
        fields: InstructionArgumentNode[] | StructFieldTypeNode[];
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
 * ones are numbered from 2 — e.g. `myEventDiscriminator` and `myEventDiscriminator_2`.
 *
 * @param prefix - The camel-case name of the node owning the discriminator.
 * @param index - The position of the discriminator amongst the node's constant discriminators.
 * @returns The camel-case constant name, before any {@link NameApi.constant} transformation.
 */
export function getConstantDiscriminatorName(prefix: string, index: number): string {
    const suffix = index <= 0 ? '' : `_${index + 1}`;
    return camelCase(`${prefix}_discriminator${suffix}`);
}

export function getConstantDiscriminatorConstantFragment(
    discriminatorNode: ConstantDiscriminatorNode,
    scope: Pick<RenderScope, 'nameApi' | 'typeManifestVisitor'> & {
        discriminatorNodes: DiscriminatorNode[];
        prefix: string;
    },
): Fragment | null {
    const { discriminatorNodes, typeManifestVisitor, prefix } = scope;

    const index = discriminatorNodes.filter(isNodeFilter('constantDiscriminatorNode')).indexOf(discriminatorNode);
    const name = getConstantDiscriminatorName(prefix, index);
    const typeManifest = visit(discriminatorNode.constant.type, typeManifestVisitor);
    const encoder = typeManifest.encoder;
    const { value, valueType } = resolveDiscriminatorValue(
        visit(discriminatorNode.constant.value, typeManifestVisitor).value,
        isNode(discriminatorNode.constant.value, 'numberValueNode'),
        typeManifest.strictType,
    );
    return getConstantFragment({ ...scope, encoder, name, value, valueType });
}

export function getFieldDiscriminatorConstantFragment(
    discriminatorNode: FieldDiscriminatorNode,
    scope: Pick<RenderScope, 'nameApi' | 'typeManifestVisitor'> & {
        fields: InstructionArgumentNode[] | StructFieldTypeNode[];
        prefix: string;
    },
): Fragment | null {
    const { fields, prefix, typeManifestVisitor } = scope;

    const field = fields.find(f => f.name === discriminatorNode.name);
    if (!field || !field.defaultValue || !isNode(field.defaultValue, VALUE_NODES)) {
        return null;
    }

    const name = camelCase(`${prefix}_${discriminatorNode.name}`);
    const typeManifest = visit(field.type, typeManifestVisitor);
    const encoder = typeManifest.encoder;
    const { value, valueType } = resolveDiscriminatorValue(
        visit(field.defaultValue, typeManifestVisitor).value,
        isNode(field.defaultValue, 'numberValueNode'),
        typeManifest.strictType,
    );
    return getConstantFragment({ ...scope, encoder, name, value, valueType });
}

function resolveDiscriminatorValue(rawValue: Fragment, isNumberValue: boolean, strictType: Fragment) {
    const value = strictType.content === 'bigint' && isNumberValue ? fragment`${rawValue}n` : rawValue;
    const needsTypeAnnotation = !['string', 'number', 'boolean', 'bigint'].includes(strictType.content);
    return { value, valueType: needsTypeAnnotation ? strictType : undefined };
}

function getConstantFragment(
    scope: Pick<RenderScope, 'nameApi'> & {
        encoder: Fragment;
        name: string;
        value: Fragment;
        valueType?: Fragment;
    },
): Fragment {
    const { encoder, name, nameApi, value, valueType } = scope;
    const constantName = nameApi.constant(name);
    const constantFunction = nameApi.constantFunction(name);
    const readonlyUint8Array = use('type ReadonlyUint8Array', 'solanaCodecsCore');
    const typeAnnotation = valueType ? fragment`: ${valueType}` : fragment``;

    return fragment`export const ${constantName}${typeAnnotation} = ${value};\n\nexport function ${constantFunction}(): ${readonlyUint8Array} { return ${encoder}.encode(${constantName}); }`;
}
