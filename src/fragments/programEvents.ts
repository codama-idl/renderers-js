import { camelCase, EventNode, isNode, isNodeFilter, ProgramNode } from '@codama/nodes';

import { Fragment, fragment, mergeFragments, RenderScope, use } from '../utils';

export function getProgramEventsFragment(
    scope: Pick<RenderScope, 'nameApi' | 'typeManifestVisitor'> & {
        programNode: ProgramNode;
    },
): Fragment | undefined {
    const events = (scope.programNode.events ?? []).filter(event => (event.discriminators ?? []).length > 0);
    if (events.length === 0) return;
    return mergeFragments(
        [
            getProgramEventsEnumFragment({ ...scope, events }),
            getProgramEventsIdentifierFunctionFragment({ ...scope, events }),
            getProgramEventsParsedUnionTypeFragment({ ...scope, events }),
            getProgramEventsParseFunctionFragment({ ...scope, events }),
        ],
        c => c.join('\n\n'),
    );
}

function getProgramEventsEnumFragment(
    scope: Pick<RenderScope, 'nameApi'> & {
        events: EventNode[];
        programNode: ProgramNode;
    },
): Fragment {
    const { programNode, nameApi, events } = scope;
    const programEventsEnum = nameApi.programEventsEnum(programNode.name);
    const programEventsEnumVariants = events.map(event => nameApi.programEventsEnumVariant(event.name));
    return fragment`export enum ${programEventsEnum} { ${programEventsEnumVariants.join(', ')} }`;
}

function getProgramEventsIdentifierFunctionFragment(
    scope: Pick<RenderScope, 'nameApi'> & {
        events: EventNode[];
        programNode: ProgramNode;
    },
): Fragment {
    const { programNode, nameApi, events } = scope;

    const programEventsEnum = nameApi.programEventsEnum(programNode.name);
    const programEventsIdentifierFunction = nameApi.programEventsIdentifierFunction(programNode.name);

    const discriminatorsFragment = mergeFragments(
        events.map((event): Fragment => {
            const variant = nameApi.programEventsEnumVariant(event.name);
            return getEventDiscriminatorConditionFragment({
                ...scope,
                eventNode: event,
                ifTrue: `return ${programEventsEnum}.${variant};`,
            });
        }),
        c => c.join('\n'),
    );

    const readonlyUint8Array = use('type ReadonlyUint8Array', 'solanaCodecsCore');

    return fragment`export function ${programEventsIdentifierFunction}(event: { data: ${readonlyUint8Array} } | ${readonlyUint8Array}): ${programEventsEnum} | null {
    const data = 'data' in event ? event.data : event;
    ${discriminatorsFragment}
    return null;
}`;
}

function getProgramEventsParsedUnionTypeFragment(
    scope: Pick<RenderScope, 'nameApi'> & {
        events: EventNode[];
        programNode: ProgramNode;
    },
): Fragment {
    const { programNode, nameApi, events } = scope;
    const programEventsParsedUnionType = nameApi.programEventsParsedUnionType(programNode.name);
    const programEventsEnum = nameApi.programEventsEnum(programNode.name);

    const typeVariants = events.map((event): Fragment => {
        const eventEnumVariant = nameApi.programEventsEnumVariant(event.name);
        const eventDataType = use(`type ${nameApi.dataType(event.name)}`, 'generatedEvents');
        return fragment`| ({ eventType: ${programEventsEnum}.${eventEnumVariant} } & ${eventDataType})`;
    });

    return mergeFragments([fragment`export type ${programEventsParsedUnionType} =`, ...typeVariants], c =>
        c.join('\n'),
    );
}

function getProgramEventsParseFunctionFragment(
    scope: Pick<RenderScope, 'nameApi'> & {
        events: EventNode[];
        programNode: ProgramNode;
    },
): Fragment {
    const { programNode, nameApi, events } = scope;

    const programEventsEnum = nameApi.programEventsEnum(programNode.name);
    const programEventsIdentifierFunction = nameApi.programEventsIdentifierFunction(programNode.name);
    const programEventsParsedUnionType = nameApi.programEventsParsedUnionType(programNode.name);
    const parseFunction = nameApi.programEventsParseFunction(programNode.name);

    const switchCases = mergeFragments(
        events.map((event): Fragment => {
            const enumVariant = nameApi.programEventsEnumVariant(event.name);
            const decoderFn = use(nameApi.decoderFunction(event.name), 'generatedEvents');
            const skipExpr = getHiddenPrefixSkipExpr(event, nameApi);

            if (skipExpr) {
                return fragment`case ${programEventsEnum}.${enumVariant}: { return { eventType: ${programEventsEnum}.${enumVariant}, ...${decoderFn}().decode(data, ${skipExpr}) }; }`;
            }
            return fragment`case ${programEventsEnum}.${enumVariant}: { return { eventType: ${programEventsEnum}.${enumVariant}, ...${decoderFn}().decode(data) }; }`;
        }),
        c => c.join('\n'),
    );

    const readonlyUint8Array = use('type ReadonlyUint8Array', 'solanaCodecsCore');

    return fragment`export function ${parseFunction}(event: { data: ${readonlyUint8Array} } | ${readonlyUint8Array}): ${programEventsParsedUnionType} | null {
    const data = 'data' in event ? event.data : event;
    const eventType = ${programEventsIdentifierFunction}(event);
    if (eventType === null) return null;
    switch (eventType) {
        ${switchCases}
    }
}`;
}

function getEventDiscriminatorConditionFragment(
    scope: Pick<RenderScope, 'nameApi'> & {
        eventNode: EventNode;
        ifTrue: string;
    },
): Fragment {
    const { eventNode, nameApi, ifTrue } = scope;
    const discriminators = eventNode.discriminators ?? [];
    const containsBytes = use('containsBytes', 'solanaCodecsCore');

    const conditions = mergeFragments(
        discriminators.map(disc => {
            if (isNode(disc, 'sizeDiscriminatorNode')) {
                return fragment`data.length === ${disc.size}`;
            }
            if (isNode(disc, 'constantDiscriminatorNode')) {
                const constantDiscs = discriminators.filter(isNodeFilter('constantDiscriminatorNode'));
                const index = constantDiscs.indexOf(disc);
                const suffix = index <= 0 ? '' : `_${index + 1}`;
                const name = camelCase(`${eventNode.name}_discriminator${suffix}`);
                const constant = use(nameApi.constant(name), 'generatedEvents');
                return fragment`${containsBytes}(data, ${constant}, ${disc.offset})`;
            }
            // fieldDiscriminatorNode
            const name = camelCase(`${eventNode.name}_${disc.name}`);
            const constant = use(nameApi.constant(name), 'generatedEvents');
            return fragment`${containsBytes}(data, ${constant}, ${disc.offset})`;
        }),
        c => c.join(' && '),
    );

    return fragment`if (${conditions}) { ${ifTrue} }`;
}

function getHiddenPrefixSkipExpr(event: EventNode, nameApi: RenderScope['nameApi']): Fragment | null {
    const hasConstantDiscriminator = (event.discriminators ?? []).some(d => isNode(d, 'constantDiscriminatorNode'));
    if (!hasConstantDiscriminator || !isNode(event.data, 'hiddenPrefixTypeNode')) {
        return null;
    }
    const prefixes = event.data.prefix;
    if (prefixes.length === 1) {
        const discConstant = use(nameApi.constant(camelCase(`${event.name}_discriminator`)), 'generatedEvents');
        return fragment`${discConstant}.length`;
    }
    const totalSize = prefixes.reduce((sum, p) => sum + (isNode(p.type, 'fixedSizeTypeNode') ? p.type.size : 0), 0);
    return fragment`${String(totalSize)}`;
}
