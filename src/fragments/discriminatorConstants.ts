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

export function getConstantDiscriminatorConstantFragment(
    discriminatorNode: ConstantDiscriminatorNode,
    scope: Pick<RenderScope, 'nameApi' | 'typeManifestVisitor'> & {
        discriminatorNodes: DiscriminatorNode[];
        prefix: string;
    },
): Fragment | null {
    const { discriminatorNodes, typeManifestVisitor, prefix } = scope;

    const index = discriminatorNodes.filter(isNodeFilter('constantDiscriminatorNode')).indexOf(discriminatorNode);
    const suffix = index <= 0 ? '' : `_${index + 1}`;

    const name = camelCase(`${prefix}_discriminator${suffix}`);
    const typeManifest = visit(discriminatorNode.constant.type, typeManifestVisitor);
    const encoder = typeManifest.encoder;
    const value = visit(discriminatorNode.constant.value, typeManifestVisitor).value;
    return getConstantFragment({ ...scope, encoder, name, value, valueType: typeManifest.strictType });
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
    const value = visit(field.defaultValue, typeManifestVisitor).value;
    const needsTypeAnnotation =
        isNode(field.defaultValue, 'bytesValueNode') ||
        (isNode(field.defaultValue, 'constantValueNode') && isNode(field.defaultValue.value, 'bytesValueNode'));
    return getConstantFragment({
        ...scope,
        encoder,
        name,
        value,
        ...(needsTypeAnnotation && { valueType: typeManifest.strictType }),
    });
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
