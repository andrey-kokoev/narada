import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  deployIntelligence,
  loadIntelligenceDeploymentBundle,
} from './cloudflare-intelligence-deploy.mjs';

const PACKAGE_DIRECTORY = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_DIRECTORY = join(PACKAGE_DIRECTORY, 'config');
const MANIFEST_PATH = join(CONFIG_DIRECTORY, 'invokable-intelligence.deployment.json');

test('loads the digest-pinned production deployment bundle', () => {
  const bundle = loadIntelligenceDeploymentBundle();
  assert.equal(bundle.id, 'deployment:narada-cloudflare:invokable-intelligence:revision-1');
  assert.deepEqual(bundle.owning_site, { kind: 'site', id: 'site:narada-cloudflare' });
  assert.equal(bundle.catalog.records.length, 27);
  assert.equal(bundle.materializations.length, 2);
});

test('refuses a deployment manifest when a pinned input digest does not match', () => {
  const directory = mkdtempSync(join(tmpdir(), 'narada-intelligence-deploy-'));
  try {
    for (const name of [
      'invokable-intelligence.catalog.json',
      'invokable-intelligence.materializations.json',
    ]) {
      copyFileSync(join(CONFIG_DIRECTORY, name), join(directory, name));
    }
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    manifest.catalog.sha256 = '0'.repeat(64);
    const manifestPath = join(directory, 'deployment.json');
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    assert.throws(
      () => loadIntelligenceDeploymentBundle(manifestPath),
      /cloudflare_intelligence_deployment_catalog_digest_mismatch/u,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('posts the canonical bundle to the protected management endpoint', async () => {
  let captured = null;
  const response = await deployIntelligence(
    ['--url', 'https://carrier.example.test/base', '--token', 'secret'],
    {},
    async (url, init) => {
      captured = { url: String(url), init };
      return {
        ok: true,
        status: 200,
        async json() {
          return { ok: true, schema: 'narada.cloudflare.invokable-intelligence.management-api.response.v1' };
        },
      };
    },
  );

  assert.equal(response.ok, true);
  assert.equal(captured.url, 'https://carrier.example.test/api/intelligence');
  assert.equal(captured.init.method, 'POST');
  assert.equal(captured.init.headers.authorization, 'Bearer secret');
  const body = JSON.parse(captured.init.body);
  assert.equal(body.id, 'deployment:narada-cloudflare:invokable-intelligence:revision-1');
  assert.equal(body.catalog.records.length, 27);
});
