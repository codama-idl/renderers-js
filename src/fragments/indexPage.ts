import { Fragment, getExportAllFragment, mergeFragments, RenderScope } from '../utils';

/**
 * Renders the barrel of a generated folder, re-exporting the file of each item, sorted by name.
 *
 * @param items - The nodes whose files are re-exported, e.g. the accounts of the tree.
 * @param scope - The render scope.
 * @return The fragment of the barrel, if there is anything to export.
 *
 * @example
 * ```ts
 * getIndexPageFragment([accountNode({ identifier: 'counter' })], scope);
 * // export * from './counter';
 * ```
 */
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
