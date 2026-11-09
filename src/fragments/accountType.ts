import { AccountNode } from '@codama/nodes';
import { getLastNodeFromPath, NodePath } from '@codama/visitors-core';

import { Fragment, getCustomDataOptions, getInnerTypeNode, RenderScope, TypeManifest } from '../utils';
import { getTypeWithCodecFragment } from './typeWithCodec';

export function getAccountTypeFragment(
    scope: Pick<RenderScope, 'customAccountData' | 'erasableSyntax' | 'nameApi'> & {
        accountPath: NodePath<AccountNode>;
        size: number | null;
        typeManifest: TypeManifest;
    },
): Fragment | undefined {
    const { accountPath, typeManifest, nameApi, customAccountData } = scope;
    const accountNode = getLastNodeFromPath(accountPath);
    if (getCustomDataOptions(customAccountData, accountNode)) return;

    return getTypeWithCodecFragment({
        codecDocs: [`Gets the codec for {@link ${nameApi.dataType(accountNode.identifier)}} account data.`],
        decoderDocs: [`Gets the decoder for {@link ${nameApi.dataType(accountNode.identifier)}} account data.`],
        encoderDocs: [`Gets the encoder for {@link ${nameApi.dataArgsType(accountNode.identifier)}} account data.`],
        erasableSyntax: scope.erasableSyntax,
        manifest: typeManifest,
        name: accountNode.identifier,
        nameApi,
        node: getInnerTypeNode(accountNode.data),
        size: scope.size,
        typeDocs: accountNode.docs,
    });
}
