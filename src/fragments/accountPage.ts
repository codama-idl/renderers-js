import { AccountNode } from '@codama/nodes';
import { getLastNodeFromPath, NodePath, visit } from '@codama/visitors-core';

import { Fragment, getProgramNodeFromPath, getStructFields, mergeFragments, RenderScope } from '../utils';
import { getAccountFetchHelpersFragment } from './accountFetchHelpers';
import { getAccountPdaHelpersFragment } from './accountPdaHelpers';
import { getAccountSizeHelpersFragment } from './accountSizeHelpers';
import { getAccountTypeFragment } from './accountType';
import { getDiscriminatorConstantsFragment } from './discriminatorConstants';

/**
 * Renders the page of an account: its discriminator constants, data type and codecs, decode
 * and fetch helpers, size function and PDA helpers.
 *
 * @param scope - The render scope, the path of the account and the byte size of its data.
 * @return The fragment of the account page.
 * @throws `CODAMA_ERROR__NODE_PATH_PROGRAM_MISSING` when the account is not within a program.
 */
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
    // Asserts that the node belongs to a program.
    getProgramNodeFromPath(scope.accountPath);

    const typeManifest = visit(node, scope.typeManifestVisitor);
    const fields = getStructFields(node.data);
    return mergeFragments(
        [
            getDiscriminatorConstantsFragment({
                ...scope,
                discriminatorNodes: node.discriminators ?? [],
                fields,
                path: scope.accountPath,
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
