import { mapRenderMapContentAsync, RenderMap } from '@codama/renderers-core';
import { format, Plugin, resolveConfig } from 'prettier';
import * as estreePlugin from 'prettier/plugins/estree';
import * as typeScriptPlugin from 'prettier/plugins/typescript';

import { Fragment } from './fragment';
import { RenderOptions } from './options';

export type PrettierOptions = Parameters<typeof format>[1];

const DEFAULT_PRETTIER_OPTIONS: PrettierOptions = {
    arrowParens: 'always',
    parser: 'typescript',
    plugins: [estreePlugin as Plugin<unknown>, typeScriptPlugin],
    printWidth: 80,
    semi: true,
    singleQuote: true,
    tabWidth: 2,
    trailingComma: 'es5',
    useTabs: false,
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
    return await resolveConfig(packageFolder);
}
