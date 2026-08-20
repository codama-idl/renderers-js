import {
    type ClientWithPayer,
    type ClientWithRpc,
    type GetMinimumBalanceForRentExemptionApi,
    type TransactionSigner,
    createClient,
    lamports,
    sequentialInstructionPlan,
} from '@solana/kit';
import { litesvm } from '@solana/kit-plugin-litesvm';
import { airdropSigner, generatedSigner } from '@solana/kit-plugin-signer';

import {
    SYSTEM_PROGRAM_ADDRESS,
    getCreateAccountInstruction,
    getInitializeNonceAccountInstruction,
    getNonceSize,
    systemProgram,
} from '../src/index.js';

/**
 * Creates a funded LiteSVM client with the generated System Program plugin.
 *
 * @return A promise resolving to the configured test client.
 */
export const createTestClient = () => {
    return createClient()
        .use(generatedSigner())
        .use(litesvm())
        .use(systemProgram())
        .use(airdropSigner(lamports(1_000_000_000n)));
};

/** A LiteSVM client configured for System Program E2E tests. */
export type TestClient = Awaited<ReturnType<typeof createTestClient>>;

/**
 * Creates an instruction plan that creates and initialises a durable nonce account.
 *
 * @param client - The client used to determine the rent-exempt balance.
 * @param nonce - The signer for the nonce account.
 * @param nonceAuthority - The authority allowed to advance the nonce.
 * @return A promise resolving to the sequential instruction plan.
 */
export const getCreateNonceInstructionPlan = async (
    client: ClientWithPayer & ClientWithRpc<GetMinimumBalanceForRentExemptionApi>,
    nonce: TransactionSigner,
    nonceAuthority: TransactionSigner,
) => {
    const space = BigInt(getNonceSize());
    const rent = await client.rpc.getMinimumBalanceForRentExemption(space).send();

    return sequentialInstructionPlan([
        getCreateAccountInstruction({
            payer: client.payer,
            newAccount: nonce,
            lamports: rent,
            space,
            programAddress: SYSTEM_PROGRAM_ADDRESS,
        }),
        getInitializeNonceAccountInstruction({
            nonceAccount: nonce.address,
            nonceAuthority: nonceAuthority.address,
        }),
    ]);
};
