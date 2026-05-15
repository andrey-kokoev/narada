import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { BUILD_MANIFEST_PATH, BUILD_MANIFEST_SCHEMA, computeCliBuildSourceHash } from './build-manifest-lib.mjs';

const siteRoot = resolve(process.argv[2] ?? join(import.meta.dirname, '..', '..', '..', '..'));
const current = computeCliBuildSourceHash(siteRoot);
const manifestPath = join(siteRoot, BUILD_MANIFEST_PATH);
const manifest = {
  schema: BUILD_MANIFEST_SCHEMA,
  package: '@narada2/cli',
  build_command: 'pnpm --filter @narada2/cli build',
  built_at: new Date().toISOString(),
  ...current,
};
mkdirSync(dirname(manifestPath), { recursive: true });
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
