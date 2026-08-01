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
    generatedFolder?: string;
    prettierOptions?: PrettierOptions;
    syncPackageJson?: boolean;
};

export type GetRenderMapOptions = {
    asyncResolvers?: string[];
    customAccountData?: CustomDataOptions[];
    customInstructionData?: CustomDataOptions[];
    dependencyMap?: Record<string, string>;
    dependencyVersions?: Record<string, string>;
    importExtension?: ImportExtension;
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
    importExtension?: ImportExtension;
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

/**
 * Defines the file extension appended to the relative module specifiers of generated code.
 *
 * Relative imports and re-exports normally omit their extension, which requires a bundler
 * or a resolver that can guess it. Setting this option makes those specifiers explicit:
 * generated files are referenced as `./myAccount.<ext>` and generated directories as
 * `./accounts/index.<ext>`. Only paths the renderer generates itself are rewritten, so
 * relative paths provided through {@link GetRenderMapOptions.linkOverrides} are emitted
 * verbatim and non-relative specifiers — npm packages, subpath imports — are never touched.
 *
 * Variants:
 * - `'js'`:
 *   Appends `.js` extensions, as expected by Node's ESM resolution — i.e. TypeScript's
 *   `moduleResolution: "nodenext"` — where the compiled JavaScript file is the resolution target.
 *
 * - `'ts'`:
 *   Appends `.ts` extensions, as expected by runtimes that execute TypeScript sources
 *   directly — e.g. Deno or Node type stripping. With TypeScript, this requires the
 *   `allowImportingTsExtensions` option, alongside `rewriteRelativeImportExtensions`
 *   when the sources are also compiled to JavaScript.
 *
 * @example
 * ```ts
 * // With `importExtension: 'js'`.
 * import { type MyType } from '../types/index.js';
 * export * from './myAccount.js';
 * ```
 */
export type ImportExtension = 'js' | 'ts';
