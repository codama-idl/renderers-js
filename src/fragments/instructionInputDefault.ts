import { CODAMA_ERROR__RENDERERS__UNSUPPORTED_NODE, CodamaError } from '@codama/errors';
import { mapFragmentContent, setFragmentContent } from '@codama/fragments';
import { camelCase } from '@codama/fragments/casing';
import {
    InstructionInputValueNode,
    InstructionNode,
    isNode,
    isNodeFilter,
    OptionalAccountStrategy,
    PdaNode,
} from '@codama/nodes';
import { findProgramNodeFromPath, getLastNodeFromPath, NodePath, pipe, visit } from '@codama/visitors-core';

import {
    addFragmentFeatures,
    Fragment,
    fragment,
    getDataPathExpression,
    getDataPathLabel,
    isAsyncInput,
    isAsyncResolver,
    mergeFragments,
    RenderScope,
    ResolvedInstructionInput,
    use,
} from '../utils';

export function getInstructionInputDefaultFragment(
    scope: Pick<RenderScope, 'asyncResolvers' | 'getImportFrom' | 'linkables' | 'nameApi' | 'typeManifestVisitor'> & {
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
        const resolverFunction = use(nameApi.resolverFunction(resolver.name), getImportFrom(resolver));
        const resolverAwait = useAsync && isAsyncResolver(resolver.name, asyncResolvers) ? 'await ' : '';
        return pipe(defaultFragment(fragment`${resolverAwait}${resolverFunction}(resolverScope)`), f =>
            addFragmentFeatures(f, ['instruction:resolverScopeVariable']),
        );
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
                    pdaProgram = fragment`'${defaultValue.pda.programId}' as ${addressType}<'${defaultValue.pda.programId}'>`;
                }
                const pdaSeeds = (defaultValue.pda.seeds ?? []).flatMap((seed): Fragment[] => {
                    if (isNode(seed, 'constantPdaSeedNode') && isNode(seed.value, 'programIdValueNode')) {
                        return [fragment`${use('getAddressEncoder', 'solanaAddresses')}().encode(${pdaProgram})`];
                    }
                    if (isNode(seed, 'constantPdaSeedNode') && !isNode(seed.value, 'programIdValueNode')) {
                        const typeManifest = visit(seed.type, typeManifestVisitor);
                        const valueManifest = visit(seed.value, typeManifestVisitor);
                        return [fragment`${typeManifest.encoder}.encode(${valueManifest.value})`];
                    }
                    if (isNode(seed, 'variablePdaSeedNode')) {
                        const typeManifest = visit(seed.type, typeManifestVisitor);
                        const valueSeed = (defaultValue.seeds ?? []).find(s => s.identifier === seed.identifier)?.value;
                        if (!valueSeed) return [];
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
                        const valueManifest = visit(valueSeed, typeManifestVisitor);
                        return [fragment`${typeManifest.encoder}.encode(${valueManifest.value})`];
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
                return pipe(visit(seed.value, typeManifestVisitor).value, f =>
                    mapFragmentContent(f, c => `${seedName}: ${c}`),
                );
            });
            const pdaSeedsFragment = pipe(
                mergeFragments(pdaSeeds, renders => renders.join(', ')),
                f => mapFragmentContent(f, c => `{ ${c} }`),
            );
            if (pdaSeeds.length > 0 || hasVariablePdaSeeds(pdaPath)) {
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
                fragment`'${defaultValue.publicKey}' as ${addressType}<'${defaultValue.publicKey}'>`,
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
                const comparedValue = visit(defaultValue.value, typeManifestVisitor).value;
                conditionalFragment = mergeFragments([conditionalFragment, comparedValue], c => c[0]);
                const operator = negatedCondition ? '!==' : '===';
                condition = `${comparedInputName} ${operator} ${comparedValue.content}`;
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
            const valueManifest = visit(defaultValue, typeManifestVisitor).value;
            return defaultFragment(valueManifest);
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
 * the derivation in sync with the program the instruction is sent to. PDAs owned by another
 * program, or pinned to an explicit program ID, keep their own default instead.
 */
function isPdaDerivedFromInstructionProgram(
    pdaPath: NodePath<PdaNode> | undefined,
    instructionPath: NodePath<InstructionNode>,
): boolean {
    if (!pdaPath || getLastNodeFromPath(pdaPath).programId) return false;
    const pdaProgram = findProgramNodeFromPath(pdaPath);
    const instructionProgram = findProgramNodeFromPath(instructionPath);
    return !!pdaProgram && !!instructionProgram && pdaProgram.identifier === instructionProgram.identifier;
}

/**
 * Whether a linked PDA takes a seeds argument on its generated find function.
 *
 * The seeds argument comes first, so it must be rendered — even with no seed values to fill
 * it — for any following argument to land in the right position.
 */
function hasVariablePdaSeeds(pdaPath: NodePath<PdaNode> | undefined): boolean {
    if (!pdaPath) return false;
    return (getLastNodeFromPath(pdaPath).seeds ?? []).some(isNodeFilter('variablePdaSeedNode'));
}
