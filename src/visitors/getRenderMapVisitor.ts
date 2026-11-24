import { CODAMA_ERROR__VERSION_MISMATCH, CodamaError } from '@codama/errors';
import { createRenderMap, mergeRenderMaps, RenderMap } from '@codama/fragments';
import { camelCase } from '@codama/fragments/casing';
import {
    CODAMA_VERSION,
    getAllAccounts,
    getAllDefinedTypes,
    getAllEvents,
    getAllPdas,
    getAllPrograms,
    getCodamaVersionMajor,
    isNode,
} from '@codama/nodes';
import {
    extendVisitor,
    getByteSizeVisitor,
    interceptFirstVisitVisitor,
    LinkableDictionary,
    NodeStack,
    pipe,
    recordLinkablesOnFirstVisitVisitor,
    recordNodeStackVisitor,
    staticVisitor,
    visit,
    Visitor,
} from '@codama/visitors-core';

import {
    getAccountPageFragment,
    getConstantsPageFragment,
    getErrorPageFragment,
    getEventPageFragment,
    getIndexPageFragment,
    getInstructionPageFragment,
    getPdaPageFragment,
    getProgramPageFragment,
    getRootIndexPageFragment,
    getTypePageFragment,
} from '../fragments';
import {
    assertValidRenderedAttributes,
    DEFAULT_KIT_IMPORT_STRATEGY,
    DEFAULT_NAME_TRANSFORMERS,
    Fragment,
    getDefinedTypeNodesToExtract,
    getImportFromFactory,
    getImportPathFactory,
    getIsInternalNodeFactory,
    getNameApi,
    getPageFragment,
    getRenderedInstructions,
    getResolvedInstructionInputs,
    GetRenderMapOptions,
    isArchivedInstruction,
    isRenderedInstruction,
    parseCustomDataOptions,
    RenderScope,
} from '../utils';
import { getTypeManifestVisitor } from './getTypeManifestVisitor';

/**
 * Creates a visitor rendering the files of the generated client of a Codama tree, keyed by
 * their path relative to the generated folder, e.g. `accounts/counter.ts`.
 *
 * @param options - The options controlling the generated code.
 * @return The visitor returning the render map.
 * @throws `CODAMA_ERROR__VERSION_MISMATCH` when the root node is not of the Codama v2 standard.
 *
 * @example
 * ```ts
 * const renderMap = visit(root, getRenderMapVisitor({ kitImportStrategy: 'rootOnly' }));
 * ```
 */
export function getRenderMapVisitor(
    options: GetRenderMapOptions = {},
): Visitor<
    RenderMap<Fragment>,
    'accountNode' | 'definedTypeNode' | 'eventNode' | 'instructionNode' | 'pdaNode' | 'programNode' | 'rootNode'
> {
    const linkables = new LinkableDictionary();
    const stack = new NodeStack();

    const customAccountData = parseCustomDataOptions(options.customAccountData ?? [], 'AccountData');
    const customInstructionData = parseCustomDataOptions(options.customInstructionData ?? [], 'InstructionData');
    const getImportPath = getImportPathFactory(options.importExtension);
    const isInternalNode = getIsInternalNodeFactory(options.internalNodes ?? []);
    const nameApi = getNameApi({ ...DEFAULT_NAME_TRANSFORMERS, ...options.nameTransformers });
    const renderScopeWithTypeManifestVisitor: Omit<RenderScope, 'typeManifestVisitor'> = {
        asyncResolvers: (options.asyncResolvers ?? []).map(camelCase),
        customAccountData,
        customInstructionData,
        dependencyMap: options.dependencyMap ?? {},
        dependencyVersions: options.dependencyVersions ?? {},
        erasableSyntax: options.erasableSyntax ?? false,
        getImportFrom: getImportFromFactory(options.linkOverrides ?? {}, customAccountData, customInstructionData, {
            getImportPath,
            isInternalNode,
            nameApi,
        }),
        getImportPath,
        isInternalNode,
        kitImportStrategy: options.kitImportStrategy ?? DEFAULT_KIT_IMPORT_STRATEGY,
        linkables,
        nameApi,
        nonScalarEnums: (options.nonScalarEnums ?? []).map(camelCase),
        renderParentInstructions: options.renderParentInstructions ?? false,
    };

    const typeManifestVisitor = getTypeManifestVisitor({ ...renderScopeWithTypeManifestVisitor, stack });
    const renderScope: RenderScope = { ...renderScopeWithTypeManifestVisitor, typeManifestVisitor };

    const isNotInternal = (node: { identifier: string }) => !isInternalNode(node.identifier);
    const byteSizeVisitor = getByteSizeVisitor(linkables, { stack });
    const asPage = <TFragment extends Fragment | undefined>(
        fragment: TFragment,
        pageDependencyMap: Record<string, string> = {},
    ): TFragment => {
        if (!fragment) return undefined as TFragment;
        return getPageFragment(fragment, {
            ...renderScope,
            dependencyMap: { ...renderScope.dependencyMap, ...pageDependencyMap },
        }) as TFragment;
    };

    return pipe(
        staticVisitor(() => createRenderMap<Fragment>(), {
            keys: [
                'rootNode',
                'programNode',
                'pdaNode',
                'accountNode',
                'definedTypeNode',
                'eventNode',
                'instructionNode',
            ],
        }),
        v =>
            extendVisitor(v, {
                visitAccount(node) {
                    return createRenderMap(
                        `accounts/${renderScope.nameApi.fileName(node.identifier)}.ts`,
                        asPage(
                            getAccountPageFragment({
                                ...renderScope,
                                accountPath: stack.getPath('accountNode'),
                                // The size of the data, typing its codecs, rather than the declared account size.
                                size: visit(node.data, byteSizeVisitor),
                            }),
                        ),
                    );
                },

                visitDefinedType(node) {
                    return createRenderMap(
                        `types/${renderScope.nameApi.fileName(node.identifier)}.ts`,
                        asPage(
                            getTypePageFragment({
                                ...renderScope,
                                node,
                                size: visit(node, byteSizeVisitor),
                                typePath: stack.getPath('definedTypeNode'),
                            }),
                            { generatedTypes: renderScope.getImportPath('.', 'directory') },
                        ),
                    );
                },

                visitEvent(node) {
                    return createRenderMap(
                        `events/${renderScope.nameApi.fileName(node.identifier)}.ts`,
                        asPage(
                            getEventPageFragment({
                                ...renderScope,
                                eventPath: stack.getPath('eventNode'),
                                size: visit(node.data, byteSizeVisitor),
                            }),
                        ),
                    );
                },

                visitInstruction(node, { self }) {
                    // Sub-instructions are visited from their parent so that the `provides`
                    // of their parents are on the stack when resolving their inputs.
                    // Archived instructions are left out of the client, along with their sub-instructions.
                    if (isArchivedInstruction(node)) return createRenderMap<Fragment>();
                    const subInstructions = node.subInstructions ?? [];
                    const isRendered = isRenderedInstruction(node, renderScope);
                    const instructionPath = stack.getPath('instructionNode');
                    return mergeRenderMaps([
                        isRendered
                            ? createRenderMap(
                                  `instructions/${renderScope.nameApi.fileName(node.identifier)}.ts`,
                                  asPage(
                                      getInstructionPageFragment({
                                          ...renderScope,
                                          instructionPath,
                                          resolvedInputs: getResolvedInstructionInputs(instructionPath, linkables),
                                          size: visit(node, byteSizeVisitor),
                                      }),
                                  ),
                              )
                            : createRenderMap<Fragment>(),
                        ...subInstructions.map(subInstruction => visit(subInstruction, self)),
                    ]);
                },

                visitPda(node) {
                    return createRenderMap(
                        `pdas/${renderScope.nameApi.fileName(node.identifier)}.ts`,
                        asPage(getPdaPageFragment({ ...renderScope, pdaPath: stack.getPath('pdaNode') })),
                    );
                },

                visitProgram(node, { self }) {
                    const constantsToExport = (node.constants ?? []).filter(isNotInternal);
                    const customDataDefinedType = [
                        ...getDefinedTypeNodesToExtract(node.accounts ?? [], customAccountData),
                        ...getDefinedTypeNodesToExtract(
                            getRenderedInstructions(node, {
                                renderParentInstructions: renderScope.renderParentInstructions,
                            }),
                            customInstructionData,
                        ),
                    ];
                    const scope = { ...renderScope, programNode: node, programPath: stack.getPath('programNode') };

                    return mergeRenderMaps([
                        createRenderMap({
                            [`constants/${renderScope.nameApi.fileName(node.identifier)}.ts`]:
                                constantsToExport.length > 0
                                    ? asPage(
                                          getConstantsPageFragment({
                                              ...renderScope,
                                              nodes: constantsToExport,
                                              programPath: stack.getPath('programNode'),
                                          }),
                                          { generatedTypes: renderScope.getImportPath('../types', 'directory') },
                                      )
                                    : undefined,
                            [`programs/${renderScope.nameApi.fileName(node.identifier)}.ts`]: asPage(
                                getProgramPageFragment(scope),
                            ),
                            [`errors/${renderScope.nameApi.fileName(node.identifier)}.ts`]:
                                (node.errors ?? []).length > 0 ? asPage(getErrorPageFragment(scope)) : undefined,
                        }),
                        ...(node.pdas ?? []).map(p => visit(p, self)),
                        ...(node.accounts ?? []).map(a => visit(a, self)),
                        ...(node.events ?? []).map(e => visit(e, self)),
                        ...(node.definedTypes ?? []).map(t => visit(t, self)),
                        ...customDataDefinedType.map(t => visit(t, self)),
                        ...(node.instructions ?? []).map(i => visit(i, self)),
                    ]);
                },

                visitRoot(node, { self }) {
                    const programsToExport = getAllPrograms(node).filter(isNotInternal);
                    const programsWithConstantsToExport = programsToExport.filter(program =>
                        (program.constants ?? []).some(isNotInternal),
                    );
                    const programsWithErrorsToExport = programsToExport.filter(p => (p.errors ?? []).length > 0);
                    const pdasToExport = getAllPdas(node).filter(isNotInternal);
                    const accountsToExport = getAllAccounts(node).filter(isNotInternal);
                    const eventsToExport = getAllEvents(node).filter(isNotInternal);
                    const instructionsToExport = getAllPrograms(node)
                        .flatMap(program =>
                            getRenderedInstructions(program, {
                                renderParentInstructions: renderScope.renderParentInstructions,
                            }),
                        )
                        .filter(isNotInternal);
                    const definedTypesToExport = getAllDefinedTypes(node).filter(isNotInternal);

                    const scope = {
                        ...renderScope,
                        accountsToExport,
                        definedTypesToExport,
                        eventsToExport,
                        instructionsToExport,
                        pdasToExport,
                        programsToExport,
                        programsWithConstantsToExport,
                    };

                    return mergeRenderMaps([
                        createRenderMap({
                            ['accounts/index.ts']: asPage(getIndexPageFragment(accountsToExport, renderScope)),
                            ['constants/index.ts']: asPage(
                                getIndexPageFragment(programsWithConstantsToExport, renderScope),
                            ),
                            ['errors/index.ts']: asPage(getIndexPageFragment(programsWithErrorsToExport, renderScope)),
                            ['events/index.ts']: asPage(getIndexPageFragment(eventsToExport, renderScope)),
                            ['index.ts']: asPage(getRootIndexPageFragment(scope)),
                            ['instructions/index.ts']: asPage(getIndexPageFragment(instructionsToExport, renderScope)),
                            ['pdas/index.ts']: asPage(getIndexPageFragment(pdasToExport, renderScope)),
                            ['programs/index.ts']: asPage(getIndexPageFragment(programsToExport, renderScope)),
                            ['types/index.ts']: asPage(getIndexPageFragment(definedTypesToExport, renderScope)),
                        }),
                        ...getAllPrograms(node).map(p => visit(p, self)),
                    ]);
                },
            }),
        v => recordNodeStackVisitor(v, stack),
        v => recordLinkablesOnFirstVisitVisitor(v, linkables),
        // Rejects attributes that would be written into generated code as they are, e.g. sizes
        // that are not numbers, before rendering anything.
        v =>
            interceptFirstVisitVisitor(v, (node, next) => {
                // Trees of another major version have other attributes, so they are rejected first.
                if (
                    isNode(node, 'rootNode') &&
                    getCodamaVersionMajor(node.version) !== getCodamaVersionMajor(CODAMA_VERSION)
                ) {
                    throw new CodamaError(CODAMA_ERROR__VERSION_MISMATCH, {
                        codamaVersion: CODAMA_VERSION,
                        rootVersion: node.version,
                    });
                }
                assertValidRenderedAttributes(node);
                return next(node);
            }),
    );
}
