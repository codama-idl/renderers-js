import { ProgramNode, resolveNestedTypeNode } from '@codama/nodes';

import { Fragment, fragment, mergeFragments, RenderScope, use } from '../utils';
import { getDiscriminatorConditionFragment } from './discriminatorCondition';

export function getProgramAccountsFragment(
    scope: Pick<RenderScope, 'nameApi' | 'typeManifestVisitor'> & {
        programNode: ProgramNode;
    },
): Fragment | undefined {
    if (scope.programNode.accounts.length === 0) return;
    return mergeFragments(
        [getProgramAccountsEnumFragment(scope), getProgramAccountsIdentifierFunctionFragment(scope)],
        c => c.join('\n\n'),
    );
}

function getProgramAccountsEnumFragment(
    scope: Pick<RenderScope, 'nameApi'> & {
        programNode: ProgramNode;
    },
): Fragment {
    const { programNode, nameApi } = scope;
    const programAccountsEnum = nameApi.programAccountsEnum(programNode.name);
    const programAccountsEnumVariants = programNode.accounts.map(account =>
        nameApi.programAccountsEnumVariant(account.name),
    );
    return fragment`export enum ${programAccountsEnum} { ${programAccountsEnumVariants.join(', ')} }`;
}

function getProgramAccountsIdentifierFunctionFragment(
    scope: Pick<RenderScope, 'nameApi' | 'typeManifestVisitor'> & {
        programNode: ProgramNode;
    },
): Fragment | undefined {
    const { programNode, nameApi } = scope;
    const accountsWithDiscriminators = programNode.accounts.filter(
        account => (account.discriminators ?? []).length > 0,
    );
    const hasAccountDiscriminators = accountsWithDiscriminators.length > 0;
    if (!hasAccountDiscriminators) return;

    const programAccountsEnum = nameApi.programAccountsEnum(programNode.name);
    const programAccountsIdentifierFunction = nameApi.programAccountsIdentifierFunction(programNode.name);

    const discriminatorsFragment = mergeFragments(
        accountsWithDiscriminators.map((account): Fragment => {
            const variant = nameApi.programAccountsEnumVariant(account.name);
            return getDiscriminatorConditionFragment({
                ...scope,
                dataName: 'data',
                discriminators: account.discriminators ?? [],
                ifTrue: `return ${programAccountsEnum}.${variant};`,
                struct: resolveNestedTypeNode(account.data),
            });
        }),
        c => c.join('\n'),
    );

    const readonlyUint8Array = use('type ReadonlyUint8Array', 'solanaCodecsCore');
    const solanaError = use('SolanaError', 'solanaErrors');
    const solanaErrorCode = use('SOLANA_ERROR__PROGRAM_CLIENTS__FAILED_TO_IDENTIFY_ACCOUNT', 'solanaErrors');

    return fragment`export function ${programAccountsIdentifierFunction}(account: { data: ${readonlyUint8Array} } | ${readonlyUint8Array}): ${programAccountsEnum} {
    const data = 'data' in account ? account.data : account;
    ${discriminatorsFragment}
    throw new ${solanaError}(${solanaErrorCode}, { accountData: data, programName: "${programNode.name}" });
}`;
}
