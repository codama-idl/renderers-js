import { BaseFragment, createFragmentTemplate } from '@codama/fragments';
import { getTextNodeContent, isNode, TextNode } from '@codama/nodes';

import {
    addToImportMap,
    createImportMap,
    ImportMap,
    importMapToString,
    mergeImportMaps,
    parseImportInput,
    removeFromImportMap,
} from './importMap';
import type { RenderScope } from './options';

/**
 * A flag carried by a fragment to inform the pages including it, e.g. that an instruction
 * builder must declare its `resolverScope` variable.
 */
export type FragmentFeature = 'instruction:resolverScopeVariable';

/**
 * An immutable piece of generated code, along with the imports it requires and the features it uses.
 * Fragments compose through {@link fragment} templates and {@link mergeFragments}.
 */
export type Fragment = BaseFragment &
    Readonly<{
        features: ReadonlySet<FragmentFeature>;
        imports: ImportMap;
    }>;

function createFragment(content: string): Fragment {
    return Object.freeze({ content, features: new Set<FragmentFeature>(), imports: createImportMap() });
}

function isFragment(value: unknown): value is Fragment {
    return typeof value === 'object' && value !== null && 'content' in value;
}

/**
 * Creates a fragment from a template literal, merging the imports and features of the
 * fragments it interpolates.
 *
 * @example
 * ```ts
 * const encoder = use('getU8Encoder', 'solanaCodecsNumbers');
 * fragment`export const encoder = ${encoder}();`;
 * ```
 */
export function fragment(template: TemplateStringsArray, ...items: unknown[]): Fragment {
    return createFragmentTemplate(template, items, isFragment, mergeFragments);
}

/**
 * Merges fragments into one, combining their contents with the given function and gathering
 * their imports and features. Undefined fragments are ignored.
 *
 * @param fragments - The fragments to merge.
 * @param mergeContent - Combines the contents of the defined fragments.
 * @return The merged fragment.
 *
 * @example
 * ```ts
 * mergeFragments([fragmentA, fragmentB], contents => contents.join('\n\n'));
 * ```
 */
export function mergeFragments(
    fragments: (Fragment | undefined)[],
    mergeContent: (contents: string[]) => string,
): Fragment {
    const filteredFragments = fragments.filter((f): f is Fragment => f !== undefined);
    return Object.freeze({
        content: mergeContent(filteredFragments.map(fragment => fragment.content)),
        features: new Set(filteredFragments.flatMap(f => [...f.features])),
        imports: mergeImportMaps(filteredFragments.map(f => f.imports)),
    });
}

/**
 * Creates a fragment referencing an identifier imported from a module, which may be a
 * symbolic module resolved when rendering the page, e.g. `solanaAddresses`.
 *
 * @param importInput - The import, e.g. `getAddressEncoder`, `type Address` or `foo as bar`.
 * @param module - The module to import it from.
 * @return The fragment of the identifier as used in code.
 *
 * @example
 * ```ts
 * use('type Address', 'solanaAddresses'); // Address
 * ```
 */
export function use(importInput: string, module: string): Fragment {
    const importInfo = parseImportInput(importInput);
    return addFragmentImports(createFragment(importInfo.usedIdentifier), module, [importInput]);
}

/** Adds the imports of the given import maps to a fragment. */
export function mergeFragmentImports(fragment: Fragment, importMaps: ImportMap[]): Fragment {
    return Object.freeze({ ...fragment, imports: mergeImportMaps([fragment.imports, ...importMaps]) });
}

/** Adds imports from a module to a fragment, e.g. `['type Address']` from `solanaAddresses`. */
export function addFragmentImports(fragment: Fragment, module: string, importInputs: string[]): Fragment {
    return Object.freeze({ ...fragment, imports: addToImportMap(fragment.imports, module, importInputs) });
}

/** Removes imports from a module of a fragment, given the identifiers they are used as. */
export function removeFragmentImports(fragment: Fragment, module: string, usedIdentifiers: string[]): Fragment {
    return Object.freeze({ ...fragment, imports: removeFromImportMap(fragment.imports, module, usedIdentifiers) });
}

/** Adds features to a fragment, e.g. to request the declaration of a variable by its page. */
export function addFragmentFeatures(fragment: Fragment, features: FragmentFeature[]): Fragment {
    return Object.freeze({ ...fragment, features: new Set([...fragment.features, ...features]) });
}

/** Renders the re-export of every export of a module, e.g. `export * from './accounts';`. */
export function getExportAllFragment(module: string): Fragment {
    return fragment`export * from '${module}';`;
}

/**
 * Documentation as found on nodes or provided by the renderer: a single text,
 * either plain or as a `TextNode`, or a list of lines.
 */
export type DocsInput = TextNode | string | readonly string[] | undefined;

/**
 * Renders a JSDoc block from the given documentation, or nothing when it is blank.
 *
 * Items containing line breaks are split into separate lines, ignoring a single
 * trailing line break, so that a multi-line text renders like a list of lines.
 */
export function getDocblockFragment(docs: DocsInput, withLineJump = false): Fragment | undefined {
    const lineJump = withLineJump ? '\n' : '';
    const lines = getDocsLines(docs);
    if (lines.every(line => line.trim() === '')) return;
    if (lines.length === 1) return fragment`/** ${lines[0]} */${lineJump}`;
    const prefixedLines = lines.map(line => (line ? ` * ${line}` : ' *'));
    return fragment`/**\n${prefixedLines.join('\n')}\n */${lineJump}`;
}

/**
 * The lines of the given documentation, splitting items on line breaks. Comment
 * terminators are escaped, e.g. `src/**\/*.ts`, so that lines cannot end the docblock.
 */
function getDocsLines(docs: DocsInput): string[] {
    if (docs === undefined) return [];
    const items: readonly string[] = typeof docs === 'string' || isTextNode(docs) ? [getTextNodeContent(docs)] : docs;
    return items.flatMap(item =>
        item
            .replace(/\r?\n$/, '')
            .split(/\r?\n/)
            .map(line => line.replace(/\*\//g, '*\\/')),
    );
}

function isTextNode(docs: TextNode | readonly string[]): docs is TextNode {
    return !Array.isArray(docs) && isNode(docs as TextNode, 'textNode');
}

/**
 * Wraps the fragment of a generated file with the autogenerated header and its import
 * statements, resolving symbolic modules to the packages or paths they map to.
 *
 * @param page - The fragment of the page content.
 * @param scope - The render scope, to resolve import modules and paths.
 * @return The fragment of the whole file.
 */
export function getPageFragment(
    page: Fragment,
    scope: Pick<RenderScope, 'dependencyMap' | 'getImportPath' | 'kitImportStrategy'>,
): Fragment {
    const header = getDocblockFragment([
        'This code was AUTOGENERATED using the Codama library.',
        'Please DO NOT EDIT THIS FILE, instead use visitors',
        'to add features, then rerun Codama to update it.',
        '',
        '@see https://github.com/codama-idl/codama',
    ]);
    const imports =
        page.imports.size === 0
            ? undefined
            : fragment`${importMapToString(
                  page.imports,
                  scope.dependencyMap,
                  scope.kitImportStrategy,
                  scope.getImportPath,
              )}`;
    return mergeFragments([header, imports, page], cs => cs.join('\n\n'));
}

/**
 * Renders a string as a TypeScript string literal, escaping quotes, backslashes and line
 * breaks, so that values from the IDL, e.g. addresses or messages, cannot end the literal.
 *
 * @param value - The string to render.
 * @return The string literal.
 *
 * @example
 * ```ts
 * getStringLiteral("It's"); // "It's"
 * ```
 */
export function getStringLiteral(value: string): string {
    return JSON.stringify(value);
}
