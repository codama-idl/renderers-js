import { CODAMA_ERROR__RENDERERS__MISSING_DEPENDENCY_VERSIONS, CodamaError, logWarn } from '@codama/errors';
import { fileExists, joinPath, readJson, RenderMap, writeFile } from '@codama/fragments';
import { lt as ltVersion, minVersion, subset, validRange } from 'semver';

import type { CodeFormatter } from './formatCode';
import { Fragment, mergeFragments } from './fragment';
import { getExternalDependencies } from './importMap';
import { DEFAULT_KIT_IMPORT_STRATEGY, KitImportStrategy, RenderOptions } from './options';

type DependencyVersions = Record<string, string>;

type PackageJson = {
    author?: string;
    dependencies?: DependencyVersions;
    description?: string;
    devDependencies?: DependencyVersions;
    files?: string[];
    keywords?: string[];
    main?: string;
    name?: string;
    peerDependencies?: DependencyVersions;
    scripts?: Record<string, string>;
    version?: string;
};

/**
 * The default version range of each package generated code may import, which the
 * `dependencyVersions` option overrides.
 */
export const DEFAULT_DEPENDENCY_VERSIONS: DependencyVersions = {
    '@solana/accounts': '^8.5.0',
    '@solana/addresses': '^8.5.0',
    '@solana/codecs': '^8.5.0',
    '@solana/errors': '^8.5.0',
    '@solana/instruction-plans': '^8.5.0',
    '@solana/instructions': '^8.5.0',
    '@solana/kit': '^8.5.0',
    '@solana/plugin-core': '^8.5.0',
    '@solana/plugin-interfaces': '^8.5.0',
    '@solana/program-client-core': '^8.5.0',
    '@solana/programs': '^8.5.0',
    '@solana/rpc-api': '^8.5.0',
    '@solana/rpc-types': '^8.5.0',
    '@solana/signers': '^8.5.0',
};

/**
 * Creates the `package.json` of the package folder, or updates the dependencies of the
 * existing one, from the packages the generated code imports. When the `syncPackageJson`
 * option is `false`, outdated or missing dependencies are only reported.
 *
 * @param renderMap - The generated files.
 * @param formatCode - Formats the `package.json`.
 * @param packageFolder - The folder of the package.
 * @param options - The dependency and sync options.
 */
export async function syncPackageJson(
    renderMap: RenderMap<Fragment>,
    formatCode: CodeFormatter,
    packageFolder: string,
    options: Pick<RenderOptions, 'dependencyMap' | 'dependencyVersions' | 'kitImportStrategy' | 'syncPackageJson'>,
): Promise<void> {
    const shouldSyncPackageJson = options.syncPackageJson ?? true;
    const packageJsonPath = joinPath(packageFolder, 'package.json');
    const usedDependencies = getUsedDependencyVersions(
        renderMap,
        options.dependencyMap ?? {},
        options.dependencyVersions ?? {},
        options.kitImportStrategy ?? DEFAULT_KIT_IMPORT_STRATEGY,
    );

    // If we should not sync the package.json, exit early.
    if (!shouldSyncPackageJson) {
        // However, if the package.json exists, we can still check it and
        // warn the user about out-of-date or missing dependencies.
        if (fileExists(packageJsonPath)) {
            checkExistingPackageJson(readJson(packageJsonPath), usedDependencies);
        }
        return;
    }

    if (fileExists(packageJsonPath)) {
        const packageJson = updateExistingPackageJson(readJson(packageJsonPath), usedDependencies);
        await writePackageJson(packageJson, packageJsonPath, formatCode);
    } else {
        const packageJson = createNewPackageJson(usedDependencies);
        await writePackageJson(packageJson, packageJsonPath, formatCode);
    }
}

/**
 * Creates the `package.json` of a new package depending on the given packages, with
 * `@solana/kit` as a peer dependency.
 *
 * @param dependencyVersions - The version range of each package the generated code depends on.
 * @return The `package.json` content.
 */
export function createNewPackageJson(dependencyVersions: DependencyVersions): PackageJson {
    return updateExistingPackageJson(
        // oxlint-disable-next-line sort-keys -- Follows the conventional package.json field order instead.
        {
            name: 'js-client',
            version: '1.0.0',
            description: '',
            main: 'src/index.ts',
            files: ['./dist/src', './dist/types', './src/'],
            scripts: { test: 'echo "Error: no test specified" && exit 1' },
            keywords: [],
            author: '',
        },
        dependencyVersions,
    );
}

/**
 * Updates the dependencies of an existing `package.json`, adding missing packages and
 * raising ranges that allow older versions than the generated code requires.
 *
 * @param packageJson - The existing `package.json` content.
 * @param dependencyVersions - The version range of each package the generated code depends on.
 * @return The updated `package.json` content.
 */
export function updateExistingPackageJson(
    packageJson: PackageJson,
    dependencyVersions: DependencyVersions,
): PackageJson {
    const updatedDependencies = { ...packageJson.dependencies };
    const updatedPeerDependencies = { ...packageJson.peerDependencies };
    const updatedDevDependencies = { ...packageJson.devDependencies };

    for (const [dependency, requiredRange] of Object.entries(dependencyVersions)) {
        let found: boolean = false;
        if (updatedDependencies[dependency]) {
            updateDependency(updatedDependencies, dependency, requiredRange);
            found = true;
        }
        if (updatedPeerDependencies[dependency]) {
            updateDependency(updatedPeerDependencies, dependency, requiredRange);
            found = true;
        }
        if (updatedDevDependencies[dependency]) {
            updateDependency(updatedDevDependencies, dependency, requiredRange);
            found = true;
        }
        if (!found) {
            const dependencyGroupToAdd = dependency === '@solana/kit' ? updatedPeerDependencies : updatedDependencies;
            dependencyGroupToAdd[dependency] = requiredRange;
        }
    }

    return {
        ...packageJson,
        ...(Object.entries(updatedPeerDependencies).length > 0 ? { peerDependencies: updatedPeerDependencies } : {}),
        ...(Object.entries(updatedDependencies).length > 0 ? { dependencies: updatedDependencies } : {}),
        ...(Object.entries(updatedDevDependencies).length > 0 ? { devDependencies: updatedDevDependencies } : {}),
    };
}

function checkExistingPackageJson(packageJson: PackageJson, dependencyVersions: DependencyVersions): void {
    const missingDependencies: string[] = [];
    const dependenciesToUpdate: string[] = [];
    const existingDependencies = {
        ...packageJson.devDependencies,
        ...packageJson.peerDependencies,
        ...packageJson.dependencies,
    };

    for (const [dependency, requiredRange] of Object.entries(dependencyVersions)) {
        if (!existingDependencies[dependency]) {
            missingDependencies.push(dependency);
        } else if (shouldUpdateRange(dependency, existingDependencies[dependency], requiredRange)) {
            dependenciesToUpdate.push(dependency);
        }
    }

    if (missingDependencies.length === 0 && dependenciesToUpdate.length === 0) return;
    const missingList = missingDependencies.map(d => `- ${d} missing: ${dependencyVersions[d]}\n`).join('');
    const outdatedList = dependenciesToUpdate
        .map(d => `- ${d} outdated: ${existingDependencies[d]} -> ${dependencyVersions[d]}\n`)
        .join('');
    logWarn(
        `The following dependencies in your \`package.json\` are out-of-date or missing:\n` +
            `${missingList}${outdatedList}`,
    );
}

/**
 * The version range of each package the generated code imports.
 *
 * @param renderMap - The generated files.
 * @param dependencyMap - Overrides of the modules symbolic modules resolve to.
 * @param dependencyVersions - Overrides of the default version ranges.
 * @param kitImportStrategy - Whether to import Kit symbols from granular packages or `@solana/kit`.
 * @return The version range of each imported package.
 * @throws `CODAMA_ERROR__RENDERERS__MISSING_DEPENDENCY_VERSIONS` when an imported package has no known range.
 */
export function getUsedDependencyVersions(
    renderMap: RenderMap<Fragment>,
    dependencyMap: Record<string, string>,
    dependencyVersions: Record<string, string>,
    kitImportStrategy: KitImportStrategy,
): DependencyVersions {
    const dependencyVersionsWithDefaults = {
        ...DEFAULT_DEPENDENCY_VERSIONS,
        ...dependencyVersions,
    };

    const fragment = mergeFragments([...renderMap.values()], () => '');
    const usedDependencies = getExternalDependencies(fragment.imports, dependencyMap, kitImportStrategy);

    const [usedDependencyVersion, missingDependencies] = [...usedDependencies].reduce(
        ([acc, missingDependencies], dependency) => {
            const version = dependencyVersionsWithDefaults[dependency];
            if (version) {
                acc[dependency] = version;
            } else {
                missingDependencies.add(dependency);
            }
            return [acc, missingDependencies];
        },
        [{} as DependencyVersions, new Set<string>()],
    );

    if (missingDependencies.size > 0) {
        throw new CodamaError(CODAMA_ERROR__RENDERERS__MISSING_DEPENDENCY_VERSIONS, {
            dependencies: [...missingDependencies],
            message: 'Please add these dependencies to the `dependencyVersions` option.',
        });
    }

    return usedDependencyVersion;
}

/**
 * Whether the version range of a dependency should be replaced by the range the generated
 * code requires, i.e. when the current range allows versions older than the required ones.
 *
 * Ranges that are not semver ranges, such as `workspace:*`, `latest` or `file:` paths, are
 * kept as they are, since they are deliberately chosen by the package author.
 *
 * @param dependency - The name of the dependency, used in warnings.
 * @param currentRange - The range of the dependency in the existing `package.json`.
 * @param requiredRange - The range the generated code requires.
 * @return Whether the current range should be updated.
 */
export function shouldUpdateRange(dependency: string, currentRange: string, requiredRange: string): boolean {
    if (!validRange(currentRange)) return false;
    if (!validRange(requiredRange)) {
        logWarn(`Could not parse the required range [${requiredRange}] of dependency "${dependency}".`);
        return false;
    }

    // A current range within the required one needs no update.
    if (subset(currentRange, requiredRange)) return false;

    // Otherwise, update when the current range allows older versions than the required one.
    const minRequiredVersion = minVersion(requiredRange);
    const minCurrentVersion = minVersion(currentRange);
    if (!minCurrentVersion || !minRequiredVersion) return false;
    return ltVersion(minCurrentVersion, minRequiredVersion);
}

function updateDependency(dependencyGroup: Record<string, string>, dependency: string, requiredRange: string) {
    const currentRange = dependencyGroup[dependency];
    if (!shouldUpdateRange(dependency, currentRange, requiredRange)) return;
    dependencyGroup[dependency] = requiredRange;
}

async function writePackageJson(
    packageJson: PackageJson,
    packageJsonPath: string,
    formatCode: CodeFormatter,
): Promise<void> {
    const packageJsonContent = JSON.stringify(packageJson, null, 2) + '\n';
    const formattedContent = await formatCode(packageJsonContent, packageJsonPath);
    writeFile(packageJsonPath, formattedContent);
}
