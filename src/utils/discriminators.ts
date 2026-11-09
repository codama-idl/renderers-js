import { CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE, CodamaError } from '@codama/errors';
import { FieldDiscriminatorNode } from '@codama/nodes';

const IDENTIFIER_PATH = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * The identifier of the top-level field a field discriminator refers to.
 *
 * Field discriminators point to their field through a path, e.g. `discriminator`
 * or `header.kind`. This renderer only supports paths made of a single field.
 *
 * @throws `CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE` when the path is nested.
 */
export function getFieldDiscriminatorIdentifier(discriminator: FieldDiscriminatorNode): string {
    if (!IDENTIFIER_PATH.test(discriminator.path)) {
        throw new CodamaError(CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE, { path: [discriminator] });
    }
    return discriminator.path;
}
