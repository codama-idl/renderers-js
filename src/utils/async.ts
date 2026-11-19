import { camelCase } from '@codama/fragments/casing';
import { InstructionNode, isNode } from '@codama/nodes';

import {
    deduplicateInstructionDependencies,
    getByteDeltaResolver,
    getDefaultValueDependencies,
    getRemainingAccountsResolver,
    InstructionDependency,
    InstructionInputDefaultValue,
    InstructionResolver,
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

/**
 * Whether an instruction needs an asynchronous builder, i.e. when an input, remaining accounts
 * or byte delta has an asynchronous default value or resolver, e.g. a PDA default.
 *
 * @param instructionNode - The instruction.
 * @param resolvedInputs - The resolved inputs of the instruction.
 * @param asyncResolvers - The camelCase names of the asynchronous resolvers.
 */
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

function hasAsyncDefaultValues(resolvedInputs: ResolvedInstructionInput[], asyncResolvers: string[]): boolean {
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

function isAsyncDefaultValue(defaultValue: InstructionInputDefaultValue): boolean {
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
 * The inputs read by the builder of an instruction: the dependencies of the default values
 * and resolvers of its inputs, remaining accounts and byte deltas, leaving out those of
 * asynchronous resolvers when rendering the synchronous builder.
 */
export function getInstructionDependencies(
    instructionNode: InstructionNode,
    resolvedInputs: ResolvedInstructionInput[],
    asyncResolvers: string[],
    useAsync: boolean,
): InstructionDependency[] {
    const getResolverDependencies = (resolver: InstructionResolver | undefined): InstructionDependency[] => {
        if (!resolver) return [];
        const isSynchronousResolver = !isAsyncResolver(resolver.name, asyncResolvers);
        return useAsync || isSynchronousResolver ? [...resolver.dependsOn] : [];
    };
    return deduplicateInstructionDependencies([
        ...resolvedInputs.flatMap(input =>
            input.resolver
                ? getResolverDependencies(input.resolver)
                : getDefaultValueDependencies(input.resolvedDefaultValue),
        ),
        ...(instructionNode.remainingAccounts ?? []).flatMap(remainingAccounts =>
            getResolverDependencies(getRemainingAccountsResolver(remainingAccounts)),
        ),
        ...(instructionNode.byteDeltas ?? []).flatMap(byteDelta => [
            ...getResolverDependencies(getByteDeltaResolver(byteDelta)),
            ...(isNode(byteDelta.value, 'dataValueNode') ? [byteDelta.value] : []),
        ]),
    ]);
}
