import type { AccountMeta } from '@solana/kit';

/** Resolves a data field from nothing but the program address. */
export function resolveComputed(_scope: object): number {
    return 42;
}

/** Resolves one readonly remaining account per requested signer. */
export function resolveRemainingAccounts(scope: { args: { signerCount: number } }): AccountMeta[] {
    return Array.from({ length: scope.args.signerCount }, () => ({
        address: '11111111111111111111111111111111' as AccountMeta['address'],
        role: 0,
    }));
}

/** Resolves a fee asynchronously, e.g. from an RPC call. */
export async function resolveFeeAsync(_scope: object): Promise<number> {
    return await Promise.resolve(5000);
}
