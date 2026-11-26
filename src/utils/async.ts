import { CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE, CodamaError } from '@codama/errors';
import { camelCase } from '@codama/fragments/casing';
import { InstructionNode, isNode, isNodeFilter } from '@codama/nodes';
import { getLastNodeFromPath, NodePath } from '@codama/visitors-core';

import type { ParsedCustomDataOptions } from './customData';
import {
    deduplicateInstructionDependencies,
    findResolvedDataField,
    getAllInstructionDataFields,
    getByteDeltaResolver,
    getDataPathRoot,
    getDefaultValueDependencies,
    getInstructionDataFields,
    getInstructionDataLink,
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
    resolvedInputs: readonly ResolvedInstructionInput[],
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

function hasAsyncDefaultValues(resolvedInputs: readonly ResolvedInstructionInput[], asyncResolvers: string[]): boolean {
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
    resolvedInputs: readonly ResolvedInstructionInput[],
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
 * Maps the camelCase name of each input argument conflicting with an account of the
 * instruction to the camelCase name it is renamed to in the input type of a builder,
 * e.g. `authority` to `authorityArg`. Arguments left out of that input, e.g. omitted
 * arguments the builder fills in, never conflict, so the map depends on the builder:
 * the synchronous one accepts every input the asynchronous one does, and more.
 *
 * Names are compared by their camelCase form since that is how they are emitted.
 *
 * @param instructionPath - The path of the instruction.
 * @param scope - The resolved inputs, the asynchronous resolvers and whether the builder is asynchronous.
 * @throws `CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE` with the path of the instruction when two
 * of its data fields or extra arguments share a name.
 *
 * @example
 * ```ts
 * getRenamedArgsMap(instructionPath, { ...scope, useAsync: false }); // Map { 'authority' => 'authorityArg' }
 * ```
 */
export function getRenamedArgsMap(
    instructionPath: NodePath<InstructionNode>,
    scope: { asyncResolvers: string[]; resolvedInputs: readonly ResolvedInstructionInput[]; useAsync: boolean },
): Map<string, string> {
    const instruction = getLastNodeFromPath(instructionPath);
    const args = getAllInstructionDataFields(instruction);
    const argNames = args.map(arg => camelCase(arg.identifier));
    // Data fields and extra arguments share the input type, so their names must be unique.
    if (new Set(argNames).size !== argNames.length) {
        throw new CodamaError(CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE, { path: instructionPath });
    }

    const accountNames = new Set((instruction.accounts ?? []).map(account => camelCase(account.identifier)));
    const conflictingNames = args
        .filter(arg => isInputArgument(arg, scope))
        .map(arg => camelCase(arg.identifier))
        .filter(name => accountNames.has(name));
    return new Map(conflictingNames.map(name => [name, camelCase(`${name}Arg`)]));
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
        resolvedInputs: readonly ResolvedInstructionInput[];
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
    const isInput = (arg: InstructionDataField) => isInputArgument(arg, scope);
    const hasInputDataFields = getInstructionDataFields(instructionNode).some(isInput);
    const argIsDependent = (arg: InstructionDataField) => argDependencies.includes(arg.identifier);
    const argHasDefaultValue = (arg: InstructionDataField) => {
        if (!hasInputDefault(arg)) return false;
        if (useAsync) return true;
        const resolvedArg = findResolvedDataField(resolvedInputs, arg);
        return !resolvedArg || !isAsyncInput(resolvedArg, asyncResolvers);
    };
    const omittedArgs = resolvedInputs.filter(
        (input): input is ResolvedInstructionDataField => input.kind === 'data' && !isInput(input.node),
    );
    const hasOmittedDataArgs = omittedArgs.some(input => !input.isExtraArgument);
    const hasDataArgs = !!dataLink || hasOmittedDataArgs || hasInputDataFields;
    const hasExtraArgs = getInstructionExtraArguments(instructionNode).some(
        field => isInput(field) && (argIsDependent(field) || argHasDefaultValue(field)),
    );
    const hasRemainingAccountArgs = (instructionNode.remainingAccounts ?? []).some(
        remainingAccounts => getRemainingAccountsName(remainingAccounts) !== undefined,
    );
    const hasInputArgs = !!dataLink || hasInputDataFields || hasExtraArgs || hasRemainingAccountArgs;
    const hasAnyArgs = hasInputArgs || omittedArgs.length > 0;
    return { hasAnyArgs, hasDataArgs, hasInput: hasAccounts || hasInputArgs, omittedArgs };
}
