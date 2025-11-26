import { CODAMA_ERROR__RENDERERS__MISSING_DEPENDENCY_VERSIONS, CodamaError, logWarn } from '@codama/errors';
import { fileExists, joinPath, readJson, RenderMap, writeFile } from '@codama/renderers-core';
import { lt as ltVersion, minVersion, subset } from 'semver';

import { RenderOptions } from '.';
import { Fragment, mergeFragments } from './fragment';
import { getExternalDependencies } from './importMap';

type DependencyVersions = Record<string, string>;

type PackageJson = {
    author?: string;
    dependencies?: DependencyVersions;
    description?: string;
    devDependencies?: DependencyVersions;
    keywords?: string[];
    main?: string;
    name?: string;
    peerDependencies?: DependencyVersions;
    scripts?: Record<string, string>;
    version?: string;
};

export const DEFAULT_DEPENDENCY_VERSIONS: DependencyVersions = {
    '@solana/accounts': '^5.0.0',
    '@solana/addresses': '^5.0.0',
    '@solana/codecs': '^5.0.0',
    '@solana/errors': '^5.0.0',
    '@solana/instructions': '^5.0.0',
    '@solana/kit': '^5.0.0',
    '@solana/programs': '^5.0.0',
    '@solana/rpc-types': '^5.0.0',
    '@solana/signers': '^5.0.0',
};

export function syncPackageJson(
    renderMap: RenderMap<Fragment>,
    options: Pick<
        RenderOptions,
        'dependencyMap' | 'dependencyVersions' | 'packageFolder' | 'syncPackageJson' | 'useGranularImports'
    >,
): void {
    const shouldSyncPackageJson = options.syncPackageJson ?? false;
    const packageFolder = options.packageFolder;

    // Without a `packageFolder`, we cannot sync the package.json.
    if (!packageFolder) {
        // If we should sync but have no folder, warn the user.
        if (shouldSyncPackageJson) {
            logWarn("Cannot sync package.json. Please provide the 'packageFolder' option.");
        }
        return;
    }

    const packageJsonPath = joinPath(packageFolder, 'package.json');
    const usedDependencies = getUsedDependencyVersions(
        renderMap,
        options.dependencyMap ?? {},
        options.dependencyVersions ?? {},
        options.useGranularImports ?? false,
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
        writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
    } else {
        const packageJson = createNewPackageJson(usedDependencies);
        writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
    }
}

export function createNewPackageJson(dependencyVersions: DependencyVersions): PackageJson {
    return updateExistingPackageJson(
        {
            name: 'js-client',
            version: '1.0.0',
            // eslint-disable-next-line sort-keys-fix/sort-keys-fix
            description: '',
            main: 'src/index.ts',
            scripts: { test: 'echo "Error: no test specified" && exit 1' },
            // eslint-disable-next-line sort-keys-fix/sort-keys-fix
            keywords: [],
            // eslint-disable-next-line sort-keys-fix/sort-keys-fix
            author: '',
        },
        dependencyVersions,
    );
}

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

export function checkExistingPackageJson(packageJson: PackageJson, dependencyVersions: DependencyVersions): void {
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

export function getUsedDependencyVersions(
    renderMap: RenderMap<Fragment>,
    dependencyMap: Record<string, string>,
    dependencyVersions: Record<string, string>,
    useGranularImports: boolean,
): DependencyVersions {
    const dependencyVersionsWithDefaults = {
        ...DEFAULT_DEPENDENCY_VERSIONS,
        ...dependencyVersions,
    };

    const fragment = mergeFragments([...renderMap.values()], () => '');
    const usedDependencies = getExternalDependencies(fragment.imports, dependencyMap, useGranularImports);

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

export function shouldUpdateRange(dependency: string, currentRange: string, requiredRange: string) {
    try {
        // Check if currentRange is a subset of requiredRange
        // If yes, required is looser or equal, no update needed
        if (subset(currentRange, requiredRange)) {
            return false;
        }

        // Get the minimum versions from both ranges.
        const minRequiredVersion = minVersion(requiredRange);
        const minCurrentVersion = minVersion(currentRange);
        if (!minCurrentVersion || !minRequiredVersion) {
            throw new Error('Could not determine minimum versions.');
        }

        // Update if the minimum required version is greater than the current minimum version.
        if (ltVersion(minCurrentVersion, minRequiredVersion)) {
            return true;
        }

        // Otherwise, do not update.
        return false;
    } catch (error) {
        console.warn(
            `Could not parse the following ranges for dependency "${dependency}":` +
                ` [${currentRange}] and/or [${requiredRange}].` +
                ` Caused by: ${(error as Error).message}`,
        );
        return false;
    }
}

function updateDependency(dependencyGroup: Record<string, string>, dependency: string, requiredRange: string) {
    const currentRange = dependencyGroup[dependency];
    if (!shouldUpdateRange(dependency, currentRange, requiredRange)) return;
    dependencyGroup[dependency] = requiredRange;
}
