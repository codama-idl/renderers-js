import {
    AccountValueNode,
    accountValueNode,
    ArgumentValueNode,
    argumentValueNode,
    camelCase,
    CamelCaseString,
    InstructionInputValueNode,
    InstructionNode,
    isNode,
} from '@codama/nodes';
import { deduplicateInstructionDependencies, ResolvedInstructionInput } from '@codama/visitors-core';

import {
    getAllInstructionDataFields,
    getByteDeltaResolver,
    getInputResolver,
    getRemainingAccountsResolver,
    InstructionInput,
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
 * Whether the default value of an instruction input, or the resolver computing it,
 * requires the asynchronous instruction builder.
 */
export function isAsyncInput(input: Pick<InstructionInput, 'defaultValue'>, asyncResolvers: string[]): boolean {
    const resolver = getInputResolver(input);
    if (resolver) return isAsyncResolver(resolver.name, asyncResolvers);
    return !!input.defaultValue && isAsyncDefaultValue(input.defaultValue, asyncResolvers);
}

export function isAsyncDefaultValue(defaultValue: InstructionInputValueNode, asyncResolvers: string[]): boolean {
    switch (defaultValue.kind) {
        case 'pdaValueNode':
            return true;
        case 'resolverValueNode':
            return isAsyncResolver(defaultValue.name, asyncResolvers);
        case 'conditionalValueNode':
            return (
                isAsyncDefaultValue(defaultValue.condition, asyncResolvers) ||
                (defaultValue.ifFalse == null ? false : isAsyncDefaultValue(defaultValue.ifFalse, asyncResolvers)) ||
                (defaultValue.ifTrue == null ? false : isAsyncDefaultValue(defaultValue.ifTrue, asyncResolvers))
            );
        default:
            return false;
    }
}

/** The accounts and arguments the default values of an instruction's inputs depend on. */
export function getInstructionDependencies(
    instruction: InstructionNode,
    asyncResolvers: string[],
    useAsync: boolean,
): (AccountValueNode | ArgumentValueNode)[] {
    return deduplicateInstructionDependencies([
        ...(instruction.accounts ?? []).flatMap(x => getInputDependencies(x, asyncResolvers, useAsync)),
        ...getAllInstructionDataFields(instruction).flatMap(x => getInputDependencies(x, asyncResolvers, useAsync)),
    ]);
}

/** The accounts and arguments the default value of an instruction input depends on. */
export function getInputDependencies(
    input: InstructionInput,
    asyncResolvers: string[],
    useAsync: boolean,
): (AccountValueNode | ArgumentValueNode)[] {
    const resolver = getInputResolver(input);
    if (resolver) {
        const isSynchronousResolver = !isAsyncResolver(resolver.name, asyncResolvers);
        return useAsync || isSynchronousResolver ? [...resolver.dependsOn] : [];
    }

    if (!input.defaultValue) return [];

    const getNestedDependencies = (
        defaultValue: InstructionInputValueNode | undefined,
    ): (AccountValueNode | ArgumentValueNode)[] => {
        if (!defaultValue) return [];
        return getInputDependencies({ ...input, defaultValue }, asyncResolvers, useAsync);
    };

    if (isNode(input.defaultValue, ['accountValueNode', 'accountBumpValueNode'])) {
        return [accountValueNode(input.defaultValue.name)];
    }

    if (isNode(input.defaultValue, ['argumentValueNode'])) {
        return [argumentValueNode(input.defaultValue.name)];
    }

    if (isNode(input.defaultValue, 'pdaValueNode')) {
        const dependencies = new Map<CamelCaseString, AccountValueNode | ArgumentValueNode>();
        (input.defaultValue.seeds ?? []).forEach(seed => {
            if (isNode(seed.value, ['accountValueNode', 'argumentValueNode'])) {
                dependencies.set(camelCase(seed.value.name), { ...seed.value });
            }
        });
        return [...dependencies.values()];
    }

    if (isNode(input.defaultValue, 'conditionalValueNode')) {
        return deduplicateInstructionDependencies([
            ...getNestedDependencies(input.defaultValue.condition),
            ...getNestedDependencies(input.defaultValue.ifTrue),
            ...getNestedDependencies(input.defaultValue.ifFalse),
        ]);
    }

    return [];
}
