import { joinPath, Path } from '@codama/fragments';
import { Plugin, resolveConfig } from 'prettier';
import * as babelPlugin from 'prettier/plugins/babel';
import * as estreePlugin from 'prettier/plugins/estree';
import * as typeScriptPlugin from 'prettier/plugins/typescript';
import { format } from 'prettier/standalone';

import { RenderOptions } from './options';

/** The options of Prettier used to format the generated code. */
export type PrettierOptions = Parameters<typeof format>[1];

const DEFAULT_PRETTIER_OPTIONS: PrettierOptions = {
    plugins: [estreePlugin as Plugin<unknown>, typeScriptPlugin, babelPlugin],
};

/** Formats the code of a generated file, e.g. with Prettier, given its path to infer its parser. */
export type CodeFormatter = (code: string, path: Path) => Promise<string>;

/**
 * Creates the formatter of the generated code: Prettier configured with the options of the
 * package folder merged with the `prettierOptions` option, or an identity function when
 * `formatCode` is `false`.
 *
 * @param packageFolder - The folder of the package the code is generated into.
 * @param options - The `formatCode` and `prettierOptions` options.
 * @return The code formatter.
 */
export async function getCodeFormatter(
    packageFolder: string,
    options: Pick<RenderOptions, 'formatCode' | 'prettierOptions'>,
): Promise<CodeFormatter> {
    const shouldFormatCode = options.formatCode ?? true;
    if (!shouldFormatCode) return code => Promise.resolve(code);

    const prettierOptions: PrettierOptions = {
        ...DEFAULT_PRETTIER_OPTIONS,
        ...(await resolvePrettierOptions(packageFolder)),
        ...options.prettierOptions,
    };

    return (code, filepath) => format(code, { ...prettierOptions, filepath });
}

async function resolvePrettierOptions(packageFolder: string | undefined): Promise<PrettierOptions | null> {
    if (!__NODEJS__) {
        // In a non-NodeJS environment, we cannot load config files.
        return null;
    }

    if (!packageFolder) return null;

    // Prettier expects a file path to resolve, not just its directory.
    // Therefore we must append a filename (any will do) to ensure the
    // provided directory is searched for config files.
    const filePathToResolve = joinPath(packageFolder, 'package.json');
    return await resolveConfig(filePathToResolve);
}
