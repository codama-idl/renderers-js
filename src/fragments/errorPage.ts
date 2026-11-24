import { camelCase } from '@codama/fragments/casing';
import { getTextNodeContent, ProgramNode } from '@codama/nodes';

import {
    Fragment,
    fragment,
    getDocblockFragment,
    getGeneratedNodeModule,
    getStringLiteral,
    mergeFragments,
    RenderScope,
    use,
} from '../utils';

/**
 * Renders the error page of a program: a constant per error code, the union of error codes,
 * their messages in non-production builds, and the `getXErrorMessage` and `isXError` helpers.
 *
 * @param scope - The render scope and the program.
 * @return The fragment of the error page.
 */
export function getErrorPageFragment(
    scope: Pick<RenderScope, 'getImportPath' | 'isInternalNode' | 'nameApi'> & { programNode: ProgramNode },
): Fragment {
    return mergeFragments(
        [
            getConstantsFragment(scope),
            getConstantUnionTypeFragment(scope),
            getErrorMessagesFragment(scope),
            getErrorMessageFunctionFragment(scope),
            getIsErrorFunctionFragment(scope),
        ],
        cs => cs.join('\n\n'),
    );
}

function getConstantsFragment(scope: Pick<RenderScope, 'nameApi'> & { programNode: ProgramNode }): Fragment {
    const constantPrefix = scope.nameApi.programErrorConstantPrefix(scope.programNode.identifier);
    return mergeFragments(
        [...(scope.programNode.errors ?? [])]
            .sort((a, b) => a.code - b.code)
            .map(error => {
                const docs = getDocblockFragment(error.docs, true);
                const name = constantPrefix + scope.nameApi.programErrorConstant(error.identifier);
                return fragment`${docs}export const ${name} = 0x${error.code.toString(16)}; // ${error.code}`;
            }),
        cs => cs.join('\n'),
    );
}

function getConstantUnionTypeFragment(scope: Pick<RenderScope, 'nameApi'> & { programNode: ProgramNode }): Fragment {
    const constantPrefix = scope.nameApi.programErrorConstantPrefix(scope.programNode.identifier);
    const typeName = scope.nameApi.programErrorUnion(scope.programNode.identifier);
    const errorTypes = mergeFragments(
        [...(scope.programNode.errors ?? [])]
            .sort((a, b) => camelCase(a.identifier).localeCompare(camelCase(b.identifier)))
            .map(error => fragment`typeof ${constantPrefix + scope.nameApi.programErrorConstant(error.identifier)}`),
        cs => cs.join(' | '),
    );

    return fragment`export type ${typeName} = ${errorTypes};`;
}

function getErrorMessagesFragment(scope: Pick<RenderScope, 'nameApi'> & { programNode: ProgramNode }): Fragment {
    const mapName = scope.nameApi.programErrorMessagesMap(scope.programNode.identifier);
    const errorUnionType = scope.nameApi.programErrorUnion(scope.programNode.identifier);
    const constantPrefix = scope.nameApi.programErrorConstantPrefix(scope.programNode.identifier);
    const messageEntries = mergeFragments(
        [...(scope.programNode.errors ?? [])]
            .sort((a, b) => camelCase(a.identifier).localeCompare(camelCase(b.identifier)))
            .map(error => {
                const constantName = constantPrefix + scope.nameApi.programErrorConstant(error.identifier);
                return fragment`[${constantName}]: ${getStringLiteral(getTextNodeContent(error.message))}`;
            }),
        cs => cs.join(', '),
    );

    return fragment`let ${mapName}: Record<${errorUnionType}, string> | undefined;
if (process.env['NODE_ENV'] !== 'production') {
  ${mapName} = { ${messageEntries} };
}`;
}

function getErrorMessageFunctionFragment(scope: Pick<RenderScope, 'nameApi'> & { programNode: ProgramNode }): Fragment {
    const functionName = scope.nameApi.programGetErrorMessageFunction(scope.programNode.identifier);
    const errorUnionType = scope.nameApi.programErrorUnion(scope.programNode.identifier);
    const messageMapName = scope.nameApi.programErrorMessagesMap(scope.programNode.identifier);

    return fragment`export function ${functionName}(code: ${errorUnionType}): string {
  if (process.env['NODE_ENV'] !== 'production') {
    return (${messageMapName} as Record<${errorUnionType}, string>)[code];
  }

  return 'Error message not available in production bundles.';
}`;
}

function getIsErrorFunctionFragment(
    scope: Pick<RenderScope, 'getImportPath' | 'isInternalNode' | 'nameApi'> & { programNode: ProgramNode },
): Fragment {
    const { programNode, nameApi } = scope;
    const programAddressConstant = use(
        nameApi.programAddressConstant(programNode.identifier),
        getGeneratedNodeModule('program', programNode.identifier, scope),
    );
    const functionName = nameApi.programIsErrorFunction(programNode.identifier);
    const programErrorUnion = nameApi.programErrorUnion(programNode.identifier);
    const addressType = use('type Address', 'solanaAddresses');
    const hasAddressType = use('type HasAddress', 'solanaAddresses');

    return fragment`export function ${functionName}<TProgramErrorCode extends ${programErrorUnion}>(
    error: unknown,
    transactionMessage: { instructions: Record<number, { programAddress: ${addressType} }> },
    code?: TProgramErrorCode,
    config: { programAddress?: ${addressType} | ${hasAddressType} } = {},
): error is ${use('type SolanaError', 'solanaErrors')}<typeof ${use('type SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM', 'solanaErrors')}> & Readonly<{ context: Readonly<{ code: TProgramErrorCode }> }> {
  const programAddressInput = config.programAddress ?? ${programAddressConstant};
  const programAddress = typeof programAddressInput === 'string' ? programAddressInput : programAddressInput.address;
  return ${use('isProgramError', 'solanaPrograms')}<TProgramErrorCode>(error, transactionMessage, programAddress, code);
}`;
}
