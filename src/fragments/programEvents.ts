import { isNode, ProgramNode, resolveNestedTypeNode, structTypeNode } from '@codama/nodes';

import { Fragment, fragment, mergeFragments, RenderScope, use } from '../utils';
import { getDiscriminatorConditionFragment } from './discriminatorCondition';
import { getEnumDeclarationFragment } from './enumDeclaration';

/**
 * Renders the program-level event helpers: an enum of all program events
 * and a function identifying which event some given data belongs to.
 *
 * @param scope - The render scope with the program node.
 * @returns A {@link Fragment} with the event helpers, or `undefined` when the program has no events.
 */
export function getProgramEventsFragment(
    scope: Pick<RenderScope, 'erasableSyntax' | 'nameApi' | 'typeManifestVisitor'> & {
        programNode: ProgramNode;
    },
): Fragment | undefined {
    if ((scope.programNode.events ?? []).length === 0) return;
    return mergeFragments([getProgramEventsEnumFragment(scope), getProgramEventsIdentifierFunctionFragment(scope)], c =>
        c.join('\n\n'),
    );
}

function getProgramEventsEnumFragment(
    scope: Pick<RenderScope, 'erasableSyntax' | 'nameApi'> & {
        programNode: ProgramNode;
    },
): Fragment {
    const { programNode, nameApi } = scope;
    return getEnumDeclarationFragment({
        ...scope,
        name: nameApi.programEventsEnum(programNode.name),
        variantNames: (programNode.events ?? []).map(event => nameApi.programEventsEnumVariant(event.name)),
    });
}

function getProgramEventsIdentifierFunctionFragment(
    scope: Pick<RenderScope, 'nameApi' | 'typeManifestVisitor'> & {
        programNode: ProgramNode;
    },
): Fragment | undefined {
    const { programNode, nameApi } = scope;
    const eventsWithDiscriminators = (programNode.events ?? []).filter(
        event => (event.discriminators ?? []).length > 0,
    );
    if (eventsWithDiscriminators.length === 0) return;

    const programEventsEnum = nameApi.programEventsEnum(programNode.name);
    const programEventsIdentifierFunction = nameApi.programEventsIdentifierFunction(programNode.name);

    const discriminatorsFragment = mergeFragments(
        eventsWithDiscriminators.map((event): Fragment => {
            const variant = nameApi.programEventsEnumVariant(event.name);
            const resolvedData = resolveNestedTypeNode(event.data);
            return getDiscriminatorConditionFragment({
                ...scope,
                dataName: 'data',
                discriminators: event.discriminators ?? [],
                ifTrue: `return ${programEventsEnum}.${variant};`,
                struct: isNode(resolvedData, 'structTypeNode') ? resolvedData : structTypeNode([]),
            });
        }),
        c => c.join('\n'),
    );

    const readonlyUint8Array = use('type ReadonlyUint8Array', 'solanaCodecsCore');

    return fragment`export function ${programEventsIdentifierFunction}(event: { data: ${readonlyUint8Array} } | ${readonlyUint8Array}): ${programEventsEnum} {
    const data = 'data' in event ? event.data : event;
    ${discriminatorsFragment}
    throw new Error('The provided event could not be identified as a ${programNode.name} event.');
}`;
}
