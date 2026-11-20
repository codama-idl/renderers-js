import { expectTypeOf, test } from 'vitest';

import renderVisitor, {
    type CustomDataOptions,
    type Fragment,
    getRenderMapVisitor,
    type GetRenderMapOptions,
    type LinkOverrides,
    type PrettierOptions,
    type RenderOptions,
} from '../src';

test('it exports the types of its options', () => {
    // Then the types making up the options can be named by callers.
    expectTypeOf<GetRenderMapOptions['customAccountData']>().toEqualTypeOf<CustomDataOptions[] | undefined>();
    expectTypeOf<GetRenderMapOptions['linkOverrides']>().toEqualTypeOf<LinkOverrides | undefined>();
    expectTypeOf<RenderOptions['prettierOptions']>().toEqualTypeOf<PrettierOptions | undefined>();
    expectTypeOf(getRenderMapVisitor).returns.toHaveProperty('visitRoot');
    expectTypeOf<Fragment['content']>().toEqualTypeOf<string>();
    expectTypeOf(renderVisitor).parameter(1).toEqualTypeOf<RenderOptions | undefined>();
});

test('it accepts custom data options keyed by identifier', () => {
    // Then custom data options name their node with an `identifier`.
    expectTypeOf<{ identifier: 'counter'; importFrom: 'hooked' }>().toExtend<CustomDataOptions>();
    expectTypeOf<{ importFrom: 'hooked'; name: 'counter' }>().not.toExtend<CustomDataOptions>();
});
