import { copyFileSync, cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { BUILD_MANIFEST_PATH, BUILD_MANIFEST_SCHEMA, computeCliBuildSourceHash } from './build-manifest-lib.mjs';
import { writeLaunchArtifactManifest } from './launch-artifact-lib.mjs';

const siteRoot = resolve(process.argv[2] ?? join(import.meta.dirname, '..', '..', '..', '..'));
const packageRoot = resolve(import.meta.dirname, '..');
const workbenchSourcePath = join(packageRoot, 'src', 'ui', 'workbench.html');
const workbenchTargetPath = join(packageRoot, 'dist', 'ui', 'workbench.html');
mkdirSync(dirname(workbenchTargetPath), { recursive: true });
copyFileSync(workbenchSourcePath, workbenchTargetPath);
const windowsAssetsSourcePath = join(packageRoot, 'src', 'assets', 'windows');
const windowsAssetsTargetPath = join(packageRoot, 'dist', 'assets', 'windows');
cpSync(windowsAssetsSourcePath, windowsAssetsTargetPath, { recursive: true });
const current = computeCliBuildSourceHash(siteRoot);
writeLaunchArtifactManifest({ siteRoot, target: 'narada-cli', packageRoot });
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
