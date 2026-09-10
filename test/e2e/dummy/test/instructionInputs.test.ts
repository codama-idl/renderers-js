import {
    AccountRole,
    createNoopSigner,
    SOLANA_ERROR__PROGRAM_CLIENTS__RESOLVED_INSTRUCTION_INPUT_MUST_BE_SIGNER,
    SOLANA_ERROR__PROGRAM_CLIENTS__UNEXPECTED_RESOLVED_INSTRUCTION_INPUT_TYPE,
    SolanaError,
    type AccountSignerMeta,
    type Address,
    type ProgramDerivedAddress,
    type ProgramDerivedAddressBump,
    type ReadonlyAccount,
    type ReadonlySignerAccount,
    type WritableAccount,
} from '@solana/kit';
import { expect, expectTypeOf, test } from 'vitest';

import {
    DUMMY_PROGRAM_ADDRESS,
    dummyProgram,
    getInstruction2Instruction,
    getInstruction8Instruction,
    getInstruction11Instruction,
    getInstruction12Instruction,
    getInstruction13Instruction,
    type DummyPluginRequirements,
} from '../src/index.js';

/**
 * Mimics the address wrapper classes exposed by third-party frameworks — e.g. web3.js's
 * `PublicKey` — which generated instruction builders accept via Kit's `HasAddress` type.
 */
class AddressWrapper<TAddress extends string> {
    constructor(readonly address: Address<TAddress>) {}
}

type AuthorityAddress = 'So11111111111111111111111111111111111111112';
type DelegateAddress = 'SysvarRent111111111111111111111111111111111';
type TargetAddress = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
type MetadataAddress = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const authorityAddress = 'So11111111111111111111111111111111111111112' as Address<AuthorityAddress>;
const delegateAddress = 'SysvarRent111111111111111111111111111111111' as Address<DelegateAddress>;
const targetAddress = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' as Address<TargetAddress>;
const metadataAddress = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL' as Address<MetadataAddress>;
const authority = createNoopSigner(authorityAddress);
const metadata: ProgramDerivedAddress<MetadataAddress> = [metadataAddress, 255 as ProgramDerivedAddressBump];

test('instruction accounts accept any address-carrying value', () => {
    // Given a signer, a plain address, an address wrapper and a PDA.
    const target = new AddressWrapper(targetAddress);

    // When we build an instruction with them.
    const instruction = getInstruction12Instruction({ authority, delegate: delegateAddress, target, metadata });

    // Then the address is extracted from every kind of input and roles follow the IDL.
    expect(instruction.accounts).toStrictEqual([
        { address: authorityAddress, role: AccountRole.READONLY_SIGNER, signer: authority },
        { address: delegateAddress, role: AccountRole.READONLY },
        { address: targetAddress, role: AccountRole.WRITABLE },
        { address: metadataAddress, role: AccountRole.READONLY },
    ]);
    expectTypeOf(instruction.accounts[0]).toEqualTypeOf<
        ReadonlySignerAccount<AuthorityAddress> & AccountSignerMeta<AuthorityAddress>
    >();
    expectTypeOf(instruction.accounts[1]).toEqualTypeOf<ReadonlyAccount<DelegateAddress>>();
    expectTypeOf(instruction.accounts[2]).toEqualTypeOf<WritableAccount<TargetAddress>>();
    expectTypeOf(instruction.accounts[3]).toEqualTypeOf<ReadonlyAccount<MetadataAddress>>();

    // And the bump argument defaults to the bump seed of the PDA.
    expect(instruction.data).toStrictEqual(new Uint8Array([255]));
});

test('instruction accounts accept explicit role overrides', () => {
    // When we build an instruction with account metas overriding the roles declared by the IDL.
    const instruction = getInstruction12Instruction({
        authority: { address: authorityAddress, role: AccountRole.WRITABLE_SIGNER, signer: authority },
        delegate: { address: delegateAddress, role: AccountRole.WRITABLE },
        metadata,
        target: { address: targetAddress, role: AccountRole.READONLY },
    });

    // Then the provided roles take precedence over the IDL, at runtime and in the types.
    expect(instruction.accounts).toStrictEqual([
        { address: authorityAddress, role: AccountRole.WRITABLE_SIGNER, signer: authority },
        { address: delegateAddress, role: AccountRole.WRITABLE },
        { address: targetAddress, role: AccountRole.READONLY },
        { address: metadataAddress, role: AccountRole.READONLY },
    ]);
    expectTypeOf(instruction.accounts[0]).toEqualTypeOf<
        AccountSignerMeta<AuthorityAddress> & { readonly role: AccountRole.WRITABLE_SIGNER }
    >();
    expectTypeOf(instruction.accounts[1]).toEqualTypeOf<WritableAccount<DelegateAddress>>();
    expectTypeOf(instruction.accounts[2]).toEqualTypeOf<ReadonlyAccount<TargetAddress>>();
});

test('signers upgrade optional signer accounts but merely carry the address of non-signer accounts', () => {
    // Given signers for the optional signer account and for a non-signer account.
    const delegate = createNoopSigner(delegateAddress);
    const target = createNoopSigner(targetAddress);

    // When we build an instruction with them.
    const instruction = getInstruction12Instruction({ authority, delegate, metadata, target });

    // Then the optional signer account is upgraded to a signer meta whilst the
    // non-signer account keeps the role declared by the IDL and no signer is attached.
    expect(instruction.accounts[1]).toStrictEqual({
        address: delegateAddress,
        role: AccountRole.READONLY_SIGNER,
        signer: delegate,
    });
    expect(instruction.accounts[2]).toStrictEqual({ address: targetAddress, role: AccountRole.WRITABLE });
    expectTypeOf(instruction.accounts[1]).toEqualTypeOf<
        ReadonlySignerAccount<DelegateAddress> & AccountSignerMeta<DelegateAddress>
    >();
    expectTypeOf(instruction.accounts[2]).toEqualTypeOf<WritableAccount<TargetAddress>>();
});

test('instruction inputs keep rejecting unknown properties in object literals', () => {
    // Given an object literal misspelling an optional input.
    const build = () =>
        getInstruction12Instruction({
            authority,
            // @ts-expect-error `bmup` is not a known input — excess property checks still apply.
            bmup: 42,
            delegate: delegateAddress,
            metadata,
            target: targetAddress,
        });

    // Then the misspelled input is ignored at runtime and the misspelling is a compile error.
    expect(build().data).toStrictEqual(new Uint8Array([255]));
});

test('optional accounts resolve to the IDL-declared meta when omitted and reject misspellings', () => {
    // When we build an instruction omitting its optional account.
    const instruction = getInstruction11Instruction({ requiredAccount: targetAddress });

    // Then the account falls back to the program address at runtime and, having no
    // input to infer from, resolves to the IDL-declared meta in the types.
    expect(instruction.accounts[0]).toStrictEqual({ address: DUMMY_PROGRAM_ADDRESS, role: AccountRole.READONLY });
    expectTypeOf(instruction.accounts[0]).toEqualTypeOf<ReadonlyAccount<string>>();
    expectTypeOf(instruction.accounts[1]).toEqualTypeOf<WritableAccount<TargetAddress>>();

    // And a misspelled optional account — which would silently fall back to that
    // default at runtime — is a compile error.
    const withTypo = getInstruction11Instruction({
        // @ts-expect-error `optinalAccount` is not a known input.
        optinalAccount: delegateAddress,
        requiredAccount: targetAddress,
    });
    expect(withTypo.accounts[0].address).toBe(DUMMY_PROGRAM_ADDRESS);
});

test('instruction inputs accept wider objects and spreads carrying extra properties', () => {
    // Given an object carrying every input as well as an unrelated property.
    const context = { authority, delegate: delegateAddress, metadata, target: targetAddress, unrelated: 42 };

    // When we build instructions from the object itself and from a spread of it.
    const fromObject = getInstruction12Instruction(context);
    const fromSpread = getInstruction12Instruction({ ...context, target: new AddressWrapper(targetAddress) });

    // Then both compile — as structural typing allows outside of object literals — and
    // the inputs are still captured precisely.
    expect(fromObject.accounts[2]).toStrictEqual({ address: targetAddress, role: AccountRole.WRITABLE });
    expect(fromSpread.accounts[2]).toStrictEqual({ address: targetAddress, role: AccountRole.WRITABLE });
    expectTypeOf(fromObject.accounts[1]).toEqualTypeOf<ReadonlyAccount<DelegateAddress>>();
    expectTypeOf(fromSpread.accounts[2]).toEqualTypeOf<WritableAccount<TargetAddress>>();
});

test('the program plugin resolves instruction accounts to the metas declared by the IDL', () => {
    // Given the instruction builder exposed by the program plugin, which is not generic
    // over the provided inputs.
    const client = dummyProgram()({} as DummyPluginRequirements);

    // When we build an instruction with a signer for the optional signer account.
    const instruction = client.dummy.instructions.instruction12({
        authority,
        delegate: createNoopSigner(delegateAddress),
        metadata,
        target: targetAddress,
    });

    // Then the signer is still upgraded at runtime, but the types fall back to the IDL-declared metas.
    expect(instruction.accounts[1].role).toBe(AccountRole.READONLY_SIGNER);
    expectTypeOf(instruction.accounts[1]).toEqualTypeOf<ReadonlyAccount<string>>();
    expectTypeOf(instruction.accounts[2]).toEqualTypeOf<WritableAccount<string>>();
});

test('signer accounts reject values that cannot sign', () => {
    // Given a plain address wrapper for an account the IDL requires to sign.
    const wrapper = new AddressWrapper(authorityAddress);

    // Then the input is rejected at the type level.
    const build = () =>
        getInstruction12Instruction({
            // @ts-expect-error A signer account requires a `TransactionSigner` or an `AccountSignerMeta`.
            authority: wrapper,
            delegate: delegateAddress,
            metadata,
            target: targetAddress,
        });

    // And it fails loudly at runtime too, pointing at `createNoopSigner` as a way out.
    expect(build).toThrow(
        new SolanaError(SOLANA_ERROR__PROGRAM_CLIENTS__RESOLVED_INSTRUCTION_INPUT_MUST_BE_SIGNER, {
            inputName: 'authority',
        }),
    );
});

test('an account whose bump seed is consumed by an argument must be a PDA unless the argument is provided', () => {
    // Given a plain address wrapper for the account whose bump seed defaults the `bump` argument.
    const metadataWrapper = new AddressWrapper(metadataAddress);

    // Then omitting the bump argument fails since the bump seed cannot be recovered from the input.
    expect(() =>
        getInstruction12Instruction({
            authority,
            delegate: delegateAddress,
            metadata: metadataWrapper,
            target: targetAddress,
        }),
    ).toThrow(
        new SolanaError(SOLANA_ERROR__PROGRAM_CLIENTS__UNEXPECTED_RESOLVED_INSTRUCTION_INPUT_TYPE, {
            expectedType: 'ProgramDerivedAddress',
            inputName: 'metadata',
        }),
    );

    // But providing the bump argument explicitly lifts the requirement.
    const instruction = getInstruction12Instruction({
        authority,
        bump: 42,
        delegate: delegateAddress,
        metadata: metadataWrapper,
        target: targetAddress,
    });
    expect(instruction.accounts[3]).toStrictEqual({ address: metadataAddress, role: AccountRole.READONLY });
    expect(instruction.data).toStrictEqual(new Uint8Array([42]));
});

test('remaining accounts accept the same inputs as instruction accounts', () => {
    // Given remaining accounts provided as an address, an address wrapper, a PDA,
    // a role override and a signer, for an instruction whose remaining accounts are not signers.
    const signer = createNoopSigner(delegateAddress);
    const instruction = getInstruction2Instruction({
        remainingAccounts: [
            authorityAddress,
            new AddressWrapper(targetAddress),
            metadata,
            { address: metadataAddress, role: AccountRole.WRITABLE },
            signer,
        ],
    });

    // Then every input resolves to an account meta following the same rules as
    // instruction accounts: addresses are extracted from any input, explicit roles
    // take precedence and signers merely carry their address for non-signer accounts.
    expect(instruction.accounts).toStrictEqual([
        { address: authorityAddress, role: AccountRole.READONLY },
        { address: targetAddress, role: AccountRole.READONLY },
        { address: metadataAddress, role: AccountRole.READONLY },
        { address: metadataAddress, role: AccountRole.WRITABLE },
        { address: delegateAddress, role: AccountRole.READONLY },
    ]);
});

test('remaining accounts that may be signers are upgraded when a signer is provided', () => {
    // Given remaining accounts provided as an address and a signer, for an instruction
    // whose remaining accounts may or may not be signers.
    const signer = createNoopSigner(delegateAddress);
    const instruction = getInstruction8Instruction({ remainingAccounts: [authorityAddress, signer] });

    // Then only the signer is upgraded to a signer meta.
    expect(instruction.accounts).toStrictEqual([
        { address: authorityAddress, role: AccountRole.READONLY },
        { address: delegateAddress, role: AccountRole.READONLY_SIGNER, signer },
    ]);
});

test('remaining accounts backed by an instruction argument are derived from that argument', () => {
    // Given an instruction whose remaining accounts are backed by an array of addresses
    // encoded in the instruction data, and which has no other account.
    const instruction = getInstruction13Instruction({ addresses: [authorityAddress, targetAddress] });

    // Then the addresses are both encoded in the data and appended as remaining accounts
    // with the role declared by the IDL.
    expect(instruction.accounts).toStrictEqual([
        { address: authorityAddress, role: AccountRole.WRITABLE },
        { address: targetAddress, role: AccountRole.WRITABLE },
    ]);
    expect(instruction.data[0]).toBe(2);
});
