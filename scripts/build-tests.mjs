import { build } from 'esbuild';

const entries = ['tests/physics.test.ts', 'tests/combat.test.ts'];
for (const entry of entries) {
  const out = 'out/' + entry.split('/').pop().replace('.ts', '.mjs');
  await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    outfile: out,
    target: 'es2022',
    logLevel: 'error',
  });
}
console.log('tests bundled');
