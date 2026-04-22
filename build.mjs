import { build } from 'esbuild';

/**
 * Bundles app.ts and api.ts into self-contained CommonJS files inside `.homeybuild/`.
 *
 * The Homey CLI runs this script via `npm run build` after it has staged the
 * source files and production dependencies into `.homeybuild/`. By bundling the
 * three AI SDKs plus `homey-api` into the output, we keep them out of
 * `dependencies` (they live in `devDependencies`) so the CLI never copies them
 * into the shipped app — which shrinks the archive dramatically.
 *
 * Externals are anything that cannot or should not be bundled:
 * - `homey`: provided by the Homey runtime at app load time.
 * - `node-sqlite3-wasm`: ships a WASM binary that must sit on disk next to the
 *   module (and is in `dependencies`, so the CLI copies it as-is).
 * - `@basmilius/homey-common`: already published as a pre-bundled CJS file and
 *   drives the decorator-based flow registry; leaving it external avoids any
 *   risk of re-bundling its decorator machinery.
 */
const external = [
    'homey',
    'node-sqlite3-wasm',
    '@basmilius/homey-common'
];

const result = await build({
    entryPoints: [
        'app.ts',
        'api.ts'
    ],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    outdir: '.homeybuild',
    external,
    // Source maps add ~8 MB to the shipped app for minimal debugging value
    // (production crashes don't surface them). Generate them locally on demand.
    sourcemap: false,
    minify: false,
    legalComments: 'none',
    logLevel: 'info',
    metafile: false
});

if (result.warnings.length > 0) {
    console.warn(`Bundled with ${result.warnings.length} warning(s).`);
}
