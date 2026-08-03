import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const scriptsRoot = dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints: [resolve(scriptsRoot, 'host-fleet-publisher-bundle-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: resolve(scriptsRoot, '..', 'scripts-dist', 'host-fleet-publisher-bundle.mjs'),
  sourcemap: false,
  legalComments: 'none',
});
