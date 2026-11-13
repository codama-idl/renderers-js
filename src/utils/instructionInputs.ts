/**
 * The renderer's own view of the inputs of an instruction.
 *
 * Fragments consume instructions through the helpers of this module rather than
 * reading the instruction data, the `codama.extraArgument` and `codama.resolver`
 * plugins or the provided values directly, so that the way the IDL stores these
 * inputs is only known here.
 *
 * @packageDocumentation
 */

import {
    CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE,
    CODAMA_ERROR__VISITORS__CANNOT_USE_OPTIONAL_ACCOUNT_AS_PDA_SEED_VALUE,
    CODAMA_ERROR__VISITORS__CYCLIC_DEPENDENCY_DETECTED_WHEN_RESOLVING_INSTRUCTION_DEFAULT_VALUES,
    CODAMA_ERROR__VISITORS__INVALID_INSTRUCTION_DEFAULT_VALUE_DEPENDENCY,
    CodamaError,
} from '@codama/errors';
import { camelCase } from '@codama/fragments/casing';
import {
    AccountValueNode,
    accountValueNode,
    DataValueNode,
    dataValueNode,
    DefaultValueStrategy,
    DefinedTypeLinkNode,
    IdentifierString,
    INSTRUCTION_INPUT_VALUE_NODE_KINDS,
    InstructionAccountNode,
    InstructionByteDeltaNode,
    InstructionInputValueNode,
    InstructionNode,
    InstructionRemainingAccountsNode,
    isNode,
    isNodeFilter,
    Node,
    PathString,
    pathString,
    PluginNode,
    REGISTERED_TYPE_NODE_KINDS,
    REGISTERED_VALUE_NODE_KINDS,
    StructFieldTypeNode,
    structFieldTypeNode,
    StructTypeNode,
    structTypeNode,
    TextNode,
    TypeNode,
    VALUE_NODE_KINDS,
    ValueNode,
} from '@codama/nodes';
import {
    getLastNodeFromPath,
    getProvidedScopeFromPath,
    LinkableDictionary,
    NodePath,
    parsePath,
    ProvidedScope,
    resolveTypePath,
} from '@codama/visitors-core';

import type { ParsedCustomDataOptions } from './customData';

const RESOLVER_PLUGIN = 'codama.resolver';
const EXTRA_ARGUMENT_PLUGIN = 'codama.extraArgument';

/** A field of the instruction data or an extra argument, as consumed by the renderer. */
export type InstructionDataField = Readonly<{
    defaultValue?: InstructionInputValueNode;
    defaultValueStrategy?: DefaultValueStrategy;
    docs?: TextNode | string;
    identifier: string;
    plugins?: readonly PluginNode[];
    type: TypeNode;
}>;

/** Any input of an instruction whose value is resolved at build time. */
export type InstructionInput = InstructionAccountNode | InstructionDataField;

/** A reference from a default value or a resolver to another input of the instruction. */
export type InstructionDependency = AccountValueNode | DataValueNode;

/** The default value of an instruction input, after resolving injected values. */
export type InstructionInputDefaultValue = InstructionInputValueNode;

/**
 * A function resolving the value of an instruction input, byte delta or remaining
 * accounts with custom code rather than from the IDL, as described by a
 * `codama.resolver` plugin.
 */
export type InstructionResolver = Readonly<{
    dependsOn: readonly InstructionDependency[];
    docs?: string;
    name: string;
}>;

/** Whether the given value is an {@link InstructionResolver} rather than a node. */
export function isInstructionResolver(value: unknown): value is InstructionResolver {
    return typeof value === 'object' && value !== null && !('kind' in value) && 'dependsOn' in value;
}

/** The fields of the instruction data, in order, when the data is an inline struct. */
export function getInstructionDataFields(instruction: InstructionNode): StructFieldTypeNode[] {
    return instruction.data && isNode(instruction.data, 'structTypeNode') ? (instruction.data.fields ?? []) : [];
}

/** The inputs of the instruction that are not part of the instruction data. */
export function getInstructionExtraArguments(instruction: InstructionNode): InstructionDataField[] {
    return (instruction.plugins ?? [])
        .filter(plugin => plugin.namespace === EXTRA_ARGUMENT_PLUGIN)
        .map(plugin => parseExtraArgumentPlugin(plugin, instruction));
}

/** The data fields of the instruction followed by its extra arguments. */
export function getAllInstructionDataFields(instruction: InstructionNode): InstructionDataField[] {
    return [...getInstructionDataFields(instruction), ...getInstructionExtraArguments(instruction)];
}

/** Whether the instruction serialises any data, i.e. it has data that is not an empty struct. */
export function hasInstructionData(instruction: InstructionNode): boolean {
    const { data } = instruction;
    return !!data && !(isNode(data, 'structTypeNode') && (data.fields ?? []).length === 0);
}

/**
 * The defined type the data of the instruction is imported from, if any: either the
 * type given by the `customInstructionData` option or the type the data links to.
 */
export function getInstructionDataLink(
    instruction: InstructionNode,
    customInstructionData: ParsedCustomDataOptions,
): DefinedTypeLinkNode | undefined {
    const customDataLink = customInstructionData.get(camelCase(instruction.identifier))?.linkNode;
    if (customDataLink) return customDataLink;
    return instruction.data && isNode(instruction.data, 'definedTypeLinkNode') ? instruction.data : undefined;
}

/**
 * The type describing the serialised data of the instruction.
 *
 * @throws `CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE` when the data is neither a
 * struct nor a link to a defined type.
 */
export function getInstructionDataNode(instruction: InstructionNode): DefinedTypeLinkNode | StructTypeNode {
    if (!instruction.data) return structTypeNode([]);
    if (isNode(instruction.data, ['structTypeNode', 'definedTypeLinkNode'])) return instruction.data;
    throw new CodamaError(CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE, { path: [instruction, instruction.data] });
}

/**
 * The type describing the extra arguments of the instruction. Only literal default
 * values are kept, since contextual ones are resolved by instruction builders.
 */
export function getInstructionExtraArgumentsNode(instruction: InstructionNode): StructTypeNode {
    return structTypeNode(
        getInstructionExtraArguments(instruction).map(argument => {
            const hasValueDefault = isNode(argument.defaultValue, VALUE_NODE_KINDS);
            return structFieldTypeNode({
                identifier: argument.identifier,
                type: argument.type,
                ...(argument.docs !== undefined ? { docs: argument.docs } : {}),
                ...(hasValueDefault ? { defaultValue: argument.defaultValue as ValueNode } : {}),
                ...(hasValueDefault && argument.defaultValueStrategy
                    ? { defaultValueStrategy: argument.defaultValueStrategy }
                    : {}),
            });
        }),
    );
}

/** The resolver computing the value of an instruction input, if any. */
export function getInputResolver(input: Pick<InstructionInput, 'plugins'>): InstructionResolver | undefined {
    return getResolverFromPlugins(input.plugins, input);
}

/** Whether an instruction input has a default value, be it a value from the IDL or a resolver. */
export function hasInputDefault(input: Pick<InstructionInput, 'defaultValue' | 'plugins'>): boolean {
    return !!input.defaultValue || !!getInputResolver(input);
}

/** The resolver computing a byte delta, if any. */
export function getByteDeltaResolver(byteDelta: InstructionByteDeltaNode): InstructionResolver | undefined {
    return getResolverFromPlugins(byteDelta.plugins, byteDelta);
}

/** The resolver providing remaining accounts, if any. */
export function getRemainingAccountsResolver(
    remainingAccounts: InstructionRemainingAccountsNode,
): InstructionResolver | undefined {
    return getResolverFromPlugins(remainingAccounts.plugins, remainingAccounts);
}

/**
 * The name under which remaining accounts are provided as an instruction input,
 * or `undefined` when they are provided by a resolver instead.
 */
export function getRemainingAccountsName(remainingAccounts: InstructionRemainingAccountsNode): string | undefined {
    return getRemainingAccountsResolver(remainingAccounts) ? undefined : remainingAccounts.identifier;
}

/**
 * Whether the given remaining accounts are backed by an existing instruction argument — i.e.
 * an array of addresses encoded in the instruction data — as opposed to an argument added
 * to the instruction input for the sole purpose of providing these remaining accounts.
 */
export function isRemainingAccountsBackedByArgument(
    instructionNode: InstructionNode,
    remainingAccounts: InstructionRemainingAccountsNode,
): boolean {
    const name = getRemainingAccountsName(remainingAccounts);
    if (name === undefined) return false;
    return getAllInstructionDataFields(instructionNode).some(field => field.identifier === name);
}

/**
 * Whether the given instruction has remaining accounts provided via a dedicated argument
 * added to the instruction input — i.e. remaining accounts that accept the same inputs as
 * instruction accounts and are converted using the same account meta helper.
 */
export function hasRemainingAccountInputs(instructionNode: InstructionNode): boolean {
    return (instructionNode.remainingAccounts ?? []).some(
        remainingAccounts =>
            !getRemainingAccountsResolver(remainingAccounts) &&
            !isRemainingAccountsBackedByArgument(instructionNode, remainingAccounts),
    );
}

/**
 * Renders a reference to instruction data from the `args` variable of an instruction
 * builder, e.g. `args.amount` or `args.config?.fees?.[0]`, with field identifiers in
 * camelCase.
 */
export function getDataPathExpression(path: PathString, root = 'args'): string {
    return parsePath(path).reduce(
        (expression, segment, index) =>
            segment.kind === 'field'
                ? `${expression}${index === 0 ? '.' : '?.'}${camelCase(segment.identifier)}`
                : `${expression}?.[${segment.index}]`,
        root,
    );
}

/** The label of a data path in generated error messages, e.g. `config.fee`. */
export function getDataPathLabel(path: PathString): string {
    return parsePath(path)
        .map((segment, index) =>
            segment.kind === 'field'
                ? `${index === 0 ? '' : '.'}${camelCase(segment.identifier)}`
                : `[${segment.index}]`,
        )
        .join('');
}

/** The identifier of the top-level field a data path starts with, if any. */
export function getDataPathRoot(path: PathString): string | undefined {
    const [segment] = parsePath(path);
    return segment?.kind === 'field' ? segment.identifier : undefined;
}

type ResolvedInputBase = {
    /** The inputs the default value or the resolver depends on. */
    dependsOn: InstructionDependency[];
    /** The path of the input, e.g. to report errors. */
    path: NodePath;
    /** The default value of the input, after resolving injected values, unless a resolver computes it. */
    resolvedDefaultValue?: InstructionInputDefaultValue;
    /** The resolver computing the value of the input, if any. */
    resolver?: InstructionResolver;
};

/** An instruction account with its resolved default value. */
export type ResolvedInstructionAccount = ResolvedInputBase & {
    isPda: boolean;
    kind: 'account';
    node: InstructionAccountNode;
    resolvedIsOptional: boolean;
    resolvedIsSigner: boolean | 'either';
};

/** A top-level field of the instruction data, or an extra argument, with its resolved default value. */
export type ResolvedInstructionDataField = ResolvedInputBase & {
    isExtraArgument: boolean;
    kind: 'data';
    node: InstructionDataField;
};

/** A resolved instruction input, discriminated by `kind`. */
export type ResolvedInstructionInput = ResolvedInstructionAccount | ResolvedInstructionDataField;

/** The name of a resolved input, as found in the IDL. */
export function getResolvedInputName(input: ResolvedInstructionInput): string {
    return input.node.identifier;
}

/** Finds the resolved input of an instruction account, if any. */
export function findResolvedAccount(
    resolvedInputs: readonly ResolvedInstructionInput[],
    account: InstructionAccountNode,
): ResolvedInstructionAccount | undefined {
    return resolvedInputs.find(
        (input): input is ResolvedInstructionAccount =>
            input.kind === 'account' && input.node.identifier === account.identifier,
    );
}

/** Finds the resolved input of a data field or extra argument, if any. */
export function findResolvedDataField(
    resolvedInputs: readonly ResolvedInstructionInput[],
    field: InstructionDataField,
): ResolvedInstructionDataField | undefined {
    return resolvedInputs.find(
        (input): input is ResolvedInstructionDataField =>
            input.kind === 'data' && input.node.identifier === field.identifier,
    );
}

/**
 * Resolves the inputs of an instruction that may receive a default value when building
 * it, ordered so that every input comes after the inputs its default value depends on.
 *
 * Every account is listed, along with the top-level data fields and the extra arguments
 * that have a contextual default value or a resolver, and the data fields and extra
 * arguments these depend on. Injected values are resolved from the `provides` of the
 * instruction and of its parents.
 *
 * @param instructionPath - The path of the instruction from the root.
 * @param linkables - The linkable nodes of the tree the instruction belongs to.
 * @throws `CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE` when an injected value the
 * renderer cannot fill in is provided, e.g. on a nested data field.
 */
export function getResolvedInstructionInputs(
    instructionPath: NodePath<InstructionNode>,
    linkables: LinkableDictionary,
): ResolvedInstructionInput[] {
    const scope = getProvidedScopeFromPath(instructionPath);
    assertNoUnsupportedInjections(instructionPath, scope, linkables);
    const entries = getInputEntries(instructionPath, scope, linkables);
    assertSupportedDataPaths(instructionPath, entries, linkables);
    // Fields of linked data only order their dependents: they are provided as a whole
    // through the linked type, so they never appear as individual builder inputs.
    const ordered = sortEntriesByDependencies(entries.filter(isBuilderInput), entries, instructionPath).filter(
        entry => !(entry.kind === 'data' && entry.isLinked),
    );
    return ordered.reduce<ResolvedInstructionInput[]>(
        (resolved, entry) => [...resolved, toResolvedInput(entry, resolved, entries)],
        [],
    );
}

/** An instruction input, with its default value or resolver and their dependencies. */
type InputEntry = ResolvedInputBase &
    (
        | { kind: 'account'; node: InstructionAccountNode }
        | { isExtraArgument: boolean; isLinked?: true; kind: 'data'; node: InstructionDataField }
    );

/** The accounts, top-level data fields and extra arguments of an instruction, as entries. */
function getInputEntries(
    instructionPath: NodePath<InstructionNode>,
    scope: ProvidedScope,
    linkables: LinkableDictionary,
): InputEntry[] {
    const instruction = getLastNodeFromPath(instructionPath);
    const toEntry = <T extends Omit<InputEntry, Exclude<keyof ResolvedInputBase, 'path'>>>(
        input: T,
    ): T & ResolvedInputBase => {
        const resolver = getInputResolver(input.node);
        const defaultValue = input.node.defaultValue;
        const resolvedDefaultValue =
            !resolver && defaultValue
                ? scope.resolveOrThrow(defaultValue, { kinds: INSTRUCTION_INPUT_VALUE_NODE_KINDS })
                : undefined;
        return {
            ...input,
            dependsOn: resolver ? [...resolver.dependsOn] : getDefaultValueDependencies(resolvedDefaultValue),
            ...(resolvedDefaultValue ? { resolvedDefaultValue } : {}),
            ...(resolver ? { resolver } : {}),
        };
    };
    return [
        ...(instruction.accounts ?? []).map(node =>
            toEntry({ kind: 'account' as const, node, path: [...instructionPath, node] }),
        ),
        ...getInstructionDataFields(instruction).map(node =>
            toEntry({
                isExtraArgument: false,
                kind: 'data' as const,
                node,
                path: [...instructionPath, instruction.data!, node],
            }),
        ),
        ...(instruction.plugins ?? [])
            .filter(plugin => plugin.namespace === EXTRA_ARGUMENT_PLUGIN)
            .map(plugin =>
                toEntry({
                    isExtraArgument: true,
                    kind: 'data' as const,
                    node: parseExtraArgumentPlugin(plugin, instruction),
                    path: [...instructionPath, plugin],
                }),
            ),
        ...getLinkedDataEntries(instructionPath, linkables),
    ];
}

/**
 * The top-level fields of instruction data given as a link to a defined struct type.
 *
 * They are provided as a whole through the linked type, so instruction builders never
 * fill them in. They are only listed so that other inputs may depend on them.
 */
function getLinkedDataEntries(instructionPath: NodePath<InstructionNode>, linkables: LinkableDictionary): InputEntry[] {
    const data = getLastNodeFromPath(instructionPath).data;
    if (!data || !isNode(data, 'definedTypeLinkNode')) return [];
    const definedTypePath = linkables.getPath([...instructionPath, data]);
    if (!definedTypePath) return [];
    const definedType = getLastNodeFromPath(definedTypePath);
    if (!isNode(definedType.type, 'structTypeNode')) return [];
    const struct = definedType.type;
    return (struct.fields ?? []).map(field => ({
        dependsOn: [],
        isExtraArgument: false,
        isLinked: true,
        kind: 'data' as const,
        node: field,
        path: [...definedTypePath, struct, field],
    }));
}

/**
 * Whether instruction builders may fill in the value of an input: every account, and the
 * data fields and extra arguments with a resolver or a default the codec does not fill in.
 * Extra arguments have no codec, whereas the codec of the instruction data fills in
 * literal defaults, so only injected ones are left to instruction builders.
 */
function isBuilderInput(entry: InputEntry): boolean {
    if (entry.kind === 'account') return true;
    if (entry.isLinked) return false;
    if (entry.resolver) return true;
    if (!entry.node.defaultValue) return false;
    return entry.isExtraArgument || isNode(entry.node.defaultValue, 'injectedValueNode');
}

/**
 * Orders entries depth-first so that each one comes after its dependencies, which are
 * looked up amongst all entries, so a dependency that is not itself a builder input is
 * listed too.
 *
 * @throws `CODAMA_ERROR__VISITORS__CYCLIC_DEPENDENCY_DETECTED_WHEN_RESOLVING_INSTRUCTION_DEFAULT_VALUES`
 * when entries depend on each other.
 */
function sortEntriesByDependencies(
    roots: readonly InputEntry[],
    entries: readonly InputEntry[],
    instructionPath: NodePath<InstructionNode>,
): InputEntry[] {
    const ordered: InputEntry[] = [];
    const visit = (entry: InputEntry, trail: readonly InputEntry[]): void => {
        if (ordered.includes(entry)) return;
        if (trail.includes(entry)) {
            const cycle = [...trail, entry];
            throw new CodamaError(
                CODAMA_ERROR__VISITORS__CYCLIC_DEPENDENCY_DETECTED_WHEN_RESOLVING_INSTRUCTION_DEFAULT_VALUES,
                {
                    cycle: cycle.map(item => item.path),
                    formattedCycle: cycle.map(item => item.node.identifier).join(' -> '),
                    path: instructionPath,
                },
            );
        }
        entry.dependsOn.forEach(dependency =>
            visit(findDependencyEntry(entries, entry, dependency, instructionPath), [...trail, entry]),
        );
        ordered.push(entry);
    };
    roots.forEach(root => visit(root, []));
    return ordered;
}

/**
 * The entry a dependency refers to: an account by identifier, or a data field or extra
 * argument by the first segment of its data path.
 *
 * @throws `CODAMA_ERROR__VISITORS__INVALID_INSTRUCTION_DEFAULT_VALUE_DEPENDENCY` when
 * the instruction has no such input.
 */
function findDependencyEntry(
    entries: readonly InputEntry[],
    dependent: InputEntry,
    dependency: InstructionDependency,
    instructionPath: NodePath<InstructionNode>,
): InputEntry {
    const isAccount = isNode(dependency, 'accountValueNode');
    const identifier = isAccount ? dependency.identifier : getDataPathRoot(dependency.path);
    const entry = entries.find(
        candidate => candidate.kind === (isAccount ? 'account' : 'data') && candidate.node.identifier === identifier,
    );
    if (entry) return entry;
    throw new CodamaError(CODAMA_ERROR__VISITORS__INVALID_INSTRUCTION_DEFAULT_VALUE_DEPENDENCY, {
        dependencyKind: dependency.kind,
        dependencyName: (isAccount ? dependency.identifier : dependency.path) as IdentifierString,
        dependent: dependent.node.identifier as IdentifierString,
        path: instructionPath,
    });
}

/**
 * The resolved input of an entry, given the inputs resolved before it, which include
 * its dependencies since entries are ordered by dependencies.
 */
function toResolvedInput(
    entry: InputEntry,
    previous: readonly ResolvedInstructionInput[],
    entries: readonly InputEntry[],
): ResolvedInstructionInput {
    const { dependsOn, path, resolvedDefaultValue, resolver } = entry;
    const base = {
        dependsOn,
        path,
        ...(resolvedDefaultValue ? { resolvedDefaultValue } : {}),
        ...(resolver ? { resolver } : {}),
    };
    if (entry.kind === 'data') {
        return { ...base, isExtraArgument: entry.isExtraArgument, kind: 'data', node: entry.node };
    }
    const account = entry.node;
    const findAccount = (identifier: string) =>
        previous.find(
            (input): input is ResolvedInstructionAccount =>
                input.kind === 'account' && input.node.identifier === identifier,
        );
    return {
        ...base,
        ...getResolvedAccountFlags(entry, findAccount),
        isPda: entries.some(
            candidate =>
                candidate.kind === 'data' &&
                isNode(candidate.resolvedDefaultValue, 'accountBumpValueNode') &&
                candidate.resolvedDefaultValue.identifier === account.identifier,
        ),
        kind: 'account',
        node: account,
    };
}

/**
 * Whether an account may be omitted and whether it must sign, once its default value
 * is taken into account, e.g. an account defaulting to a PDA is never omitted.
 *
 * @throws `CODAMA_ERROR__VISITORS__CANNOT_USE_OPTIONAL_ACCOUNT_AS_PDA_SEED_VALUE` when
 * a PDA default is derived from an optional account.
 */
function getResolvedAccountFlags(
    entry: Extract<InputEntry, { kind: 'account' }>,
    findAccount: (identifier: string) => ResolvedInstructionAccount | undefined,
): Pick<ResolvedInstructionAccount, 'resolvedIsOptional' | 'resolvedIsSigner'> {
    const account = entry.node;
    const defaults = { resolvedIsOptional: !!account.isOptional, resolvedIsSigner: account.isSigner };
    if (entry.resolver) return { ...defaults, resolvedIsOptional: false };

    const defaultValue = entry.resolvedDefaultValue;
    switch (defaultValue?.kind) {
        case 'accountValueNode': {
            const defaultAccount = findAccount(defaultValue.identifier)!;
            const isPublicKey = account.isSigner === false && defaultAccount.node.isSigner === false;
            const isSigner = account.isSigner === true && defaultAccount.node.isSigner === true;
            return {
                resolvedIsOptional: !!defaultAccount.node.isOptional,
                resolvedIsSigner: !isPublicKey && !isSigner ? 'either' : isSigner,
            };
        }
        case 'publicKeyValueNode':
        case 'programLinkNode':
        case 'programIdValueNode':
            return { resolvedIsOptional: false, resolvedIsSigner: account.isSigner === false ? false : 'either' };
        case 'pdaValueNode':
            (defaultValue.seeds ?? []).forEach(seed => {
                if (isNode(seed.value, 'accountValueNode') && findAccount(seed.value.identifier)?.resolvedIsOptional) {
                    throw new CodamaError(CODAMA_ERROR__VISITORS__CANNOT_USE_OPTIONAL_ACCOUNT_AS_PDA_SEED_VALUE, {
                        path: [...entry.path, defaultValue, seed],
                        seedValueName: seed.value.identifier,
                    });
                }
            });
            return { resolvedIsOptional: false, resolvedIsSigner: account.isSigner === false ? false : 'either' };
        case 'identityValueNode':
        case 'payerValueNode':
            return { ...defaults, resolvedIsOptional: false };
        default:
            return defaults;
    }
}

/**
 * Asserts that every data path an input, byte delta or remaining accounts depends on
 * resolves within the instruction data or extra arguments. Paths entering the data of a
 * linked account, e.g. `mint.data.decimals`, are not supported since instruction
 * builders only receive account addresses.
 *
 * @throws `CODAMA_ERROR__CANNOT_RESOLVE_PATH` when a path does not exist.
 * @throws `CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE` when a path enters account data.
 */
function assertSupportedDataPaths(
    instructionPath: NodePath<InstructionNode>,
    entries: readonly InputEntry[],
    linkables: LinkableDictionary,
): void {
    const instruction = getLastNodeFromPath(instructionPath);
    const byteDeltaDependencies = (instruction.byteDeltas ?? []).flatMap(byteDelta => [
        ...(getByteDeltaResolver(byteDelta)?.dependsOn ?? []),
        ...(isNode(byteDelta.value, 'dataValueNode') ? [byteDelta.value] : []),
    ]);
    const remainingAccountsDependencies = (instruction.remainingAccounts ?? []).flatMap(
        remainingAccounts => getRemainingAccountsResolver(remainingAccounts)?.dependsOn ?? [],
    );
    const dependencies = [
        ...entries.flatMap(entry => entry.dependsOn),
        ...byteDeltaDependencies,
        ...remainingAccountsDependencies,
    ];
    dependencies.filter(isNodeFilter('dataValueNode')).forEach(dependency => {
        const [root, ...rest] = parsePath(dependency.path);
        if (root?.kind !== 'field' || rest.length === 0) return;
        const entry = entries.find(
            (candidate): candidate is Extract<InputEntry, { kind: 'data' }> =>
                candidate.kind === 'data' && candidate.node.identifier === root.identifier,
        );
        // Unknown roots are reported with the input depending on them when ordering inputs.
        if (!entry) return;
        const field = structFieldTypeNode({ identifier: entry.node.identifier, type: entry.node.type });
        const remainingPath = pathString(dependency.path.slice(root.identifier.length).replace(/^\./, ''));
        const resolved = resolveTypePath([...entry.path.slice(0, -1), field], remainingPath, linkables, {
            followAccountLinks: true,
        });
        if (resolved.some(node => isNode(node, 'accountNode'))) {
            throw new CodamaError(CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE, {
                path: [...instructionPath, dependency],
            });
        }
    });
}

/**
 * Asserts that no injected value nested within the instruction data is provided.
 * Instruction builders only fill in injected values on accounts, top-level data fields
 * and extra arguments; elsewhere, codecs only fill in their fallback, so a provided value
 * would be silently ignored.
 *
 * @throws `CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE` with the path of the injection.
 */
function assertNoUnsupportedInjections(
    instructionPath: NodePath<InstructionNode>,
    scope: ProvidedScope,
    linkables: LinkableDictionary,
): void {
    const data = getLastNodeFromPath(instructionPath).data;
    if (!data) return;
    // Injections directly set as the default of a top-level field are filled in by builders,
    // but not those nested within it, e.g. a struct value with an injected member.
    const nestedNodes: { node: Node; path: NodePath }[] = isNode(data, 'structTypeNode')
        ? (data.fields ?? []).flatMap(field => {
              const path: NodePath = [...instructionPath, data, field];
              const defaultValue = field.defaultValue;
              return [
                  { node: field.type, path },
                  ...(defaultValue && !isNode(defaultValue, 'injectedValueNode') ? [{ node: defaultValue, path }] : []),
              ];
          })
        : [{ node: data, path: [...instructionPath] }];
    nestedNodes.forEach(({ node, path }) => assertNoProvidedInjectionsWithin(node, path, scope, linkables, new Set()));
}

function assertNoProvidedInjectionsWithin(
    node: Node,
    path: NodePath,
    scope: ProvidedScope,
    linkables: LinkableDictionary,
    followed: ReadonlySet<Node>,
): void {
    if (isNode(node, 'injectedValueNode')) {
        if (scope.get(node.key)) {
            throw new CodamaError(CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE, { path: [...path, node] });
        }
        return;
    }
    if (isNode(node, 'definedTypeLinkNode')) {
        const linkedPath = linkables.getPath([...path, node]);
        if (!linkedPath || followed.has(node)) return;
        const definedType = getLastNodeFromPath(linkedPath);
        assertNoProvidedInjectionsWithin(
            definedType.type,
            [...linkedPath, definedType.type],
            scope,
            linkables,
            new Set([...followed, node]),
        );
        return;
    }
    Object.values(node).forEach(child => {
        const children: unknown[] = Array.isArray(child) ? child : [child];
        children.forEach(item => {
            if (isNodeObject(item) && (isNode(item, REGISTERED_TYPE_NODE_KINDS) || isValueLike(item))) {
                assertNoProvidedInjectionsWithin(item, [...path, item], scope, linkables, followed);
            }
        });
    });
}

function isNodeObject(value: unknown): value is Node {
    return typeof value === 'object' && value !== null && typeof (value as { kind?: unknown }).kind === 'string';
}

function isValueLike(node: Node): boolean {
    return isNode(node, [...REGISTERED_VALUE_NODE_KINDS, 'definedTypeLinkNode']);
}

/**
 * The inputs a default value depends on, in the order instruction builders must
 * resolve them.
 */
export function getDefaultValueDependencies(
    defaultValue: InstructionInputDefaultValue | undefined,
): InstructionDependency[] {
    if (!defaultValue) return [];

    if (isNode(defaultValue, ['accountValueNode', 'accountBumpValueNode'])) {
        return [accountValueNode(defaultValue.identifier)];
    }

    if (isNode(defaultValue, 'accountDataValueNode')) {
        return [accountValueNode(defaultValue.account)];
    }

    if (isNode(defaultValue, 'dataValueNode')) {
        return [dataValueNode(defaultValue.path)];
    }

    if (isNode(defaultValue, 'pdaValueNode')) {
        const dependencies = new Map<string, InstructionDependency>();
        (defaultValue.seeds ?? []).forEach(seed => {
            if (isNode(seed.value, 'accountValueNode')) dependencies.set(seed.value.identifier, seed.value);
            if (isNode(seed.value, 'dataValueNode')) dependencies.set(seed.value.path, seed.value);
        });
        return [...dependencies.values(), ...(defaultValue.programId ? [defaultValue.programId] : [])];
    }

    if (isNode(defaultValue, 'conditionalValueNode')) {
        return deduplicateInstructionDependencies([
            ...getDefaultValueDependencies(defaultValue.condition),
            ...getDefaultValueDependencies(defaultValue.ifTrue),
            ...getDefaultValueDependencies(defaultValue.ifFalse),
        ]);
    }

    return [];
}

/** Removes duplicate dependencies, listing accounts before data. */
export function deduplicateInstructionDependencies(dependencies: InstructionDependency[]): InstructionDependency[] {
    const accounts = new Map<string, InstructionDependency>();
    const data = new Map<string, InstructionDependency>();
    dependencies.forEach(dependency => {
        if (isNode(dependency, 'accountValueNode')) accounts.set(dependency.identifier, dependency);
        else data.set(dependency.path, dependency);
    });
    return [...accounts.values(), ...data.values()];
}

function getResolverFromPlugins(
    plugins: readonly PluginNode[] | undefined,
    owner: unknown,
): InstructionResolver | undefined {
    const plugin = (plugins ?? []).find(candidate => candidate.namespace === RESOLVER_PLUGIN);
    if (!plugin) return undefined;
    const payload = plugin.payload as { dependsOn?: unknown; docs?: unknown; name?: unknown } | undefined;
    const dependsOn = payload?.dependsOn ?? [];
    if (
        !payload ||
        typeof payload.name !== 'string' ||
        !Array.isArray(dependsOn) ||
        !dependsOn.every(dependency => typeof dependency === 'string' && /^(accounts|data)\./.test(dependency)) ||
        (payload.docs !== undefined && typeof payload.docs !== 'string')
    ) {
        throw new CodamaError(CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE, {
            path: isNodeObject(owner) ? [owner, plugin] : [plugin],
        });
    }
    return Object.freeze({
        dependsOn: (dependsOn as string[]).map((dependency): InstructionDependency => {
            const [root, ...rest] = dependency.split('.');
            const reference = rest.join('.');
            return root === 'accounts' ? accountValueNode(reference) : dataValueNode(reference as PathString);
        }),
        ...(payload.docs !== undefined ? { docs: payload.docs } : {}),
        name: payload.name,
    });
}

function parseExtraArgumentPlugin(plugin: PluginNode, instruction: InstructionNode): InstructionDataField {
    const payload = plugin.payload as
        | {
              defaultValue?: unknown;
              defaultValueStrategy?: unknown;
              docs?: unknown;
              identifier?: unknown;
              type?: unknown;
          }
        | undefined;
    const isValidType =
        isNodeObject(payload?.type) && isNode(payload.type, [...REGISTERED_TYPE_NODE_KINDS, 'definedTypeLinkNode']);
    const isValidDefault =
        payload?.defaultValue === undefined ||
        (isNodeObject(payload.defaultValue) && isNode(payload.defaultValue, INSTRUCTION_INPUT_VALUE_NODE_KINDS));
    if (
        !payload ||
        typeof payload.identifier !== 'string' ||
        !isValidType ||
        !isValidDefault ||
        (payload.defaultValueStrategy !== undefined &&
            payload.defaultValueStrategy !== 'omitted' &&
            payload.defaultValueStrategy !== 'optional') ||
        (payload.docs !== undefined && typeof payload.docs !== 'string')
    ) {
        throw new CodamaError(CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE, { path: [instruction, plugin] });
    }
    return Object.freeze({
        identifier: payload.identifier,
        type: payload.type as TypeNode,
        ...(payload.defaultValue !== undefined
            ? { defaultValue: payload.defaultValue as InstructionInputValueNode }
            : {}),
        ...(payload.defaultValueStrategy !== undefined
            ? { defaultValueStrategy: payload.defaultValueStrategy as DefaultValueStrategy }
            : {}),
        ...(payload.docs !== undefined ? { docs: payload.docs } : {}),
        ...(plugin.plugins ? { plugins: plugin.plugins } : {}),
    });
}
