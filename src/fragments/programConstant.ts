import { ProgramNode } from '@codama/nodes';
import { pipe } from '@codama/visitors-core';

import { addFragmentImports, fragment, Fragment, getStringLiteral, RenderScope } from '../utils';

/**
 * Renders the constant holding the address of a program, e.g. `SPL_TOKEN_PROGRAM_ADDRESS`.
 *
 * @param scope - The render scope and the program.
 * @return The fragment of the address constant.
 */
export function getProgramConstantFragment(
    scope: Pick<RenderScope, 'nameApi'> & { programNode: ProgramNode },
): Fragment {
    const { programNode, nameApi } = scope;
    const programAddressConstant = nameApi.programAddressConstant(programNode.identifier);

    return pipe(
        fragment`export const ${programAddressConstant} = ${getStringLiteral(programNode.publicKey)} as Address<${getStringLiteral(programNode.publicKey)}>;`,
        f => addFragmentImports(f, 'solanaAddresses', ['type Address']),
    );
}
