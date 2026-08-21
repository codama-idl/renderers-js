import { camelCase } from '@codama/nodes';

import { Fragment, getExportAllFragment, mergeFragments, RenderScope } from '../utils';

export function getIndexPageFragment(
    items: { name: string }[],
    scope: Pick<RenderScope, 'getImportPath'>,
): Fragment | undefined {
    if (items.length === 0) return;

    const names = items
        .map(item => camelCase(item.name))
        .sort((a, b) => a.localeCompare(b))
        .map(name => getExportAllFragment(scope.getImportPath(`./${name}`, 'file')));

    return mergeFragments(names, cs => cs.join('\n'));
}
