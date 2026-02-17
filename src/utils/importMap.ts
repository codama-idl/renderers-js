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

const DEFAULT_INTERNAL_MODULE_MAP: Record<string, string> = {
    errors: '../errors',
    generated: '..',
    generatedAccounts: '../accounts',
    generatedErrors: '../errors',
    generatedInstructions: '../instructions',
    generatedPdas: '../pdas',
    generatedPrograms: '../programs',
    generatedTypes: '../types',
    hooked: '../../hooked',
    shared: '../shared',
    types: '../types',
};

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
    useGranularImports = false,
): string {
    const resolvedMap = resolveImportMapModules(importMap, dependencyMap, useGranularImports);

    return [...resolvedMap.entries()]
        .sort(([a], [b]) => {
            const relative = Number(a.startsWith('.')) - Number(b.startsWith('.'));
            // Relative imports go last.
            if (relative !== 0) return relative;
            // Otherwise, sort alphabetically.
            return a.localeCompare(b);
        })
        .map(([module, imports]) => {
            const innerImports = [...imports.values()]
                .map(importInfoToString)
                .sort((a, b) => a.localeCompare(b))
                .join(', ');
            return `import { ${innerImports} } from '${module}';`;
        })
        .join('\n');
}

export function getExternalDependencies(
    importMap: ImportMap,
    dependencyMap: Record<string, string>,
    useGranularImports: boolean,
): Set<string> {
    const resolvedImports = resolveImportMapModules(importMap, dependencyMap, useGranularImports);
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
    useGranularImports: boolean,
): ImportMap {
    const dependencyMapWithDefaults = {
        ...(useGranularImports ? DEFAULT_GRANULAR_EXTERNAL_MODULE_MAP : DEFAULT_EXTERNAL_MODULE_MAP),
        ...DEFAULT_INTERNAL_MODULE_MAP,
        ...dependencyMap,
    };

    return mergeImportMaps(
        [...importMap.entries()].map(([module, imports]) => {
            const resolvedModule = dependencyMapWithDefaults[module] ?? module;
            return new Map([[resolvedModule, imports]]);
        }),
    );
}

function importInfoToString({ importedIdentifier, isType, usedIdentifier }: ImportInfo): string {
    const alias = importedIdentifier !== usedIdentifier ? ` as ${usedIdentifier}` : '';
    return `${isType ? 'type ' : ''}${importedIdentifier}${alias}`;
}
