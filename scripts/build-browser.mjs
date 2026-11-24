import { build } from 'esbuild';
await build({
  entryPoints: ['src/main.ts'],
  bundle: true, format: 'esm', platform: 'neutral',
  outfile: 'out/browser-main.mjs', target: 'es2022', logLevel: 'error',
  loader: { '.css': 'empty' },
});
console.log('bundled browser main');
