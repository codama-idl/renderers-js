import { CODAMA_ERROR__NODE_PATH_PROGRAM_MISSING, CodamaError } from '@codama/errors';
import { AccountNode, isNode } from '@codama/nodes';
import { findProgramNodeFromPath, getLastNodeFromPath, NodePath, visit } from '@codama/visitors-core';

import { Fragment, mergeFragments, RenderScope } from '../utils';
import { getAccountFetchHelpersFragment } from './accountFetchHelpers';
import { getAccountPdaHelpersFragment } from './accountPdaHelpers';
import { getAccountSizeHelpersFragment } from './accountSizeHelpers';
import { getAccountTypeFragment } from './accountType';
import { getDiscriminatorConstantsFragment } from './discriminatorConstants';

export function getAccountPageFragment(
    scope: Pick<
        RenderScope,
        'customAccountData' | 'erasableSyntax' | 'linkables' | 'nameApi' | 'typeManifestVisitor'
    > & {
        accountPath: NodePath<AccountNode>;
        size: number | null;
    },
): Fragment {
    const node = getLastNodeFromPath(scope.accountPath);
    if (!findProgramNodeFromPath(scope.accountPath)) {
        throw new CodamaError(CODAMA_ERROR__NODE_PATH_PROGRAM_MISSING, { path: scope.accountPath });
    }

    const typeManifest = visit(node, scope.typeManifestVisitor);
    // Field discriminators can only refer to the fields of struct data.
    const fields = isNode(node.data, 'structTypeNode') ? (node.data.fields ?? []) : [];
    return mergeFragments(
        [
            getDiscriminatorConstantsFragment({
                ...scope,
                discriminatorNodes: node.discriminators ?? [],
                fields,
                prefix: node.identifier,
            }),
            getAccountTypeFragment({ ...scope, typeManifest }),
            getAccountFetchHelpersFragment({ ...scope, typeManifest }),
            getAccountSizeHelpersFragment(scope),
            getAccountPdaHelpersFragment({ ...scope, typeManifest }),
        ],
        cs => cs.join('\n\n'),
    );
}
