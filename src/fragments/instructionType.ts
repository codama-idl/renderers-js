import { mapFragmentContent } from '@codama/fragments';
import { InstructionNode } from '@codama/nodes';
import { getLastNodeFromPath, NodePath } from '@codama/visitors-core';

import {
    Fragment,
    fragment,
    getAccountTypeParamName,
    getGeneratedNodeModule,
    getProgramNodeFromPath,
    hasInstructionData,
    mergeFragments,
    RenderScope,
    use,
} from '../utils';
import { getInstructionAccountMetaFragment } from './instructionAccountMeta';
import { getInstructionAccountTypeParamFragment } from './instructionAccountTypeParam';

/**
 * Renders the type of an instruction, e.g. `TransferInstruction`, with one type parameter
 * per account so that its account metas reflect the values provided for them.
 *
 * @param scope - The render scope and the path of the instruction.
 * @return The fragment of the instruction type.
 */
export function getInstructionTypeFragment(
    scope: Pick<RenderScope, 'customInstructionData' | 'getImportPath' | 'isInternalNode' | 'linkables' | 'nameApi'> & {
        instructionPath: NodePath<InstructionNode>;
    },
): Fragment {
    const { instructionPath, nameApi, customInstructionData } = scope;
    const instructionNode = getLastNodeFromPath(instructionPath);
    const programNode = getProgramNodeFromPath(instructionPath);
    const hasAccounts = (instructionNode.accounts ?? []).length > 0;
    const hasData = hasInstructionData(instructionNode, customInstructionData);

    const instructionType = nameApi.instructionType(instructionNode.identifier);
    const programAddressConstant = use(
        nameApi.programAddressConstant(programNode.identifier),
        getGeneratedNodeModule('program', programNode.identifier, scope),
    );

    const accountTypeParams = mergeFragments(
        (instructionNode.accounts ?? []).map(account => getInstructionAccountTypeParamFragment(account, scope)),
        cs => (cs.length > 0 ? `${cs.join(', ')}, ` : ''),
    );

    const data = hasData
        ? fragment` & ${use('type InstructionWithData', 'solanaInstructions')}<${use('type ReadonlyUint8Array', 'solanaCodecsCore')}>`
        : undefined;

    const usesLegacyOptionalAccounts = instructionNode.optionalAccountStrategy === 'omitted';
    const accountMetasFragment = mergeFragments(
        (instructionNode.accounts ?? []).map(account =>
            mapFragmentContent(getInstructionAccountMetaFragment(account), c => {
                const typeParam = getAccountTypeParamName(account.identifier);
                const isLegacyOptional = account.isOptional && usesLegacyOptionalAccounts;
                const type = `${typeParam} extends string ? ${c} : ${typeParam}`;
                if (!isLegacyOptional) return type;
                return `...(${typeParam} extends undefined ? [] : [${type}])`;
            }),
        ),
        c => c.join(', '),
    );

    const instructionWithAccounts = use('type InstructionWithAccounts', 'solanaInstructions');
    const accounts = hasAccounts
        ? fragment` & ${instructionWithAccounts}<[${accountMetasFragment}, ...TRemainingAccounts]>`
        : fragment` & ${instructionWithAccounts}<TRemainingAccounts>`;

    return fragment`export type ${instructionType}<TProgram extends string = typeof ${programAddressConstant}, ${accountTypeParams}TRemainingAccounts extends readonly ${use('type AccountMeta', 'solanaInstructions')}<string>[] = []> =
${use('type Instruction', 'solanaInstructions')}<TProgram>${data}${accounts};`;
}
