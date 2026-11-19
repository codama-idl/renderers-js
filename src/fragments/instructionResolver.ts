import { pipe } from '@codama/visitors-core';

import {
    addFragmentFeatures,
    Fragment,
    fragment,
    InstructionResolver,
    isAsyncResolver,
    RenderScope,
    use,
} from '../utils';

/**
 * Renders the call of a resolver with the resolver scope of an instruction builder, e.g.
 * `await resolveVault(resolverScope)`, importing the resolver from its module.
 *
 * Asynchronous resolvers are only called by asynchronous builders, so nothing is rendered
 * for them in synchronous builders.
 *
 * @param resolver - The resolver to call.
 * @param scope - The render scope and whether the builder is asynchronous.
 * @return The resolver call, or `undefined` when a synchronous builder cannot call it.
 *
 * @example
 * ```ts
 * getInstructionResolverCallFragment({ dependsOn: [], name: 'resolveVault' }, { ...scope, useAsync: true });
 * // resolveVault(resolverScope)
 * ```
 */
export function getInstructionResolverCallFragment(
    resolver: InstructionResolver,
    scope: Pick<RenderScope, 'asyncResolvers' | 'getImportFrom' | 'nameApi'> & { useAsync: boolean },
): Fragment | undefined {
    const isAsync = isAsyncResolver(resolver.name, scope.asyncResolvers);
    if (!scope.useAsync && isAsync) return;

    const awaitKeyword = isAsync ? 'await ' : '';
    const functionName = use(scope.nameApi.resolverFunction(resolver.name), scope.getImportFrom(resolver));
    return pipe(fragment`${awaitKeyword}${functionName}(resolverScope)`, f =>
        addFragmentFeatures(f, ['instruction:resolverScopeVariable']),
    );
}
