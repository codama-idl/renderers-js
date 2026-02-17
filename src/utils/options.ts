import type { CamelCaseString } from '@codama/nodes';
import type { LinkableDictionary } from '@codama/visitors-core';

import type { TypeManifestVisitor } from '../visitors';
import type { CustomDataOptions, ParsedCustomDataOptions } from './customData';
import { PrettierOptions } from './formatCode';
import type { GetImportFromFunction, LinkOverrides } from './linkOverrides';
import type { NameApi, NameTransformers } from './nameTransformers';

export type RenderOptions = GetRenderMapOptions & {
    deleteFolderBeforeRendering?: boolean;
    formatCode?: boolean;
    packageFolder?: string;
    prettierOptions?: PrettierOptions;
    syncPackageJson?: boolean;
};

export type GetRenderMapOptions = {
    asyncResolvers?: string[];
    customAccountData?: CustomDataOptions[];
    customInstructionData?: CustomDataOptions[];
    dependencyMap?: Record<string, string>;
    dependencyVersions?: Record<string, string>;
    internalNodes?: string[];
    kitImportStrategy?: KitImportStrategy;
    linkOverrides?: LinkOverrides;
    nameTransformers?: Partial<NameTransformers>;
    nonScalarEnums?: string[];
    renderParentInstructions?: boolean;
};

export type RenderScope = {
    asyncResolvers: CamelCaseString[];
    customAccountData: ParsedCustomDataOptions;
    customInstructionData: ParsedCustomDataOptions;
    dependencyMap: Record<string, string>;
    dependencyVersions: Record<string, string>;
    getImportFrom: GetImportFromFunction;
    kitImportStrategy: KitImportStrategy;
    linkables: LinkableDictionary;
    nameApi: NameApi;
    nonScalarEnums: CamelCaseString[];
    renderParentInstructions: boolean;
    typeManifestVisitor: TypeManifestVisitor;
};

/**
 * Defines how generated code should import utilities that exist both as standalone
 * packages (granular imports) and via the root `@solana/kit` package.
 *
 * Variants:
 * - `'granular'`:
 *   Always import from the most specific standalone packages when possible
 *   (e.g. `@solana/addresses`, `@solana/codecs-strings`) and never from `@solana/kit`
 *   (except for symbols that are only exported from `@solana/kit`).
 *
 * - `'preferRoot'` (default):
 *   Prefer importing from `@solana/kit` when a symbol is exported from its root
 *   entrypoint. If it is not available from the root entrypoint, fall back to
 *   granular packages.
 *
 * - `'rootOnly'`:
 *   Only import from the `@solana/kit` package. When a symbol is not exported from
 *   the root entrypoint, the generator may use `@solana/kit` subpath exports
 *   (e.g. `@solana/kit/program-client-core`).
 *   This is useful when `@solana/kit` is installed as a `peerDependency`, but it may
 *   require TypeScript `moduleResolution: "bundler"` to resolve `@solana/kit`
 *   subpath exports correctly.
 */
export type KitImportStrategy = 'granular' | 'preferRoot' | 'rootOnly';

export const DEFAULT_KIT_IMPORT_STRATEGY: KitImportStrategy = 'preferRoot';
