import { joinPath, Path } from '@codama/renderers-core';
import { Plugin, resolveConfig } from 'prettier';
import * as babelPlugin from 'prettier/plugins/babel';
import * as estreePlugin from 'prettier/plugins/estree';
import * as typeScriptPlugin from 'prettier/plugins/typescript';
import { format } from 'prettier/standalone';

import { RenderOptions } from './options';

export type PrettierOptions = Parameters<typeof format>[1];

const DEFAULT_PRETTIER_OPTIONS: PrettierOptions = {
    plugins: [estreePlugin as Plugin<unknown>, typeScriptPlugin, babelPlugin],
};

export type CodeFormatter = (code: string, path: Path) => Promise<string>;

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
