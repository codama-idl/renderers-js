import {
    CODAMA_ERROR__DISCRIMINATOR_FIELD_HAS_NO_DEFAULT_VALUE,
    CODAMA_ERROR__DISCRIMINATOR_FIELD_NOT_FOUND,
    CodamaError,
} from '@codama/errors';
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
    type ProgramNode,
    type SizeDiscriminatorNode,
    type StructFieldTypeNode,
} from '@codama/nodes';
import { pipe, visit } from '@codama/visitors-core';
import { getBase64Decoder } from '@solana/codecs-strings';

import { Fragment, fragment, getFieldDiscriminatorIdentifier, mergeFragments, RenderScope, use } from '../utils';

/**
 * ```
 * if (data.length === 72) {
 *   return splTokenAccounts.TOKEN;
 * }
 *
 * if (containsBytes(data, getU32Encoder().encode(42), offset)) {
 *   return splTokenAccounts.TOKEN;
 * }
 *
 * if (containsBytes(data, new Uint8Array([1, 2, 3]), offset)) {
 *   return splTokenAccounts.TOKEN;
 * }
 * ```
 */
export function getDiscriminatorConditionFragment(
    scope: Pick<RenderScope, 'nameApi' | 'typeManifestVisitor'> & {
        dataName: string;
        discriminators: DiscriminatorNode[];
        ifTrue: string;
        programNode: ProgramNode;
        fields: StructFieldTypeNode[];
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
    const identifier = getFieldDiscriminatorIdentifier(discriminator);
    const field = scope.fields.find(f => f.identifier === identifier);
    if (!field) {
        throw new CodamaError(CODAMA_ERROR__DISCRIMINATOR_FIELD_NOT_FOUND, {
            field: discriminator.path,
            path: [discriminator],
        });
    }
    if (!field.defaultValue) {
        throw new CodamaError(CODAMA_ERROR__DISCRIMINATOR_FIELD_HAS_NO_DEFAULT_VALUE, { path: [field] });
    }

    // This handles the case where a field uses an u8 array to represent its discriminator.
    // In this case, we can simplify the generated code by delegating to a constantDiscriminatorNode.
    const defaultValueItems = isNode(field.defaultValue, 'arrayValueNode') ? (field.defaultValue.items ?? []) : [];
    if (
        isNode(field.type, 'arrayTypeNode') &&
        isNode(field.type.item, 'integerTypeNode') &&
        field.type.item.format === 'u8' &&
        isNode(field.type.count, 'fixedCountNode') &&
        isNode(field.defaultValue, 'arrayValueNode') &&
        defaultValueItems.every(isNodeFilter('integerValueNode'))
    ) {
        const base64Bytes = getBase64Decoder().decode(
            new Uint8Array(defaultValueItems.map(node => Number(node.value))),
        );
        return getByteConditionFragment(
            constantDiscriminatorNode(constantValueNodeFromBytes('base64', base64Bytes), {
                offset: discriminator.offset,
            }),
            scope,
        );
    }

    return getByteConditionFragment(
        constantDiscriminatorNode(constantValueNode(field.type, field.defaultValue), { offset: discriminator.offset }),
        scope,
    );
}
