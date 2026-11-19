import { camelCase } from '@codama/fragments/casing';
import {
    AccountNode,
    DefinedTypeLinkNode,
    definedTypeLinkNode,
    DefinedTypeNode,
    definedTypeNode,
    InstructionNode,
    isNode,
} from '@codama/nodes';

import { getInstructionDataNode } from './instructionInputs';

/**
 * The data of an account or instruction written manually rather than generated, given by the
 * identifier of the node or by an object configuring where to import it from.
 *
 * - `name`: the identifier of the account or instruction.
 * - `importFrom`: the module the data type and codecs are imported from, `hooked` by default.
 * - `importAs`: the identifier of the data type, e.g. `counterAccountData` by default, which
 *   renders as `CounterAccountData` and `getCounterAccountDataCodec`.
 * - `extract`: whether to also render the generated data as a defined type, e.g. to build upon it.
 * - `extractAs`: the identifier of that defined type, the `importAs` one by default.
 */
export type CustomDataOptions =
    | string
    | {
          extract?: boolean;
          extractAs?: string;
          importAs?: string;
          importFrom?: string;
          name: string;
      };

/**
 * The custom data options of accounts or instructions, keyed by the camelCase name of the
 * node they apply to. Use {@link getCustomDataOptions} rather than reading the map directly,
 * so that nodes are matched regardless of the casing of their name.
 */
export type ParsedCustomDataOptions = Map<
    string,
    {
        extract: boolean;
        extractAs: string;
        importAs: string;
        importFrom: string;
        linkNode: DefinedTypeLinkNode;
    }
>;

/**
 * Finds the custom data options of an account or instruction node, if any.
 *
 * @param options - The parsed custom data options.
 * @param node - The account or instruction node, matched by the camelCase form of its identifier.
 */
export function getCustomDataOptions(
    options: ParsedCustomDataOptions,
    node: Pick<AccountNode | InstructionNode, 'identifier'>,
): ReturnType<ParsedCustomDataOptions['get']> {
    return options.get(camelCase(node.identifier));
}

/**
 * Parses the `customAccountData` or `customInstructionData` option, keyed by the camelCase
 * identifier of the node, filling in default import modules and names.
 *
 * @param customDataOptions - The option, as given by the caller.
 * @param defaultSuffix - The suffix of default data type names, e.g. `AccountData`.
 * @return The parsed options, keyed by camelCase identifier.
 */
export const parseCustomDataOptions = (
    customDataOptions: CustomDataOptions[],
    defaultSuffix: string,
): ParsedCustomDataOptions =>
    new Map(
        customDataOptions.map(o => {
            const options = typeof o === 'string' ? { name: o } : o;
            const importAs = camelCase(options.importAs ?? `${options.name}${defaultSuffix}`);
            const importFrom = options.importFrom ?? 'hooked';
            return [
                camelCase(options.name),
                {
                    extract: options.extract ?? false,
                    extractAs: options.extractAs ? camelCase(options.extractAs) : importAs,
                    importAs,
                    importFrom,
                    linkNode: definedTypeLinkNode(importAs),
                },
            ];
        }),
    );

/**
 * The defined types to render for the custom data of accounts or instructions configured with
 * `extract: true`, holding the data they would have generated.
 *
 * @param nodes - The accounts or instructions, e.g. the ones rendered as pages.
 * @param parsedCustomDataOptions - The parsed custom data options.
 * @return The defined types to render.
 */
export const getDefinedTypeNodesToExtract = (
    nodes: AccountNode[] | InstructionNode[],
    parsedCustomDataOptions: ParsedCustomDataOptions,
): DefinedTypeNode[] =>
    nodes.flatMap(node => {
        const options = getCustomDataOptions(parsedCustomDataOptions, node);
        if (!options || !options.extract) return [];

        if (isNode(node, 'accountNode')) {
            return [definedTypeNode({ identifier: options.extractAs, type: { ...node.data } })];
        }

        return [
            definedTypeNode({
                identifier: options.extractAs,
                type: getInstructionDataNode(node),
            }),
        ];
    });
