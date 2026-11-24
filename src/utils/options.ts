import type { LinkableDictionary, Visitor } from '@codama/visitors-core';

import type { CustomDataOptions, ParsedCustomDataOptions } from './customData';
import type { PrettierOptions } from './formatCode';
import type { IsInternalNodeFunction } from './generatedModules';
import type { GetImportFromFunction, LinkOverrides } from './linkOverrides';
import type { NameApi, NameTransformers } from './nameTransformers';
import type { TypeManifest, TypeManifestNodeKind } from './typeManifest';

/**
 * The options of {@link renderVisitor}: the options of {@link getRenderMapVisitor}, along with
 * options controlling how files are formatted and written.
 */
export type RenderOptions = GetRenderMapOptions & {
    /**
     * Whether to delete the generated folder before writing the generated files.
     *
     * @defaultValue `true`
     */
    deleteFolderBeforeRendering?: boolean;
    /**
     * Whether to format the generated code with Prettier.
     *
     * @defaultValue `true`
     */
    formatCode?: boolean;
    /**
     * The path of the generated folder, relative to the package folder.
     *
     * @defaultValue `'src/generated'`
     */
    generatedFolder?: string;
    /** Prettier options, overriding the ones of the package folder and the defaults. */
    prettierOptions?: PrettierOptions;
    /**
     * Whether to create or update the `package.json` of the package folder with the
     * dependencies of the generated code, rather than only reporting outdated ones.
     *
     * @defaultValue `true`
     */
    syncPackageJson?: boolean;
};

/**
 * The options of {@link getRenderMapVisitor}, controlling the generated code. See the README
 * for examples of each option.
 */
export type GetRenderMapOptions = {
    /** The names of the resolvers returning promises, which asynchronous builders await. */
    asyncResolvers?: string[];
    /** The accounts whose data is written manually rather than generated. */
    customAccountData?: CustomDataOptions[];
    /** The instructions whose data is written manually rather than generated. */
    customInstructionData?: CustomDataOptions[];
    /** Overrides of the modules that symbolic modules, e.g. `solanaAddresses`, resolve to. */
    dependencyMap?: Record<string, string>;
    /** Overrides of the version ranges of the packages the generated code depends on. */
    dependencyVersions?: Record<string, string>;
    /**
     * Whether generated code should avoid TypeScript syntax that cannot be erased
     * by a type-stripping compiler. When `true`, `enum` declarations are replaced
     * with `const` objects and union types of the same name.
     *
     * @defaultValue `false`
     */
    erasableSyntax?: boolean;
    /** The extension of relative import paths, e.g. `'js'` for Node ESM resolution. */
    importExtension?: ImportExtension;
    /** The identifiers of the nodes to render without exporting them from barrels. */
    internalNodes?: string[];
    /**
     * Whether to import Kit symbols from granular packages or from `@solana/kit`.
     *
     * @defaultValue `'preferRoot'`
     */
    kitImportStrategy?: KitImportStrategy;
    /** Overrides of the modules that linked nodes and resolvers are imported from. */
    linkOverrides?: LinkOverrides;
    /** Overrides of the transformers deriving generated names from node identifiers. */
    nameTransformers?: Partial<NameTransformers>;
    /** The identifiers of the enums outside the tree whose values are data unions. */
    nonScalarEnums?: string[];
    /**
     * Whether to render parent instructions along with their sub-instructions.
     *
     * @defaultValue `false`
     */
    renderParentInstructions?: boolean;
};

/**
 * The context shared by the fragments of a render: the parsed options, the name API, the
 * linkable nodes of the tree and the type manifest visitor.
 */
export type RenderScope = {
    asyncResolvers: string[];
    customAccountData: ParsedCustomDataOptions;
    customInstructionData: ParsedCustomDataOptions;
    dependencyMap: Record<string, string>;
    dependencyVersions: Record<string, string>;
    /** Whether generated code should avoid non-erasable TypeScript syntax. */
    erasableSyntax: boolean;
    getImportFrom: GetImportFromFunction;
    getImportPath: GetImportPathFunction;
    /** Whether a node is listed in the `internalNodes` option, and thus left out of barrels. */
    isInternalNode: IsInternalNodeFunction;
    kitImportStrategy: KitImportStrategy;
    linkables: LinkableDictionary;
    nameApi: NameApi;
    nonScalarEnums: string[];
    renderParentInstructions: boolean;
    typeManifestVisitor: Visitor<TypeManifest, TypeManifestNodeKind>;
};

/** Defines whether a generated import path targets a file or a directory. */
export type ImportPathType = 'directory' | 'file';

/** Resolves a renderer-owned import path according to the configured import options. */
export type GetImportPathFunction = (path: string, type: ImportPathType) => string;

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

/** The default `kitImportStrategy` option, importing from `@solana/kit` when possible. */
export const DEFAULT_KIT_IMPORT_STRATEGY: KitImportStrategy = 'preferRoot';

/**
 * Defines the file extension appended to the relative module specifiers of generated code.
 *
 * Relative imports and re-exports normally omit their extension, which requires a bundler
 * or a resolver that can guess it. Setting this option makes those specifiers explicit:
 * generated files are referenced as `./my-account.<ext>` and generated directories as
 * `./accounts/index.<ext>`. Only paths the renderer generates itself are rewritten, so
 * paths provided through {@link GetRenderMapOptions.dependencyMap} or
 * {@link GetRenderMapOptions.linkOverrides} are emitted verbatim and non-relative specifiers —
 * npm packages, subpath imports — are never touched.
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
 * export * from './my-account.js';
 * ```
 */
export type ImportExtension = 'js' | 'ts';
