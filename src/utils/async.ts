import { camelCase } from '@codama/fragments/casing';
import { InstructionNode, isNode, isNodeFilter } from '@codama/nodes';

import type { ParsedCustomDataOptions } from './customData';
import {
    deduplicateInstructionDependencies,
    findResolvedDataField,
    getByteDeltaResolver,
    getDataPathRoot,
    getInstructionDataLink,
    getDefaultValueDependencies,
    getInstructionDataFields,
    getInstructionExtraArguments,
    getRemainingAccountsName,
    getRemainingAccountsResolver,
    hasInputDefault,
    InstructionDataField,
    InstructionDependency,
    InstructionInputDefaultValue,
    InstructionResolver,
    ResolvedInstructionDataField,
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
function getInstructionDependencies(
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

/**
 * Whether an instruction builder fills in an input when it is not provided: it has a default
 * value or a resolver, which is not asynchronous for synchronous builders, and does not
 * default to the payer or the identity, which builders have no value for. The program plugin
 * fills in the payer of its client instead.
 *
 * @param input - The resolved input, if any. Data fields with a default value the codec
 * fills in have none.
 * @param scope - The asynchronous resolvers and whether the builder is asynchronous.
 */
export function isFilledInByBuilder(
    input: ResolvedInstructionInput | undefined,
    scope: { asyncResolvers: string[]; useAsync: boolean },
): boolean {
    return (
        !!input &&
        (!!input.resolver || !!input.resolvedDefaultValue) &&
        !isNode(input.resolvedDefaultValue, ['identityValueNode', 'payerValueNode']) &&
        (scope.useAsync || !isAsyncInput(input, scope.asyncResolvers))
    );
}

/**
 * Whether a data field or extra argument has a value when the caller of a builder omits it:
 * either a default value its codec fills in, or one the builder fills in.
 *
 * @param arg - The data field or extra argument.
 * @param scope - The resolved inputs, the asynchronous resolvers and whether the builder is asynchronous.
 */
export function isArgumentFilledIn(
    arg: InstructionDataField,
    scope: { asyncResolvers: string[]; resolvedInputs: readonly ResolvedInstructionInput[]; useAsync: boolean },
): boolean {
    const resolvedArg = findResolvedDataField(scope.resolvedInputs, arg);
    const hasCodecDefault = hasInputDefault(arg) && !resolvedArg;
    return hasCodecDefault || isFilledInByBuilder(resolvedArg, scope);
}

/**
 * Whether a data field or extra argument is part of the input of a builder: unless it is
 * omitted and has a value when not provided. Omitted arguments that nothing fills in, e.g.
 * defaulting to the payer, are kept in the input, since nothing else provides them.
 *
 * @param arg - The data field or extra argument.
 * @param scope - The resolved inputs, the asynchronous resolvers and whether the builder is asynchronous.
 */
export function isInputArgument(
    arg: InstructionDataField,
    scope: { asyncResolvers: string[]; resolvedInputs: readonly ResolvedInstructionInput[]; useAsync: boolean },
): boolean {
    return arg.defaultValueStrategy !== 'omitted' || !isArgumentFilledIn(arg, scope);
}

/**
 * Determines which inputs the sync or async builder of an instruction accepts, so that
 * callers such as the program plugin can invoke it with the same arguments it declares.
 *
 * - `hasInput`: whether the builder takes an `input` parameter.
 * - `hasAnyArgs`: whether the builder declares an `args` variable, read or filled in by
 *   default values, resolvers, remaining accounts or byte deltas.
 * - `hasDataArgs`: whether the instruction data is encoded from `args`.
 * - `omittedArgs`: the data fields and extra arguments omitted from the input but filled
 *   in by the builder, which `args` must declare.
 */
export function getInstructionFunctionInputFlags(
    instructionNode: InstructionNode,
    scope: {
        asyncResolvers: string[];
        customInstructionData: ParsedCustomDataOptions;
        resolvedInputs: ResolvedInstructionInput[];
        useAsync: boolean;
    },
): { hasAnyArgs: boolean; hasDataArgs: boolean; hasInput: boolean; omittedArgs: ResolvedInstructionDataField[] } {
    const { asyncResolvers, customInstructionData, resolvedInputs, useAsync } = scope;
    const dataLink = getInstructionDataLink(instructionNode, customInstructionData);
    const hasAccounts = (instructionNode.accounts ?? []).length > 0;
    const instructionDependencies = getInstructionDependencies(
        instructionNode,
        resolvedInputs,
        asyncResolvers,
        useAsync,
    );
    const argDependencies = instructionDependencies
        .filter(isNodeFilter('dataValueNode'))
        .map(node => getDataPathRoot(node.path));
    const argIsNotOmitted = (arg: InstructionDataField) => isInputArgument(arg, scope);
    const argIsDependent = (arg: InstructionDataField) => argDependencies.includes(arg.identifier);
    const argHasDefaultValue = (arg: InstructionDataField) => {
        if (!hasInputDefault(arg)) return false;
        if (useAsync) return true;
        const resolvedArg = findResolvedDataField(resolvedInputs, arg);
        return !resolvedArg || !isAsyncInput(resolvedArg, asyncResolvers);
    };
    const omittedArgs = resolvedInputs.filter(
        (input): input is ResolvedInstructionDataField =>
            input.kind === 'data' &&
            input.node.defaultValueStrategy === 'omitted' &&
            (useAsync || !isAsyncInput(input, asyncResolvers)),
    );
    const hasOmittedDataArgs = omittedArgs.some(input => !input.isExtraArgument);
    const hasDataArgs =
        !!dataLink ||
        hasOmittedDataArgs ||
        getInstructionDataFields(instructionNode).filter(argIsNotOmitted).length > 0;
    const hasExtraArgs =
        getInstructionExtraArguments(instructionNode).filter(
            field => argIsNotOmitted(field) && (argIsDependent(field) || argHasDefaultValue(field)),
        ).length > 0;
    const hasRemainingAccountArgs = (instructionNode.remainingAccounts ?? []).some(
        remainingAccounts => getRemainingAccountsName(remainingAccounts) !== undefined,
    );
    const hasInputArgs =
        !!dataLink ||
        getInstructionDataFields(instructionNode).filter(argIsNotOmitted).length > 0 ||
        hasExtraArgs ||
        hasRemainingAccountArgs;
    const hasAnyArgs = hasInputArgs || omittedArgs.length > 0;
    return { hasAnyArgs, hasDataArgs, hasInput: hasAccounts || hasInputArgs, omittedArgs };
}
