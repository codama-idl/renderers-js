import { env } from 'node:process';
import path from 'node:path';
import { defineConfig, type Options } from 'tsup';

const E2E_PROJECTS = ['anchor', 'dummy', 'memo', 'system', 'token'];

const SHARED_OPTIONS: Options = {
    define: { __VERSION__: `"${env['npm_package_version']}"` },
    esbuildOptions: options => {
        options.outbase = './test/e2e';
    },
    inject: [path.resolve(__dirname, 'env-shim.ts')],
    outExtension: ({ format }) => ({ js: format === 'cjs' ? '.js' : '.mjs' }),
    sourcemap: true,
    treeshake: true,
};

const config: ReturnType<typeof defineConfig> = defineConfig(() => [
    {
        ...SHARED_OPTIONS,
        entry: E2E_PROJECTS.map(project => `./test/e2e/${project}/src/index.ts`),
        format: 'cjs',
        outDir: './test/e2e/dist',
    },
]);

export default config;
