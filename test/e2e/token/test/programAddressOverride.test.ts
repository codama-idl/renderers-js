import { address, generateKeyPairSigner, type Address, type HasAddress } from '@solana/kit';
import { expect, expectTypeOf, test } from 'vitest';

import { TOKEN_PROGRAM_ADDRESS, getInitializeMintInstruction } from '../src/index.js';

class PublicKey<TAddress extends string> {
    readonly #address: Address<TAddress>;
    constructor(value: Address<TAddress>) {
        this.#address = value;
    }
    get address(): Address<TAddress> {
        return this.#address;
    }
    toBase58(): string {
        return this.#address;
    }
}

test('it can override the program address of an instruction', async () => {
    // Note: this test does not need to run the generated instruction

    // Given: a program address that we want to create instructions for
    const TOKEN_22_PROGRAM_ADDRESS = address('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

    // When we generate an initialize mint instruction with the program address
    const mintAddress = (await generateKeyPairSigner()).address;
    const mintAuthorityAddress = (await generateKeyPairSigner()).address;

    const mintInstruction = getInitializeMintInstruction(
        {
            mint: mintAddress,
            decimals: 2,
            mintAuthority: mintAuthorityAddress,
        },
        { programAddress: TOKEN_22_PROGRAM_ADDRESS },
    );

    // Then: the generated instruction has the correct program address
    expect(mintInstruction.programAddress).toBe(TOKEN_22_PROGRAM_ADDRESS);
});

test('it accepts address-bearing objects as program address overrides', async () => {
    // Given a program address wrapped in objects exposing it.
    type Token22ProgramAddress = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
    const token22ProgramAddress = address<Token22ProgramAddress>('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
    const token22ProgramWrapper: HasAddress<Token22ProgramAddress> = { address: token22ProgramAddress };
    const token22PublicKey = new PublicKey(token22ProgramAddress);
    const input = {
        mint: (await generateKeyPairSigner()).address,
        decimals: 2,
        mintAuthority: (await generateKeyPairSigner()).address,
    };

    // When we generate instructions overriding the program address with these objects.
    const fromAddress = getInitializeMintInstruction(input, { programAddress: token22ProgramAddress });
    const fromWrapper = getInitializeMintInstruction(input, { programAddress: token22ProgramWrapper });
    const fromPublicKey = getInitializeMintInstruction(input, { programAddress: token22PublicKey });

    // Then the program address is unwrapped to the underlying address.
    expect(fromWrapper.programAddress).toBe(token22ProgramAddress);
    expect(fromPublicKey.programAddress).toBe(token22ProgramAddress);
    expect(fromWrapper).toStrictEqual(fromAddress);
    expect(fromPublicKey).toStrictEqual(fromAddress);

    // And the instruction types carry the same literal program address as a plain address override.
    expectTypeOf(fromAddress.programAddress).toEqualTypeOf<Address<Address<Token22ProgramAddress>>>();
    expectTypeOf(fromWrapper).toEqualTypeOf(fromAddress);
    expectTypeOf(fromPublicKey).toEqualTypeOf(fromAddress);
});

test('it defaults to the program address constant when no override is provided', async () => {
    // Given an initialize mint input.
    const input = {
        mint: (await generateKeyPairSigner()).address,
        decimals: 2,
        mintAuthority: (await generateKeyPairSigner()).address,
    };

    // When we generate instructions without a config, with an empty config, and with the default program address.
    const withoutConfig = getInitializeMintInstruction(input);
    const withEmptyConfig = getInitializeMintInstruction(input, {});
    const withDefaultAddress = getInitializeMintInstruction(input, { programAddress: TOKEN_PROGRAM_ADDRESS });
    const withDefaultWrapper = getInitializeMintInstruction(input, {
        programAddress: { address: TOKEN_PROGRAM_ADDRESS },
    });

    // Then they all target the program address constant.
    expect(withoutConfig.programAddress).toBe(TOKEN_PROGRAM_ADDRESS);
    expect(withDefaultWrapper).toStrictEqual(withoutConfig);

    // And their instruction types all carry the literal program address constant.
    expectTypeOf(withoutConfig.programAddress).toEqualTypeOf<Address<typeof TOKEN_PROGRAM_ADDRESS>>();
    expectTypeOf(withEmptyConfig).toEqualTypeOf(withoutConfig);
    expectTypeOf(withDefaultAddress).toEqualTypeOf(withoutConfig);
    expectTypeOf(withDefaultWrapper).toEqualTypeOf(withoutConfig);
});
