import { ProgramNode } from '@codama/nodes';

import { Fragment, mergeFragments, RenderScope } from '../utils';
import { getProgramAccountsFragment } from './programAccounts';
import { getProgramConstantFragment } from './programConstant';
import { getProgramInstructionsFragment } from './programInstructions';
import { getProgramPluginFragment } from './programPlugin';

export function getProgramPageFragment(
    scope: Pick<RenderScope, 'asyncResolvers' | 'nameApi' | 'renderParentInstructions' | 'typeManifestVisitor'> & {
        programNode: ProgramNode;
    },
): Fragment {
    return mergeFragments(
        [
            getProgramConstantFragment(scope),
            getProgramAccountsFragment(scope),
            getProgramInstructionsFragment(scope),
            getProgramPluginFragment(scope),
        ],
        cs => cs.join('\n\n'),
    );
}
