import { resolve } from 'node:path';
import { writeLaunchArtifactManifest } from './launch-artifact-lib.mjs';

const args = process.argv.slice(2);
const valueAfter = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const target = valueAfter('--target');
if (!target) throw new Error('launch_artifact_target_missing');

const packageRootArg = valueAfter('--package-root');
const siteRootArg = valueAfter('--site-root');
const packageRoot = packageRootArg
  ? resolve(process.cwd(), packageRootArg)
  : resolve(import.meta.dirname, '..');
const siteRoot = siteRootArg
  ? resolve(process.cwd(), siteRootArg)
  : resolve(import.meta.dirname, '..', '..', '..', '..');
const manifest = writeLaunchArtifactManifest({ siteRoot, target, packageRoot });
console.log(JSON.stringify({
  schema: 'narada.launch_artifact_write_result.v1',
  status: 'current',
  target,
  artifact_manifest_path: manifest.artifact_manifest_path,
  artifact_root: manifest.artifact_root,
}));
