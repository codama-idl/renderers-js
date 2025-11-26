import { CODAMA_ERROR__RENDERERS__MISSING_DEPENDENCY_VERSIONS, CodamaError } from '@codama/errors';
import { createRenderMap } from '@codama/renderers-core';
import { describe, expect, test } from 'vitest';

import {
    createNewPackageJson,
    DEFAULT_DEPENDENCY_VERSIONS,
    getUsedDependencyVersions,
    shouldUpdateRange,
    updateExistingPackageJson,
    use,
} from '../../src/utils';

describe('getUsedDependencyVersions', () => {
    test('it returns the version of all used dependencies', () => {
        const renderMap = createRenderMap({
            'mint.ts': use('Foo', 'foo-package'),
            'token.ts': use('Bar', 'bar-package'),
        });
        const dependencyVersions = {
            'bar-package': '^1.0.0',
            'foo-package': '^2.0.0',
            'unused-package': '^3.0.0',
        };

        expect(getUsedDependencyVersions(renderMap, {}, dependencyVersions, false)).toEqual({
            'bar-package': '^1.0.0',
            'foo-package': '^2.0.0',
        });
    });

    test('it automatically includes Kit dependencies', () => {
        const renderMap = createRenderMap({
            'mint.ts': use('Address', 'solanaAddresses'),
            'token.ts': use('getUtf8Codec', 'solanaCodecsStrings'),
        });

        expect(getUsedDependencyVersions(renderMap, {}, {}, false)).toEqual({
            '@solana/kit': DEFAULT_DEPENDENCY_VERSIONS['@solana/kit'],
        });
    });

    test('it automatically includes Kit granular dependencies', () => {
        const renderMap = createRenderMap({
            'mint.ts': use('Address', 'solanaAddresses'),
            'token.ts': use('getUtf8Codec', 'solanaCodecsStrings'),
        });

        expect(getUsedDependencyVersions(renderMap, {}, {}, true)).toEqual({
            '@solana/addresses': DEFAULT_DEPENDENCY_VERSIONS['@solana/addresses'],
            '@solana/codecs': DEFAULT_DEPENDENCY_VERSIONS['@solana/codecs'],
        });
    });

    test('it throws if used dependency versions are not provided', () => {
        const renderMap = createRenderMap({ 'mint.ts': use('Foo', 'foo-package') });

        expect(() => getUsedDependencyVersions(renderMap, {}, {}, false)).toThrow(
            new CodamaError(CODAMA_ERROR__RENDERERS__MISSING_DEPENDENCY_VERSIONS, {
                dependencies: ['foo-package'],
                message: 'Please add these dependencies to the `dependencyVersions` option.',
            }),
        );
    });
});

describe('createNewPackageJson', () => {
    test('it returns a new package.json object with the given dependencies', () => {
        const packageJson = createNewPackageJson({
            'bar-package': '^1.0.0',
            'foo-package': '^2.0.0',
        });
        expect(packageJson.dependencies).toEqual({
            'bar-package': '^1.0.0',
            'foo-package': '^2.0.0',
        });
    });

    test('it saves @solana/kit as a peer dependency by default', () => {
        const packageJson = createNewPackageJson({
            '@solana/kit': '^5.0.0',
            'foo-package': '^1.0.0',
        });
        expect(packageJson.peerDependencies).toEqual({ '@solana/kit': '^5.0.0' });
        expect(packageJson.dependencies).toEqual({ 'foo-package': '^1.0.0' });
    });
});

describe('updateExistingPackageJson', () => {
    test('it updates a package.json with the given dependencies in all dependency groups', () => {
        const packageJson = updateExistingPackageJson(
            {
                dependencies: {
                    'package-a': '^1.0.0',
                    'package-d': '^1.0.0',
                },
                devDependencies: {
                    'package-b': '^1.0.0',
                    'package-d': '^1.0.0',
                },
                peerDependencies: {
                    'package-c': '^1.0.0',
                    'package-d': '^1.0.0',
                },
            },
            {
                'package-a': '^2.0.0',
                'package-b': '^2.0.0',
                'package-c': '^2.0.0',
                'package-d': '^2.0.0',
            },
        );
        expect(packageJson).toEqual({
            dependencies: {
                'package-a': '^2.0.0',
                'package-d': '^2.0.0',
            },
            devDependencies: {
                'package-b': '^2.0.0',
                'package-d': '^2.0.0',
            },
            peerDependencies: {
                'package-c': '^2.0.0',
                'package-d': '^2.0.0',
            },
        });
    });

    test('it does not update non-dependency attributes', () => {
        const packageJson = updateExistingPackageJson(
            {
                dependencies: { 'package-a': '^1.0.0' },
                name: 'my-package',
                scripts: { build: 'tsc -p .', test: 'vitest' },
                version: '1.2.3',
            },
            { 'package-a': '^2.0.0' },
        );
        expect(packageJson).toEqual({
            dependencies: { 'package-a': '^2.0.0' },
            name: 'my-package',
            scripts: { build: 'tsc -p .', test: 'vitest' },
            version: '1.2.3',
        });
    });

    test('it adds new dependencies to the dependencies group by default', () => {
        const packageJson = updateExistingPackageJson({}, { 'package-new': '^1.0.0' });
        expect(packageJson).toEqual({ dependencies: { 'package-new': '^1.0.0' } });
    });

    test('it adds the @solana/kit dependency to the peer dependency group by default', () => {
        const packageJson = updateExistingPackageJson({}, { '@solana/kit': '^1.0.0' });
        expect(packageJson).toEqual({ peerDependencies: { '@solana/kit': '^1.0.0' } });
    });

    test('it does not update nor add dependencies whose range is newer or stricter', () => {
        const packageJson = updateExistingPackageJson(
            {
                dependencies: { 'package-a': '^2.0.0' },
                devDependencies: { 'package-b': '^2.5.0' },
                peerDependencies: { 'package-c': '^2.0.0' },
            },
            {
                'package-a': '^1.0.0',
                'package-b': '^2.0.0',
                'package-c': '>=1 <5',
            },
        );
        expect(packageJson).toEqual({
            dependencies: { 'package-a': '^2.0.0' },
            devDependencies: { 'package-b': '^2.5.0' },
            peerDependencies: { 'package-c': '^2.0.0' },
        });
    });
});

describe('shouldUpdateRange', () => {
    test('it returns true if the required version is stricter', () => {
        expect(shouldUpdateRange('module', '^1.0.0', '^1.1.0')).toBe(true);
        expect(shouldUpdateRange('module', '^0.1', '^0.1.5')).toBe(true);
        expect(shouldUpdateRange('module', '>=1 <5', '^3.0')).toBe(true);
        expect(shouldUpdateRange('module', '>=1 <5', '>=2 <4')).toBe(true);
    });

    test('it returns true if the required version is newer', () => {
        expect(shouldUpdateRange('module', '^1.0', '^2.0')).toBe(true);
        expect(shouldUpdateRange('module', '^1.0.0', '^2.0.0')).toBe(true);
        expect(shouldUpdateRange('module', '^0.1', '^42.99.99')).toBe(true);
        expect(shouldUpdateRange('module', '>=1 <5', '>=2 <6')).toBe(true);
    });

    test('it returns false if the required version is looser', () => {
        expect(shouldUpdateRange('module', '^1.1.0', '^1.0.0')).toBe(false);
        expect(shouldUpdateRange('module', '^0.1.5', '^0.1')).toBe(false);
        expect(shouldUpdateRange('module', '^3.0', '>=1 <5')).toBe(false);
        expect(shouldUpdateRange('module', '>=2 <4', '>=1 <5')).toBe(false);
    });

    test('it returns false if the required version is older', () => {
        expect(shouldUpdateRange('module', '^2.0', '^1.0')).toBe(false);
        expect(shouldUpdateRange('module', '^2.0.0', '^1.0.0')).toBe(false);
        expect(shouldUpdateRange('module', '^42.99.99', '^0.1')).toBe(false);
        expect(shouldUpdateRange('module', '>=2 <6', '>=1 <5')).toBe(false);
    });

    test('it returns false if either range cannot be parsed', () => {
        expect(shouldUpdateRange('module', 'invalid', '^1.0.0')).toBe(false);
        expect(shouldUpdateRange('module', '^1.0.0', 'invalid')).toBe(false);
    });
});
