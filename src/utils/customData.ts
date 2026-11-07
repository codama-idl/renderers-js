import {
    AccountNode,
    camelCase,
    CamelCaseString,
    DefinedTypeLinkNode,
    definedTypeLinkNode,
    DefinedTypeNode,
    definedTypeNode,
    InstructionNode,
    isNode,
} from '@codama/nodes';

import { getInstructionDataNode } from './instructionInputs';

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
    CamelCaseString,
    {
        extract: boolean;
        extractAs: CamelCaseString;
        importAs: CamelCaseString;
        importFrom: string;
        linkNode: DefinedTypeLinkNode;
    }
>;

/**
 * Finds the custom data options of an account or instruction node, if any.
 *
 * @param options - The parsed custom data options.
 * @param node - The account or instruction node, matched by the camelCase form of its name.
 */
export function getCustomDataOptions(
    options: ParsedCustomDataOptions,
    node: Pick<AccountNode | InstructionNode, 'name'>,
): ReturnType<ParsedCustomDataOptions['get']> {
    return options.get(camelCase(node.name));
}

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

export const getDefinedTypeNodesToExtract = (
    nodes: AccountNode[] | InstructionNode[],
    parsedCustomDataOptions: ParsedCustomDataOptions,
): DefinedTypeNode[] =>
    nodes.flatMap(node => {
        const options = getCustomDataOptions(parsedCustomDataOptions, node);
        if (!options || !options.extract) return [];

        if (isNode(node, 'accountNode')) {
            return [definedTypeNode({ name: options.extractAs, type: { ...node.data } })];
        }

        return [
            definedTypeNode({
                name: options.extractAs,
                type: getInstructionDataNode(node),
            }),
        ];
    });
