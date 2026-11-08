import { CODAMA_ERROR__UNRECOGNIZED_BYTES_ENCODING, CodamaError } from '@codama/errors';
import {
    camelCase,
    CamelCaseString,
    ConstantValueNode,
    CountNode,
    isNode,
    isNodeFilter,
    isScalarEnum,
    NumberTypeNode,
    PostOffsetTypeNode,
    PreOffsetTypeNode,
    REGISTERED_TYPE_NODE_KINDS,
    REGISTERED_VALUE_NODE_KINDS,
    RegisteredTypeNode,
    RegisteredValueNode,
    structFieldTypeNode,
    structTypeNode,
    TypeNode,
} from '@codama/nodes';
import { mapFragmentContent, setFragmentContent } from '@codama/renderers-core';
import {
    extendVisitor,
    findLastNodeFromPath,
    LinkableDictionary,
    NodeStack,
    pipe,
    recordNodeStackVisitor,
    staticVisitor,
    visit,
    type Visitor,
} from '@codama/visitors-core';

import { getConstantDiscriminatorName, getEventDiscriminatorPrefix } from '../fragments/discriminatorConstants';
import {
    addFragmentImports,
    Fragment,
    fragment,
    getBytesFromBytesValueNode,
    getCustomDataOptions,
    getDocblockFragment,
    getEnumBody,
    getEnumVariantDiscriminators,
    getInnerTypeNode,
    getInstructionDataNode,
    hasCustomEnumVariantDiscriminators,
    type GetImportFromFunction,
    isBigNumberFormat,
    isDefaultNumberType,
    mergeFragments,
    mergeTypeManifests,
    type NameApi,
    type ParsedCustomDataOptions,
    type TypeManifest,
    typeManifest,
    use,
} from '../utils';

export type TypeManifestVisitor = ReturnType<typeof getTypeManifestVisitor>;

export function getTypeManifestVisitor(input: {
    customAccountData: ParsedCustomDataOptions;
    customInstructionData: ParsedCustomDataOptions;
    erasableSyntax?: boolean;
    getImportFrom: GetImportFromFunction;
    linkables: LinkableDictionary;
    nameApi: NameApi;
    nonScalarEnums: CamelCaseString[];
    stack?: NodeStack;
}): Visitor<
    TypeManifest,
    | RegisteredTypeNode['kind']
    | RegisteredValueNode['kind']
    | 'accountNode'
    | 'definedTypeLinkNode'
    | 'definedTypeNode'
    | 'eventNode'
    | 'instructionNode'
> {
    const {
        nameApi,
        linkables,
        nonScalarEnums,
        customAccountData,
        customInstructionData,
        getImportFrom,
        erasableSyntax = false,
    } = input;
    const stack = input.stack ?? new NodeStack();
    let parentName: { loose: string; strict: string } | null = null;

    /**
     * Finds the name of the discriminator constant matching the provided constant value,
     * when visited inside an event whose constant discriminators include it — so codecs
     * and conditions can render `MY_EVENT_DISCRIMINATOR` instead of inline bytes.
     */
    const getEventDiscriminatorConstantName = (constant: ConstantValueNode): string | null => {
        const eventNode = findLastNodeFromPath(stack.getPath(), 'eventNode');
        if (!eventNode) return null;
        const constantDiscriminators = (eventNode.discriminators ?? []).filter(
            isNodeFilter('constantDiscriminatorNode'),
        );
        const serializedConstant = JSON.stringify(constant);
        const index = constantDiscriminators.findIndex(
            discriminator => JSON.stringify(discriminator.constant) === serializedConstant,
        );
        if (index < 0) return null;
        const prefix = getEventDiscriminatorPrefix(nameApi, eventNode.name);
        return nameApi.constant(getConstantDiscriminatorName(prefix, index));
    };

    /**
     * Renders a variant of a discriminated union from its name and its data, if any.
     *
     * A struct data is spread into the variant object alongside the discriminator
     * attribute, whereas any other data is exposed under a `fields` attribute.
     */
    const renderEnumVariant = (
        variant: { data: TypeNode | undefined; name: string },
        self: Visitor<TypeManifest, TypeNode['kind']>,
    ): TypeManifest => {
        const currentParentName = parentName;
        const discriminator = nameApi.discriminatedUnionDiscriminator(camelCase(currentParentName?.strict ?? ''));
        const name = nameApi.discriminatedUnionVariant(variant.name);
        const kindAttribute = `${discriminator}: "${name}"`;

        if (variant.data === undefined) {
            return typeManifest({
                decoder: fragment`['${name}', ${use('getUnitDecoder', 'solanaCodecsDataStructures')}()]`,
                encoder: fragment`['${name}', ${use('getUnitEncoder', 'solanaCodecsDataStructures')}()]`,
                looseType: fragment`{ ${kindAttribute} }`,
                strictType: fragment`{ ${kindAttribute} }`,
            });
        }

        const struct = isNode(variant.data, 'structTypeNode')
            ? variant.data
            : structTypeNode([structFieldTypeNode({ name: 'fields', type: variant.data })]);

        parentName = null;
        const structManifest = visit(struct, self);
        parentName = currentParentName;

        return typeManifest({
            ...structManifest,
            decoder: fragment`['${name}', ${structManifest.decoder}]`,
            encoder: fragment`['${name}', ${structManifest.encoder}]`,
            looseType: pipe(structManifest.looseType, f =>
                mapFragmentContent(f, c => `{ ${kindAttribute},${c.slice(1, -1)}}`),
            ),
            strictType: pipe(structManifest.strictType, f =>
                mapFragmentContent(f, c => `{ ${kindAttribute},${c.slice(1, -1)}}`),
            ),
        });
    };

    return pipe(
        staticVisitor(() => typeManifest(), {
            keys: [
                ...REGISTERED_TYPE_NODE_KINDS,
                ...REGISTERED_VALUE_NODE_KINDS,
                'definedTypeLinkNode',
                'definedTypeNode',
                'accountNode',
                'eventNode',
                'instructionNode',
            ],
        }),
        visitor =>
            extendVisitor(visitor, {
                visitAccount(account, { self }) {
                    parentName = {
                        loose: nameApi.dataArgsType(account.name),
                        strict: nameApi.dataType(account.name),
                    };
                    const link = getCustomDataOptions(customAccountData, account)?.linkNode;
                    const manifest = link ? visit(link, self) : visit(account.data, self);
                    parentName = null;
                    return manifest;
                },

                visitAmountType(amountType, { self }) {
                    return visit(amountType.number, self);
                },

                visitArrayType(arrayType, { self }) {
                    const childManifest = visit(arrayType.item, self);
                    const sizeManifest = getArrayLikeSizeOption(arrayType.count, self);
                    const encoderOptions = sizeManifest.encoder ? fragment`, { ${sizeManifest.encoder} }` : '';
                    const decoderOptions = sizeManifest.decoder ? fragment`, { ${sizeManifest.decoder} }` : '';

                    return typeManifest({
                        ...childManifest,
                        decoder: fragment`${use('getArrayDecoder', 'solanaCodecsDataStructures')}(${childManifest.decoder}${decoderOptions})`,
                        encoder: fragment`${use('getArrayEncoder', 'solanaCodecsDataStructures')}(${childManifest.encoder}${encoderOptions})`,
                        looseType: fragment`Array<${childManifest.looseType}>`,
                        strictType: fragment`Array<${childManifest.strictType}>`,
                    });
                },

                visitArrayValue(node, { self }) {
                    return mergeTypeManifests(
                        (node.items ?? []).map(v => visit(v, self)),
                        { mergeValues: renders => `[${renders.join(', ')}]` },
                    );
                },

                visitBooleanType(booleanType, { self }) {
                    let sizeEncoder = fragment``;
                    let sizeDecoder = fragment``;
                    if (!isDefaultNumberType(getInnerTypeNode(booleanType.size), 'u8')) {
                        const size = visit(booleanType.size, self);
                        sizeEncoder = fragment`{ size: ${size.encoder} }`;
                        sizeDecoder = fragment`{ size: ${size.decoder} }`;
                    }

                    return typeManifest({
                        decoder: fragment`${use('getBooleanDecoder', 'solanaCodecsDataStructures')}(${sizeDecoder})`,
                        encoder: fragment`${use('getBooleanEncoder', 'solanaCodecsDataStructures')}(${sizeEncoder})`,
                        looseType: fragment`boolean`,
                        strictType: fragment`boolean`,
                    });
                },

                visitBooleanValue(node) {
                    return typeManifest({ value: fragment`${JSON.stringify(node.boolean)}` });
                },

                visitBytesType() {
                    const readonlyUint8Array = use('type ReadonlyUint8Array', 'solanaCodecsCore');
                    return typeManifest({
                        decoder: fragment`${use('getBytesDecoder', 'solanaCodecsDataStructures')}()`,
                        encoder: fragment`${use('getBytesEncoder', 'solanaCodecsDataStructures')}()`,
                        looseType: readonlyUint8Array,
                        strictType: readonlyUint8Array,
                    });
                },

                visitBytesValue(node) {
                    const bytes = getBytesFromBytesValueNode(node);
                    return typeManifest({ value: fragment`new Uint8Array([${Array.from(bytes).join(', ')}])` });
                },

                visitConstantValue(node, { self }) {
                    const discriminatorConstantName = getEventDiscriminatorConstantName(node);
                    if (discriminatorConstantName) {
                        return typeManifest({ value: fragment`${discriminatorConstantName}` });
                    }
                    if (isNode(node.type, 'bytesTypeNode') && isNode(node.value, 'bytesValueNode')) {
                        return visit(node.value, self);
                    }
                    return typeManifest({
                        value: fragment`${visit(node.type, self).encoder}.encode(${visit(node.value, self).value})`,
                    });
                },

                visitDateTimeType(dateTimeType, { self }) {
                    return visit(dateTimeType.number, self);
                },

                visitDefinedType(definedType, { self }) {
                    parentName = {
                        loose: nameApi.dataArgsType(definedType.name),
                        strict: nameApi.dataType(definedType.name),
                    };
                    const manifest = visit(definedType.type, self);
                    parentName = null;
                    return manifest;
                },

                visitDefinedTypeLink(node) {
                    const strictName = nameApi.dataType(node.name);
                    const looseName = nameApi.dataArgsType(node.name);
                    const encoderFunction = nameApi.encoderFunction(node.name);
                    const decoderFunction = nameApi.decoderFunction(node.name);
                    const importFrom = getImportFrom(node);

                    return typeManifest({
                        decoder: fragment`${use(decoderFunction, importFrom)}()`,
                        encoder: fragment`${use(encoderFunction, importFrom)}()`,
                        looseType: use(`type ${looseName}`, importFrom),
                        strictType: use(`type ${strictName}`, importFrom),
                    });
                },

                visitEnumEmptyVariantType(enumEmptyVariantType, { self }) {
                    return renderEnumVariant({ data: undefined, name: enumEmptyVariantType.name }, self);
                },

                visitEnumStructVariantType(enumStructVariantType, { self }) {
                    return renderEnumVariant(
                        { data: enumStructVariantType.struct, name: enumStructVariantType.name },
                        self,
                    );
                },

                visitEnumTupleVariantType(enumTupleVariantType, { self }) {
                    return renderEnumVariant(
                        { data: enumTupleVariantType.tuple, name: enumTupleVariantType.name },
                        self,
                    );
                },

                visitEnumType(enumType, { self }) {
                    const currentParentName = parentName;
                    const encoderOptions: Fragment[] = [];
                    const decoderOptions: Fragment[] = [];
                    const variants = enumType.variants ?? [];
                    const hasCustomDiscriminators = hasCustomEnumVariantDiscriminators(variants);
                    const discriminators = getEnumVariantDiscriminators(variants);

                    const hasDefaultSize = isDefaultNumberType(getInnerTypeNode(enumType.size), 'u8');
                    if (hasCustomDiscriminators && !isScalarEnum(enumType)) {
                        // The discriminated union codec writes the position of the variant as its
                        // prefix, so the prefix codec maps that position to the custom discriminator.
                        const sizeManifest = visit(enumType.size, self);
                        const values = `[${discriminators.join(', ')}]`;
                        encoderOptions.push(
                            fragment`size: ${use('transformEncoder', 'solanaCodecsCore')}(${sizeManifest.encoder}, (index: bigint | number) => ${values}[Number(index)]!)`,
                        );
                        decoderOptions.push(
                            fragment`size: ${use('transformDecoder', 'solanaCodecsCore')}(${sizeManifest.decoder}, (value: bigint | number) => ${values}.indexOf(Number(value)))`,
                        );
                    } else if (!hasDefaultSize) {
                        const sizeManifest = visit(enumType.size, self);
                        encoderOptions.push(fragment`size: ${sizeManifest.encoder}`);
                        decoderOptions.push(fragment`size: ${sizeManifest.decoder}`);
                    }
                    if (hasCustomDiscriminators && isScalarEnum(enumType)) {
                        encoderOptions.push(fragment`useValuesAsDiscriminators: true`);
                        decoderOptions.push(fragment`useValuesAsDiscriminators: true`);
                    }

                    const discriminator = nameApi.discriminatedUnionDiscriminator(
                        camelCase(currentParentName?.strict ?? ''),
                    );
                    if (!isScalarEnum(enumType) && discriminator !== '__kind') {
                        encoderOptions.push(fragment`discriminator: '${discriminator}'`);
                        decoderOptions.push(fragment`discriminator: '${discriminator}'`);
                    }

                    const encoderOptionsFragment = mergeFragments(encoderOptions, cs =>
                        cs.length > 0 ? `, { ${cs.join(', ')} }` : '',
                    );
                    const decoderOptionsFragment = mergeFragments(decoderOptions, cs =>
                        cs.length > 0 ? `, { ${cs.join(', ')} }` : '',
                    );

                    if (isScalarEnum(enumType)) {
                        if (currentParentName === null) {
                            throw new Error(
                                'Scalar enums cannot be inlined and must be introduced ' +
                                    'via a defined type. Ensure you are not inlining a ' +
                                    'defined type that is a scalar enum through a visitor.',
                            );
                        }
                        const variantNames = variants.map(({ name }) => nameApi.enumVariant(name));
                        const body = getEnumBody(
                            variantNames,
                            erasableSyntax,
                            hasCustomDiscriminators ? discriminators : undefined,
                        );
                        // Reverse mappings would widen the decoder output type. The encoder
                        // can safely accept the wider input type, so only narrow the decoder.
                        const decoderConstructor = erasableSyntax
                            ? fragment`${currentParentName.strict} as Omit<typeof ${currentParentName.strict}, number>`
                            : fragment`${currentParentName.strict}`;
                        return typeManifest({
                            decoder: fragment`${use('getEnumDecoder', 'solanaCodecsDataStructures')}(${decoderConstructor}${decoderOptionsFragment})`,
                            encoder: fragment`${use('getEnumEncoder', 'solanaCodecsDataStructures')}(${currentParentName.strict}${encoderOptionsFragment})`,
                            isEnum: true,
                            looseType: fragment`{ ${body} }`,
                            strictType: fragment`{ ${body} }`,
                        });
                    }

                    const mergedManifest = mergeTypeManifests(
                        (enumType.variants ?? []).map(variant => visit(variant, self)),
                        {
                            mergeCodecs: renders => renders.join(', '),
                            mergeTypes: renders => renders.join(' | '),
                        },
                    );

                    return typeManifest({
                        ...mergedManifest,
                        decoder: fragment`${use('getDiscriminatedUnionDecoder', 'solanaCodecsDataStructures')}([${mergedManifest.decoder}]${decoderOptionsFragment})`,
                        encoder: fragment`${use('getDiscriminatedUnionEncoder', 'solanaCodecsDataStructures')}([${mergedManifest.encoder}]${encoderOptionsFragment})`,
                    });
                },

                visitEnumValue(node, { self }) {
                    const manifest = typeManifest();
                    const enumName = nameApi.dataType(node.enum.name);
                    const enumFunction = nameApi.discriminatedUnionFunction(node.enum.name);
                    const importFrom = getImportFrom(node.enum);

                    const enumNode = linkables.get([...stack.getPath(), node.enum])?.type;
                    const isScalar =
                        enumNode && isNode(enumNode, 'enumTypeNode')
                            ? isScalarEnum(enumNode)
                            : !nonScalarEnums.includes(camelCase(node.enum.name));

                    if (!node.value && isScalar) {
                        const variantName = nameApi.enumVariant(node.variant);
                        return typeManifest({
                            ...manifest,
                            value: pipe(
                                manifest.value,
                                f => setFragmentContent(f, `${enumName}.${variantName}`),
                                f => addFragmentImports(f, importFrom, [enumName]),
                            ),
                        });
                    }

                    const variantName = nameApi.discriminatedUnionVariant(node.variant);
                    if (!node.value) {
                        return typeManifest({
                            ...manifest,
                            value: pipe(
                                manifest.value,
                                f => setFragmentContent(f, `${enumFunction}('${variantName}')`),
                                f => addFragmentImports(f, importFrom, [enumFunction]),
                            ),
                        });
                    }

                    return typeManifest({
                        ...manifest,
                        value: pipe(
                            visit(node.value, self).value,
                            f => mapFragmentContent(f, c => `${enumFunction}('${variantName}', ${c})`),
                            f => addFragmentImports(f, importFrom, [enumFunction]),
                        ),
                    });
                },

                visitEvent(event, { self }) {
                    const eventDataName = nameApi.eventDataType(event.name);
                    parentName = {
                        loose: nameApi.dataArgsType(eventDataName),
                        strict: nameApi.dataType(eventDataName),
                    };
                    const manifest = visit(event.data, self);
                    parentName = null;
                    return manifest;
                },

                visitFixedSizeType(node, { self }) {
                    return applyFixedSize(visit(node.type, self), node.size);
                },

                visitHiddenPrefixType(node, { self }) {
                    return applyHiddenPrefix(
                        visit(node.type, self),
                        (node.prefix ?? []).map(c => visit(c, self).value),
                    );
                },

                visitHiddenSuffixType(node, { self }) {
                    return applyHiddenSuffix(
                        visit(node.type, self),
                        (node.suffix ?? []).map(c => visit(c, self).value),
                    );
                },

                visitInstruction(instruction, { self }) {
                    const instructionDataName = nameApi.instructionDataType(instruction.name);
                    parentName = {
                        loose: nameApi.dataArgsType(instructionDataName),
                        strict: nameApi.dataType(instructionDataName),
                    };
                    const link = getCustomDataOptions(customInstructionData, instruction)?.linkNode;
                    const manifest = link ? visit(link, self) : visit(getInstructionDataNode(instruction), self);
                    parentName = null;
                    return manifest;
                },

                visitMapEntryValue(node, { self }) {
                    return mergeTypeManifests([visit(node.key, self), visit(node.value, self)], {
                        mergeValues: renders => `[${renders.join(', ')}]`,
                    });
                },

                visitMapType(mapType, { self }) {
                    const key = visit(mapType.key, self);
                    const value = visit(mapType.value, self);
                    const mergedManifest = mergeTypeManifests([key, value], {
                        mergeCodecs: ([k, v]) => `${k}, ${v}`,
                        mergeTypes: ([k, v]) => `Map<${k}, ${v}>`,
                    });
                    const sizeManifest = getArrayLikeSizeOption(mapType.count, self);
                    const encoderOptions = sizeManifest.encoder ? fragment`, { ${sizeManifest.encoder} }` : '';
                    const decoderOptions = sizeManifest.decoder ? fragment`, { ${sizeManifest.decoder} }` : '';

                    return typeManifest({
                        ...mergedManifest,
                        decoder: fragment`${use('getMapDecoder', 'solanaCodecsDataStructures')}(${mergedManifest.decoder}${decoderOptions})`,
                        encoder: fragment`${use('getMapEncoder', 'solanaCodecsDataStructures')}(${mergedManifest.encoder}${encoderOptions})`,
                    });
                },

                visitMapValue(node, { self }) {
                    const entryFragments = (node.entries ?? []).map(entry => visit(entry, self));
                    return mergeTypeManifests(entryFragments, {
                        mergeValues: renders => `new Map([${renders.join(', ')}])`,
                    });
                },

                visitNoneValue() {
                    return typeManifest({
                        value: fragment`${use('none', 'solanaOptions')}()`,
                    });
                },

                visitNumberType(numberType) {
                    return renderNumberType(numberType.format, numberType.endian, nameApi);
                },

                visitNumberValue(node) {
                    return renderNumberValue(node.number);
                },

                visitOptionType(optionType, { self }) {
                    const childManifest = visit(optionType.item, self);
                    const encoderOptions: Fragment[] = [];
                    const decoderOptions: Fragment[] = [];

                    // Prefix option.
                    if (!isDefaultNumberType(getInnerTypeNode(optionType.prefix), 'u8')) {
                        const prefixManifest = visit(optionType.prefix, self);
                        encoderOptions.push(fragment`prefix: ${prefixManifest.encoder}`);
                        decoderOptions.push(fragment`prefix: ${prefixManifest.decoder}`);
                    }

                    // Fixed option.
                    if (optionType.fixed) {
                        encoderOptions.push(fragment`noneValue: "zeroes"`);
                        decoderOptions.push(fragment`noneValue: "zeroes"`);
                    }

                    const encoderOptionsFragment = mergeFragments(encoderOptions, cs =>
                        cs.length > 0 ? `, { ${cs.join(', ')} }` : '',
                    );
                    const decoderOptionsFragment = mergeFragments(decoderOptions, cs =>
                        cs.length > 0 ? `, { ${cs.join(', ')} }` : '',
                    );

                    return typeManifest({
                        ...childManifest,
                        decoder: fragment`${use('getOptionDecoder', 'solanaOptions')}(${childManifest.decoder}${decoderOptionsFragment})`,
                        encoder: fragment`${use('getOptionEncoder', 'solanaOptions')}(${childManifest.encoder}${encoderOptionsFragment})`,
                        looseType: fragment`${use('type OptionOrNullable', 'solanaOptions')}<${childManifest.looseType}>`,
                        strictType: fragment`${use('type Option', 'solanaOptions')}<${childManifest.strictType}>`,
                    });
                },

                visitPostOffsetType(node, { self }) {
                    return applyPostOffset(visit(node.type, self), node.offset, node.strategy);
                },

                visitPreOffsetType(node, { self }) {
                    return applyPreOffset(visit(node.type, self), node.offset, node.strategy);
                },

                visitPublicKeyType() {
                    const addressType = use('type Address', 'solanaAddresses');
                    const looseType = fragment`${addressType} | ${use('type HasAddress', 'solanaAddresses')}`;
                    return typeManifest({
                        decoder: fragment`${use('getAddressDecoder', 'solanaAddresses')}()`,
                        encoder: fragment`${use('getAddressEncoder', 'solanaAddresses')}()`,
                        looseType,
                        strictType: addressType,
                    });
                },

                visitPublicKeyValue(node) {
                    return typeManifest({
                        value: fragment`${use('address', 'solanaAddresses')}("${node.publicKey}")`,
                    });
                },

                visitRemainderOptionType(node, { self }) {
                    const childManifest = visit(node.item, self);
                    const encoderOptions: string[] = ['prefix: null'];
                    const decoderOptions: string[] = ['prefix: null'];

                    const encoderOptionsAsString =
                        encoderOptions.length > 0 ? `, { ${encoderOptions.join(', ')} }` : '';
                    const decoderOptionsAsString =
                        decoderOptions.length > 0 ? `, { ${decoderOptions.join(', ')} }` : '';

                    return typeManifest({
                        ...childManifest,
                        decoder: fragment`${use('getOptionDecoder', 'solanaOptions')}(${childManifest.decoder}${decoderOptionsAsString})`,
                        encoder: fragment`${use('getOptionEncoder', 'solanaOptions')}(${childManifest.encoder}${encoderOptionsAsString})`,
                        looseType: fragment`${use('type OptionOrNullable', 'solanaOptions')}<${childManifest.looseType}>`,
                        strictType: fragment`${use('type Option', 'solanaOptions')}<${childManifest.strictType}>`,
                    });
                },

                visitSentinelType(node, { self }) {
                    return applySentinel(visit(node.type, self), visit(node.sentinel, self).value);
                },

                visitSetType(setType, { self }) {
                    const childManifest = visit(setType.item, self);
                    const sizeManifest = getArrayLikeSizeOption(setType.count, self);
                    const encoderOptions = sizeManifest.encoder ? fragment`, { ${sizeManifest.encoder} }` : '';
                    const decoderOptions = sizeManifest.decoder ? fragment`, { ${sizeManifest.decoder} }` : '';

                    return typeManifest({
                        ...childManifest,
                        decoder: fragment`${use('getSetDecoder', 'solanaCodecsDataStructures')}(${childManifest.decoder}${decoderOptions})`,
                        encoder: fragment`${use('getSetEncoder', 'solanaCodecsDataStructures')}(${childManifest.encoder}${encoderOptions})`,
                        looseType: fragment`Set<${childManifest.looseType}>`,
                        strictType: fragment`Set<${childManifest.strictType}>`,
                    });
                },

                visitSetValue(node, { self }) {
                    return mergeTypeManifests(
                        (node.items ?? []).map(v => visit(v, self)),
                        { mergeValues: renders => `new Set([${renders.join(', ')}])` },
                    );
                },

                visitSizePrefixType(node, { self }) {
                    return applySizePrefix(visit(node.type, self), visit(node.prefix, self));
                },

                visitSolAmountType({ number }, { self }) {
                    return applyLamports(visit(number, self));
                },

                visitSomeValue(node, { self }) {
                    const innerValue = visit(node.value, self).value;
                    return typeManifest({
                        value: fragment`${use('some', 'solanaOptions')}(${innerValue})`,
                    });
                },

                visitStringType(stringType) {
                    const [encoder, decoder] = (() => {
                        switch (stringType.encoding) {
                            case 'base16':
                                return ['getBase16Encoder', 'getBase16Decoder'];
                            case 'base58':
                                return ['getBase58Encoder', 'getBase58Decoder'];
                            case 'base64':
                                return ['getBase64Encoder', 'getBase64Decoder'];
                            case 'utf8':
                                return ['getUtf8Encoder', 'getUtf8Decoder'];
                            default:
                                throw new CodamaError(CODAMA_ERROR__UNRECOGNIZED_BYTES_ENCODING, {
                                    encoding: stringType.encoding satisfies never,
                                });
                        }
                    })();

                    return typeManifest({
                        decoder: fragment`${use(decoder, 'solanaCodecsStrings')}()`,
                        encoder: fragment`${use(encoder, 'solanaCodecsStrings')}()`,
                        looseType: fragment`string`,
                        strictType: fragment`string`,
                    });
                },

                visitStringValue(node) {
                    return typeManifest({
                        value: fragment`${JSON.stringify(node.string)}`,
                    });
                },

                visitStructFieldType(structFieldType, { self }) {
                    const name = camelCase(structFieldType.name);
                    const originalChildManifest = visit(structFieldType.type, self);
                    let docs = getDocblockFragment(structFieldType.docs, true);
                    docs = docs ? fragment`\n${docs}` : docs;
                    const childManifest = typeManifest({
                        ...originalChildManifest,
                        decoder: fragment`['${name}', ${originalChildManifest.decoder}]`,
                        encoder: fragment`['${name}', ${originalChildManifest.encoder}]`,
                        looseType: fragment`${docs}${name}: ${originalChildManifest.looseType}; `,
                        strictType: fragment`${docs}${name}: ${originalChildManifest.strictType}; `,
                    });

                    // No default value.
                    if (!structFieldType.defaultValue) {
                        return childManifest;
                    }

                    // Optional default value.
                    if (structFieldType.defaultValueStrategy !== 'omitted') {
                        return typeManifest({
                            ...childManifest,
                            looseType: fragment`${docs}${name}?: ${originalChildManifest.looseType}; `,
                        });
                    }

                    // Omitted default value.
                    return typeManifest({ ...childManifest, looseType: fragment`` });
                },

                visitStructFieldValue(node, { self }) {
                    const innerValue = visit(node.value, self).value;
                    return typeManifest({
                        value: fragment`${camelCase(node.name)}: ${innerValue}`,
                    });
                },

                visitStructType(structType, { self }) {
                    const optionalFields = (structType.fields ?? []).filter(f => !!f.defaultValue);

                    const mergedManifest = pipe(
                        mergeTypeManifests(
                            (structType.fields ?? []).map(field => visit(field, self)),
                            {
                                mergeCodecs: renders => `([${renders.join(', ')}])`,
                                mergeTypes: renders => `{ ${renders.join('')} }`,
                            },
                        ),
                        manifest =>
                            typeManifest({
                                ...manifest,
                                decoder: fragment`${use('getStructDecoder', 'solanaCodecsDataStructures')}${manifest.decoder}`,
                                encoder: fragment`${use('getStructEncoder', 'solanaCodecsDataStructures')}${manifest.encoder}`,
                            }),
                    );

                    if (optionalFields.length === 0) {
                        return mergedManifest;
                    }

                    // Check if we are inside an instruction, account or event to use discriminator constants when available.
                    const parentPath = stack.getPath();
                    const instructionNode = findLastNodeFromPath(parentPath, 'instructionNode');
                    const accountNode = findLastNodeFromPath(parentPath, 'accountNode');
                    const eventNode = findLastNodeFromPath(parentPath, 'eventNode');
                    const discriminatorParent = instructionNode ?? accountNode ?? eventNode;
                    const discriminatorPrefix =
                        discriminatorParent && isNode(discriminatorParent, 'eventNode')
                            ? getEventDiscriminatorPrefix(nameApi, discriminatorParent.name)
                            : discriminatorParent?.name;
                    const discriminators = discriminatorParent?.discriminators ?? [];
                    const fieldDiscriminators = discriminators.filter(isNodeFilter('fieldDiscriminatorNode'));

                    const defaultValues = mergeFragments(
                        optionalFields.map((f): Fragment => {
                            const key = camelCase(f.name);

                            // If the field has an associated discriminator node, use the constant value instead.
                            if (fieldDiscriminators.some(d => camelCase(d.name) === camelCase(f.name))) {
                                const constantName = nameApi.constant(camelCase(`${discriminatorPrefix}_${f.name}`));
                                return f.defaultValueStrategy === 'omitted'
                                    ? fragment`${key}: ${constantName}`
                                    : fragment`${key}: value.${key} ?? ${constantName}`;
                            }

                            const defaultValue = f.defaultValue as NonNullable<typeof f.defaultValue>;
                            const value = visit(defaultValue, self).value;
                            return f.defaultValueStrategy === 'omitted'
                                ? fragment`${key}: ${value}`
                                : fragment`${key}: value.${key} ?? ${value}`;
                        }),
                        cs => cs.join(', '),
                    );

                    return typeManifest({
                        ...mergedManifest,
                        encoder: fragment`${use('transformEncoder', 'solanaCodecsCore')}(${mergedManifest.encoder}, (value) => ({ ...value, ${defaultValues} }))`,
                    });
                },

                visitStructValue(node, { self }) {
                    return mergeTypeManifests(
                        (node.fields ?? []).map(field => visit(field, self)),
                        { mergeValues: renders => `{ ${renders.join(', ')} }` },
                    );
                },

                visitTupleType(tupleType, { self }) {
                    const items = (tupleType.items ?? []).map(item => visit(item, self));
                    const mergedManifest = mergeTypeManifests(items, {
                        mergeCodecs: codecs => `[${codecs.join(', ')}]`,
                        mergeTypes: types => `readonly [${types.join(', ')}]`,
                    });

                    return typeManifest({
                        ...mergedManifest,
                        decoder: fragment`${use('getTupleDecoder', 'solanaCodecsDataStructures')}(${mergedManifest.decoder})`,
                        encoder: fragment`${use('getTupleEncoder', 'solanaCodecsDataStructures')}(${mergedManifest.encoder})`,
                    });
                },

                visitTupleValue(node, { self }) {
                    return mergeTypeManifests(
                        (node.items ?? []).map(v => visit(v, self)),
                        { mergeValues: renders => `[${renders.join(', ')}]` },
                    );
                },

                visitZeroableOptionType(node, { self }) {
                    const childManifest = visit(node.item, self);
                    const encoderOptions: Fragment[] = [fragment`prefix: null`];
                    const decoderOptions: Fragment[] = [fragment`prefix: null`];

                    // Zero-value option.
                    if (node.zeroValue) {
                        const zeroValueManifest = visit(node.zeroValue, self);
                        encoderOptions.push(fragment`noneValue: ${zeroValueManifest.value}`);
                        decoderOptions.push(fragment`noneValue: ${zeroValueManifest.value}`);
                    } else {
                        encoderOptions.push(fragment`noneValue: "zeroes"`);
                        decoderOptions.push(fragment`noneValue: "zeroes"`);
                    }

                    const encoderOptionsFragment = mergeFragments(encoderOptions, cs =>
                        cs.length > 0 ? `, { ${cs.join(', ')} }` : '',
                    );
                    const decoderOptionsFragment = mergeFragments(decoderOptions, cs =>
                        cs.length > 0 ? `, { ${cs.join(', ')} }` : '',
                    );

                    return typeManifest({
                        ...childManifest,
                        decoder: fragment`${use('getOptionDecoder', 'solanaOptions')}(${childManifest.decoder}${decoderOptionsFragment})`,
                        encoder: fragment`${use('getOptionEncoder', 'solanaOptions')}(${childManifest.encoder}${encoderOptionsFragment})`,
                        looseType: fragment`${use('type OptionOrNullable', 'solanaOptions')}<${childManifest.looseType}>`,
                        strictType: fragment`${use('type Option', 'solanaOptions')}<${childManifest.strictType}>`,
                    });
                },
            }),
        visitor => recordNodeStackVisitor(visitor, stack),
    );
}

/** Renders the codecs and types of a number from its format and endianness. */
function renderNumberType(
    format: NumberTypeNode['format'],
    endian: NumberTypeNode['endian'],
    nameApi: NameApi,
): TypeManifest {
    const encoderFunction = use(nameApi.encoderFunction(format), 'solanaCodecsNumbers');
    const decoderFunction = use(nameApi.decoderFunction(format), 'solanaCodecsNumbers');
    const isBigNumber = isBigNumberFormat(format);
    const endianness = endian === 'be' ? fragment`{ endian: ${use('Endian', 'solanaCodecsNumbers')}.Big }` : '';
    return typeManifest({
        decoder: fragment`${decoderFunction}(${endianness})`,
        encoder: fragment`${encoderFunction}(${endianness})`,
        looseType: fragment`${isBigNumber ? 'number | bigint' : 'number'}`,
        strictType: fragment`${isBigNumber ? 'bigint' : 'number'}`,
    });
}

/** Renders a number literal. */
function renderNumberValue(value: number): TypeManifest {
    return typeManifest({ value: fragment`${JSON.stringify(value)}` });
}

/** Wraps the codecs of a number into lamports codecs, typed as `Lamports`. */
function applyLamports(manifest: TypeManifest): TypeManifest {
    return typeManifest({
        ...manifest,
        decoder: fragment`${use('getLamportsDecoder', 'solanaRpcTypes')}(${manifest.decoder})`,
        encoder: fragment`${use('getLamportsEncoder', 'solanaRpcTypes')}(${manifest.encoder})`,
        looseType: use('type Lamports', 'solanaRpcTypes'),
        strictType: use('type Lamports', 'solanaRpcTypes'),
    });
}

/** Fixes the byte size of the codecs of a type. */
function applyFixedSize(manifest: TypeManifest, size: number): TypeManifest {
    return typeManifest({
        ...manifest,
        decoder: fragment`${use('fixDecoderSize', 'solanaCodecsCore')}(${manifest.decoder}, ${size})`,
        encoder: fragment`${use('fixEncoderSize', 'solanaCodecsCore')}(${manifest.encoder}, ${size})`,
    });
}

/** Prefixes the codecs of a type with the given constant values. */
function applyHiddenPrefix(manifest: TypeManifest, prefixes: Fragment[]): TypeManifest {
    const prefixEncoders = pipe(
        mergeFragments(prefixes, cs => cs.map(c => `getConstantEncoder(${c})`).join(', ')),
        f => addFragmentImports(f, 'solanaCodecsCore', ['getConstantEncoder']),
    );
    const prefixDecoders = pipe(
        mergeFragments(prefixes, cs => cs.map(c => `getConstantDecoder(${c})`).join(', ')),
        f => addFragmentImports(f, 'solanaCodecsCore', ['getConstantDecoder']),
    );
    return typeManifest({
        ...manifest,
        decoder: fragment`${use('getHiddenPrefixDecoder', 'solanaCodecsDataStructures')}(${manifest.decoder}, [${prefixDecoders}])`,
        encoder: fragment`${use('getHiddenPrefixEncoder', 'solanaCodecsDataStructures')}(${manifest.encoder}, [${prefixEncoders}])`,
    });
}

/** Suffixes the codecs of a type with the given constant values. */
function applyHiddenSuffix(manifest: TypeManifest, suffixes: Fragment[]): TypeManifest {
    const suffixEncoders = pipe(
        mergeFragments(suffixes, cs => cs.map(c => `getConstantEncoder(${c})`).join(', ')),
        f => addFragmentImports(f, 'solanaCodecsCore', ['getConstantEncoder']),
    );
    const suffixDecoders = pipe(
        mergeFragments(suffixes, cs => cs.map(c => `getConstantDecoder(${c})`).join(', ')),
        f => addFragmentImports(f, 'solanaCodecsCore', ['getConstantDecoder']),
    );
    return typeManifest({
        ...manifest,
        decoder: fragment`${use('getHiddenSuffixDecoder', 'solanaCodecsDataStructures')}(${manifest.decoder}, [${suffixDecoders}])`,
        encoder: fragment`${use('getHiddenSuffixEncoder', 'solanaCodecsDataStructures')}(${manifest.encoder}, [${suffixEncoders}])`,
    });
}

/** Moves the cursor after the codecs of a type have run. */
function applyPostOffset(
    manifest: TypeManifest,
    offset: number,
    strategy: PostOffsetTypeNode['strategy'] | undefined,
): TypeManifest {
    if (strategy === 'padded') {
        return typeManifest({
            ...manifest,
            decoder: fragment`${use('padRightDecoder', 'solanaCodecsCore')}(${manifest.decoder}, ${offset})`,
            encoder: fragment`${use('padRightEncoder', 'solanaCodecsCore')}(${manifest.encoder}, ${offset})`,
        });
    }

    const fn = (() => {
        switch (strategy) {
            case 'absolute':
                return offset < 0 ? `({ wrapBytes }) => wrapBytes(${offset})` : `() => ${offset}`;
            case 'preOffset':
                return offset < 0
                    ? `({ preOffset }) => preOffset ${offset}`
                    : `({ preOffset }) => preOffset + ${offset}`;
            case 'relative':
            default:
                return offset < 0
                    ? `({ postOffset }) => postOffset ${offset}`
                    : `({ postOffset }) => postOffset + ${offset}`;
        }
    })();

    return typeManifest({
        ...manifest,
        decoder: fragment`${use('offsetDecoder', 'solanaCodecsCore')}(${manifest.decoder}, { postOffset: ${fn} })`,
        encoder: fragment`${use('offsetEncoder', 'solanaCodecsCore')}(${manifest.encoder}, { postOffset: ${fn} })`,
    });
}

/** Moves the cursor before the codecs of a type run. */
function applyPreOffset(
    manifest: TypeManifest,
    offset: number,
    strategy: PreOffsetTypeNode['strategy'] | undefined,
): TypeManifest {
    if (strategy === 'padded') {
        return typeManifest({
            ...manifest,
            decoder: fragment`${use('padLeftDecoder', 'solanaCodecsCore')}(${manifest.decoder}, ${offset})`,
            encoder: fragment`${use('padLeftEncoder', 'solanaCodecsCore')}(${manifest.encoder}, ${offset})`,
        });
    }

    const fn = (() => {
        switch (strategy) {
            case 'absolute':
                return offset < 0 ? `({ wrapBytes }) => wrapBytes(${offset})` : `() => ${offset}`;
            case 'relative':
            default:
                return offset < 0
                    ? `({ preOffset }) => preOffset ${offset}`
                    : `({ preOffset }) => preOffset + ${offset}`;
        }
    })();

    return typeManifest({
        ...manifest,
        decoder: fragment`${use('offsetDecoder', 'solanaCodecsCore')}(${manifest.decoder}, { preOffset: ${fn} })`,
        encoder: fragment`${use('offsetEncoder', 'solanaCodecsCore')}(${manifest.encoder}, { preOffset: ${fn} })`,
    });
}

/** Delimits the codecs of a type with a sentinel value. */
function applySentinel(manifest: TypeManifest, sentinel: Fragment): TypeManifest {
    return typeManifest({
        ...manifest,
        decoder: fragment`${use('addDecoderSentinel', 'solanaCodecsCore')}(${manifest.decoder}, ${sentinel})`,
        encoder: fragment`${use('addEncoderSentinel', 'solanaCodecsCore')}(${manifest.encoder}, ${sentinel})`,
    });
}

/** Prefixes the codecs of a type with its byte size. */
function applySizePrefix(manifest: TypeManifest, prefix: TypeManifest): TypeManifest {
    return typeManifest({
        ...manifest,
        decoder: fragment`${use('addDecoderSizePrefix', 'solanaCodecsCore')}(${manifest.decoder}, ${prefix.decoder})`,
        encoder: fragment`${use('addEncoderSizePrefix', 'solanaCodecsCore')}(${manifest.encoder}, ${prefix.encoder})`,
    });
}

function getArrayLikeSizeOption(
    count: CountNode,
    visitor: Visitor<TypeManifest, TypeNode['kind']>,
): {
    decoder: Fragment | undefined;
    encoder: Fragment | undefined;
} {
    if (isNode(count, 'fixedCountNode')) {
        return {
            decoder: fragment`size: ${count.value}`,
            encoder: fragment`size: ${count.value}`,
        };
    }
    if (isNode(count, 'remainderCountNode')) {
        return {
            decoder: fragment`size: 'remainder'`,
            encoder: fragment`size: 'remainder'`,
        };
    }
    if (isDefaultNumberType(getInnerTypeNode(count.prefix), 'u32')) {
        return { decoder: undefined, encoder: undefined };
    }
    const prefixManifest = visit(count.prefix, visitor);
    return {
        decoder: pipe(prefixManifest.decoder, f => mapFragmentContent(f, c => `size: ${c}`)),
        encoder: pipe(prefixManifest.encoder, f => mapFragmentContent(f, c => `size: ${c}`)),
    };
}
