import {
    camelCase,
    CamelCaseString,
    getAllAccounts,
    getAllDefinedTypes,
    getAllInstructionsWithSubs,
    getAllPdas,
    getAllPrograms,
} from '@codama/nodes';
import { createRenderMap, mergeRenderMaps, RenderMap } from '@codama/renderers-core';
import {
    extendVisitor,
    getByteSizeVisitor,
    getResolvedInstructionInputsVisitor,
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
    getErrorPageFragment,
    getIndexPageFragment,
    getInstructionPageFragment,
    getPdaPageFragment,
    getProgramPageFragment,
    getRootIndexPageFragment,
    getTypePageFragment,
} from '../fragments';
import {
    DEFAULT_KIT_IMPORT_STRATEGY,
    DEFAULT_NAME_TRANSFORMERS,
    Fragment,
    getDefinedTypeNodesToExtract,
    getImportFromFactory,
    getImportPathFactory,
    getNameApi,
    getPageFragment,
    GetRenderMapOptions,
    parseCustomDataOptions,
    RenderScope,
} from '../utils';
import { getTypeManifestVisitor } from './getTypeManifestVisitor';

export function getRenderMapVisitor(
    options: GetRenderMapOptions = {},
): Visitor<
    RenderMap<Fragment>,
    'accountNode' | 'definedTypeNode' | 'instructionNode' | 'pdaNode' | 'programNode' | 'rootNode'
> {
    const linkables = new LinkableDictionary();
    const stack = new NodeStack();

    const customAccountData = parseCustomDataOptions(options.customAccountData ?? [], 'AccountData');
    const customInstructionData = parseCustomDataOptions(options.customInstructionData ?? [], 'InstructionData');
    const renderScopeWithTypeManifestVisitor: Omit<RenderScope, 'typeManifestVisitor'> = {
        asyncResolvers: (options.asyncResolvers ?? []).map(camelCase),
        customAccountData,
        customInstructionData,
        dependencyMap: options.dependencyMap ?? {},
        dependencyVersions: options.dependencyVersions ?? {},
        erasableSyntax: options.erasableSyntax ?? false,
        getImportFrom: getImportFromFactory(options.linkOverrides ?? {}, customAccountData, customInstructionData),
        getImportPath: getImportPathFactory(options.importExtension),
        kitImportStrategy: options.kitImportStrategy ?? DEFAULT_KIT_IMPORT_STRATEGY,
        linkables,
        nameApi: getNameApi({ ...DEFAULT_NAME_TRANSFORMERS, ...options.nameTransformers }),
        nonScalarEnums: (options.nonScalarEnums ?? []).map(camelCase),
        renderParentInstructions: options.renderParentInstructions ?? false,
    };

    const typeManifestVisitor = getTypeManifestVisitor({ ...renderScopeWithTypeManifestVisitor, stack });
    const renderScope: RenderScope = { ...renderScopeWithTypeManifestVisitor, typeManifestVisitor };

    const internalNodes = (options.internalNodes ?? []).map(camelCase);
    const resolvedInstructionInputVisitor = getResolvedInstructionInputsVisitor();
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
            keys: ['rootNode', 'programNode', 'pdaNode', 'accountNode', 'definedTypeNode', 'instructionNode'],
        }),
        v =>
            extendVisitor(v, {
                visitAccount(node) {
                    return createRenderMap(
                        `accounts/${camelCase(node.name)}.ts`,
                        asPage(
                            getAccountPageFragment({
                                ...renderScope,
                                accountPath: stack.getPath('accountNode'),
                                size: visit(node, byteSizeVisitor),
                            }),
                        ),
                    );
                },

                visitDefinedType(node) {
                    return createRenderMap(
                        `types/${camelCase(node.name)}.ts`,
                        asPage(getTypePageFragment({ ...renderScope, node, size: visit(node, byteSizeVisitor) }), {
                            generatedTypes: renderScope.getImportPath('.', 'directory'),
                        }),
                    );
                },

                visitInstruction(node) {
                    return createRenderMap(
                        `instructions/${camelCase(node.name)}.ts`,
                        asPage(
                            getInstructionPageFragment({
                                ...renderScope,
                                instructionPath: stack.getPath('instructionNode'),
                                resolvedInputs: visit(node, resolvedInstructionInputVisitor),
                                size: visit(node, byteSizeVisitor),
                            }),
                        ),
                    );
                },

                visitPda(node) {
                    return createRenderMap(
                        `pdas/${camelCase(node.name)}.ts`,
                        asPage(getPdaPageFragment({ ...renderScope, pdaPath: stack.getPath('pdaNode') })),
                    );
                },

                visitProgram(node, { self }) {
                    const customDataDefinedType = [
                        ...getDefinedTypeNodesToExtract(node.accounts ?? [], customAccountData),
                        ...getDefinedTypeNodesToExtract(node.instructions ?? [], customInstructionData),
                    ];
                    const scope = { ...renderScope, programNode: node };

                    return mergeRenderMaps([
                        createRenderMap({
                            [`programs/${camelCase(node.name)}.ts`]: asPage(getProgramPageFragment(scope)),
                            [`errors/${camelCase(node.name)}.ts`]:
                                (node.errors ?? []).length > 0 ? asPage(getErrorPageFragment(scope)) : undefined,
                        }),
                        ...(node.pdas ?? []).map(p => visit(p, self)),
                        ...(node.accounts ?? []).map(a => visit(a, self)),
                        ...(node.definedTypes ?? []).map(t => visit(t, self)),
                        ...customDataDefinedType.map(t => visit(t, self)),
                        ...getAllInstructionsWithSubs(node, { leavesOnly: !renderScope.renderParentInstructions }).map(
                            i => visit(i, self),
                        ),
                    ]);
                },

                visitRoot(node, { self }) {
                    const isNotInternal = (n: { name: CamelCaseString }) => !internalNodes.includes(n.name);
                    const programsToExport = getAllPrograms(node).filter(isNotInternal);
                    const programsWithErrorsToExport = programsToExport.filter(p => (p.errors ?? []).length > 0);
                    const pdasToExport = getAllPdas(node);
                    const accountsToExport = getAllAccounts(node).filter(isNotInternal);
                    const instructionsToExport = getAllInstructionsWithSubs(node, {
                        leavesOnly: !renderScope.renderParentInstructions,
                    }).filter(isNotInternal);
                    const definedTypesToExport = getAllDefinedTypes(node).filter(isNotInternal);

                    const scope = {
                        ...renderScope,
                        accountsToExport,
                        definedTypesToExport,
                        instructionsToExport,
                        pdasToExport,
                        programsToExport,
                    };

                    return mergeRenderMaps([
                        createRenderMap({
                            ['accounts/index.ts']: asPage(getIndexPageFragment(accountsToExport, renderScope)),
                            ['errors/index.ts']: asPage(getIndexPageFragment(programsWithErrorsToExport, renderScope)),
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
    );
}
