import { CODAMA_ERROR__UNEXPECTED_NODE_KIND, CodamaError } from '@codama/errors';
import { camelCase } from '@codama/fragments/casing';
import { AccountLinkNode, DefinedTypeLinkNode, InstructionLinkNode, PdaLinkNode, ProgramLinkNode } from '@codama/nodes';

import type { ParsedCustomDataOptions } from './customData';
import type { GeneratedNodeModuleScope } from './generatedModules';
import { getGeneratedNodeModule } from './generatedModules';
import type { InstructionResolver } from './instructionInputs';
import { isInstructionResolver } from './instructionInputs';

/**
 * Maps the names of linked nodes to the module they should be imported from.
 *
 * Names are matched by their camelCase form, so that `my_account`, `myAccount` and
 * `MyAccount` all refer to the same node.
 */
export type LinkOverrides = {
    accounts?: Record<string, string>;
    definedTypes?: Record<string, string>;
    instructions?: Record<string, string>;
    pdas?: Record<string, string>;
    programs?: Record<string, string>;
    resolvers?: Record<string, string>;
};

type OverridableNodes = AccountLinkNode | DefinedTypeLinkNode | InstructionLinkNode | PdaLinkNode | ProgramLinkNode;

/** Resolves the module a linked node, or a resolver, is imported from. */
export type GetImportFromFunction = (node: InstructionResolver | OverridableNodes) => string;

/**
 * Creates the function returning the module a linked node or resolver is imported from,
 * according to the `linkOverrides` option and the custom data options. Linked nodes default
 * to their generated folder, e.g. `generatedAccounts`, and resolvers to the `hooked` folder.
 *
 * @param overrides - The `linkOverrides` option.
 * @param customAccountData - The parsed `customAccountData` option.
 * @param customInstructionData - The parsed `customInstructionData` option.
 * @param scope - The import paths of the generated output, the internal nodes, which are
 * imported from their own file, and the naming API.
 * @return The function returning the module of a linked node or resolver.
 */
export function getImportFromFactory(
    overrides: LinkOverrides,
    customAccountData: ParsedCustomDataOptions,
    customInstructionData: ParsedCustomDataOptions,
    scope: GeneratedNodeModuleScope,
): GetImportFromFunction {
    const customDataOverrides = Object.fromEntries(
        [...customAccountData.values(), ...customInstructionData.values()].map(({ importFrom, importAs }) => [
            importAs,
            importFrom,
        ]),
    );
    const linkOverrides = {
        accounts: withCamelCaseKeys(overrides.accounts ?? {}),
        definedTypes: { ...customDataOverrides, ...withCamelCaseKeys(overrides.definedTypes ?? {}) },
        instructions: withCamelCaseKeys(overrides.instructions ?? {}),
        pdas: withCamelCaseKeys(overrides.pdas ?? {}),
        programs: withCamelCaseKeys(overrides.programs ?? {}),
        resolvers: withCamelCaseKeys(overrides.resolvers ?? {}),
    };

    return (node: InstructionResolver | OverridableNodes) => {
        if (isInstructionResolver(node)) {
            return linkOverrides.resolvers[camelCase(node.name)] ?? 'hooked';
        }
        const name = camelCase(node.identifier);
        const kind = node.kind;
        switch (kind) {
            case 'accountLinkNode':
                return linkOverrides.accounts[name] ?? getGeneratedNodeModule('account', node.identifier, scope);
            case 'definedTypeLinkNode':
                return (
                    linkOverrides.definedTypes[name] ?? getGeneratedNodeModule('definedType', node.identifier, scope)
                );
            case 'instructionLinkNode':
                return (
                    linkOverrides.instructions[name] ?? getGeneratedNodeModule('instruction', node.identifier, scope)
                );
            case 'pdaLinkNode':
                return linkOverrides.pdas[name] ?? getGeneratedNodeModule('pda', node.identifier, scope);
            case 'programLinkNode':
                return linkOverrides.programs[name] ?? getGeneratedNodeModule('program', node.identifier, scope);
            default:
                throw new CodamaError(CODAMA_ERROR__UNEXPECTED_NODE_KIND, {
                    expectedKinds: [
                        'accountLinkNode',
                        'definedTypeLinkNode',
                        'instructionLinkNode',
                        'pdaLinkNode',
                        'programLinkNode',
                    ],
                    path: [node satisfies never],
                });
        }
    };
}

function withCamelCaseKeys(record: Record<string, string>): Record<string, string> {
    return Object.fromEntries(Object.entries(record).map(([key, value]) => [camelCase(key), value]));
}
