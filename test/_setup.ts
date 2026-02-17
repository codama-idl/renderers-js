import { CamelCaseString } from '@codama/nodes';
import { getFromRenderMap, RenderMap } from '@codama/renderers-core';
import { LinkableDictionary } from '@codama/visitors-core';
import { Plugin } from 'prettier';
import * as estreePlugin from 'prettier/plugins/estree';
import * as typeScriptPlugin from 'prettier/plugins/typescript';
import { format } from 'prettier/standalone';
import { expect } from 'vitest';

import { getTypeManifestVisitor } from '../src';
import {
    DEFAULT_KIT_IMPORT_STRATEGY,
    DEFAULT_NAME_TRANSFORMERS,
    type Fragment,
    getImportFromFactory,
    getNameApi,
    importMapToString,
    KitImportStrategy,
    ParsedCustomDataOptions,
    type RenderScope,
} from '../src/utils';

const PRETTIER_OPTIONS: Parameters<typeof format>[1] = {
    arrowParens: 'always',
    parser: 'typescript',
    plugins: [estreePlugin as Plugin<unknown>, typeScriptPlugin],
    printWidth: 80,
    semi: true,
    singleQuote: true,
    tabWidth: 2,
    trailingComma: 'none',
    useTabs: false,
};

export function getDefaultScope(): RenderScope {
    const customAccountData: ParsedCustomDataOptions = new Map();
    const customInstructionData: ParsedCustomDataOptions = new Map();
    const getImportFrom = getImportFromFactory({}, customAccountData, customInstructionData);
    const linkables = new LinkableDictionary();
    const nameApi = getNameApi(DEFAULT_NAME_TRANSFORMERS);
    const nonScalarEnums: CamelCaseString[] = [];
    return {
        asyncResolvers: [],
        customAccountData,
        customInstructionData,
        dependencyMap: {},
        dependencyVersions: {},
        getImportFrom,
        kitImportStrategy: DEFAULT_KIT_IMPORT_STRATEGY,
        linkables,
        nameApi,
        nonScalarEnums,
        renderParentInstructions: false,
        typeManifestVisitor: getTypeManifestVisitor({
            customAccountData,
            customInstructionData,
            getImportFrom,
            linkables,
            nameApi,
            nonScalarEnums,
        }),
    };
}

export function renderMapContains(
    renderMap: RenderMap<Fragment>,
    key: string,
    expected: (RegExp | string)[] | RegExp | string,
) {
    expect(renderMap.has(key), `RenderMap is missing key "${key}".`).toBe(true);
    return codeContains(getFromRenderMap(renderMap, key).content, expected);
}

export function renderMapDoesNotContain(
    renderMap: RenderMap<Fragment>,
    key: string,
    expected: (RegExp | string)[] | RegExp | string,
) {
    expect(renderMap.has(key), `RenderMap is missing key "${key}".`).toBe(true);
    return codeDoesNotContain(getFromRenderMap(renderMap, key).content, expected);
}

export async function fragmentContains(actual: Fragment | undefined, expected: (RegExp | string)[] | RegExp | string) {
    expect(actual).toBeDefined();
    await codeContains(actual!.content, expected);
}

export async function fragmentDoesNotContain(
    actual: Fragment | undefined,
    expected: (RegExp | string)[] | RegExp | string,
) {
    expect(actual).toBeDefined();
    await codeDoesNotContain(actual!.content, expected);
}

export async function codeContains(actual: string, expected: (RegExp | string)[] | RegExp | string) {
    const expectedArray = Array.isArray(expected) ? expected : [expected];
    const normalizedActual = await normalizeCode(actual);
    expectedArray.forEach(expectedResult => {
        if (typeof expectedResult === 'string') {
            expect(normalizedActual).toMatch(codeStringAsRegex(expectedResult));
        } else {
            expect(normalizedActual).toMatch(expectedResult);
        }
    });
}

export async function codeDoesNotContain(actual: string, expected: (RegExp | string)[] | RegExp | string) {
    const expectedArray = Array.isArray(expected) ? expected : [expected];
    const normalizedActual = await normalizeCode(actual);
    expectedArray.forEach(expectedResult => {
        if (typeof expectedResult === 'string') {
            expect(normalizedActual).not.toMatch(codeStringAsRegex(expectedResult));
        } else {
            expect(normalizedActual).not.toMatch(expectedResult);
        }
    });
}

export function renderMapContainsImports(
    renderMap: RenderMap<Fragment>,
    key: string,
    expectedImports: Record<string, string[]>,
) {
    expect(renderMap.has(key), `RenderMap is missing key "${key}".`).toBe(true);
    return codeContainsImports(getFromRenderMap(renderMap, key).content, expectedImports);
}

export function renderMapDoesNotContainImports(
    renderMap: RenderMap<Fragment>,
    key: string,
    expectedImports: Record<string, string[]>,
) {
    expect(renderMap.has(key), `RenderMap is missing key "${key}".`).toBe(true);
    return codeDoesNotContainImports(getFromRenderMap(renderMap, key).content, expectedImports);
}

export function fragmentContainsImports(
    actual: Fragment | undefined,
    expectedImports: Record<string, string[]>,
    options?: { dependencyMap?: Record<string, string>; kitImportStrategy?: KitImportStrategy },
) {
    expect(actual).toBeDefined();
    const imports = importMapToString(actual!.imports, options?.dependencyMap, options?.kitImportStrategy);
    return codeContainsImports(imports, expectedImports);
}

export function fragmentDoesNotContainImports(
    actual: Fragment | undefined,
    expectedImports: Record<string, string[]>,
    options?: { dependencyMap?: Record<string, string>; kitImportStrategy?: KitImportStrategy },
) {
    expect(actual).toBeDefined();
    const imports = importMapToString(actual!.imports, options?.dependencyMap, options?.kitImportStrategy);
    return codeDoesNotContainImports(imports, expectedImports);
}

export async function codeContainsImports(actual: string, expectedImports: Record<string, string[]>) {
    const normalizedActual = await inlineCode(actual);
    const importPairs = Object.entries(expectedImports).flatMap(([key, value]) => {
        return value.map(v => [key, v] as const);
    });

    importPairs.forEach(([importFrom, importValue]) => {
        expect(normalizedActual).toMatch(new RegExp(`import{[^}]*\\b${importValue}\\b[^}]*}from'${importFrom}'`));
    });
}

export async function codeDoesNotContainImports(actual: string, expectedImports: Record<string, string[]>) {
    const normalizedActual = await inlineCode(actual);
    const importPairs = Object.entries(expectedImports).flatMap(([key, value]) => {
        return value.map(v => [key, v] as const);
    });

    importPairs.forEach(([importFrom, importValue]) => {
        expect(normalizedActual).not.toMatch(new RegExp(`import{[^}]*\\b${importValue}\\b[^}]*}from'${importFrom}'`));
    });
}

export function codeStringAsRegex(code: string) {
    const stringAsRegex = escapeRegex(code)
        // Transform spaces between words into required whitespace.
        .replace(/(\w)\s+(\w)/g, '$1\\s+$2')
        // Do it again for single-character words — e.g. "as[ ]a[ ]token".
        .replace(/(\w)\s+(\w)/g, '$1\\s+$2')
        // Transform other spaces into optional whitespace.
        .replace(/\s+/g, '\\s*');
    return new RegExp(stringAsRegex);
}

async function normalizeCode(code: string) {
    try {
        code = await format(code, PRETTIER_OPTIONS);
    } catch {
        // Ignore errors.
    }
    return code.trim();
}

async function inlineCode(code: string) {
    return (await normalizeCode(code)).replace(/\s+/g, ' ').replace(/\s*(\W)\s*/g, '$1');
}

function escapeRegex(stringAsRegex: string) {
    return stringAsRegex.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}
