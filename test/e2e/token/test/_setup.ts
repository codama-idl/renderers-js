import { type Address, type TransactionSigner, createClient, generateKeyPairSigner, lamports } from '@solana/kit';
import { litesvm } from '@solana/kit-plugin-litesvm';
import { airdropSigner, generatedSigner } from '@solana/kit-plugin-signer';

import {
    TOKEN_PROGRAM_ADDRESS,
    associatedTokenProgram,
    getMintSize,
    getTokenSize,
    systemProgram,
    tokenProgram,
} from '../src/index.js';

/**
 * Creates a funded LiteSVM client with the generated token-related program plugins.
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
        .use(associatedTokenProgram());
};

/** A LiteSVM client configured for Token Program E2E tests. */
export type TestClient = Awaited<ReturnType<typeof createTestClient>>;

/**
 * Creates and initialises a token mint.
 *
 * @param client - The configured Token Program test client.
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
 * @param client - The configured Token Program test client.
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
 * @param client - The configured Token Program test client.
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
