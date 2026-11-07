import {
    accountLinkNode,
    accountValueNode,
    argumentValueNode,
    instructionAccountNode,
    instructionArgumentNode,
    instructionByteDeltaNode,
    instructionNode,
    instructionRemainingAccountsNode,
    numberTypeNode,
    numberValueNode,
    publicKeyValueNode,
    resolverValueNode,
} from '@codama/nodes';
import { expect, test } from 'vitest';

import {
    getAllInstructionDataFields,
    getByteDeltaResolver,
    getInputDefaultValue,
    getInputResolver,
    getInstructionDataFields,
    getInstructionDataNode,
    getInstructionExtraArguments,
    getInstructionExtraArgumentsNode,
    getRemainingAccountsName,
    getRemainingAccountsResolver,
    hasInputDefault,
    hasInstructionData,
    hasRemainingAccountInputs,
    isInstructionResolver,
    isRemainingAccountsBackedByArgument,
} from '../../src/utils';

const amount = instructionArgumentNode({ name: 'amount', type: numberTypeNode('u64') });
const useAta = instructionArgumentNode({ name: 'useAta', type: numberTypeNode('u8') });

test('it exposes the data fields and extra arguments of an instruction', () => {
    const instruction = instructionNode({ arguments: [amount], extraArguments: [useAta], name: 'transfer' });

    expect(getInstructionDataFields(instruction)).toStrictEqual([amount]);
    expect(getInstructionExtraArguments(instruction)).toStrictEqual([useAta]);
    expect(getAllInstructionDataFields(instruction)).toStrictEqual([amount, useAta]);
    expect(hasInstructionData(instruction)).toBe(true);
    expect(getInstructionDataNode(instruction).fields?.map(f => f.name)).toStrictEqual(['amount']);
    expect(getInstructionExtraArgumentsNode(instruction).fields?.map(f => f.name)).toStrictEqual(['useAta']);
});

test('it reports instructions without data', () => {
    const instruction = instructionNode({ extraArguments: [useAta], name: 'noop' });

    expect(hasInstructionData(instruction)).toBe(false);
    expect(getInstructionDataNode(instruction).fields).toBeUndefined();
});

test('it exposes the resolver of an input separately from its default value', () => {
    const resolved = instructionAccountNode({
        defaultValue: resolverValueNode('resolveDestination', {
            dependsOn: [accountValueNode('owner'), argumentValueNode('useAta')],
            docs: ['Resolves the destination.'],
        }),
        isSigner: false,
        isWritable: true,
        name: 'destination',
    });
    const defaulted = instructionAccountNode({
        defaultValue: publicKeyValueNode('1111'),
        isSigner: false,
        isWritable: false,
        name: 'program',
    });
    const plain = instructionAccountNode({ isSigner: true, isWritable: true, name: 'owner' });

    const resolver = getInputResolver(resolved);
    expect(resolver).toStrictEqual({
        dependsOn: [accountValueNode('owner'), argumentValueNode('useAta')],
        docs: ['Resolves the destination.'],
        name: 'resolveDestination',
    });
    expect(isInstructionResolver(resolver)).toBe(true);
    expect(isInstructionResolver(resolved.defaultValue)).toBe(false);
    expect(getInputDefaultValue(resolved)).toBeUndefined();
    expect(hasInputDefault(resolved)).toBe(true);

    expect(getInputResolver(defaulted)).toBeUndefined();
    expect(getInputDefaultValue(defaulted)).toStrictEqual(publicKeyValueNode('1111'));
    expect(hasInputDefault(defaulted)).toBe(true);

    expect(getInputResolver(plain)).toBeUndefined();
    expect(getInputDefaultValue(plain)).toBeUndefined();
    expect(hasInputDefault(plain)).toBe(false);
});

test('it exposes the resolver of a byte delta', () => {
    expect(getByteDeltaResolver(instructionByteDeltaNode(resolverValueNode('resolveSize')))).toStrictEqual({
        dependsOn: [],
        docs: [],
        name: 'resolveSize',
    });
    expect(getByteDeltaResolver(instructionByteDeltaNode(numberValueNode(42)))).toBeUndefined();
    expect(getByteDeltaResolver(instructionByteDeltaNode(accountLinkNode('counter')))).toBeUndefined();
});

test('it distinguishes remaining accounts provided as inputs from resolved ones', () => {
    const fromInput = instructionRemainingAccountsNode(argumentValueNode('signers'), { isSigner: true });
    const fromData = instructionRemainingAccountsNode(argumentValueNode('amount'));
    const fromResolver = instructionRemainingAccountsNode(resolverValueNode('resolveSigners'));
    const instruction = instructionNode({
        arguments: [amount],
        name: 'transfer',
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
