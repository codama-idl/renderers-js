/* eslint-disable no-case-declarations */
import { camelCase, InstructionInputValueNode, isNode, OptionalAccountStrategy } from '@codama/nodes';
import { mapFragmentContent, setFragmentContent } from '@codama/renderers-core';
import { pipe, ResolvedInstructionInput, visit } from '@codama/visitors-core';

import {
    addFragmentFeatures,
    addFragmentImports,
    Fragment,
    fragment,
    isAsyncDefaultValue,
    mergeFragments,
    RenderScope,
    use,
} from '../utils';

export function getInstructionInputDefaultFragment(
    scope: Pick<RenderScope, 'asyncResolvers' | 'getImportFrom' | 'nameApi' | 'typeManifestVisitor'> & {
        input: ResolvedInstructionInput;
        optionalAccountStrategy: OptionalAccountStrategy;
        useAsync: boolean;
    },
): Fragment {
    const { input, optionalAccountStrategy, asyncResolvers, useAsync, nameApi, typeManifestVisitor, getImportFrom } =
        scope;
    if (!input.defaultValue) {
        return fragment``;
    }

    if (!useAsync && isAsyncDefaultValue(input.defaultValue, asyncResolvers)) {
        return fragment``;
    }

    const { defaultValue } = input;
    const defaultFragment = (renderedValue: Fragment, isWritable?: boolean): Fragment => {
        const inputName = camelCase(input.name);
        if (input.kind === 'instructionAccountNode' && isNode(defaultValue, 'resolverValueNode')) {
            return fragment`accounts.${inputName} = { ...accounts.${inputName}, ...${renderedValue} };`;
        }
        if (input.kind === 'instructionAccountNode' && isWritable === undefined) {
            return fragment`accounts.${inputName}.value = ${renderedValue};`;
        }
        if (input.kind === 'instructionAccountNode') {
            return fragment`accounts.${inputName}.value = ${renderedValue};\naccounts.${inputName}.isWritable = ${isWritable ? 'true' : 'false'}`;
        }
        return fragment`args.${inputName} = ${renderedValue};`;
    };

    const expectTransactionSigner = use('expectTransactionSigner', 'shared');
    const expectSome = use('expectSome', 'shared');
    const expectAddress = use('expectAddress', 'shared');
    const expectProgramDerivedAddress = use('expectProgramDerivedAddress', 'shared');
    const addressType = use('type Address', 'solanaAddresses');

    switch (defaultValue.kind) {
        case 'accountValueNode':
            const name = camelCase(defaultValue.name);
            if (input.kind === 'instructionAccountNode' && input.resolvedIsSigner && !input.isSigner) {
                return defaultFragment(fragment`${expectTransactionSigner}(accounts.${name}.value).address`);
            }
            if (input.kind === 'instructionAccountNode') {
                return defaultFragment(fragment`${expectSome}(accounts.${name}.value)`);
            }
            return defaultFragment(fragment`${expectAddress}(accounts.${name}.value)`);

        case 'pdaValueNode':
            let pdaProgramValue: Fragment | undefined;
            if (isNode(defaultValue.programId, 'accountValueNode')) {
                pdaProgramValue = fragment`${expectAddress}(accounts.${camelCase(defaultValue.programId.name)}.value)`;
            }
            if (isNode(defaultValue.programId, 'argumentValueNode')) {
                pdaProgramValue = fragment`${expectAddress}(args.${camelCase(defaultValue.programId.name)})`;
            }

            // Inlined PDA value.
            if (isNode(defaultValue.pda, 'pdaNode')) {
                let pdaProgram = fragment`programAddress`;
                if (pdaProgramValue) {
                    pdaProgram = pdaProgramValue;
                } else if (defaultValue.pda.programId) {
                    pdaProgram = fragment`'${defaultValue.pda.programId}' as ${addressType}<'${defaultValue.pda.programId}'>`;
                }
                const pdaSeeds = defaultValue.pda.seeds.flatMap((seed): Fragment[] => {
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
                        const valueSeed = defaultValue.seeds.find(s => s.name === seed.name)?.value;
                        if (!valueSeed) return [];
                        if (isNode(valueSeed, 'accountValueNode')) {
                            return [
                                fragment`${typeManifest.encoder}.encode(${expectAddress}(accounts.${camelCase(valueSeed.name)}.value))`,
                            ];
                        }
                        if (isNode(valueSeed, 'argumentValueNode')) {
                            return [
                                fragment`${typeManifest.encoder}.encode(${expectSome}(args.${camelCase(valueSeed.name)}))`,
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
            const pdaFunction = use(nameApi.pdaFindFunction(defaultValue.pda.name), getImportFrom(defaultValue.pda));
            const pdaArgs: Fragment[] = [];
            const pdaSeeds = defaultValue.seeds.map((seed): Fragment => {
                if (isNode(seed.value, 'accountValueNode')) {
                    return fragment`${seed.name}: ${expectAddress}(accounts.${camelCase(seed.value.name)}.value)`;
                }
                if (isNode(seed.value, 'argumentValueNode')) {
                    return fragment`${seed.name}: ${expectSome}(args.${camelCase(seed.value.name)})`;
                }
                return pipe(visit(seed.value, typeManifestVisitor).value, f =>
                    mapFragmentContent(f, c => `${seed.name}: ${c}`),
                );
            });
            const pdaSeedsFragment = pipe(
                mergeFragments(pdaSeeds, renders => renders.join(', ')),
                f => mapFragmentContent(f, c => `{ ${c} }`),
            );
            if (pdaSeeds.length > 0) {
                pdaArgs.push(pdaSeedsFragment);
            }
            if (pdaProgramValue) {
                pdaArgs.push(fragment`{ programAddress: ${pdaProgramValue} }`);
            }
            return defaultFragment(fragment`await ${pdaFunction}(${mergeFragments(pdaArgs, c => c.join(', '))})`);

        case 'publicKeyValueNode':
            return defaultFragment(
                fragment`'${defaultValue.publicKey}' as ${addressType}<'${defaultValue.publicKey}'>`,
            );

        case 'programLinkNode':
            const programAddress = use(nameApi.programAddressConstant(defaultValue.name), getImportFrom(defaultValue));
            return defaultFragment(programAddress, false);

        case 'programIdValueNode':
            if (
                optionalAccountStrategy === 'programId' &&
                input.kind === 'instructionAccountNode' &&
                input.isOptional
            ) {
                return fragment``;
            }
            return defaultFragment(fragment`programAddress`, false);

        case 'identityValueNode':
        case 'payerValueNode':
            return fragment``;

        case 'accountBumpValueNode':
            return defaultFragment(
                fragment`${expectProgramDerivedAddress}(accounts.${camelCase(defaultValue.name)}.value)[1]`,
            );

        case 'argumentValueNode':
            return defaultFragment(fragment`${expectSome}(args.${camelCase(defaultValue.name)})`);

        case 'resolverValueNode':
            const resolverFunction = use(nameApi.resolverFunction(defaultValue.name), getImportFrom(defaultValue));
            const resolverAwait = useAsync && asyncResolvers.includes(defaultValue.name) ? 'await ' : '';
            return pipe(defaultFragment(fragment`${resolverAwait}${resolverFunction}(resolverScope)`), f =>
                addFragmentFeatures(f, ['instruction:resolverScopeVariable']),
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

            if (isNode(defaultValue.condition, 'resolverValueNode')) {
                const conditionalResolverFunction = nameApi.resolverFunction(defaultValue.condition.name);
                const module = getImportFrom(defaultValue.condition);
                conditionalFragment = pipe(
                    conditionalFragment,
                    f => addFragmentImports(f, module, [conditionalResolverFunction]),
                    f => addFragmentFeatures(f, ['instruction:resolverScopeVariable']),
                );
                const conditionalResolverAwait =
                    useAsync && asyncResolvers.includes(defaultValue.condition.name) ? 'await ' : '';
                condition = `${conditionalResolverAwait}${conditionalResolverFunction}(resolverScope)`;
                condition = negatedCondition ? `!${condition}` : condition;
            } else {
                const comparedInputName = isNode(defaultValue.condition, 'accountValueNode')
                    ? `accounts.${camelCase(defaultValue.condition.name)}.value`
                    : `args.${camelCase(defaultValue.condition.name)}`;
                if (defaultValue.value) {
                    const comparedValue = visit(defaultValue.value, typeManifestVisitor).value;
                    conditionalFragment = mergeFragments([conditionalFragment, comparedValue], c => c[0]);
                    const operator = negatedCondition ? '!==' : '===';
                    condition = `${comparedInputName} ${operator} ${comparedValue.content}`;
                } else {
                    condition = negatedCondition ? `!${comparedInputName}` : comparedInputName;
                }
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
        input: { ...input, defaultValue },
    });
}
