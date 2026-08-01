import { AccountNode, DefinedTypeNode, InstructionNode, PdaNode, ProgramNode } from '@codama/nodes';

import { Fragment, fragment, getExportAllFragment, mergeFragments, RenderScope } from '../utils';

export function getRootIndexPageFragment(
    scope: Pick<RenderScope, 'importExtension'> & {
        accountsToExport: AccountNode[];
        definedTypesToExport: DefinedTypeNode[];
        instructionsToExport: InstructionNode[];
        pdasToExport: PdaNode[];
        programsToExport: ProgramNode[];
    },
): Fragment {
    const hasAnythingToExport =
        scope.programsToExport.length > 0 ||
        scope.accountsToExport.length > 0 ||
        scope.instructionsToExport.length > 0 ||
        scope.definedTypesToExport.length > 0;

    if (!hasAnythingToExport) {
        return fragment`export default {};`;
    }

    const programsWithErrorsToExport = scope.programsToExport.filter(p => (p.errors ?? []).length > 0);

    // Each entry is a directory, so an explicit extension must target its index file.
    const index = scope.importExtension ? `/index.${scope.importExtension}` : '';

    return mergeFragments(
        [
            scope.accountsToExport.length > 0 ? getExportAllFragment(`./accounts${index}`) : undefined,
            programsWithErrorsToExport.length > 0 ? getExportAllFragment(`./errors${index}`) : undefined,
            scope.instructionsToExport.length > 0 ? getExportAllFragment(`./instructions${index}`) : undefined,
            scope.pdasToExport.length > 0 ? getExportAllFragment(`./pdas${index}`) : undefined,
            scope.programsToExport.length > 0 ? getExportAllFragment(`./programs${index}`) : undefined,
            scope.definedTypesToExport.length > 0 ? getExportAllFragment(`./types${index}`) : undefined,
        ],
        cs => cs.join('\n'),
    );
}
