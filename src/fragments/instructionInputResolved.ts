import { mapFragmentContent } from '@codama/fragments';
import { camelCase } from '@codama/fragments/casing';
import { InstructionNode, parseOptionalAccountStrategy } from '@codama/nodes';
import { getLastNodeFromPath, NodePath } from '@codama/visitors-core';

import { Fragment, fragment, mergeFragments, RenderScope, ResolvedInstructionInput } from '../utils';
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
        const camelName = camelCase(input.node.identifier);
        return [
            mapFragmentContent(inputFragment, c =>
                input.kind === 'data'
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
