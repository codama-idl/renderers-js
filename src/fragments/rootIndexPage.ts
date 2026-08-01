import { AccountNode, ConstantNode, DefinedTypeNode, InstructionNode, PdaNode, ProgramNode } from '@codama/nodes';

import { Fragment, fragment, getExportAllFragment, mergeFragments, RenderScope } from '../utils';

export function getRootIndexPageFragment(
    scope: Pick<RenderScope, 'getImportPath'> & {
        accountsToExport: AccountNode[];
        constantsToExport: ConstantNode[];
        definedTypesToExport: DefinedTypeNode[];
        instructionsToExport: InstructionNode[];
        pdasToExport: PdaNode[];
        programsToExport: ProgramNode[];
    },
): Fragment {
    const hasAnythingToExport =
        scope.programsToExport.length > 0 ||
        scope.accountsToExport.length > 0 ||
        scope.constantsToExport.length > 0 ||
        scope.instructionsToExport.length > 0 ||
        scope.definedTypesToExport.length > 0;

    if (!hasAnythingToExport) {
        return fragment`export default {};`;
    }

    const programsWithErrorsToExport = scope.programsToExport.filter(p => (p.errors ?? []).length > 0);

    return mergeFragments(
        [
            scope.accountsToExport.length > 0
                ? getExportAllFragment(scope.getImportPath('./accounts', 'directory'))
                : undefined,
            scope.constantsToExport.length > 0
                ? getExportAllFragment(scope.getImportPath('./constants', 'file'))
                : undefined,
            programsWithErrorsToExport.length > 0
                ? getExportAllFragment(scope.getImportPath('./errors', 'directory'))
                : undefined,
            scope.instructionsToExport.length > 0
                ? getExportAllFragment(scope.getImportPath('./instructions', 'directory'))
                : undefined,
            scope.pdasToExport.length > 0
                ? getExportAllFragment(scope.getImportPath('./pdas', 'directory'))
                : undefined,
            scope.programsToExport.length > 0
                ? getExportAllFragment(scope.getImportPath('./programs', 'directory'))
                : undefined,
            scope.definedTypesToExport.length > 0
                ? getExportAllFragment(scope.getImportPath('./types', 'directory'))
                : undefined,
        ],
        cs => cs.join('\n'),
    );
}
