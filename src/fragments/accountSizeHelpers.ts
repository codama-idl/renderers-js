import { AccountNode } from '@codama/nodes';
import { getLastNodeFromPath, NodePath } from '@codama/visitors-core';

import { Fragment, fragment, RenderScope } from '../utils';

/**
 * Renders the function returning the byte size of an account, e.g. `getCounterSize()`,
 * when the account has a fixed size: either the `size` it declares or the size of its data.
 *
 * @param scope - The path of the account and the byte size of its data, if fixed.
 */
export function getAccountSizeHelpersFragment(
    scope: Pick<RenderScope, 'nameApi'> & { accountPath: NodePath<AccountNode>; size: number | null },
): Fragment | undefined {
    const { accountPath, nameApi } = scope;
    const accountNode = getLastNodeFromPath(accountPath);
    // The declared size of the account, which may exceed the size of its data, e.g. for padding.
    const size = accountNode.size ?? scope.size;
    if (size == null) return;

    const getSizeFunction = nameApi.accountGetSizeFunction(accountNode.identifier);
    return fragment`export function ${getSizeFunction}(): number {
  return ${size};
}`;
}
