import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  checkLaunchArtifact,
  writeLaunchArtifactManifest,
} from '../../scripts/launch-artifact-lib.mjs';

async function fixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), 'narada-launch-artifact-'));
  const packageRoot = join(root, 'packages', 'fixture');
  const outputRoot = join(packageRoot, 'dist');
  await mkdir(join(packageRoot, 'src'), { recursive: true });
  await mkdir(join(packageRoot, '.ai', 'runtime'), { recursive: true });
  await mkdir(join(outputRoot, 'assets'), { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({
    name: 'fixture-workspace',
    packageManager: 'pnpm@10.0.0',
  }));
  await writeFile(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
  await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
  await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
    name: '@fixture/ui',
    type: 'module',
    narada: {
      launch_artifact: {
        target: 'fixture-ui',
        build_script: 'build',
        output_root: 'dist',
        required_outputs: ['index.html', 'assets/**'],
      },
    },
    scripts: { build: 'vite build' },
  }));
  await writeFile(join(packageRoot, 'src', 'main.js'), 'export const value = 1;\n');
  await writeFile(join(packageRoot, '.ai', 'runtime', 'volatile.json'), '{"status":"initial"}\n');
  await writeFile(join(outputRoot, 'index.html'), '<!doctype html>\n');
  await writeFile(join(outputRoot, 'assets', 'app.js'), 'console.log("fixture");\n');
  return { root, packageRoot, outputRoot };
}

test('launch artifact manifest detects source and published output drift', async (t) => {
  const fixture = await fixtureRoot();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  writeLaunchArtifactManifest({
    siteRoot: fixture.root,
    target: 'fixture-ui',
    packageRoot: fixture.packageRoot,
  });
  const current = checkLaunchArtifact(fixture.root, 'fixture-ui');
  assert.equal(current.status, 'current');
  assert.equal(current.source_closure.inputs.includes('packages/fixture/src/main.js'), true);

  await writeFile(join(fixture.packageRoot, '.ai', 'runtime', 'volatile.json'), '{"status":"changed"}\n');
  const generatedStateChange = checkLaunchArtifact(fixture.root, 'fixture-ui');
  assert.equal(generatedStateChange.status, 'current');

  const manifestPath = join(fixture.outputRoot, 'narada-launch-artifact.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  await writeFile(manifestPath, JSON.stringify({ ...manifest, output_root: 'wrong-output' }));
  const manifestDrift = checkLaunchArtifact(fixture.root, 'fixture-ui');
  assert.equal(manifestDrift.status, 'stale');
  assert.equal(manifestDrift.reason, 'launch_artifact_manifest_identity_mismatch');
  writeLaunchArtifactManifest({
    siteRoot: fixture.root,
    target: 'fixture-ui',
    packageRoot: fixture.packageRoot,
  });

  await writeFile(join(fixture.packageRoot, 'src', 'main.js'), 'export const value = 2;\n');
  const sourceDrift = checkLaunchArtifact(fixture.root, 'fixture-ui');
  assert.equal(sourceDrift.status, 'stale');
  assert.equal(sourceDrift.reason, 'source_closure_changed');

  writeLaunchArtifactManifest({
    siteRoot: fixture.root,
    target: 'fixture-ui',
    packageRoot: fixture.packageRoot,
  });
  await writeFile(join(fixture.outputRoot, 'index.html'), '<!doctype html><main>changed</main>\n');
  const outputDrift = checkLaunchArtifact(fixture.root, 'fixture-ui');
  assert.equal(outputDrift.status, 'stale');
  assert.equal(outputDrift.reason, 'published_outputs_changed');
});
