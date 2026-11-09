import { Fragment, getExportAllFragment, mergeFragments, RenderScope } from '../utils';

export function getIndexPageFragment(
    items: { identifier: string }[],
    scope: Pick<RenderScope, 'getImportPath' | 'nameApi'>,
): Fragment | undefined {
    if (items.length === 0) return;

    const names = items
        .map(item => scope.nameApi.fileName(item.identifier))
        .sort((a, b) => a.localeCompare(b))
        .map(name => getExportAllFragment(scope.getImportPath(`./${name}`, 'file')));

    return mergeFragments(names, cs => cs.join('\n'));
}
