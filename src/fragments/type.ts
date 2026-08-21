import { Fragment, fragment, getDocblockFragment, RenderScope, TypeManifest } from '../utils';
import { getEnumDeclarationFromBodyFragment } from './enumDeclaration';

export function getTypeFragment(
    scope: Pick<RenderScope, 'erasableSyntax' | 'nameApi'> & {
        docs?: string[];
        manifest: TypeManifest;
        name: string;
    },
): Fragment {
    const { name, manifest, nameApi, docs = [] } = scope;

    const docblock = getDocblockFragment(docs, true);
    const strictName = nameApi.dataType(name);
    const looseName = nameApi.dataArgsType(name);
    const aliasedLooseName = `export type ${looseName} = ${strictName};`;

    if (manifest.isEnum) {
        const enumDeclaration = getEnumDeclarationFromBodyFragment({
            ...scope,
            body: manifest.strictType,
            docblock,
            name: strictName,
        });
        return fragment`${enumDeclaration}\n\n${aliasedLooseName}`;
    }

    const looseExport =
        manifest.strictType.content === manifest.looseType.content
            ? aliasedLooseName
            : fragment`export type ${looseName} = ${manifest.looseType};`;
    return fragment`${docblock}export type ${strictName} = ${manifest.strictType};\n\n${looseExport}`;
}
