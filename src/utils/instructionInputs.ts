import {
    AccountValueNode,
    ArgumentValueNode,
    camelCase,
    Docs,
    InstructionAccountNode,
    InstructionArgumentNode,
    InstructionByteDeltaNode,
    InstructionInputValueNode,
    InstructionNode,
    InstructionRemainingAccountsNode,
    isNode,
    ResolverValueNode,
    StructTypeNode,
    structTypeNodeFromInstructionArgumentNodes,
} from '@codama/nodes';

/**
 * The renderer's own view of the inputs of an instruction.
 *
 * Fragments consume instructions through the helpers of this module rather than
 * reading `arguments`, `extraArguments` or resolver value nodes directly, so that
 * the way the IDL stores these inputs is only known here.
 */

/** A field of the instruction data or an extra argument, as consumed by the renderer. */
export type InstructionDataField = Pick<
    InstructionArgumentNode,
    'defaultValue' | 'defaultValueStrategy' | 'docs' | 'name' | 'type'
>;

/** Any input of an instruction whose value is resolved at build time. */
export type InstructionInput = InstructionAccountNode | InstructionDataField;

/**
 * A function resolving the value of an instruction input, byte delta or remaining
 * accounts with custom code rather than from the IDL.
 */
export type InstructionResolver = Readonly<{
    dependsOn: readonly (AccountValueNode | ArgumentValueNode)[];
    docs: Docs;
    name: string;
}>;

/** Whether the given value is an {@link InstructionResolver} rather than a node. */
export function isInstructionResolver(value: unknown): value is InstructionResolver {
    return typeof value === 'object' && value !== null && !('kind' in value) && 'dependsOn' in value;
}

/** The fields of the instruction data, in order. */
export function getInstructionDataFields(instruction: InstructionNode): InstructionDataField[] {
    return instruction.arguments ?? [];
}

/** The inputs of the instruction that are not part of the instruction data. */
export function getInstructionExtraArguments(instruction: InstructionNode): InstructionDataField[] {
    return instruction.extraArguments ?? [];
}

/** The data fields of the instruction followed by its extra arguments. */
export function getAllInstructionDataFields(instruction: InstructionNode): InstructionDataField[] {
    return [...getInstructionDataFields(instruction), ...getInstructionExtraArguments(instruction)];
}

/** Whether the instruction serialises any data. */
export function hasInstructionData(instruction: InstructionNode): boolean {
    return getInstructionDataFields(instruction).length > 0;
}

/** The type describing the serialised data of the instruction. */
export function getInstructionDataNode(instruction: InstructionNode): StructTypeNode {
    return structTypeNodeFromInstructionArgumentNodes(instruction.arguments ?? []);
}

/** The type describing the extra arguments of the instruction. */
export function getInstructionExtraArgumentsNode(instruction: InstructionNode): StructTypeNode {
    return structTypeNodeFromInstructionArgumentNodes(instruction.extraArguments ?? []);
}

/** The default value of an instruction input, when it comes from the IDL rather than a resolver. */
export type InstructionInputDefaultValue = Exclude<InstructionInputValueNode, ResolverValueNode>;

/** The resolver computing the value of an instruction input, if any. */
export function getInputResolver(input: Pick<InstructionInput, 'defaultValue'>): InstructionResolver | undefined {
    return getResolverFromValue(input.defaultValue);
}

/** The default value of an instruction input, if any, unless a resolver computes it. */
export function getInputDefaultValue(
    input: Pick<InstructionInput, 'defaultValue'>,
): InstructionInputDefaultValue | undefined {
    return isNode(input.defaultValue, 'resolverValueNode') ? undefined : input.defaultValue;
}

/** Whether an instruction input has a default value, be it a value from the IDL or a resolver. */
export function hasInputDefault(input: Pick<InstructionInput, 'defaultValue'>): boolean {
    return !!input.defaultValue;
}

/** The resolver computing a byte delta, if any. */
export function getByteDeltaResolver(byteDelta: InstructionByteDeltaNode): InstructionResolver | undefined {
    return getResolverFromValue(byteDelta.value);
}

/** The resolver providing remaining accounts, if any. */
export function getRemainingAccountsResolver(
    remainingAccounts: InstructionRemainingAccountsNode,
): InstructionResolver | undefined {
    return getResolverFromValue(remainingAccounts.value);
}

/**
 * The name under which remaining accounts are provided as an instruction input,
 * or `undefined` when they are provided by a resolver instead.
 */
export function getRemainingAccountsName(remainingAccounts: InstructionRemainingAccountsNode): string | undefined {
    return isNode(remainingAccounts.value, 'argumentValueNode') ? remainingAccounts.value.name : undefined;
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
    return getAllInstructionDataFields(instructionNode).some(field => camelCase(field.name) === camelCase(name));
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

function getResolverFromValue(
    value: InstructionByteDeltaNode['value'] | InstructionInputValueNode | undefined,
): InstructionResolver | undefined {
    if (!isNode(value, 'resolverValueNode')) return undefined;
    return Object.freeze({ dependsOn: value.dependsOn ?? [], docs: value.docs ?? [], name: value.name });
}
