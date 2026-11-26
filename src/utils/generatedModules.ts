/**
 * The modules generated nodes are imported from.
 *
 * Generated nodes are imported from the barrel of their folder, e.g. `../accounts`, unless
 * they are listed in the `internalNodes` option, in which case they are left out of that
 * barrel and imported from their own file instead, e.g. `../accounts/counter`.
 *
 * @packageDocumentation
 */

import { camelCase } from '@codama/fragments/casing';

import type { NameApi } from './nameTransformers';
import type { GetImportPathFunction } from './options';

/** The kinds of generated nodes, each rendered in its own folder. */
export type GeneratedNodeKind = 'account' | 'definedType' | 'instruction' | 'pda' | 'program';

const GENERATED_FOLDERS: Record<GeneratedNodeKind, { folder: string; module: string }> = {
    account: { folder: 'accounts', module: 'generatedAccounts' },
    definedType: { folder: 'types', module: 'generatedTypes' },
    instruction: { folder: 'instructions', module: 'generatedInstructions' },
    pda: { folder: 'pdas', module: 'generatedPdas' },
    program: { folder: 'programs', module: 'generatedPrograms' },
};

/** Whether a node, given by its identifier, is listed in the `internalNodes` option. */
export type IsInternalNodeFunction = (identifier: string) => boolean;

/** The scope needed to import a generated node: whether it is internal, its file name and import paths. */
export type GeneratedNodeModuleScope = {
    getImportPath: GetImportPathFunction;
    isInternalNode: IsInternalNodeFunction;
    nameApi: NameApi;
};

/**
 * Creates the function telling whether a node is listed in the `internalNodes` option,
 * matching identifiers by their camelCase form.
 *
 * @param internalNodes - The `internalNodes` option.
 */
export function getIsInternalNodeFactory(internalNodes: readonly string[]): IsInternalNodeFunction {
    const camelCaseInternalNodes = new Set(internalNodes.map(camelCase));
    return identifier => camelCaseInternalNodes.has(camelCase(identifier));
}

/**
 * The module a generated node is imported from: the symbolic module of the barrel of its
 * folder, e.g. `generatedAccounts`, or the path of its own file when it is internal, e.g.
 * `../accounts/counter`, since internal nodes are left out of barrels.
 *
 * @param kind - The kind of the node.
 * @param identifier - The identifier of the node.
 * @param scope - Tells whether the node is internal, names its file and renders import paths.
 * @return The module to import the node from.
 *
 * @example
 * ```ts
 * getGeneratedNodeModule('pda', 'secret', scope); // '../pdas/secret' when `secret` is internal
 * ```
 */
export function getGeneratedNodeModule(
    kind: GeneratedNodeKind,
    identifier: string,
    scope: GeneratedNodeModuleScope,
): string {
    const { folder, module } = GENERATED_FOLDERS[kind];
    if (!scope.isInternalNode(identifier)) return module;
    return scope.getImportPath(`../${folder}/${scope.nameApi.fileName(identifier)}`, 'file');
}
