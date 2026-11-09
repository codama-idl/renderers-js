import { CODAMA_ERROR__NODE_PATH_PROGRAM_MISSING, CodamaError } from '@codama/errors';
import { PdaNode } from '@codama/nodes';
import { findProgramNodeFromPath, NodePath } from '@codama/visitors-core';

import { Fragment, RenderScope } from '../utils';
import { getPdaFunctionFragment } from './pdaFunction';

export function getPdaPageFragment(
    scope: Pick<RenderScope, 'nameApi' | 'typeManifestVisitor'> & {
        pdaPath: NodePath<PdaNode>;
    },
): Fragment {
    if (!findProgramNodeFromPath(scope.pdaPath)) {
        throw new CodamaError(CODAMA_ERROR__NODE_PATH_PROGRAM_MISSING, { path: scope.pdaPath });
    }

    return getPdaFunctionFragment(scope);
}
