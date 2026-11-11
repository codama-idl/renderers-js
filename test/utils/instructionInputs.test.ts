import {
    CODAMA_ERROR__INJECTED_VALUE_NOT_PROVIDED,
    CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE,
    CODAMA_ERROR__VISITORS__CANNOT_USE_OPTIONAL_ACCOUNT_AS_PDA_SEED_VALUE,
    CODAMA_ERROR__VISITORS__CYCLIC_DEPENDENCY_DETECTED_WHEN_RESOLVING_INSTRUCTION_DEFAULT_VALUES,
    CODAMA_ERROR__VISITORS__INVALID_INSTRUCTION_DEFAULT_VALUE_DEPENDENCY,
    type CodamaErrorCode,
    isCodamaError,
} from '@codama/errors';
import {
    accountBumpValueNode,
    accountValueNode,
    dataValueNode,
    definedTypeLinkNode,
    definedTypeNode,
    identityValueNode,
    injectedValueNode,
    type InstructionNode,
    instructionAccountNode,
    instructionByteDeltaNode,
    instructionNode,
    instructionRemainingAccountsNode,
    integerTypeNode,
    integerValueNode,
    pdaSeedValueNode,
    pdaValueNode,
    pluginNode,
    programNode,
    providedNode,
    publicKeyTypeNode,
    publicKeyValueNode,
    rootNode,
    structFieldTypeNode,
    structFieldValueNode,
    structTypeNode,
    structValueNode,
} from '@codama/nodes';
import { getLinkablesFromNode, type NodePath } from '@codama/visitors-core';
import { expect, test } from 'vitest';

import {
    getAllInstructionDataFields,
    getByteDeltaResolver,
    getInputResolver,
    getInstructionDataFields,
    getInstructionDataNode,
    getInstructionExtraArguments,
    getInstructionExtraArgumentsNode,
    getRemainingAccountsName,
    getRemainingAccountsResolver,
    getResolvedInputName,
    getResolvedInstructionInputs,
    hasInputDefault,
    hasInstructionData,
    hasRemainingAccountInputs,
    isInstructionResolver,
    isRemainingAccountsBackedByArgument,
} from '../../src/utils';

const amount = structFieldTypeNode({ identifier: 'amount', type: integerTypeNode('u64') });
const useAta = { identifier: 'useAta', type: integerTypeNode('u8') };
const useAtaPlugin = pluginNode('codama.extraArgument', useAta);

test('it exposes the data fields and extra arguments of an instruction', () => {
    const instruction = instructionNode({
        data: structTypeNode([amount]),
        identifier: 'transfer',
        plugins: [useAtaPlugin],
    });

    expect(getInstructionDataFields(instruction)).toStrictEqual([amount]);
    expect(getInstructionExtraArguments(instruction)).toStrictEqual([useAta]);
    expect(getAllInstructionDataFields(instruction)).toStrictEqual([amount, useAta]);
    expect(hasInstructionData(instruction)).toBe(true);
    expect(getInstructionDataNode(instruction)).toStrictEqual(structTypeNode([amount]));
    expect(getInstructionExtraArgumentsNode(instruction)).toStrictEqual(structTypeNode([structFieldTypeNode(useAta)]));
});

test('it reports instructions without data', () => {
    const instruction = instructionNode({ identifier: 'noop', plugins: [useAtaPlugin] });

    expect(hasInstructionData(instruction)).toBe(false);
    expect(getInstructionDataNode(instruction)).toStrictEqual(structTypeNode([]));
});

test('it exposes instruction data linked to a defined type', () => {
    const data = definedTypeLinkNode('transferArgs');
    const instruction = instructionNode({ data, identifier: 'transfer' });

    expect(hasInstructionData(instruction)).toBe(true);
    expect(getInstructionDataNode(instruction)).toBe(data);
    expect(getInstructionDataFields(instruction)).toStrictEqual([]);
});

test('it keeps only literal default values in the extra arguments node', () => {
    const instruction = instructionNode({
        identifier: 'transfer',
        plugins: [
            pluginNode('codama.extraArgument', {
                defaultValue: integerValueNode('1'),
                defaultValueStrategy: 'omitted',
                identifier: 'literal',
                type: integerTypeNode('u8'),
            }),
            pluginNode('codama.extraArgument', {
                defaultValue: accountValueNode('owner'),
                defaultValueStrategy: 'omitted',
                identifier: 'contextual',
                type: integerTypeNode('u8'),
            }),
        ],
    });

    expect(getInstructionExtraArgumentsNode(instruction)).toStrictEqual(
        structTypeNode([
            structFieldTypeNode({
                defaultValue: integerValueNode('1'),
                defaultValueStrategy: 'omitted',
                identifier: 'literal',
                type: integerTypeNode('u8'),
            }),
            structFieldTypeNode({ identifier: 'contextual', type: integerTypeNode('u8') }),
        ]),
    );
});

test('it exposes the resolver of an input separately from its default value', () => {
    const resolved = instructionAccountNode({
        identifier: 'destination',
        isSigner: false,
        isWritable: true,
        plugins: [
            pluginNode('codama.resolver', {
                dependsOn: ['accounts.owner', 'data.useAta'],
                docs: 'Resolves the destination.',
                name: 'resolveDestination',
            }),
        ],
    });
    const defaulted = instructionAccountNode({
        defaultValue: publicKeyValueNode('1111'),
        identifier: 'program',
        isSigner: false,
        isWritable: false,
    });
    const plain = instructionAccountNode({ identifier: 'owner', isSigner: true, isWritable: true });

    const resolver = getInputResolver(resolved);
    expect(resolver).toStrictEqual({
        dependsOn: [accountValueNode('owner'), dataValueNode('useAta')],
        docs: 'Resolves the destination.',
        name: 'resolveDestination',
    });
    expect(isInstructionResolver(resolver)).toBe(true);
    expect(isInstructionResolver(defaulted.defaultValue)).toBe(false);
    expect(hasInputDefault(resolved)).toBe(true);

    expect(getInputResolver(defaulted)).toBeUndefined();
    expect(hasInputDefault(defaulted)).toBe(true);

    expect(getInputResolver(plain)).toBeUndefined();
    expect(hasInputDefault(plain)).toBe(false);
});

test('it exposes the resolver of a byte delta', () => {
    const resolved = instructionByteDeltaNode(integerValueNode('0'), {
        plugins: [pluginNode('codama.resolver', { name: 'resolveSize' })],
    });

    expect(getByteDeltaResolver(resolved)).toStrictEqual({ dependsOn: [], name: 'resolveSize' });
    expect(getByteDeltaResolver(instructionByteDeltaNode(integerValueNode('42')))).toBeUndefined();
});

test('it distinguishes remaining accounts provided as inputs from resolved ones', () => {
    const fromInput = instructionRemainingAccountsNode('signers', { isSigner: true });
    const fromData = instructionRemainingAccountsNode('amount');
    const fromResolver = instructionRemainingAccountsNode('remainingAccounts', {
        plugins: [pluginNode('codama.resolver', { name: 'resolveSigners' })],
    });
    const instruction = instructionNode({
        data: structTypeNode([amount]),
        identifier: 'transfer',
        remainingAccounts: [fromInput, fromData, fromResolver],
    });

    expect(getRemainingAccountsName(fromInput)).toBe('signers');
    expect(getRemainingAccountsName(fromResolver)).toBeUndefined();
    expect(getRemainingAccountsResolver(fromResolver)?.name).toBe('resolveSigners');
    expect(getRemainingAccountsResolver(fromInput)).toBeUndefined();

    expect(isRemainingAccountsBackedByArgument(instruction, fromInput)).toBe(false);
    expect(isRemainingAccountsBackedByArgument(instruction, fromData)).toBe(true);
    expect(isRemainingAccountsBackedByArgument(instruction, fromResolver)).toBe(false);
    expect(hasRemainingAccountInputs(instruction)).toBe(true);
    expect(hasRemainingAccountInputs({ ...instruction, remainingAccounts: [fromData, fromResolver] })).toBe(false);
});

/** Resolves the inputs of the given instruction, within a program that may hold other nodes. */
function resolve(
    instruction: InstructionNode,
    program: Partial<Parameters<typeof programNode>[0]> = {},
): ReturnType<typeof getResolvedInstructionInputs> {
    const root = rootNode(
        programNode({ identifier: 'myProgram', publicKey: '1111', ...program, instructions: [instruction] }),
    );
    const path: NodePath<InstructionNode> = [root, root.program, root.program.instructions![0]];
    return getResolvedInstructionInputs(path, getLinkablesFromNode(root));
}

/** The Codama error thrown by the given function, failing if it does not throw one with that code. */
function getCodamaError<TCode extends CodamaErrorCode>(code: TCode, fn: () => unknown) {
    try {
        fn();
    } catch (error) {
        if (isCodamaError(error, code)) return error;
        throw error;
    }
    throw new Error(`Expected a Codama error with code ${code} to be thrown.`);
}

const account = (identifier: string, options: Partial<Parameters<typeof instructionAccountNode>[0]> = {}) =>
    instructionAccountNode({ identifier, isSigner: false, isWritable: false, ...options });
const resolverPlugin = (name: string, dependsOn: string[] = []) => pluginNode('codama.resolver', { dependsOn, name });

test('it orders resolved inputs after the inputs they depend on', () => {
    // Given accounts listed before the inputs their defaults depend on.
    const instruction = instructionNode({
        accounts: [
            account('vault', {
                defaultValue: pdaValueNode('vault', { seeds: [pdaSeedValueNode('owner', accountValueNode('owner'))] }),
            }),
            account('destination', { plugins: [resolverPlugin('resolveDestination', ['data.useAta'])] }),
            account('owner', { isSigner: true }),
        ],
        data: structTypeNode([structFieldTypeNode({ identifier: 'amount', type: integerTypeNode('u64') })]),
        identifier: 'transfer',
        plugins: [pluginNode('codama.extraArgument', { identifier: 'useAta', type: integerTypeNode('u8') })],
    });

    // Then each input comes after its dependencies, and data fields without defaults are left out.
    expect(resolve(instruction).map(getResolvedInputName)).toStrictEqual(['owner', 'vault', 'useAta', 'destination']);
});

test('it fails on inputs that depend on each other', () => {
    // Given two accounts defaulting to one another.
    const instruction = instructionNode({
        accounts: [
            account('first', { defaultValue: accountValueNode('second') }),
            account('second', { plugins: [resolverPlugin('resolveSecond', ['accounts.first'])] }),
        ],
        identifier: 'cyclic',
    });

    // Then resolving its inputs fails with the cycle.
    const error = getCodamaError(
        CODAMA_ERROR__VISITORS__CYCLIC_DEPENDENCY_DETECTED_WHEN_RESOLVING_INSTRUCTION_DEFAULT_VALUES,
        () => resolve(instruction),
    );
    expect(error.context.formattedCycle).toBe('first -> second -> first');
});

test('it fails on resolver dependencies that do not exist', () => {
    // Given a resolver depending on a data field the instruction does not have.
    const instruction = instructionNode({
        accounts: [account('vault', { plugins: [resolverPlugin('resolveVault', ['data.missing'])] })],
        identifier: 'broken',
    });

    // Then resolving its inputs fails with the missing dependency.
    const error = getCodamaError(CODAMA_ERROR__VISITORS__INVALID_INSTRUCTION_DEFAULT_VALUE_DEPENDENCY, () =>
        resolve(instruction),
    );
    expect(error.context).toMatchObject({
        dependencyKind: 'dataValueNode',
        dependencyName: 'missing',
        dependent: 'vault',
    });
});

test('it fails on PDA defaults derived from optional accounts', () => {
    // Given a PDA account whose seed is an optional account.
    const instruction = instructionNode({
        accounts: [
            account('owner', { isOptional: true }),
            account('vault', {
                defaultValue: pdaValueNode('vault', { seeds: [pdaSeedValueNode('owner', accountValueNode('owner'))] }),
            }),
        ],
        identifier: 'broken',
    });

    // Then resolving its inputs fails on that seed.
    const error = getCodamaError(CODAMA_ERROR__VISITORS__CANNOT_USE_OPTIONAL_ACCOUNT_AS_PDA_SEED_VALUE, () =>
        resolve(instruction),
    );
    expect(error.context.seedValueName).toBe('owner');
});

test('it fails on malformed resolver and extra argument payloads', () => {
    // Given a resolver without a name, a resolver with an invalid dependency and an extra argument without a type.
    const nameless = pluginNode('codama.resolver', { dependsOn: [] });
    const invalidDependency = pluginNode('codama.resolver', { dependsOn: ['owner'], name: 'resolveVault' });
    const typeless = pluginNode('codama.extraArgument', { identifier: 'useAta' });
    const vault = account('vault', { plugins: [invalidDependency] });

    // Then resolving the inputs of each fails on the offending plugin.
    const unsupported = (instruction: InstructionNode) =>
        getCodamaError(CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE, () => resolve(instruction)).context.path;
    expect(
        unsupported(instructionNode({ accounts: [account('vault', { plugins: [nameless] })], identifier: 'a' })).at(-1),
    ).toBe(nameless);
    expect(unsupported(instructionNode({ accounts: [vault], identifier: 'b' }))).toStrictEqual([
        vault,
        invalidDependency,
    ]);
    expect(unsupported(instructionNode({ identifier: 'c', plugins: [typeless] })).at(-1)).toBe(typeless);
});

test('it resolves injected account defaults from the provides of the instruction', () => {
    // Given an account defaulting to an injected value provided by the instruction.
    const instruction = instructionNode({
        accounts: [account('authority', { defaultValue: injectedValueNode({ key: 'authority' }), isSigner: true })],
        identifier: 'increment',
        provides: [providedNode('authority', identityValueNode())],
    });

    // Then the account resolves to the provided value.
    expect(resolve(instruction)).toMatchObject([
        {
            kind: 'account',
            resolvedDefaultValue: identityValueNode(),
            resolvedIsOptional: false,
            resolvedIsSigner: true,
        },
    ]);
});

test('it resolves injected values from the provides of parent instructions', () => {
    // Given a sub-instruction whose account default is provided by its parent.
    const child = instructionNode({
        accounts: [account('authority', { defaultValue: injectedValueNode({ key: 'authority' }) })],
        identifier: 'child',
    });
    const parent = instructionNode({
        identifier: 'parent',
        provides: [providedNode('authority', publicKeyValueNode('1111'))],
        subInstructions: [child],
    });
    const root = rootNode(programNode({ identifier: 'myProgram', instructions: [parent], publicKey: '1111' }));

    // Then the account resolves to the value provided by the parent.
    const inputs = getResolvedInstructionInputs([root, root.program, parent, child], getLinkablesFromNode(root));
    expect(inputs).toMatchObject([{ resolvedDefaultValue: publicKeyValueNode('1111') }]);
});

test('it fails on injected defaults that are not provided', () => {
    // Given an account defaulting to an injected value nothing provides.
    const instruction = instructionNode({
        accounts: [account('authority', { defaultValue: injectedValueNode({ key: 'authority' }) })],
        identifier: 'increment',
    });

    // Then resolving its inputs fails on the missing key.
    expect(getCodamaError(CODAMA_ERROR__INJECTED_VALUE_NOT_PROVIDED, () => resolve(instruction)).context.key).toBe(
        'authority',
    );
});

test('it marks accounts as PDAs when a data field defaults to their bump through an injection', () => {
    // Given a bump data field defaulting to an injected bump of the vault account.
    const instruction = instructionNode({
        accounts: [account('vault'), account('owner')],
        data: structTypeNode([
            structFieldTypeNode({
                defaultValue: injectedValueNode({ key: 'bump' }),
                identifier: 'bump',
                type: integerTypeNode('u8'),
            }),
        ]),
        identifier: 'initialize',
        provides: [providedNode('bump', accountBumpValueNode('vault'))],
    });

    // Then the vault is a PDA, the bump field depends on it, and the owner is not a PDA.
    const inputs = resolve(instruction);
    expect(inputs.map(input => [getResolvedInputName(input), input.kind === 'account' && input.isPda])).toStrictEqual([
        ['vault', true],
        ['owner', false],
        ['bump', false],
    ]);
    expect(inputs.find(input => input.kind === 'data')?.dependsOn).toStrictEqual([accountValueNode('vault')]);
});

test('it fails on provided injections nested within data field defaults', () => {
    // Given a data field defaulting to a struct value with a provided injected member.
    const injection = injectedValueNode({ key: 'owner' });
    const instruction = instructionNode({
        data: structTypeNode([
            structFieldTypeNode({
                defaultValue: structValueNode([structFieldValueNode('owner', injection)]),
                identifier: 'config',
                type: structTypeNode([structFieldTypeNode({ identifier: 'owner', type: publicKeyTypeNode() })]),
            }),
        ]),
        identifier: 'configure',
        provides: [providedNode('owner', publicKeyValueNode('1111'))],
    });

    // Then resolving its inputs fails on that injection, since only codecs would fill it in.
    expect(
        getCodamaError(CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE, () => resolve(instruction)).context.path.at(-1),
    ).toBe(injection);
});

test('it fails on provided injections nested within linked instruction data', () => {
    // Given instruction data linked to a defined type with a provided injected default.
    const injection = injectedValueNode({ key: 'fee' });
    const instruction = instructionNode({
        data: definedTypeLinkNode('transferArgs'),
        identifier: 'transfer',
        provides: [providedNode('fee', integerValueNode('5'))],
    });
    const transferArgs = definedTypeNode({
        identifier: 'transferArgs',
        type: structTypeNode([
            structFieldTypeNode({ defaultValue: injection, identifier: 'fee', type: integerTypeNode('u64') }),
        ]),
    });

    // Then resolving its inputs fails on that injection.
    const error = getCodamaError(CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE, () =>
        resolve(instruction, { definedTypes: [transferArgs] }),
    );
    expect(error.context.path.at(-1)).toBe(injection);
});

test('it lets inputs depend on fields of linked instruction data without listing them', () => {
    // Given instruction data linked to a defined type, and an account resolver depending on one of its fields.
    const instruction = instructionNode({
        accounts: [account('vault', { plugins: [resolverPlugin('resolveVault', ['data.amount'])] })],
        data: definedTypeLinkNode('transferArgs'),
        identifier: 'transfer',
    });
    const transferArgs = definedTypeNode({
        identifier: 'transferArgs',
        type: structTypeNode([structFieldTypeNode({ identifier: 'amount', type: integerTypeNode('u64') })]),
    });

    // Then the dependency resolves, and the linked field is not listed as an input of its own.
    const inputs = resolve(instruction, { definedTypes: [transferArgs] });
    expect(inputs.map(getResolvedInputName)).toStrictEqual(['vault']);
    expect(inputs[0].dependsOn).toStrictEqual([dataValueNode('amount')]);
});

test('it lets inputs depend on nested fields of linked instruction data', () => {
    // Given an account resolver depending on a nested field of linked instruction data.
    const instruction = instructionNode({
        accounts: [account('vault', { plugins: [resolverPlugin('resolveVault', ['data.config.fee'])] })],
        data: definedTypeLinkNode('transferArgs'),
        identifier: 'transfer',
    });
    const transferArgs = definedTypeNode({
        identifier: 'transferArgs',
        type: structTypeNode([
            structFieldTypeNode({
                identifier: 'config',
                type: structTypeNode([structFieldTypeNode({ identifier: 'fee', type: integerTypeNode('u64') })]),
            }),
        ]),
    });

    // Then the dependency resolves through its top-level field.
    const inputs = resolve(instruction, { definedTypes: [transferArgs] });
    expect(inputs.map(getResolvedInputName)).toStrictEqual(['vault']);
    expect(inputs[0].dependsOn).toStrictEqual([dataValueNode('config.fee')]);
});
