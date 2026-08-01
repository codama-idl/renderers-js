import { AccountNode, DefinedTypeNode, EventNode, InstructionNode, PdaNode, ProgramNode } from '@codama/nodes';

import { Fragment, fragment, getExportAllFragment, mergeFragments, RenderScope } from '../utils';

export function getRootIndexPageFragment(
    scope: Pick<RenderScope, 'getImportPath'> & {
        accountsToExport: AccountNode[];
        definedTypesToExport: DefinedTypeNode[];
        eventsToExport: EventNode[];
        instructionsToExport: InstructionNode[];
        pdasToExport: PdaNode[];
        programsToExport: ProgramNode[];
        programsWithConstantsToExport: ProgramNode[];
    },
): Fragment {
    const hasAnythingToExport =
        scope.programsToExport.length > 0 ||
        scope.accountsToExport.length > 0 ||
        scope.programsWithConstantsToExport.length > 0 ||
        scope.eventsToExport.length > 0 ||
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
            scope.programsWithConstantsToExport.length > 0
                ? getExportAllFragment(scope.getImportPath('./constants', 'directory'))
                : undefined,
            programsWithErrorsToExport.length > 0
                ? getExportAllFragment(scope.getImportPath('./errors', 'directory'))
                : undefined,
            scope.eventsToExport.length > 0
                ? getExportAllFragment(scope.getImportPath('./events', 'directory'))
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
