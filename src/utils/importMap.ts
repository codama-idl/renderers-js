import {
    DEFAULT_KIT_IMPORT_STRATEGY,
    GetImportPathFunction,
    ImportExtension,
    ImportPathType,
    KitImportStrategy,
} from '.';

const DEFAULT_EXTERNAL_MODULE_MAP: Record<string, string> = {
    solanaAccounts: '@solana/kit',
    solanaAddresses: '@solana/kit',
    solanaCodecsCore: '@solana/kit',
    solanaCodecsDataStructures: '@solana/kit',
    solanaCodecsNumbers: '@solana/kit',
    solanaCodecsStrings: '@solana/kit',
    solanaErrors: '@solana/kit',
    solanaInstructionPlans: '@solana/kit',
    solanaInstructions: '@solana/kit',
    solanaOptions: '@solana/kit',
    solanaPluginCore: '@solana/kit',
    solanaPluginInterfaces: '@solana/kit',
    solanaProgramClientCore: '@solana/kit/program-client-core',
    solanaPrograms: '@solana/kit',
    solanaRpcApi: '@solana/kit',
    solanaRpcTypes: '@solana/kit',
    solanaSigners: '@solana/kit',
};

const DEFAULT_GRANULAR_EXTERNAL_MODULE_MAP: Record<string, string> = {
    solanaAccounts: '@solana/accounts',
    solanaAddresses: '@solana/addresses',
    solanaCodecsCore: '@solana/codecs',
    solanaCodecsDataStructures: '@solana/codecs',
    solanaCodecsNumbers: '@solana/codecs',
    solanaCodecsStrings: '@solana/codecs',
    solanaErrors: '@solana/errors',
    solanaInstructionPlans: '@solana/instruction-plans',
    solanaInstructions: '@solana/instructions',
    solanaOptions: '@solana/codecs',
    solanaPluginCore: '@solana/plugin-core',
    solanaPluginInterfaces: '@solana/plugin-interfaces',
    solanaProgramClientCore: '@solana/program-client-core',
    solanaPrograms: '@solana/programs',
    solanaRpcApi: '@solana/rpc-api',
    solanaRpcTypes: '@solana/rpc-types',
    solanaSigners: '@solana/signers',
};

const RECOGNIZED_EXTENSION_REGEX = /\.(?:[mc]?[jt]sx?|json)$/;

type ImportInput = string;
type Module = string;
type UsedIdentifier = string;
type ImportInfo = Readonly<{
    importedIdentifier: string;
    isType: boolean;
    usedIdentifier: UsedIdentifier;
}>;

export type ImportMap = ReadonlyMap<Module, ReadonlyMap<UsedIdentifier, ImportInfo>>;

export function createImportMap(): ImportMap {
    return Object.freeze(new Map());
}

export function parseImportInput(input: ImportInput): ImportInfo {
    const matches = input.match(/^(type )?([^ ]+)(?: as (.+))?$/);
    if (!matches) return Object.freeze({ importedIdentifier: input, isType: false, usedIdentifier: input });

    const [_, isType, name, alias] = matches;
    return Object.freeze({
        importedIdentifier: name,
        isType: !!isType,
        usedIdentifier: alias ?? name,
    });
}

export function addToImportMap(importMap: ImportMap, module: Module, imports: ImportInput[]): ImportMap {
    const parsedImports = imports.map(parseImportInput).map(i => [i.usedIdentifier, i] as const);
    return mergeImportMaps([importMap, new Map([[module, new Map(parsedImports)]])]);
}

export function removeFromImportMap(
    importMap: ImportMap,
    module: Module,
    usedIdentifiers: UsedIdentifier[],
): ImportMap {
    const newMap = new Map(importMap);
    const newModuleMap = new Map(newMap.get(module));
    usedIdentifiers.forEach(usedIdentifier => {
        newModuleMap.delete(usedIdentifier);
    });
    if (newModuleMap.size === 0) {
        newMap.delete(module);
    } else {
        newMap.set(module, newModuleMap);
    }
    return Object.freeze(newMap);
}

export function mergeImportMaps(importMaps: ImportMap[]): ImportMap {
    if (importMaps.length === 0) return createImportMap();
    if (importMaps.length === 1) return importMaps[0];
    const mergedMap = new Map(importMaps[0]);
    for (const map of importMaps.slice(1)) {
        for (const [module, imports] of map) {
            const mergedModuleMap = (mergedMap.get(module) ?? new Map()) as Map<UsedIdentifier, ImportInfo>;
            for (const [usedIdentifier, importInfo] of imports) {
                const existingImportInfo = mergedModuleMap.get(usedIdentifier);
                // If two identical imports exist such that
                // one is a type import and the other is not,
                // then we must only keep the non-type import.
                const shouldOverwriteTypeOnly =
                    existingImportInfo &&
                    existingImportInfo.importedIdentifier === importInfo.importedIdentifier &&
                    existingImportInfo.isType &&
                    !importInfo.isType;
                if (!existingImportInfo || shouldOverwriteTypeOnly) {
                    mergedModuleMap.set(usedIdentifier, importInfo);
                }
            }
            mergedMap.set(module, mergedModuleMap);
        }
    }
    return Object.freeze(mergedMap);
}

export function importMapToString(
    importMap: ImportMap,
    dependencyMap: Record<string, string> = {},
    kitImportStrategy: KitImportStrategy = DEFAULT_KIT_IMPORT_STRATEGY,
    getImportPath: GetImportPathFunction = getImportPathFactory(),
): string {
    const resolvedMap = resolveImportMapModules(importMap, dependencyMap, kitImportStrategy, getImportPath);

    return [...resolvedMap.entries()]
        .sort(([a], [b]) => {
            const relative = Number(a.startsWith('.')) - Number(b.startsWith('.'));
            // Relative imports go last.
            if (relative !== 0) return relative;
            // Otherwise, sort alphabetically.
            return a.localeCompare(b);
        })
        .map(([module, imports]) => {
            const importInfos = [...imports.values()];
            // When every import of a module is type-only, we can use a single
            // `import type` statement. This ensures the statement is fully erased
            // from the emitted JavaScript under `verbatimModuleSyntax`, instead of
            // leaving an empty `import {} from '...'` side-effect statement behind.
            const isTypeOnlyModule = importInfos.length > 0 && importInfos.every(({ isType }) => isType);
            const innerImports = importInfos
                .map(importInfo => importInfoToString(importInfo, isTypeOnlyModule))
                .sort((a, b) => a.localeCompare(b))
                .join(', ');
            return `import ${isTypeOnlyModule ? 'type ' : ''}{ ${innerImports} } from '${module}';`;
        })
        .join('\n');
}

export function getExternalDependencies(
    importMap: ImportMap,
    dependencyMap: Record<string, string>,
    kitImportStrategy: KitImportStrategy,
): Set<string> {
    const resolvedImports = resolveImportMapModules(importMap, dependencyMap, kitImportStrategy);
    return new Set(
        [...resolvedImports.keys()]
            .filter(module => !module.startsWith('.'))
            .map(module => {
                // For subpath imports, we want to get the root package name to check against dependencies.
                const subPathExportIndex = module.startsWith('@') ? 2 : 1;
                return module.split('/').slice(0, subPathExportIndex).join('/');
            }),
    );
}

function resolveImportMapModules(
    importMap: ImportMap,
    dependencyMap: Record<string, string>,
    kitImportStrategy: KitImportStrategy,
    getImportPath: GetImportPathFunction = getImportPathFactory(),
): ImportMap {
    const defaultExternalModuleMap =
        kitImportStrategy === 'granular' ? DEFAULT_GRANULAR_EXTERNAL_MODULE_MAP : DEFAULT_EXTERNAL_MODULE_MAP;
    if (kitImportStrategy === 'preferRoot') {
        defaultExternalModuleMap['solanaProgramClientCore'] = '@solana/program-client-core';
    }

    const dependencyMapWithDefaults = {
        ...defaultExternalModuleMap,
        ...getDefaultInternalModuleMap(getImportPath),
        ...dependencyMap,
    };

    return mergeImportMaps(
        [...importMap.entries()].map(([module, imports]) => {
            const resolvedModule = dependencyMapWithDefaults[module] ?? module;
            return new Map([[resolvedModule, imports]]);
        }),
    );
}

function getDefaultInternalModuleMap(getImportPath: GetImportPathFunction): Record<string, string> {
    return {
        errors: getImportPath('../errors', 'directory'),
        generated: getImportPath('..', 'directory'),
        generatedAccounts: getImportPath('../accounts', 'directory'),
        generatedErrors: getImportPath('../errors', 'directory'),
        generatedInstructions: getImportPath('../instructions', 'directory'),
        generatedPdas: getImportPath('../pdas', 'directory'),
        generatedPrograms: getImportPath('../programs', 'directory'),
        generatedTypes: getImportPath('../types', 'directory'),
        hooked: getImportPath('../../hooked', 'directory'),
        shared: getImportPath('../shared', 'directory'),
        types: getImportPath('../types', 'directory'),
    };
}

/**
 * Creates a function that prepares renderer-owned import paths for generated output.
 *
 * @param importExtension - The explicit extension to append, if any.
 * @return A function that resolves generated file and directory import paths.
 */
export function getImportPathFactory(importExtension?: ImportExtension): GetImportPathFunction {
    return (path: string, type: ImportPathType): string => {
        if (!importExtension || !path.startsWith('.') || RECOGNIZED_EXTENSION_REGEX.test(path)) return path;
        return type === 'directory' ? `${path}/index.${importExtension}` : `${path}.${importExtension}`;
    };
}

function importInfoToString(
    { importedIdentifier, isType, usedIdentifier }: ImportInfo,
    omitTypeKeyword: boolean = false,
): string {
    const alias = importedIdentifier !== usedIdentifier ? ` as ${usedIdentifier}` : '';
    return `${isType && !omitTypeKeyword ? 'type ' : ''}${importedIdentifier}${alias}`;
}
