import { build } from 'esbuild';

/**
 * Bundles the app into self-contained CommonJS files inside `.homeybuild/`.
 *
 * Two build passes:
 * 1. Main — `app.ts` + `api.ts` into `.homeybuild/app.js` / `.homeybuild/api.js`.
 *    The three AI SDKs are marked external so the main bundle stays lean; they
 *    are loaded on demand by the summarizer.
 * 2. Providers — each AI provider wrapper becomes a self-contained bundle in
 *    `.homeybuild/providers/{anthropic,gemini,openai}.js`, with its SDK inlined.
 *    Only the active provider is required at runtime, so Anthropic+Gemini+OpenAI
 *    no longer all sit in memory at app start.
 *
 * Runtime externals (not bundled):
 * - `homey`: provided by the Homey runtime at app load time.
 * - `node-sqlite3-wasm`: ships a WASM binary that must sit on disk next to the
 *   module (and is in `dependencies`, so the CLI copies it as-is).
 * - `@basmilius/homey-common`: already pre-bundled and drives the decorator-
 *   based flow registry; leaving it external avoids any risk of re-bundling
 *   its decorator machinery.
 */
const runtimeExternal = [
    'homey',
    '@basmilius/homey-common'
];

const commonOptions = {
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    // Source maps add ~8 MB to the shipped app for minimal debugging value.
    sourcemap: false,
    // Minify only identifiers/whitespace: keeps stack traces readable while
    // cutting bundle size by roughly half.
    minifyIdentifiers: true,
    minifyWhitespace: true,
    minifySyntax: true,
    keepNames: true,
    legalComments: 'none',
    logLevel: 'info'
};

const mainResult = await build({
    ...commonOptions,
    entryPoints: [
        'app.ts',
        'api.ts'
    ],
    outdir: '.homeybuild',
    // The AI SDKs are loaded lazily from a sibling `providers/` dir at runtime,
    // so mark them external here too in case a static import sneaks in.
    external: [
        ...runtimeExternal,
        '@anthropic-ai/sdk',
        '@google/genai',
        'openai'
    ]
});

const providersResult = await build({
    ...commonOptions,
    entryPoints: [
        'src/brain/providers/anthropic.ts',
        'src/brain/providers/gemini.ts',
        'src/brain/providers/openai.ts'
    ],
    outbase: 'src/brain/providers',
    outdir: '.homeybuild/providers',
    external: runtimeExternal
});

const totalWarnings = mainResult.warnings.length + providersResult.warnings.length;

if (totalWarnings > 0) {
    console.warn(`Bundled with ${totalWarnings} warning(s).`);
}
