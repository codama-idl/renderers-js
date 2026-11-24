import type { RegisteredTypeNode, RegisteredValueNode } from '@codama/nodes';

import { Fragment, fragment, mergeFragments } from './fragment';

/**
 * How a type or value renders in TypeScript: its strict type, i.e. the decoded one, its loose
 * type, i.e. the encoder input, its encoder and decoder, or its value.
 */
export type TypeManifest = Readonly<{
    decoder: Fragment;
    encoder: Fragment;
    isEnum: boolean;
    looseType: Fragment;
    strictType: Fragment;
    value: Fragment;
}>;

/** Creates a type manifest, with empty fragments for the parts not given. */
export function typeManifest(input: Partial<TypeManifest> = {}): TypeManifest {
    return Object.freeze({
        decoder: fragment``,
        encoder: fragment``,
        isEnum: false,
        looseType: fragment``,
        strictType: fragment``,
        value: fragment``,
        ...input,
    });
}

/**
 * Merges type manifests into one, combining each of their parts with the given functions, e.g.
 * the item manifests of a tuple.
 *
 * @param manifests - The manifests to merge.
 * @param options - The functions combining types, codecs and values, which default to an empty content.
 * @return The merged manifest.
 */
export function mergeTypeManifests(
    manifests: TypeManifest[],
    options: {
        mergeCodecs?: (renders: string[]) => string;
        mergeTypes?: (renders: string[]) => string;
        mergeValues?: (renders: string[]) => string;
    } = {},
): TypeManifest {
    const { mergeTypes, mergeCodecs, mergeValues } = options;
    const merge = (fragmentFn: (m: TypeManifest) => Fragment, mergeFn?: (r: string[]) => string) =>
        mergeFn ? mergeFragments(manifests.map(fragmentFn), mergeFn) : fragment``;
    return Object.freeze({
        decoder: merge(m => m.decoder, mergeCodecs),
        encoder: merge(m => m.encoder, mergeCodecs),
        isEnum: false,
        looseType: merge(m => m.looseType, mergeTypes),
        strictType: merge(m => m.strictType, mergeTypes),
        value: merge(m => m.value, mergeValues),
    });
}

/**
 * The kinds of nodes the type manifest visitor accepts: type and value nodes, as well as
 * accounts, defined types, events and instructions, which return the manifest of their data.
 *
 * The render scope spells out the visitor type as `Visitor<TypeManifest, TypeManifestNodeKind>`
 * rather than importing `TypeManifestVisitor` from the visitors, which would reintroduce an
 * import cycle.
 *
 * @see `getTypeManifestVisitor`
 */
export type TypeManifestNodeKind =
    | RegisteredTypeNode['kind']
    | RegisteredValueNode['kind']
    | 'accountNode'
    | 'definedTypeLinkNode'
    | 'definedTypeNode'
    | 'eventNode'
    | 'instructionNode';
