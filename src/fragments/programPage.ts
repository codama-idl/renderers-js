import { ProgramNode } from '@codama/nodes';
import { NodePath } from '@codama/visitors-core';

import { Fragment, mergeFragments, RenderScope } from '../utils';
import { getProgramAccountsFragment } from './programAccounts';
import { getProgramConstantFragment } from './programConstant';
import { getProgramEventsFragment } from './programEvents';
import { getProgramInstructionsFragment } from './programInstructions';
import { getProgramPluginFragment } from './programPlugin';

/**
 * Renders the page of a program: its address constant, account, instruction and event helpers,
 * and its Kit plugin.
 *
 * @param scope - The render scope, the program and its path.
 * @return The fragment of the program page.
 */
export function getProgramPageFragment(
    scope: Pick<
        RenderScope,
        | 'asyncResolvers'
        | 'customInstructionData'
        | 'erasableSyntax'
        | 'getImportPath'
        | 'isInternalNode'
        | 'linkables'
        | 'nameApi'
        | 'renderParentInstructions'
        | 'typeManifestVisitor'
    > & {
        programNode: ProgramNode;
        programPath: NodePath<ProgramNode>;
    },
): Fragment {
    return mergeFragments(
        [
            getProgramConstantFragment(scope),
            getProgramAccountsFragment(scope),
            getProgramEventsFragment(scope),
            getProgramInstructionsFragment(scope),
            getProgramPluginFragment(scope),
        ],
        cs => cs.join('\n\n'),
    );
}
