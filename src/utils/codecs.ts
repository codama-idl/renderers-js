import { CODAMA_ERROR__UNRECOGNIZED_BYTES_ENCODING, CodamaError } from '@codama/errors';
import { BytesValueNode } from '@codama/nodes';
import { getBase16Encoder, getBase58Encoder, getBase64Encoder, getUtf8Encoder } from '@solana/codecs-strings';

/**
 * The bytes a bytes value node holds, decoded from its encoding.
 *
 * @param node - The bytes value node.
 * @return The decoded bytes.
 * @throws `CODAMA_ERROR__UNRECOGNIZED_BYTES_ENCODING` when the encoding is not supported.
 *
 * @example
 * ```ts
 * getBytesFromBytesValueNode(bytesValueNode('base16', 'ff00')); // Uint8Array [255, 0]
 * ```
 */
export function getBytesFromBytesValueNode(node: BytesValueNode): Uint8Array {
    const encoder = (() => {
        switch (node.encoding) {
            case 'utf8':
                return getUtf8Encoder();
            case 'base16':
                return getBase16Encoder();
            case 'base58':
                return getBase58Encoder();
            case 'base64':
                return getBase64Encoder();
            default:
                throw new CodamaError(CODAMA_ERROR__UNRECOGNIZED_BYTES_ENCODING, {
                    encoding: node.encoding satisfies never,
                });
        }
    })();
    return Uint8Array.from(encoder.encode(node.data));
}
