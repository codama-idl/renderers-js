import { CODAMA_ERROR__UNEXPECTED_NODE_KIND, CodamaError } from '@codama/errors';
import {
    AccountLinkNode,
    camelCase,
    DefinedTypeLinkNode,
    InstructionLinkNode,
    PdaLinkNode,
    ProgramLinkNode,
    ResolverValueNode,
} from '@codama/nodes';

import { ParsedCustomDataOptions } from './customData';

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

type OverridableNodes =
    | AccountLinkNode
    | DefinedTypeLinkNode
    | InstructionLinkNode
    | PdaLinkNode
    | ProgramLinkNode
    | ResolverValueNode;

export type GetImportFromFunction = (node: OverridableNodes, fallback?: string) => string;

export function getImportFromFactory(
    overrides: LinkOverrides,
    customAccountData: ParsedCustomDataOptions,
    customInstructionData: ParsedCustomDataOptions,
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

    return (node: OverridableNodes) => {
        const kind = node.kind;
        const name = camelCase(node.name);
        switch (kind) {
            case 'accountLinkNode':
                return linkOverrides.accounts[name] ?? 'generatedAccounts';
            case 'definedTypeLinkNode':
                return linkOverrides.definedTypes[name] ?? 'generatedTypes';
            case 'instructionLinkNode':
                return linkOverrides.instructions[name] ?? 'generatedInstructions';
            case 'pdaLinkNode':
                return linkOverrides.pdas[name] ?? 'generatedPdas';
            case 'programLinkNode':
                return linkOverrides.programs[name] ?? 'generatedPrograms';
            case 'resolverValueNode':
                return linkOverrides.resolvers[name] ?? 'hooked';
            default:
                throw new CodamaError(CODAMA_ERROR__UNEXPECTED_NODE_KIND, {
                    expectedKinds: [
                        'accountLinkNode',
                        'definedTypeLinkNode',
                        'instructionLinkNode',
                        'pdaLinkNode',
                        'programLinkNode',
                        'resolverValueNode',
                    ],
                    kind: kind satisfies never,
                    node,
                });
        }
    };
}

function withCamelCaseKeys(record: Record<string, string>): Record<string, string> {
    return Object.fromEntries(Object.entries(record).map(([key, value]) => [camelCase(key), value]));
}
