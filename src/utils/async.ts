import { camelCase } from '@codama/fragments/casing';
import { InstructionNode } from '@codama/nodes';

import {
    deduplicateInstructionDependencies,
    getByteDeltaResolver,
    getDefaultValueDependencies,
    getRemainingAccountsResolver,
    InstructionDependency,
    InstructionInputDefaultValue,
    ResolvedInstructionInput,
} from './instructionInputs';

/**
 * Whether a resolver was declared asynchronous via the `asyncResolvers` option.
 *
 * @param resolverName - The name of the resolver, as found in the IDL.
 * @param asyncResolvers - The camelCase names of the asynchronous resolvers.
 */
export function isAsyncResolver(resolverName: string, asyncResolvers: string[]): boolean {
    return asyncResolvers.includes(camelCase(resolverName));
}

export function hasAsyncFunction(
    instructionNode: InstructionNode,
    resolvedInputs: ResolvedInstructionInput[],
    asyncResolvers: string[],
): boolean {
    const hasByteDeltasAsync = (instructionNode.byteDeltas ?? []).some(byteDelta => {
        const resolver = getByteDeltaResolver(byteDelta);
        return !!resolver && isAsyncResolver(resolver.name, asyncResolvers);
    });
    const hasRemainingAccountsAsync = (instructionNode.remainingAccounts ?? []).some(remainingAccounts => {
        const resolver = getRemainingAccountsResolver(remainingAccounts);
        return !!resolver && isAsyncResolver(resolver.name, asyncResolvers);
    });

    return hasAsyncDefaultValues(resolvedInputs, asyncResolvers) || hasByteDeltasAsync || hasRemainingAccountsAsync;
}

export function hasAsyncDefaultValues(resolvedInputs: ResolvedInstructionInput[], asyncResolvers: string[]): boolean {
    return resolvedInputs.some(input => isAsyncInput(input, asyncResolvers));
}

/**
 * Whether the resolved default value of an instruction input, or the resolver computing
 * it, requires the asynchronous instruction builder.
 */
export function isAsyncInput(
    input: Pick<ResolvedInstructionInput, 'resolvedDefaultValue' | 'resolver'>,
    asyncResolvers: string[],
): boolean {
    if (input.resolver) return isAsyncResolver(input.resolver.name, asyncResolvers);
    return !!input.resolvedDefaultValue && isAsyncDefaultValue(input.resolvedDefaultValue);
}

export function isAsyncDefaultValue(defaultValue: InstructionInputDefaultValue): boolean {
    switch (defaultValue.kind) {
        case 'pdaValueNode':
            return true;
        case 'conditionalValueNode':
            return (
                (defaultValue.ifFalse == null ? false : isAsyncDefaultValue(defaultValue.ifFalse)) ||
                (defaultValue.ifTrue == null ? false : isAsyncDefaultValue(defaultValue.ifTrue))
            );
        default:
            return false;
    }
}

/**
 * The inputs the default values of an instruction depend on, leaving out the
 * dependencies of asynchronous resolvers when rendering the synchronous builder.
 */
export function getInstructionDependencies(
    resolvedInputs: ResolvedInstructionInput[],
    asyncResolvers: string[],
    useAsync: boolean,
): InstructionDependency[] {
    return deduplicateInstructionDependencies(
        resolvedInputs.flatMap(input => {
            if (!input.resolver) return getDefaultValueDependencies(input.resolvedDefaultValue);
            const isSynchronousResolver = !isAsyncResolver(input.resolver.name, asyncResolvers);
            return useAsync || isSynchronousResolver ? [...input.resolver.dependsOn] : [];
        }),
    );
}
