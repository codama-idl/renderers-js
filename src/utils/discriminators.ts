import {
    CODAMA_ERROR__DISCRIMINATOR_FIELD_HAS_NO_DEFAULT_VALUE,
    CODAMA_ERROR__DISCRIMINATOR_FIELD_NOT_FOUND,
    CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE,
    CodamaError,
} from '@codama/errors';
import { camelCase } from '@codama/fragments/casing';
import { FieldDiscriminatorNode, StructFieldTypeNode, ValueNode } from '@codama/nodes';
import { parsePath } from '@codama/visitors-core';

import type { NameApi } from './nameTransformers';
import { getStructFieldCodecDefault } from './typeNodes';

/**
 * The identifier of the top-level field a field discriminator refers to.
 *
 * Field discriminators point to their field through a path, e.g. `discriminator`
 * or `header.kind`. This renderer only supports paths made of a single field.
 *
 * @throws `CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE` when the path is nested or
 * starts with an index.
 */
export function getFieldDiscriminatorIdentifier(discriminator: FieldDiscriminatorNode): string {
    const segments = parsePath(discriminator.path);
    const [segment] = segments;
    if (segments.length !== 1 || segment.kind !== 'field') {
        throw new CodamaError(CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE, { path: [discriminator] });
    }
    return segment.identifier;
}

/**
 * The field a field discriminator refers to, amongst the fields of the data it discriminates.
 *
 * @param discriminator - The field discriminator.
 * @param fields - The top-level fields of the data, e.g. of an account.
 * @return The field and the default value its codec fills in, e.g. the fallback of an injected default.
 * @throws `CODAMA_ERROR__DISCRIMINATOR_FIELD_NOT_FOUND` when no field matches its path.
 * @throws `CODAMA_ERROR__DISCRIMINATOR_FIELD_HAS_NO_DEFAULT_VALUE` when the field has no
 * default value its codec fills in.
 */
export function getFieldDiscriminatorField(
    discriminator: FieldDiscriminatorNode,
    fields: readonly StructFieldTypeNode[],
): { defaultValue: ValueNode; field: StructFieldTypeNode } {
    const identifier = getFieldDiscriminatorIdentifier(discriminator);
    const field = fields.find(f => f.identifier === identifier);
    if (!field) {
        throw new CodamaError(CODAMA_ERROR__DISCRIMINATOR_FIELD_NOT_FOUND, {
            field: discriminator.path,
            path: [discriminator],
        });
    }
    const defaultValue = getStructFieldCodecDefault(field);
    if (!defaultValue) {
        throw new CodamaError(CODAMA_ERROR__DISCRIMINATOR_FIELD_HAS_NO_DEFAULT_VALUE, { path: [field] });
    }
    return { defaultValue, field };
}

/**
 * Derives the camel-case name of the constant rendered for a constant discriminator.
 *
 * The first constant discriminator of a node gets no index suffix, whilst subsequent
 * ones are numbered from 2 — e.g. `myEventDiscriminator` and `myEventDiscriminator2`,
 * since the whole name goes through `camelCase`.
 *
 * @param prefix - The name of the node owning the discriminator.
 * @param index - The position of the discriminator amongst the node's constant discriminators.
 * @return The camel-case constant name, before any {@link NameApi.constant} transformation.
 */
export function getConstantDiscriminatorName(prefix: string, index: number): string {
    const suffix = index <= 0 ? '' : `_${index + 1}`;
    return camelCase(`${prefix}_discriminator${suffix}`);
}

/**
 * Derives the camel-case name of the constant rendered for a field discriminator, e.g.
 * `myAccountDiscriminator` for the `discriminator` field of `myAccount`. Both the constant
 * declaration and the codecs filling in the field derive it through this helper.
 *
 * @param prefix - The name of the node owning the discriminator.
 * @param fieldIdentifier - The identifier of the discriminator field.
 * @return The camel-case constant name, before any {@link NameApi.constant} transformation.
 */
export function getFieldDiscriminatorName(prefix: string, fieldIdentifier: string): string {
    return camelCase(`${prefix}_${fieldIdentifier}`);
}

/**
 * Derives the camel-case prefix used for an event's discriminator constants.
 *
 * Both the constant declarations on the event page and the codecs referencing
 * them derive the prefix through this helper so the two can never drift apart.
 *
 * @param nameApi - The naming API of the current render scope.
 * @param eventIdentifier - The identifier of the event node.
 * @return The camel-case prefix to combine with {@link getConstantDiscriminatorName}.
 */
export function getEventDiscriminatorPrefix(nameApi: NameApi, eventIdentifier: string): string {
    return camelCase(nameApi.eventDataType(eventIdentifier));
}
