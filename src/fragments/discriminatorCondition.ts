import { mapFragmentContent } from '@codama/fragments';
import {
    type ConstantDiscriminatorNode,
    constantDiscriminatorNode,
    constantValueNode,
    constantValueNodeFromBytes,
    type DiscriminatorNode,
    type FieldDiscriminatorNode,
    isNode,
    isNodeFilter,
    type SizeDiscriminatorNode,
    type StructFieldTypeNode,
} from '@codama/nodes';
import { pipe, visit } from '@codama/visitors-core';
import { getBase64Decoder } from '@solana/codecs-strings';

import {
    Fragment,
    fragment,
    getFieldDiscriminatorField,
    getStructFieldCodecDefault,
    getTypeNodeTransforms,
    isDefaultIntegerType,
    mergeFragments,
    RenderScope,
    use,
} from '../utils';

/**
 * Renders a condition checking that some data matches every discriminator of an account,
 * instruction or event, running the given statement when it does.
 *
 * @param scope - The name of the data variable, the discriminators, the statement to run
 * and the top-level fields of the data, which field discriminators refer to.
 * @return The `if` statement.
 *
 * @example
 * ```ts
 * if (data.length === 72) { return SplTokenAccount.Token; }
 * if (containsBytes(data, getU32Encoder().encode(42), 0)) { return SplTokenAccount.Mint; }
 * ```
 */
export function getDiscriminatorConditionFragment(
    scope: Pick<RenderScope, 'typeManifestVisitor'> & {
        dataName: string;
        discriminators: DiscriminatorNode[];
        fields: StructFieldTypeNode[];
        ifTrue: string;
    },
): Fragment {
    return pipe(
        mergeFragments(
            scope.discriminators.flatMap(discriminator => {
                if (isNode(discriminator, 'sizeDiscriminatorNode')) {
                    return [getSizeConditionFragment(discriminator, scope)];
                }
                if (isNode(discriminator, 'constantDiscriminatorNode')) {
                    return [getByteConditionFragment(discriminator, scope)];
                }
                if (isNode(discriminator, 'fieldDiscriminatorNode')) {
                    return [getFieldConditionFragment(discriminator, scope)];
                }
                return [];
            }),
            c => c.join(' && '),
        ),
        f => mapFragmentContent(f, c => `if (${c}) { ${scope.ifTrue} }`),
    );
}

function getSizeConditionFragment(
    discriminator: SizeDiscriminatorNode,
    scope: Pick<RenderScope, 'typeManifestVisitor'> & {
        dataName: string;
    },
): Fragment {
    const { dataName } = scope;
    return fragment`${dataName}.length === ${discriminator.size}`;
}

function getByteConditionFragment(
    discriminator: ConstantDiscriminatorNode,
    scope: Pick<RenderScope, 'typeManifestVisitor'> & {
        dataName: string;
    },
): Fragment {
    const { dataName, typeManifestVisitor } = scope;
    const constant = visit(discriminator.constant, typeManifestVisitor).value;
    return fragment`${use('containsBytes', 'solanaCodecsCore')}(${dataName}, ${constant}, ${discriminator.offset})`;
}

function getFieldConditionFragment(
    discriminator: FieldDiscriminatorNode,
    scope: Pick<RenderScope, 'typeManifestVisitor'> & {
        dataName: string;
        fields: StructFieldTypeNode[];
    },
): Fragment {
    const field = getFieldDiscriminatorField(discriminator, scope.fields);
    const defaultValue = getStructFieldCodecDefault(field)!;

    // A fixed-size array of u8 encodes as its items, so it is matched as raw bytes.
    const items = isNode(defaultValue, 'arrayValueNode') ? (defaultValue.items ?? []) : [];
    if (
        isNode(field.type, 'arrayTypeNode') &&
        getTypeNodeTransforms(field.type).length === 0 &&
        isNode(field.type.item, 'integerTypeNode') &&
        isDefaultIntegerType(field.type.item, 'u8') &&
        isNode(field.type.count, 'fixedCountNode') &&
        isNode(defaultValue, 'arrayValueNode') &&
        items.every(isNodeFilter('integerValueNode'))
    ) {
        const base64Bytes = getBase64Decoder().decode(new Uint8Array(items.map(node => Number(node.value))));
        return getByteConditionFragment(
            constantDiscriminatorNode(constantValueNodeFromBytes('base64', base64Bytes), {
                offset: discriminator.offset,
            }),
            scope,
        );
    }

    return getByteConditionFragment(
        constantDiscriminatorNode(constantValueNode(field.type, defaultValue), { offset: discriminator.offset }),
        scope,
    );
}
