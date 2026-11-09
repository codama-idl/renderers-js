import { CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE, CodamaError } from '@codama/errors';
import { FieldDiscriminatorNode } from '@codama/nodes';
import { parsePath } from '@codama/visitors-core';

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
