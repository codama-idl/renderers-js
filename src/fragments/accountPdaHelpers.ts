import { AccountNode, isNodeFilter } from '@codama/nodes';
import { getLastNodeFromPath, NodePath, pipe } from '@codama/visitors-core';

import {
    addFragmentImports,
    Fragment,
    fragment,
    getCustomDataOptions,
    getGeneratedNodeModule,
    RenderScope,
    TypeManifest,
} from '../utils';

/**
 * Renders the helpers fetching an account from the seeds of its PDA, e.g.
 * `fetchCounterFromSeeds` and `fetchMaybeCounterFromSeeds`, when the account has a PDA.
 *
 * @param scope - The render scope, the path of the account and its type manifest.
 * @return The fragment of the PDA helpers, if the account has a PDA.
 */
export function getAccountPdaHelpersFragment(
    scope: Pick<RenderScope, 'customAccountData' | 'getImportPath' | 'isInternalNode' | 'linkables' | 'nameApi'> & {
        accountPath: NodePath<AccountNode>;
        typeManifest: TypeManifest;
    },
): Fragment | undefined {
    const { accountPath, nameApi, linkables, customAccountData, typeManifest } = scope;
    const accountNode = getLastNodeFromPath(accountPath);
    const pdaNode = accountNode.pda ? linkables.get([...accountPath, accountNode.pda]) : undefined;
    if (!pdaNode) return;

    const accountType = getCustomDataOptions(customAccountData, accountNode)
        ? typeManifest.strictType
        : nameApi.dataType(accountNode.identifier);

    // The PDA is resolved rather than imported through its link, since its seeds decide
    // whether a `seeds` argument is rendered.
    const importFrom = getGeneratedNodeModule('pda', pdaNode.identifier, scope);
    const pdaSeedsType = nameApi.pdaSeedsType(pdaNode.identifier);
    const findPdaFunction = nameApi.pdaFindFunction(pdaNode.identifier);
    const hasVariableSeeds = (pdaNode.seeds ?? []).filter(isNodeFilter('variablePdaSeedNode')).length > 0;

    const fetchFromSeedsFunction = nameApi.accountFetchFromSeedsFunction(accountNode.identifier);
    const fetchMaybeFromSeedsFunction = nameApi.accountFetchMaybeFromSeedsFunction(accountNode.identifier);
    const fetchMaybeFunction = nameApi.accountFetchMaybeFunction(accountNode.identifier);

    return pipe(
        fragment`export async function ${fetchFromSeedsFunction}(
  rpc: Parameters<typeof fetchEncodedAccount>[0] | ClientWithRpc<GetAccountInfoApi>,
  ${hasVariableSeeds ? `seeds: ${pdaSeedsType},` : ''}
  config: FetchAccountConfig & { programAddress?: Address | HasAddress } = {},
): Promise<Account<${accountType}>> {
  const maybeAccount = await ${fetchMaybeFromSeedsFunction}(rpc, ${hasVariableSeeds ? 'seeds, ' : ''}config);
  assertAccountExists(maybeAccount);
  return maybeAccount;
}

export async function ${fetchMaybeFromSeedsFunction}(
  rpc: Parameters<typeof fetchEncodedAccount>[0] | ClientWithRpc<GetAccountInfoApi>,
  ${hasVariableSeeds ? `seeds: ${pdaSeedsType},` : ''}
  config: FetchAccountConfig & { programAddress?: Address | HasAddress } = {},
): Promise<MaybeAccount<${accountType}>> {
  const { programAddress, ...fetchConfig } = config;
  const [address] = await ${findPdaFunction}(${hasVariableSeeds ? 'seeds, ' : ''}{ programAddress });
  return await ${fetchMaybeFunction}(rpc, address, fetchConfig);
}`,
        f =>
            addFragmentImports(
                f,
                importFrom,
                hasVariableSeeds ? [`type ${pdaSeedsType}`, findPdaFunction] : [findPdaFunction],
            ),
        f => addFragmentImports(f, 'solanaAddresses', ['type Address', 'type HasAddress']),
        f => addFragmentImports(f, 'solanaPluginInterfaces', ['type ClientWithRpc']),
        f => addFragmentImports(f, 'solanaRpcApi', ['type GetAccountInfoApi']),
        f =>
            addFragmentImports(f, 'solanaAccounts', [
                'type Account',
                'assertAccountExists',
                'type FetchAccountConfig',
                'type MaybeAccount',
            ]),
    );
}
