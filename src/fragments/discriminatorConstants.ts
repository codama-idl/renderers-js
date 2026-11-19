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
    getConstantDiscriminatorName,
    getFieldDiscriminatorField,
    getFieldDiscriminatorName,
    getTypedValueFragment,
    mergeFragments,
    RenderScope,
    use,
} from '../utils';

/**
 * Renders a constant and an encoding function for each constant and field discriminator of
 * an account, instruction or event, e.g. `COUNTER_DISCRIMINATOR` and `getCounterDiscriminatorBytes`.
 *
 * @param scope - The render scope, the discriminators, the top-level fields of the data they
 * discriminate, the path of their owner and the prefix of the constant names.
 * @return The fragment of the discriminator constants.
 * @throws `CODAMA_ERROR__DISCRIMINATOR_FIELD_NOT_FOUND` or
 * `CODAMA_ERROR__DISCRIMINATOR_FIELD_HAS_NO_DEFAULT_VALUE` for invalid field discriminators.
 */
export function getDiscriminatorConstantsFragment(
    scope: Pick<RenderScope, 'linkables' | 'nameApi' | 'typeManifestVisitor'> & {
        discriminatorNodes: DiscriminatorNode[];
        fields: StructFieldTypeNode[];
        path: NodePath;
        prefix: string;
    },
): Fragment {
    const fragments = scope.discriminatorNodes.flatMap(node => {
        const constant = getDiscriminatorConstantFragment(node, scope);
        return constant ? [constant] : [];
    });
    return mergeFragments(fragments, c => c.join('\n\n'));
}

function getDiscriminatorConstantFragment(
    discriminatorNode: DiscriminatorNode,
    scope: Pick<RenderScope, 'linkables' | 'nameApi' | 'typeManifestVisitor'> & {
        discriminatorNodes: DiscriminatorNode[];
        fields: StructFieldTypeNode[];
        path: NodePath;
        prefix: string;
    },
): Fragment | undefined {
    switch (discriminatorNode.kind) {
        case 'constantDiscriminatorNode':
            return getConstantDiscriminatorConstantFragment(discriminatorNode, scope);
        case 'fieldDiscriminatorNode':
            return getFieldDiscriminatorConstantFragment(discriminatorNode, scope);
        default:
            // Size discriminators have no constant.
            return undefined;
    }
}

function getConstantDiscriminatorConstantFragment(
    discriminatorNode: ConstantDiscriminatorNode,
    scope: Pick<RenderScope, 'linkables' | 'nameApi' | 'typeManifestVisitor'> & {
        discriminatorNodes: DiscriminatorNode[];
        path: NodePath;
        prefix: string;
    },
): Fragment {
    const { discriminatorNodes, prefix } = scope;

    const index = discriminatorNodes.filter(isNodeFilter('constantDiscriminatorNode')).indexOf(discriminatorNode);
    const name = getConstantDiscriminatorName(prefix, index);
    const { type, value } = discriminatorNode.constant;
    return getConstantFragment({ ...scope, name, type, value });
}

function getFieldDiscriminatorConstantFragment(
    discriminatorNode: FieldDiscriminatorNode,
    scope: Pick<RenderScope, 'linkables' | 'nameApi' | 'typeManifestVisitor'> & {
        fields: StructFieldTypeNode[];
        path: NodePath;
        prefix: string;
    },
): Fragment {
    const { fields, prefix } = scope;
    const { defaultValue, field } = getFieldDiscriminatorField(discriminatorNode, fields);
    const name = getFieldDiscriminatorName(prefix, field.identifier);
    return getConstantFragment({ ...scope, name, type: field.type, value: defaultValue });
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
