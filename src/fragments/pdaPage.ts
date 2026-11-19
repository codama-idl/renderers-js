import { PdaNode } from '@codama/nodes';
import { NodePath } from '@codama/visitors-core';

import { Fragment, getProgramNodeFromPath, RenderScope } from '../utils';
import { getPdaFunctionFragment } from './pdaFunction';

/**
 * Renders the page of a PDA, containing its seeds type and find function.
 *
 * @param scope - The render scope and the path of the PDA.
 * @return The fragment of the PDA page.
 * @throws `CODAMA_ERROR__NODE_PATH_PROGRAM_MISSING` when the PDA is not within a program.
 */
export function getPdaPageFragment(
    scope: Pick<RenderScope, 'linkables' | 'nameApi' | 'typeManifestVisitor'> & {
        pdaPath: NodePath<PdaNode>;
    },
): Fragment {
    // Asserts that the node belongs to a program.
    getProgramNodeFromPath(scope.pdaPath);

    return getPdaFunctionFragment(scope);
}
