import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatSiteFileMaterializationReadText,
  parseSiteFileMaterializationReadArgs,
  readSiteFileMaterialization,
  summarizeSiteFileMaterialization,
} from './cloudflare-carrier-site-file-materialization-read.mjs';

test('parseSiteFileMaterializationReadArgs uses the site_file_materialization.list operation', () => {
  const parsed = parseSiteFileMaterializationReadArgs([
    '--url', 'https://carrier.example.test',
    '--site', 'site_alpha',
    '--token', 'token-value',
    '--site-file-materialization-id', 'materialization-1',
  ]);

  assert.equal(parsed.operation, 'site_file_materialization.list');
  assert.equal(parsed.params.site_id, 'site_alpha');
  assert.equal(parsed.focusMaterializationId, 'materialization-1');
  assert.equal(parsed.params.site_file_materialization_limit, 200);
});

test('readSiteFileMaterialization returns a structured read result', async () => {
  const result = await readSiteFileMaterialization({
    workerUrl: 'https://carrier.example.test',
    operation: 'site_file_materialization.list',
    requestId: 'req-materialization',
    params: { site_id: 'site_alpha' },
    format: 'json',
    continuation: false,
    auth: { kind: 'bearer', value: 'token-value', source: 'token' },
  }, async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.operation, 'site_file_materialization.list');
    return {
      status: 200,
      async text() {
        return JSON.stringify({
          ok: true,
          site_id: 'site_alpha',
          site_file_materialization_authority: 'cloudflare_carrier_site',
          cloudflare_site_file_materialization_admission: 'admitted',
          filesystem_executor_authority: 'cloudflare_site_file_store',
          windows_filesystem_mutation_admission: 'not_admitted',
          repository_publication_admission: 'not_admitted',
          authority_partition: 'site_file_materialization_cloudflare_owned_windows_filesystem_and_publication_not_admitted',
          materializations: [{
            materialization_id: 'materialization-1',
            proposal_id: 'proposal-9',
            file_path: 'docs/architecture/cloudflare-carrier/target.md',
            write_effect: 'cloudflare_site_file_materialization_record',
            materialization_posture: 'recorded',
            recorded_at: '2026-06-12T00:00:00.000Z',
          }],
        });
      },
    };
  });

  assert.equal(result.schema, 'narada.cloudflare_carrier.site_file_materialization_read.v1');
  assert.equal(result.summary.latest_materialization_id, 'materialization-1');
  assert.equal(result.summary.latest_file_path, 'docs/architecture/cloudflare-carrier/target.md');
});

test('readSiteFileMaterialization narrows to the focused materialization id', async () => {
  const result = await readSiteFileMaterialization({
    workerUrl: 'https://carrier.example.test',
    operation: 'site_file_materialization.list',
    requestId: 'req-materialization',
    params: { site_id: 'site_alpha', site_file_materialization_limit: 200 },
    format: 'json',
    continuation: false,
    focusMaterializationId: 'materialization-2',
    auth: { kind: 'bearer', value: 'token-value', source: 'token' },
  }, async () => ({
    status: 200,
    async text() {
      return JSON.stringify({
        ok: true,
        site_id: 'site_alpha',
        materializations: [
          { materialization_id: 'materialization-2', proposal_id: 'proposal-2', file_path: 'docs/two.md', materialization_posture: 'recorded' },
          { materialization_id: 'materialization-1', proposal_id: 'proposal-1', file_path: 'docs/one.md', materialization_posture: 'recorded' },
        ],
      });
    },
  }));

  assert.equal(result.summary.materialization_count, 1);
  assert.equal(result.summary.focused_materialization_id, 'materialization-2');
  assert.equal(result.summary.focused_read, true);
  assert.equal(result.summary.latest_file_path, 'docs/two.md');
});

test('readSiteFileMaterialization fails when the focused materialization id is absent', async () => {
  await assert.rejects(
    () => readSiteFileMaterialization({
      workerUrl: 'https://carrier.example.test',
      operation: 'site_file_materialization.list',
      requestId: 'req-materialization',
      params: { site_id: 'site_alpha', site_file_materialization_limit: 200 },
      format: 'json',
      continuation: false,
      focusMaterializationId: 'materialization-missing',
      auth: { kind: 'bearer', value: 'token-value', source: 'token' },
    }, async () => ({
      status: 200,
      async text() {
        return JSON.stringify({
          ok: true,
          site_id: 'site_alpha',
          materializations: [{ materialization_id: 'materialization-1' }],
        });
      },
    })),
    /site_file_materialization_read_focus_not_found:materialization-missing/,
  );
});

test('summarizeSiteFileMaterialization tolerates empty responses', () => {
  const summary = summarizeSiteFileMaterialization({});
  assert.equal(summary.site_id, null);
  assert.equal(summary.materialization_count, 0);
  assert.equal(summary.latest_materialization_id, null);
});

test('formatSiteFileMaterializationReadText prints the key review facts', () => {
  const text = formatSiteFileMaterializationReadText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      materialization_count: 1,
      site_file_materialization_authority: 'cloudflare_carrier_site',
      cloudflare_site_file_materialization_admission: 'admitted',
      filesystem_executor_authority: 'cloudflare_site_file_store',
      windows_filesystem_mutation_admission: 'not_admitted',
      repository_publication_admission: 'not_admitted',
      authority_partition: 'site_file_materialization_cloudflare_owned_windows_filesystem_and_publication_not_admitted',
      latest_materialization_id: 'materialization-1',
      latest_proposal_id: 'proposal-9',
      latest_file_path: 'docs/architecture/cloudflare-carrier/target.md',
      latest_write_effect: 'cloudflare_site_file_materialization_record',
      latest_materialization_posture: 'recorded',
      latest_recorded_at: '2026-06-12T00:00:00.000Z',
    },
  });

  assert.match(text, /Site File Materialization Review: ok/);
  assert.match(text, /Materializations: count=1 authority=cloudflare_carrier_site admission=admitted/);
  assert.match(text, /Latest Materialization: materialization-1 proposal=proposal-9 file=docs\/architecture\/cloudflare-carrier\/target.md effect=cloudflare_site_file_materialization_record posture=recorded/);
});

test('formatSiteFileMaterializationReadText prints focused wording for direct historical reads', () => {
  const text = formatSiteFileMaterializationReadText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      materialization_count: 1,
      focused_materialization_id: 'materialization-9',
      focused_read: true,
      site_file_materialization_authority: 'cloudflare_carrier_site',
      cloudflare_site_file_materialization_admission: 'admitted',
      latest_materialization_id: 'materialization-9',
      latest_proposal_id: 'proposal-9',
      latest_file_path: 'docs/focused.md',
      latest_materialization_posture: 'recorded',
    },
  });

  assert.match(text, /Materializations: count=1 focused=materialization-9 authority=cloudflare_carrier_site admission=admitted/);
  assert.match(text, /Focused Materialization: materialization-9 proposal=proposal-9 file=docs\/focused.md posture=recorded/);
});
