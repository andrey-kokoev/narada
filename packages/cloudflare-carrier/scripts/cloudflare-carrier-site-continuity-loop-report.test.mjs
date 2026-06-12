import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  formatSiteContinuityLoopReportText,
  loadSiteContinuityLoopReport,
  parseSiteContinuityLoopReportArgs,
  putSiteContinuityLoopReport,
  summarizeSiteContinuityLoopReport,
} from './cloudflare-carrier-site-continuity-loop-report.mjs';

async function writeJsonTempFile(name, value) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'narada-cloudflare-loop-report-'));
  const filePath = path.join(directory, name);
  await writeFile(filePath, JSON.stringify(value, null, 2));
  return filePath;
}

test('loadSiteContinuityLoopReport extracts nested report from sync artifact', async () => {
  const reportFile = await writeJsonTempFile('sync.json', {
    schema: 'narada.site_continuity_cloudflare_sync_once.v1',
    site_id: 'site_alpha',
    continuity_loop_report: {
      schema: 'narada.site_continuity_productized_loop.v1',
      site_id: 'site_alpha',
      status: 'ok',
      generated_at: '2026-06-12T03:04:03.895Z',
    },
  });

  const report = await loadSiteContinuityLoopReport(reportFile);
  assert.equal(report.schema, 'narada.site_continuity_productized_loop.v1');
  assert.equal(report.site_id, 'site_alpha');
});

test('parseSiteContinuityLoopReportArgs builds loop-report request from direct report file', async () => {
  const reportFile = await writeJsonTempFile('report.json', {
    schema: 'narada.site_continuity_productized_loop.v1',
    site_id: 'site_alpha',
    status: 'ok',
    generated_at: '2026-06-12T03:04:03.895Z',
    cloudflare_push: {
      status: 'imported',
      imported_at: '2026-06-12T03:04:02.324Z',
    },
  });

  const parsed = await parseSiteContinuityLoopReportArgs([
    '--url', 'https://carrier.example.test/',
    '--site', 'site_alpha',
    '--report-file', reportFile,
    '--operator-session-cookie', 'operator-session-cookie',
    '--format', 'text',
  ], {}, () => 123);

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.requestId, 'site_continuity_loop_report_put_site_alpha');
  assert.equal(parsed.reportFile, reportFile);
  assert.equal(parsed.format, 'text');
  assert.deepEqual(parsed.auth, { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' });
  assert.equal(parsed.params.site_id, 'site_alpha');
  assert.equal(parsed.params.report.schema, 'narada.site_continuity_productized_loop.v1');
});

test('parseSiteContinuityLoopReportArgs refuses missing required inputs and site mismatch', async () => {
  const reportFile = await writeJsonTempFile('report.json', {
    schema: 'narada.site_continuity_productized_loop.v1',
    site_id: 'site_beta',
    status: 'ok',
  });

  await assert.rejects(
    async () => parseSiteContinuityLoopReportArgs(['--site', 'site_alpha', '--report-file', reportFile, '--token', 'secret'], {}),
    /site_continuity_loop_report_requires_--url_or_CLOUDFLARE_CARRIER_URL/,
  );
  await assert.rejects(
    async () => parseSiteContinuityLoopReportArgs(['--url', 'https://carrier.example.test', '--report-file', reportFile, '--token', 'secret'], {}),
    /site_continuity_loop_report_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID/,
  );
  await assert.rejects(
    async () => parseSiteContinuityLoopReportArgs(['--url', 'https://carrier.example.test', '--site', 'site_alpha', '--token', 'secret'], {}),
    /site_continuity_loop_report_requires_--report-file_or_CLOUDFLARE_SITE_CONTINUITY_LOOP_REPORT_FILE/,
  );
  await assert.rejects(
    async () => parseSiteContinuityLoopReportArgs(['--url', 'https://carrier.example.test', '--site', 'site_alpha', '--report-file', reportFile], {}),
    /site_continuity_loop_report_requires_bearer_token_or_operator_session/,
  );
  await assert.rejects(
    async () => parseSiteContinuityLoopReportArgs(['--url', 'https://carrier.example.test', '--site', 'site_alpha', '--report-file', reportFile, '--token', 'secret'], {}),
    /site_continuity_loop_report_site_id_mismatch:site_alpha:site_beta/,
  );
});

test('putSiteContinuityLoopReport posts loop report envelope and redacts auth', async () => {
  const requests = [];
  const result = await putSiteContinuityLoopReport({
    workerUrl: 'https://carrier.example.test',
    reportFile: 'D:\\tmp\\report.json',
    requestId: 'loop-report-request',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-file' },
    params: {
      site_id: 'site_alpha',
      report: {
        schema: 'narada.site_continuity_productized_loop.v1',
        site_id: 'site_alpha',
        status: 'ok',
        generated_at: '2026-06-12T03:04:03.895Z',
        cloudflare_source: 'cloudflare.site.read',
        cloudflare_push: {
          status: 'imported',
          imported_at: '2026-06-12T03:04:02.324Z',
          previous_imported_at: '2026-06-12T02:44:02.298Z',
          durability_action: 'refreshed_existing_packet',
        },
        windows_packet_count: 1,
      },
    },
  }, async (url, init) => {
    requests.push({ url: String(url), init });
    return {
      status: 200,
      async text() {
        return JSON.stringify({
          ok: true,
          status: 'recorded',
          report_record: {
            report_id: 'site-continuity-loop:site_alpha:2026-06-12T03:04:03.895Z',
            site_id: 'site_alpha',
            status: 'ok',
            generated_at: '2026-06-12T03:04:03.895Z',
            cloudflare_source: 'cloudflare.site.read',
            cloudflare_push_status: 'imported',
            windows_packet_count: 1,
            recorded_by_principal_id: 'principal:operator',
            recorded_at: '2026-06-12T03:04:04.681Z',
          },
        });
      },
    };
  });

  assert.equal(requests[0].url, 'https://carrier.example.test/api/carrier');
  assert.equal(requests[0].init.headers.cookie, 'narada_operator_session=operator-session-cookie');
  assert.equal(JSON.parse(requests[0].init.body).operation, 'site.continuity.loop.report.put');
  assert.equal(result.auth_source, 'operator-session-file');
  assert.deepEqual(result.summary, {
    ok: true,
    code: null,
    site_id: 'site_alpha',
    status: 'recorded',
    loop_report_id: 'site-continuity-loop:site_alpha:2026-06-12T03:04:03.895Z',
    generated_at: '2026-06-12T03:04:03.895Z',
    recorded_at: '2026-06-12T03:04:04.681Z',
    recorded_by_principal_id: 'principal:operator',
    freshness_state: null,
    freshness_reason: null,
    cloudflare_source: 'cloudflare.site.read',
    cloudflare_push_status: 'imported',
    windows_packet_count: 1,
    imported_at: '2026-06-12T03:04:02.324Z',
    previous_imported_at: '2026-06-12T02:44:02.298Z',
    durability_action: 'refreshed_existing_packet',
  });
});

test('putSiteContinuityLoopReport preserves structured refusal evidence', async () => {
  await assert.rejects(
    async () => putSiteContinuityLoopReport({
      workerUrl: 'https://carrier.example.test',
      reportFile: 'D:\\tmp\\report.json',
      requestId: 'loop-report-request',
      auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
      params: {
        site_id: 'site_alpha',
        report: {
          schema: 'narada.site_continuity_productized_loop.v1',
          site_id: 'site_alpha',
          status: 'ok',
        },
      },
    }, async () => ({
      status: 403,
      async text() {
        return JSON.stringify({ ok: false, code: 'site_authority_denied', site_id: 'site_alpha' });
      },
    })),
    (error) => {
      assert.match(error.message, /site_continuity_loop_report_request_failed:site_authority_denied/);
      assert.equal(error.summary.site_id, 'site_alpha');
      assert.equal(error.config.auth.source, 'flag:--token');
      return true;
    },
  );
});

test('formatSiteContinuityLoopReportText renders operator summary without auth material', () => {
  const text = formatSiteContinuityLoopReportText({
    status: 'ok',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      ok: true,
      site_id: 'site_alpha',
      status: 'recorded',
      loop_report_id: 'site-continuity-loop:site_alpha:2026-06-12T03:04:03.895Z',
      generated_at: '2026-06-12T03:04:03.895Z',
      recorded_at: '2026-06-12T03:04:04.681Z',
      recorded_by_principal_id: 'principal:operator',
      freshness_state: 'fresh',
      freshness_reason: 'site_continuity_loop_report_fresh',
      cloudflare_source: 'cloudflare.site.read',
      cloudflare_push_status: 'imported',
      windows_packet_count: 1,
      imported_at: '2026-06-12T03:04:02.324Z',
      previous_imported_at: '2026-06-12T02:44:02.298Z',
      durability_action: 'refreshed_existing_packet',
    },
  });

  assert.match(text, /Site Continuity Loop Report: ok/);
  assert.match(text, /Freshness Reason: site_continuity_loop_report_fresh/);
  assert.match(text, /Cloudflare Push: imported/);
  assert.match(text, /Durability: refreshed_existing_packet/);
  assert.doesNotMatch(text, /operator-session-cookie|secret-token/);
});

test('summarizeSiteContinuityLoopReport falls back to params when response is partial', () => {
  assert.deepEqual(
    summarizeSiteContinuityLoopReport(
      { ok: false, code: 'unauthorized' },
      {
        site_id: 'site_alpha',
        report: {
          site_id: 'site_alpha',
          generated_at: '2026-06-12T03:04:03.895Z',
          cloudflare_push: {
            status: 'imported',
          },
        },
      },
    ),
    {
      ok: false,
      code: 'unauthorized',
      site_id: 'site_alpha',
      status: null,
      loop_report_id: null,
      generated_at: '2026-06-12T03:04:03.895Z',
      recorded_at: null,
      recorded_by_principal_id: null,
      freshness_state: null,
      freshness_reason: null,
      cloudflare_source: null,
      cloudflare_push_status: 'imported',
      windows_packet_count: null,
      imported_at: null,
      previous_imported_at: null,
      durability_action: null,
    },
  );
});
