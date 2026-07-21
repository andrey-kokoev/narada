import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { materializeCloudflareSiteRegistryProjection } from '../read-models/cloudflare-carrier-site-registry-projection.mjs';

test('site registry projection materializes active site list without credentials', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-cloudflare-site-registry-projection-'));
  const outputPath = join(root, '.narada/site-registry/cloudflare-sites.json');
  try {
    const result = await materializeCloudflareSiteRegistryProjection({
      workerUrl: 'https://worker.example/',
      bearerToken: { value: 'secret-token-value', source: 'token-file' },
      outputPath,
      now: () => '2026-06-11T10:20:00.000Z',
      fetchImpl: async (url, init) => {
        assert.equal(url, 'https://worker.example/api/carrier');
        assert.equal(init.headers.authorization, 'Bearer secret-token-value');
        assert.deepEqual(JSON.parse(init.body), {
          operation: 'site.list',
          request_id: 'site_registry_projection_20260611102000',
          params: {},
        });
        return jsonResponse(200, {
          ok: true,
          sites: [
            { site_id: 'site_beta', display_name: 'Beta', status: 'active', site_ref: 'cloudflare://site_beta' },
            { site_id: 'site_alpha', display_name: 'Alpha', status: 'active' },
            { site_id: 'site_inactive', status: 'inactive' },
          ],
        });
      },
    });

    assert.equal(result.status, 'ok');
    assert.equal(result.written, true);
    assert.equal(result.token_source, 'token-file');
    assert.equal(result.projection.site_count, 2);
    assert.deepEqual(result.projection.sites.map((site) => site.site_id), ['site_alpha', 'site_beta']);
    assert.doesNotMatch(JSON.stringify(result), /secret-token-value/);

    const written = JSON.parse(await readFile(outputPath, 'utf8'));
    assert.equal(written.schema, 'narada.cloudflare_site_registry.snapshot.v1');
    assert.equal(written.generated_at, '2026-06-11T10:20:00.000Z');
    assert.equal(written.embeds_credentials, false);
    assert.deepEqual(written.sites.map((site) => site.site_id), ['site_alpha', 'site_beta']);
    assert.doesNotMatch(JSON.stringify(written), /secret-token-value/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site registry projection dry-run returns projection without writing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-cloudflare-site-registry-projection-dry-run-'));
  const outputPath = join(root, '.narada/site-registry/cloudflare-sites.json');
  try {
    const result = await materializeCloudflareSiteRegistryProjection({
      workerUrl: 'https://worker.example',
      bearerToken: { value: 'secret-token-value', source: 'flag:--token' },
      outputPath,
      dryRun: true,
      fetchImpl: async () => jsonResponse(200, { ok: true, sites: ['site_dry_run'] }),
    });

    assert.equal(result.status, 'ok');
    assert.equal(result.dry_run, true);
    assert.equal(result.written, false);
    assert.equal(result.projection.site_count, 1);
    await assert.rejects(readFile(outputPath, 'utf8'), /ENOENT/);
    assert.doesNotMatch(JSON.stringify(result), /secret-token-value/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('site registry projection reports site.list failures without writing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'narada-cloudflare-site-registry-projection-failed-'));
  const outputPath = join(root, '.narada/site-registry/cloudflare-sites.json');
  try {
    const result = await materializeCloudflareSiteRegistryProjection({
      workerUrl: 'https://worker.example',
      bearerToken: { value: 'secret-token-value', source: 'env:CLOUDFLARE_CARRIER_TOKEN' },
      outputPath,
      fetchImpl: async () => jsonResponse(403, { ok: false, code: 'site_authority_denied' }),
    });

    assert.equal(result.status, 'failed');
    assert.equal(result.reason, 'site_list_failed');
    assert.equal(result.http_status, 403);
    assert.equal(result.code, 'site_authority_denied');
    assert.equal(result.written, false);
    assert.doesNotMatch(JSON.stringify(result), /secret-token-value/);
    await assert.rejects(readFile(outputPath, 'utf8'), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function jsonResponse(status, body) {
  return {
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}
