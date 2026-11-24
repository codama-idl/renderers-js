import {
    CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE,
    CODAMA_ERROR__VISITORS__INVALID_PDA_SEED_VALUES,
    CodamaError,
} from '@codama/errors';
import { mapFragmentContent, setFragmentContent } from '@codama/fragments';
import { camelCase } from '@codama/fragments/casing';
import {
    ConditionalValueNode,
    IdentifierString,
    InstructionInputValueNode,
    InstructionNode,
    isNode,
    isNodeFilter,
    OptionalAccountStrategy,
    PdaNode,
    TypeNode,
    ValueNode,
} from '@codama/nodes';
import { findProgramNodeFromPath, getLastNodeFromPath, NodePath, pipe, visit } from '@codama/visitors-core';

import {
    Fragment,
    fragment,
    getBigIntLiteral,
    getDataPathExpression,
    getDataPathLabel,
    getStringLiteral,
    getTypedValueFragment,
    hasVariablePdaSeeds,
    isAsyncInput,
    isPdaDerivedFromProgram,
    isScalarEnumValue,
    mergeFragments,
    RenderScope,
    ResolvedInstructionInput,
    use,
} from '../utils';
import { getInstructionResolverCallFragment } from './instructionResolver';

/**
 * Renders the assignment of the default value of an instruction input in a builder, e.g.
 * `accounts.vault.value = await findVaultPda(...)` or `args.amount = 42`.
 *
 * @param scope - The render scope, the resolved input, the path of the instruction, its
 * optional account strategy and whether the builder is asynchronous.
 * @return The fragment of the assignment, empty when the input has no default value the
 * builder can fill in.
 * @throws `CODAMA_ERROR__VISITORS__INVALID_PDA_SEED_VALUES` when an inline PDA default misses a seed value.
 * @throws `CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE` for default values the renderer cannot fill in.
 */
export function getInstructionInputDefaultFragment(
    scope: Pick<
        RenderScope,
        'asyncResolvers' | 'getImportFrom' | 'linkables' | 'nameApi' | 'nonScalarEnums' | 'typeManifestVisitor'
    > & {
        input: ResolvedInstructionInput;
        instructionPath: NodePath<InstructionNode>;
        optionalAccountStrategy: OptionalAccountStrategy;
        useAsync: boolean;
    },
): Fragment {
    const {
        input,
        instructionPath,
        optionalAccountStrategy,
        asyncResolvers,
        useAsync,
        nameApi,
        linkables,
        typeManifestVisitor,
        getImportFrom,
    } = scope;
    const { resolver, resolvedDefaultValue: defaultValue } = input;
    if (!resolver && !defaultValue) {
        return fragment``;
    }

    if (!useAsync && isAsyncInput(input, asyncResolvers)) {
        return fragment``;
    }

    // Renders a value for the input type of the given type, e.g. `lamports(5000n)` for a SOL amount.
    const typedValue = (value: ValueNode, type: TypeNode | undefined): Fragment =>
        getTypedValueFragment(value, type, { linkables, loose: true, path: instructionPath, typeManifestVisitor });

    const defaultFragment = (renderedValue: Fragment, isWritable?: boolean): Fragment => {
        const inputName = camelCase(input.node.identifier);
        if (input.kind === 'account' && resolver) {
            return fragment`accounts.${inputName} = { ...accounts.${inputName}, ...${renderedValue} };`;
        }
        if (input.kind === 'account' && isWritable === undefined) {
            return fragment`accounts.${inputName}.value = ${renderedValue};`;
        }
        if (input.kind === 'account') {
            return fragment`accounts.${inputName}.value = ${renderedValue};\naccounts.${inputName}.isWritable = ${isWritable ? 'true' : 'false'}`;
        }
        return fragment`args.${inputName} = ${renderedValue};`;
    };

    const getNonNullResolvedInstructionInput = use('getNonNullResolvedInstructionInput', 'solanaProgramClientCore');
    const getResolvedInstructionAccountAsTransactionSigner = use(
        'getResolvedInstructionAccountAsTransactionSigner',
        'solanaProgramClientCore',
    );
    const getAddressFromResolvedInstructionAccount = use(
        'getAddressFromResolvedInstructionAccount',
        'solanaProgramClientCore',
    );
    const getResolvedInstructionAccountAsProgramDerivedAddress = use(
        'getResolvedInstructionAccountAsProgramDerivedAddress',
        'solanaProgramClientCore',
    );
    const addressType = use('type Address', 'solanaAddresses');

    // Resolved inputs delegate their whole value to a resolver function.
    if (resolver) {
        // Synchronous builders cannot call asynchronous resolvers, as for the inputs above.
        const resolverCall = getInstructionResolverCallFragment(resolver, scope);
        return resolverCall ? defaultFragment(resolverCall) : fragment``;
    }

    if (!defaultValue) return fragment``;
    switch (defaultValue.kind) {
        case 'accountValueNode':
            const name = camelCase(defaultValue.identifier);
            if (input.kind === 'account' && input.resolvedIsSigner && !input.node.isSigner) {
                return defaultFragment(
                    fragment`${getResolvedInstructionAccountAsTransactionSigner}("${name}", accounts.${name}.value).address`,
                );
            }
            if (input.kind === 'account') {
                return defaultFragment(
                    fragment`${getNonNullResolvedInstructionInput}("${name}", accounts.${name}.value)`,
                );
            }
            return defaultFragment(
                fragment`${getAddressFromResolvedInstructionAccount}("${name}", accounts.${name}.value)`,
            );

        case 'pdaValueNode':
            let pdaProgramValue: Fragment | undefined;
            if (isNode(defaultValue.programId, 'accountValueNode')) {
                const name = camelCase(defaultValue.programId.identifier);
                pdaProgramValue = fragment`${getAddressFromResolvedInstructionAccount}("${name}", accounts.${name}.value)`;
            }
            if (isNode(defaultValue.programId, 'dataValueNode')) {
                const { path } = defaultValue.programId;
                pdaProgramValue = fragment`${getAddressFromResolvedInstructionAccount}("${getDataPathLabel(path)}", ${getDataPathExpression(path)})`;
            }

            // Inlined PDA value.
            if (isNode(defaultValue.pda, 'pdaNode')) {
                let pdaProgram = fragment`programAddress`;
                if (pdaProgramValue) {
                    pdaProgram = pdaProgramValue;
                } else if (defaultValue.pda.programId) {
                    pdaProgram = fragment`${getStringLiteral(defaultValue.pda.programId)} as ${addressType}<${getStringLiteral(defaultValue.pda.programId)}>`;
                }
                const pdaSeeds = (defaultValue.pda.seeds ?? []).flatMap((seed): Fragment[] => {
                    if (isNode(seed, 'constantPdaSeedNode') && isNode(seed.value, 'programIdValueNode')) {
                        return [fragment`${use('getAddressEncoder', 'solanaAddresses')}().encode(${pdaProgram})`];
                    }
                    if (isNode(seed, 'constantPdaSeedNode') && !isNode(seed.value, 'programIdValueNode')) {
                        const typeManifest = visit(seed.type, typeManifestVisitor);
                        return [fragment`${typeManifest.encoder}.encode(${typedValue(seed.value, seed.type)})`];
                    }
                    if (isNode(seed, 'variablePdaSeedNode')) {
                        const typeManifest = visit(seed.type, typeManifestVisitor);
                        const valueSeed = (defaultValue.seeds ?? []).find(s => s.identifier === seed.identifier)?.value;
                        // A missing seed value would derive a different address.
                        if (!valueSeed) {
                            throw new CodamaError(CODAMA_ERROR__VISITORS__INVALID_PDA_SEED_VALUES, {
                                path: instructionPath,
                                pdaName: defaultValue.pda.identifier as IdentifierString,
                            });
                        }
                        if (isNode(valueSeed, 'accountValueNode')) {
                            const name = camelCase(valueSeed.identifier);
                            return [
                                fragment`${typeManifest.encoder}.encode(${getAddressFromResolvedInstructionAccount}("${name}", accounts.${name}.value))`,
                            ];
                        }
                        if (isNode(valueSeed, 'dataValueNode')) {
                            const { path } = valueSeed;
                            return [
                                fragment`${typeManifest.encoder}.encode(${getNonNullResolvedInstructionInput}("${getDataPathLabel(path)}", ${getDataPathExpression(path)}))`,
                            ];
                        }
                        return [fragment`${typeManifest.encoder}.encode(${typedValue(valueSeed, seed.type)})`];
                    }
                    return [];
                });
                const getProgramDerivedAddress = use('getProgramDerivedAddress', 'solanaAddresses');
                const programAddress =
                    pdaProgram.content === 'programAddress' ? pdaProgram : fragment`programAddress: ${pdaProgram}`;
                const seeds = mergeFragments(pdaSeeds, s => s.join(', '));
                return defaultFragment(
                    fragment`await ${getProgramDerivedAddress}({ ${programAddress}, seeds: [${seeds}] })`,
                );
            }

            // Linked PDA value.
            const pdaFunction = use(
                nameApi.pdaFindFunction(defaultValue.pda.identifier),
                getImportFrom(defaultValue.pda),
            );
            const pdaPath = linkables.getPath([...instructionPath, defaultValue.pda]);
            const pdaArgs: Fragment[] = [];
            const pdaSeeds = (defaultValue.seeds ?? []).map((seed): Fragment => {
                const seedName = camelCase(seed.identifier);
                if (isNode(seed.value, 'accountValueNode')) {
                    const name = camelCase(seed.value.identifier);
                    return fragment`${seedName}: ${getAddressFromResolvedInstructionAccount}("${name}", accounts.${name}.value)`;
                }
                if (isNode(seed.value, 'dataValueNode')) {
                    const { path } = seed.value;
                    return fragment`${seedName}: ${getNonNullResolvedInstructionInput}("${getDataPathLabel(path)}", ${getDataPathExpression(path)})`;
                }
                const pdaSeedType = (pdaPath ? (getLastNodeFromPath(pdaPath).seeds ?? []) : [])
                    .filter(isNodeFilter('variablePdaSeedNode'))
                    .find(pdaSeed => pdaSeed.identifier === seed.identifier)?.type;
                return pipe(typedValue(seed.value, pdaSeedType), f => mapFragmentContent(f, c => `${seedName}: ${c}`));
            });
            const pdaSeedsFragment = pipe(
                mergeFragments(pdaSeeds, renders => renders.join(', ')),
                f => mapFragmentContent(f, c => `{ ${c} }`),
            );
            // The seeds argument comes first, so it is rendered even without seed values for
            // the program address that follows to land in the right position.
            if (pdaSeeds.length > 0 || (!!pdaPath && hasVariablePdaSeeds(getLastNodeFromPath(pdaPath)))) {
                pdaArgs.push(pdaSeedsFragment);
            }
            if (pdaProgramValue) {
                pdaArgs.push(fragment`{ programAddress: ${pdaProgramValue} }`);
            } else if (isPdaDerivedFromInstructionProgram(pdaPath, instructionPath)) {
                pdaArgs.push(fragment`{ programAddress }`);
            }
            return defaultFragment(fragment`await ${pdaFunction}(${mergeFragments(pdaArgs, c => c.join(', '))})`);

        case 'publicKeyValueNode':
            return defaultFragment(
                fragment`${getStringLiteral(defaultValue.publicKey)} as ${addressType}<${getStringLiteral(defaultValue.publicKey)}>`,
            );

        case 'programLinkNode':
            const programAddress = use(
                nameApi.programAddressConstant(defaultValue.identifier),
                getImportFrom(defaultValue),
            );
            return defaultFragment(programAddress, false);

        case 'programIdValueNode':
            if (optionalAccountStrategy === 'programId' && input.kind === 'account' && input.node.isOptional) {
                return fragment``;
            }
            return defaultFragment(fragment`programAddress`, false);

        case 'identityValueNode':
        case 'payerValueNode':
            return fragment``;

        case 'accountBumpValueNode':
            return defaultFragment(
                fragment`${getResolvedInstructionAccountAsProgramDerivedAddress}("${camelCase(defaultValue.identifier)}", accounts.${camelCase(defaultValue.identifier)}.value)[1]`,
            );

        case 'dataValueNode':
            return defaultFragment(
                fragment`${getNonNullResolvedInstructionInput}("${getDataPathLabel(defaultValue.path)}", ${getDataPathExpression(defaultValue.path)})`,
            );

        case 'conditionalValueNode':
            const ifTrueRenderer = renderNestedInstructionDefault({
                ...scope,
                defaultValue: defaultValue.ifTrue,
            });
            const ifFalseRenderer = renderNestedInstructionDefault({
                ...scope,
                defaultValue: defaultValue.ifFalse,
            });
            if (!ifTrueRenderer && !ifFalseRenderer) {
                return fragment``;
            }
            let conditionalFragment = fragment``;
            if (ifTrueRenderer) {
                conditionalFragment = mergeFragments([conditionalFragment, ifTrueRenderer], c => c[0]);
            }
            if (ifFalseRenderer) {
                conditionalFragment = mergeFragments([conditionalFragment, ifFalseRenderer], c => c[0]);
            }
            const negatedCondition = !ifTrueRenderer;
            let condition = 'true';

            const comparedInputName = isNode(defaultValue.condition, 'accountValueNode')
                ? `accounts.${camelCase(defaultValue.condition.identifier)}.value`
                : getDataPathExpression(defaultValue.condition.path);
            if (defaultValue.value) {
                const comparison = getConditionComparisonFragment(defaultValue, defaultValue.value, comparedInputName, {
                    ...scope,
                    getAddressFromResolvedInstructionAccount,
                });
                conditionalFragment = mergeFragments([conditionalFragment, comparison], c => c[0]);
                condition = negatedCondition ? `!(${comparison.content})` : comparison.content;
            } else {
                condition = negatedCondition ? `!${comparedInputName}` : comparedInputName;
            }

            if (ifTrueRenderer && ifFalseRenderer) {
                return setFragmentContent(
                    conditionalFragment,
                    `if (${condition}) {\n${ifTrueRenderer.content}\n} else {\n${ifFalseRenderer.content}\n}`,
                );
            }

            return setFragmentContent(
                conditionalFragment,
                `if (${condition}) {\n${ifTrueRenderer ? ifTrueRenderer.content : ifFalseRenderer?.content}\n}`,
            );

        case 'accountDataValueNode':
        case 'injectedValueNode':
            // Account data is not yet supported as an instruction input default by this renderer,
            // and injected values are resolved beforehand.
            throw new CodamaError(CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE, {
                path: [...input.path, defaultValue],
            });

        default:
            return defaultFragment(typedValue(defaultValue, input.kind === 'data' ? input.node.type : undefined));
    }
}

function renderNestedInstructionDefault(
    scope: Parameters<typeof getInstructionInputDefaultFragment>[0] & {
        defaultValue: InstructionInputValueNode | undefined;
    },
): Fragment | undefined {
    const { input, defaultValue } = scope;
    if (!defaultValue) return undefined;
    return getInstructionInputDefaultFragment({
        ...scope,
        input: { ...input, resolvedDefaultValue: defaultValue },
    });
}

/**
 * Whether a linked PDA is derived from the same program as the instruction using it.
 *
 * When it is, the generated find function bakes in that program's address as its default,
 * so the instruction must forward its own — possibly overridden — program address to keep
 * the derivation in sync with the program the instruction is sent to. That includes PDAs
 * pinned to the address of their own program, as program plugins do. PDAs owned by another
 * program, or pinned to another program ID, keep their own default instead.
 */
function isPdaDerivedFromInstructionProgram(
    pdaPath: NodePath<PdaNode> | undefined,
    instructionPath: NodePath<InstructionNode>,
): boolean {
    if (!pdaPath) return false;
    const pdaProgram = findProgramNodeFromPath(pdaPath);
    const instructionProgram = findProgramNodeFromPath(instructionPath);
    return (
        !!pdaProgram &&
        pdaProgram.identifier === instructionProgram?.identifier &&
        isPdaDerivedFromProgram(getLastNodeFromPath(pdaPath), pdaProgram)
    );
}

/**
 * The condition of a conditional default value comparing its input with a value, e.g.
 * `args.amount !== undefined && BigInt(args.amount) === 5n`. An absent input never equals
 * the value. Integers are compared as `bigint`s, since inputs accept both numbers and bigints,
 * accounts by address, since they may be signers, and strings, booleans, addresses and
 * members of native enums as they are.
 *
 * @throws `CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE` for values that cannot be compared with
 * `===`, e.g. options, structs or data unions, whose instances are never identical.
 */
function getConditionComparisonFragment(
    conditional: ConditionalValueNode,
    value: ValueNode,
    comparedInputName: string,
    scope: Pick<RenderScope, 'linkables' | 'nonScalarEnums' | 'typeManifestVisitor'> & {
        getAddressFromResolvedInstructionAccount: Fragment;
        input: ResolvedInstructionInput;
    },
): Fragment {
    const isPresent = `${comparedInputName} != null`;
    if (isNode(conditional.condition, 'accountValueNode')) {
        if (!isNode(value, 'publicKeyValueNode')) return throwUnsupportedComparison(conditional, scope);
        const name = camelCase(conditional.condition.identifier);
        const renderedValue = visit(value, scope.typeManifestVisitor).value;
        return fragment`${isPresent} && ${scope.getAddressFromResolvedInstructionAccount}("${name}", ${comparedInputName}) === ${renderedValue}`;
    }
    switch (value.kind) {
        case 'integerValueNode':
            return fragment`${isPresent} && BigInt(${comparedInputName}) === ${getBigIntLiteral(value.value)}`;
        case 'enumValueNode':
            if (!isScalarEnumValue(value, scope.input.path, scope))
                return throwUnsupportedComparison(conditional, scope);
            return fragment`${comparedInputName} === ${visit(value, scope.typeManifestVisitor).value}`;
        case 'booleanValueNode':
        case 'publicKeyValueNode':
        case 'stringValueNode':
            return fragment`${comparedInputName} === ${visit(value, scope.typeManifestVisitor).value}`;
        default:
            return throwUnsupportedComparison(conditional, scope);
    }
}

function throwUnsupportedComparison(
    conditional: ConditionalValueNode,
    scope: { input: ResolvedInstructionInput },
): never {
    throw new CodamaError(CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE, { path: [...scope.input.path, conditional] });
}
