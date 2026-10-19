import { generateKeyPairSigner, none, some, type Account, type Address, type HasAddress } from '@solana/kit';
import { expect, expectTypeOf, test } from 'vitest';

import { createTestClient } from '../../_setup.js';
import {
    TOKEN_PROGRAM_ADDRESS,
    fetchAllMint,
    fetchMint,
    getMintSize,
    type InitializeMintInstructionData,
    type InitializeMintInstructionDataArgs,
    type Mint,
} from '../src/index.js';

test('it creates and initialises a new mint account', async () => {
    // Given an authority and a mint account.
    const client = await createTestClient();
    const [authority, mint] = await Promise.all([generateKeyPairSigner(), generateKeyPairSigner()]);
    const space = BigInt(getMintSize());
    const rent = await client.rpc.getMinimumBalanceForRentExemption(space).send();

    // When we create and initialise the mint account.
    await client.sendTransaction([
        client.system.instructions.createAccount({
            newAccount: mint,
            lamports: rent,
            space,
            programAddress: TOKEN_PROGRAM_ADDRESS,
        }),
        client.token.instructions.initializeMint({
            mint: mint.address,
            decimals: 2,
            mintAuthority: authority.address,
        }),
    ]);

    // Then the generated account plugin fetches and decodes it.
    const mintAccount = await client.token.accounts.mint.fetch(mint.address);
    expect(mintAccount).toMatchObject({
        address: mint.address,
        data: {
            mintAuthority: some(authority.address),
            supply: 0n,
            decimals: 2,
            isInitialized: true,
            freezeAuthority: none(),
        },
    });
});

test('it creates a new mint account with a freeze authority', async () => {
    // Given distinct mint and freeze authorities.
    const client = await createTestClient();
    const [mintAuthority, freezeAuthority, mint] = await Promise.all([
        generateKeyPairSigner(),
        generateKeyPairSigner(),
        generateKeyPairSigner(),
    ]);
    const space = BigInt(getMintSize());
    const rent = await client.rpc.getMinimumBalanceForRentExemption(space).send();

    // When we create and initialise the mint with both authorities.
    await client.sendTransaction([
        client.system.instructions.createAccount({
            newAccount: mint,
            lamports: rent,
            space,
            programAddress: TOKEN_PROGRAM_ADDRESS,
        }),
        client.token.instructions.initializeMint({
            mint: mint.address,
            decimals: 0,
            mintAuthority: mintAuthority.address,
            freezeAuthority: freezeAuthority.address,
        }),
    ]);

    // Then both authorities are decoded correctly.
    const mintAccount = await client.token.accounts.mint.fetch(mint.address);
    expect(mintAccount.data).toMatchObject({
        mintAuthority: some(mintAuthority.address),
        freezeAuthority: some(freezeAuthority.address),
    });
});

test('it accepts address-bearing objects as authority arguments', async () => {
    // Given authorities wrapped in objects exposing their address.
    const client = await createTestClient();
    const [mintAuthority, freezeAuthority, mint] = await Promise.all([
        generateKeyPairSigner(),
        generateKeyPairSigner(),
        generateKeyPairSigner(),
    ]);
    const space = BigInt(getMintSize());
    const rent = await client.rpc.getMinimumBalanceForRentExemption(space).send();

    // When we initialise the mint by passing these objects as instruction data arguments.
    await client.sendTransaction([
        client.system.instructions.createAccount({
            newAccount: mint,
            lamports: rent,
            space,
            programAddress: TOKEN_PROGRAM_ADDRESS,
        }),
        client.token.instructions.initializeMint({
            mint: mint.address,
            decimals: 0,
            mintAuthority: { address: mintAuthority.address },
            freezeAuthority: { address: freezeAuthority.address },
        }),
    ]);

    // Then the authorities are encoded as their underlying addresses.
    const mintAccount = await client.token.accounts.mint.fetch(mint.address);
    expect(mintAccount.data).toMatchObject({
        mintAuthority: some(mintAuthority.address),
        freezeAuthority: some(freezeAuthority.address),
    });

    // And only the loose data type accepts address-bearing objects.
    expectTypeOf<InitializeMintInstructionDataArgs['mintAuthority']>().toEqualTypeOf<Address | HasAddress>();
    expectTypeOf<InitializeMintInstructionData['mintAuthority']>().toEqualTypeOf<Address>();
});

test('it fetches mint accounts from address-bearing objects', async () => {
    // Given an initialised mint account.
    const client = await createTestClient();
    const [authority, mint] = await Promise.all([generateKeyPairSigner(), generateKeyPairSigner()]);
    const space = BigInt(getMintSize());
    const rent = await client.rpc.getMinimumBalanceForRentExemption(space).send();
    await client.sendTransaction([
        client.system.instructions.createAccount({
            newAccount: mint,
            lamports: rent,
            space,
            programAddress: TOKEN_PROGRAM_ADDRESS,
        }),
        client.token.instructions.initializeMint({
            mint: mint.address,
            decimals: 2,
            mintAuthority: authority.address,
        }),
    ]);

    // When we fetch it by passing an object exposing its address.
    const wrapper: HasAddress = { address: mint.address };
    const mintAccount = await fetchMint(client.rpc, wrapper);
    const [mintAccountFromAll] = await fetchAllMint(client.rpc, [wrapper]);

    // Then the account is fetched and exposes its plain address.
    expect(mintAccount).toMatchObject({ address: mint.address, data: { decimals: 2 } });
    expect(mintAccountFromAll).toMatchObject({ address: mint.address, data: { decimals: 2 } });

    // And the address type is inferred from the object whilst objects without an address are rejected.
    const fetchFromLiteral = () => fetchMint(client.rpc, wrapper as HasAddress<'1111'>);
    expectTypeOf(fetchFromLiteral).returns.toEqualTypeOf<Promise<Account<Mint, '1111'>>>();
    // @ts-expect-error Objects without an address property are rejected.
    const fetchFromInvalid = () => fetchMint(client.rpc, { publicKey: mint.address });
    expectTypeOf(fetchFromInvalid).toBeFunction();
});

test('it fetches mint accounts from a client exposing an RPC', async () => {
    // Given an initialised mint account.
    const client = await createTestClient();
    const [authority, mint] = await Promise.all([generateKeyPairSigner(), generateKeyPairSigner()]);
    const space = BigInt(getMintSize());
    const rent = await client.rpc.getMinimumBalanceForRentExemption(space).send();
    await client.sendTransaction([
        client.system.instructions.createAccount({
            newAccount: mint,
            lamports: rent,
            space,
            programAddress: TOKEN_PROGRAM_ADDRESS,
        }),
        client.token.instructions.initializeMint({
            mint: mint.address,
            decimals: 2,
            mintAuthority: authority.address,
        }),
    ]);

    // When we fetch it by passing the client instead of its RPC.
    const mintAccount = await fetchMint(client, mint.address);
    const [mintAccountFromAll] = await fetchAllMint(client, [mint.address]);

    // Then the account is fetched through the client's RPC.
    expect(mintAccount).toMatchObject({ address: mint.address, data: { decimals: 2 } });
    expect(mintAccountFromAll).toMatchObject({ address: mint.address, data: { decimals: 2 } });

    // And objects whose rpc property is not an RPC are rejected.
    // @ts-expect-error Objects without a valid rpc property are rejected.
    const fetchFromInvalid = () => fetchMint({ rpc: {} }, mint.address);
    expectTypeOf(fetchFromInvalid).toBeFunction();
});
