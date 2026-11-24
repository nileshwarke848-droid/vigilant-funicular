import { build } from 'esbuild';
await build({ entryPoints: ['scripts/play-fixture.ts'], bundle: true, format: 'esm', platform: 'neutral', outfile: 'out/play.mjs', target: 'es2022', logLevel: 'error' });
