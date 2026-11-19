import type { TypeNode } from '@codama/nodes';

import { DocsInput, Fragment, mergeFragments, RenderScope, TypeManifest } from '../utils';
import { getTypeFragment } from './type';
import { getTypeCodecFragment } from './typeCodec';

/**
 * Renders the types and the codec functions of a type, as found on type, account, event and
 * instruction data pages.
 *
 * @param scope - The render scope, the name of the type, its type manifest, byte size and docs.
 * @return The fragment of the types and codec functions.
 */
export function getTypeWithCodecFragment(
    scope: Pick<RenderScope, 'erasableSyntax' | 'nameApi'> & {
        codecDocs?: DocsInput;
        decoderDocs?: DocsInput;
        encoderDocs?: DocsInput;
        manifest: TypeManifest;
        name: string;
        node: TypeNode;
        size: number | null;
        typeDocs?: DocsInput;
    },
): Fragment {
    return mergeFragments([getTypeFragment({ ...scope, docs: scope.typeDocs }), getTypeCodecFragment(scope)], renders =>
        renders.join('\n\n'),
    );
}
