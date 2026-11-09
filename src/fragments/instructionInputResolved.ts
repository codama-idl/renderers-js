import { mapFragmentContent } from '@codama/fragments';
import { camelCase } from '@codama/fragments/casing';
import { InstructionNode, isNode, parseOptionalAccountStrategy } from '@codama/nodes';
import { getLastNodeFromPath, NodePath, ResolvedInstructionInput } from '@codama/visitors-core';

import { Fragment, fragment, mergeFragments, RenderScope } from '../utils';
import { getInstructionInputDefaultFragment } from './instructionInputDefault';

export function getInstructionInputResolvedFragment(
    scope: Pick<RenderScope, 'asyncResolvers' | 'getImportFrom' | 'linkables' | 'nameApi' | 'typeManifestVisitor'> & {
        instructionPath: NodePath<InstructionNode>;
        resolvedInputs: ResolvedInstructionInput[];
        useAsync: boolean;
    },
): Fragment {
    const instructionNode = getLastNodeFromPath(scope.instructionPath);
    const resolvedInputFragments = scope.resolvedInputs.flatMap((input: ResolvedInstructionInput): Fragment[] => {
        const inputFragment = getInstructionInputDefaultFragment({
            ...scope,
            input,
            optionalAccountStrategy: parseOptionalAccountStrategy(instructionNode.optionalAccountStrategy),
        });
        if (!inputFragment.content) return [];
        const camelName = camelCase(input.name);
        return [
            mapFragmentContent(inputFragment, c =>
                isNode(input, 'instructionArgumentNode')
                    ? `if (!args.${camelName}) {\n${c}\n}`
                    : `if (!accounts.${camelName}.value) {\n${c}\n}`,
            ),
        ];
    });

    if (resolvedInputFragments.length === 0) {
        return fragment``;
    }

    return mergeFragments([fragment`// Resolve default values.`, ...resolvedInputFragments], c => c.join('\n'));
}
