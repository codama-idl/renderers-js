import { joinPath, mapRenderMapContentAsync, RenderMap } from '@codama/renderers-core';
import { Plugin, resolveConfig } from 'prettier';
import * as estreePlugin from 'prettier/plugins/estree';
import * as typeScriptPlugin from 'prettier/plugins/typescript';
import { format } from 'prettier/standalone';

import { Fragment } from './fragment';
import { RenderOptions } from './options';

export type PrettierOptions = Parameters<typeof format>[1];

const DEFAULT_PRETTIER_OPTIONS: PrettierOptions = {
    parser: 'typescript',
    plugins: [estreePlugin as Plugin<unknown>, typeScriptPlugin],
};

export async function formatCode(
    renderMap: RenderMap<Fragment>,
    options: Pick<RenderOptions, 'formatCode' | 'packageFolder' | 'prettierOptions'>,
): Promise<RenderMap<Fragment>> {
    const shouldFormatCode = options.formatCode ?? true;
    if (!shouldFormatCode) return renderMap;

    const prettierOptions: PrettierOptions = {
        ...DEFAULT_PRETTIER_OPTIONS,
        ...(await resolvePrettierOptions(options.packageFolder)),
        ...options.prettierOptions,
    };

    return await mapRenderMapContentAsync(renderMap, code => format(code, prettierOptions));
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
