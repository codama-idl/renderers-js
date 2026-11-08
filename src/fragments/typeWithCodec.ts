import type { TypeNode } from '@codama/nodes';

import { DocsInput, Fragment, mergeFragments, RenderScope, TypeManifest } from '../utils';
import { getTypeFragment } from './type';
import { getTypeCodecFragment } from './typeCodec';

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
