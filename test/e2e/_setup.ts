import {
    type Address,
    type ClientWithPayer,
    type ClientWithRpc,
    type GetMinimumBalanceForRentExemptionApi,
    type TransactionSigner,
    createClient,
    generateKeyPairSigner,
    lamports,
    sequentialInstructionPlan,
} from '@solana/kit';
import { litesvm } from '@solana/kit-plugin-litesvm';
import { airdropSigner, generatedSigner } from '@solana/kit-plugin-signer';

import { memoProgram } from './memo/src/index.js';
import {
    SYSTEM_PROGRAM_ADDRESS,
    getCreateAccountInstruction,
    getInitializeNonceAccountInstruction,
    getNonceSize,
    systemProgram,
} from './system/src/index.js';
import {
    TOKEN_PROGRAM_ADDRESS,
    associatedTokenProgram,
    getMintSize,
    getTokenSize,
    tokenProgram,
} from './token/src/index.js';

/**
 * Creates a funded LiteSVM client composing the generated program plugins of
 * every fixture. Since each plugin comes from an independently generated
 * client, this also proves that generated plugins compose on a single client.
 *
 * @return A promise resolving to the configured test client.
 */
export const createTestClient = () => {
    return createClient()
        .use(generatedSigner())
        .use(litesvm())
        .use(airdropSigner(lamports(1_000_000_000n)))
        .use(systemProgram())
        .use(tokenProgram())
        .use(associatedTokenProgram())
        .use(memoProgram());
};

/** A LiteSVM client configured with the generated program plugins of every fixture. */
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

/**
 * Creates and initialises a token mint.
 *
 * @param client - The configured test client.
 * @param mintAuthority - The authority allowed to mint tokens.
 * @param decimals - The number of decimal places used by the mint.
 * @return The address of the created mint.
 */
export const createMint = async (
    client: TestClient,
    mintAuthority: Address,
    decimals: number = 0,
): Promise<Address> => {
    const space = BigInt(getMintSize());
    const [rent, mint] = await Promise.all([
        client.rpc.getMinimumBalanceForRentExemption(space).send(),
        generateKeyPairSigner(),
    ]);
    await client.sendTransaction([
        client.system.instructions.createAccount({
            newAccount: mint,
            lamports: rent,
            space,
            programAddress: TOKEN_PROGRAM_ADDRESS,
        }),
        client.token.instructions.initializeMint({
            mint: mint.address,
            decimals,
            mintAuthority,
        }),
    ]);
    return mint.address;
};

/**
 * Creates and initialises a token account.
 *
 * @param client - The configured test client.
 * @param mint - The mint associated with the token account.
 * @param owner - The owner of the token account.
 * @return The address of the created token account.
 */
export const createToken = async (client: TestClient, mint: Address, owner: Address): Promise<Address> => {
    const space = BigInt(getTokenSize());
    const [rent, token] = await Promise.all([
        client.rpc.getMinimumBalanceForRentExemption(space).send(),
        generateKeyPairSigner(),
    ]);
    await client.sendTransaction([
        client.system.instructions.createAccount({
            newAccount: token,
            lamports: rent,
            space,
            programAddress: TOKEN_PROGRAM_ADDRESS,
        }),
        client.token.instructions.initializeAccount({
            account: token.address,
            mint,
            owner,
        }),
    ]);
    return token.address;
};

/**
 * Creates a token account and mints an initial amount into it.
 *
 * @param client - The configured test client.
 * @param mintAuthority - The authority allowed to mint tokens.
 * @param mint - The mint associated with the token account.
 * @param owner - The owner of the token account.
 * @param amount - The initial token amount.
 * @return The address of the created token account.
 */
export const createTokenWithAmount = async (
    client: TestClient,
    mintAuthority: TransactionSigner,
    mint: Address,
    owner: Address,
    amount: bigint,
): Promise<Address> => {
    const space = BigInt(getTokenSize());
    const [rent, token] = await Promise.all([
        client.rpc.getMinimumBalanceForRentExemption(space).send(),
        generateKeyPairSigner(),
    ]);
    await client.sendTransaction([
        client.system.instructions.createAccount({
            newAccount: token,
            lamports: rent,
            space,
            programAddress: TOKEN_PROGRAM_ADDRESS,
        }),
        client.token.instructions.initializeAccount({
            account: token.address,
            mint,
            owner,
        }),
        client.token.instructions.mintTo({
            mint,
            token: token.address,
            mintAuthority,
            amount,
        }),
    ]);
    return token.address;
};
