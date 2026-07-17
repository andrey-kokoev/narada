import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = resolve(packageRoot, 'public');
const operatorConsoleDist = resolve(packageRoot, '..', 'operator-console-ui', 'dist');
const agentWebUiDist = resolve(packageRoot, '..', 'agent-web-ui', 'dist');

await rm(publicRoot, { recursive: true, force: true });
await mkdir(resolve(publicRoot, 'console'), { recursive: true });
await mkdir(resolve(publicRoot, 'sessions'), { recursive: true });
await cp(operatorConsoleDist, resolve(publicRoot, 'console'), { recursive: true });
await cp(agentWebUiDist, resolve(publicRoot, 'sessions'), { recursive: true });

const sourceArtifacts = {
  console: await readSourceArtifactManifest(resolve(publicRoot, 'console')),
  sessions: await readSourceArtifactManifest(resolve(publicRoot, 'sessions')),
};
const assetTree = await hashAssetTree(publicRoot);
const sourceHash = hashJson(sourceArtifacts);
const manifest = {
  schema: 'narada.cloudflare_assets_manifest.v1',
  target: 'narada-nars-projection',
  built_at: new Date().toISOString(),
  git_commit: process.env.GITHUB_SHA ?? process.env.SOURCE_VERSION ?? process.env.COMMIT_SHA ?? null,
  source_hash: sourceHash,
  source_artifacts: sourceArtifacts,
  asset_tree_hash: assetTree.tree_hash,
  asset_tree: assetTree,
};
await writeFile(resolve(publicRoot, 'narada-cloudflare-assets.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`Cloudflare workspace assets assembled at ${publicRoot} (${assetTree.tree_hash})`);

async function readSourceArtifactManifest(assetRoot) {
  const manifestPath = resolve(assetRoot, 'narada-launch-artifact.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  return {
    schema: manifest.schema ?? null,
    target: manifest.target ?? null,
    package: manifest.package ?? null,
    source_hash: manifest.source_closure?.source_hash ?? null,
    source_input_count: manifest.source_closure?.input_count ?? null,
    recipe_hash: manifest.recipe_hash ?? null,
    output_tree_hash: manifest.outputs?.tree_hash ?? null,
  };
}

async function hashAssetTree(root) {
  const files = [];
  await collectFiles(root, root, files);
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file.relativePath);
    hash.update('\0');
    hash.update(file.content);
    hash.update('\0');
  }
  return {
    algorithm: 'sha256',
    tree_hash: hash.digest('hex'),
    file_count: files.length,
  };
}

async function collectFiles(root, current, files) {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = resolve(current, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(root, path, files);
      continue;
    }
    if (!entry.isFile() || entry.name === 'narada-cloudflare-assets.json') continue;
    files.push({
      relativePath: relative(root, path).replaceAll('\\', '/'),
      content: await readFile(path),
    });
  }
}

function hashJson(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
