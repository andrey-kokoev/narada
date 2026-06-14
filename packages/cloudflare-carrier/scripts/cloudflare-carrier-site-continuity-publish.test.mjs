import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatSiteContinuityPublishText,
  parseSiteContinuityPublishArgs,
  publishCloudflareSiteContinuityPacket,
  summarizeSiteContinuityPublish,
} from './cloudflare-carrier-site-continuity-publish.mjs';

test('parseSiteContinuityPublishArgs builds publish request with operator session auth', () => {
  const parsed = parseSiteContinuityPublishArgs([
    '--url', 'https://carrier.example.test/',
    '--site', 'site_alpha',
    '--operator-session-cookie', 'operator-session-cookie',
    '--format', 'text',
  ], {}, () => 123);

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.requestId, 'site_continuity_packet_publish_site_alpha');
  assert.equal(parsed.format, 'text');
  assert.equal(parsed.operatorSessionFile, null);
  assert.deepEqual(parsed.auth, { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' });
  assert.deepEqual(parsed.params, { site_id: 'site_alpha' });
});

test('parseSiteContinuityPublishArgs refuses missing required inputs', () => {
  assert.throws(
    () => parseSiteContinuityPublishArgs(['--site', 'site_alpha', '--token', 'secret'], {}),
    /site_continuity_publish_requires_--url_or_CLOUDFLARE_CARRIER_URL/,
  );
  assert.throws(
    () => parseSiteContinuityPublishArgs(['--url', 'https://carrier.example.test', '--token', 'secret'], {}),
    /site_continuity_publish_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID/,
  );
  assert.throws(
    () => parseSiteContinuityPublishArgs(['--url', 'https://carrier.example.test', '--site', 'site_alpha'], {}),
    /site_continuity_publish_requires_bearer_token_or_operator_session/,
  );
});

test('publishCloudflareSiteContinuityPacket posts publish envelope and redacts auth', async () => {
  const requests = [];
  const result = await publishCloudflareSiteContinuityPacket({
    workerUrl: 'https://carrier.example.test',
    requestId: 'publish-request',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-file' },
    params: { site_id: 'site_alpha' },
  }, async (url, init) => {
    requests.push({ url: String(url), init });
    return {
      status: 200,
      async text() {
        return JSON.stringify({
          ok: true,
          schema: 'narada.cloudflare_site_continuity_packet_publish.v1',
          status: 'imported',
          site_id: 'site_alpha',
          packet: {
            packet_id: 'packet-1',
            site_id: 'site_alpha',
            source_embodiment_kind: 'cloudflare_carrier',
            target_embodiment_kind: 'local_windows',
          },
          site_continuity_packet_admission: {
            action: 'projection_only',
            reason: 'site_continuity_exchange_packet_projection_admitted',
          },
          packet_record: {
            durability_action: 'inserted_new_packet',
            imported_at: '2026-06-12T03:10:00.000Z',
            previous_imported_at: null,
            imported_by_principal_id: 'principal:operator',
          },
        });
      },
    };
  });

  assert.equal(requests[0].url, 'https://carrier.example.test/api/carrier');
  assert.equal(requests[0].init.headers.cookie, 'narada_operator_session=operator-session-cookie');
  assert.equal(JSON.parse(requests[0].init.body).operation, 'site.continuity.packet.publish');
  assert.equal(result.auth_source, 'operator-session-file');
  assert.deepEqual(result.summary, {
    ok: true,
    code: null,
    site_id: 'site_alpha',
    status: 'imported',
    packet_id: 'packet-1',
    source_embodiment_kind: 'cloudflare_carrier',
    target_embodiment_kind: 'local_windows',
    packet_admission_action: 'projection_only',
    packet_admission_reason: 'site_continuity_exchange_packet_projection_admitted',
    durability_action: 'inserted_new_packet',
    imported_at: '2026-06-12T03:10:00.000Z',
    previous_imported_at: null,
    imported_by_principal_id: 'principal:operator',
  });
});

test('publishCloudflareSiteContinuityPacket preserves structured refusal evidence', async () => {
  await assert.rejects(
    async () => publishCloudflareSiteContinuityPacket({
      workerUrl: 'https://carrier.example.test',
      requestId: 'publish-request',
      auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
      params: { site_id: 'site_alpha' },
    }, async () => ({
      status: 403,
      async text() {
        return JSON.stringify({ ok: false, code: 'site_authority_denied', site_id: 'site_alpha' });
      },
    })),
    (error) => {
      assert.match(error.message, /site_continuity_publish_request_failed:site_authority_denied/);
      assert.equal(error.summary.site_id, 'site_alpha');
      assert.equal(error.config.auth.source, 'flag:--token');
      return true;
    },
  );
});

test('formatSiteContinuityPublishText renders operator summary without auth material', () => {
  const text = formatSiteContinuityPublishText({
      status: 'ok',
      worker_url: 'https://carrier.example.test',
      operator_session_file: 'D:\\narada\\.narada\\auth\\cloudflare-operator-session.json',
      auth_source: 'operator-session-file',
      summary: {
        ok: true,
        site_id: 'site_alpha',
      status: 'imported',
      packet_id: 'packet-1',
      source_embodiment_kind: 'cloudflare_carrier',
      target_embodiment_kind: 'local_windows',
      packet_admission_action: 'projection_only',
      packet_admission_reason: 'site_continuity_exchange_packet_projection_admitted',
      durability_action: 'refreshed_existing_packet',
      imported_at: '2026-06-12T03:10:00.000Z',
      previous_imported_at: '2026-06-12T03:05:00.000Z',
      imported_by_principal_id: 'principal:operator',
    },
  });

  assert.match(text, /Site Continuity Publish: ok/);
  assert.match(text, /Direction: cloudflare_carrier -> local_windows/);
  assert.match(text, /Admission: projection_only reason=site_continuity_exchange_packet_projection_admitted/);
  assert.match(text, /Durability: refreshed_existing_packet/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text/);
  assert.match(text, /Operation List: pnpm --filter @narada2\/cloudflare-carrier product:operation:list:text/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file D:\\narada\\\.narada\\auth\\cloudflare-operator-session\.json --execute-site-next/);
  assert.doesNotMatch(text, /operator-session-cookie|secret-token/);
});

test('summarizeSiteContinuityPublish falls back to params when response is partial', () => {
  assert.deepEqual(
    summarizeSiteContinuityPublish({ ok: false, code: 'unauthorized' }, { site_id: 'site_alpha' }),
    {
      ok: false,
      code: 'unauthorized',
      site_id: 'site_alpha',
      status: null,
      packet_id: null,
      source_embodiment_kind: null,
      target_embodiment_kind: null,
      packet_admission_action: null,
      packet_admission_reason: null,
      durability_action: null,
      imported_at: null,
      previous_imported_at: null,
      imported_by_principal_id: null,
    },
  );
});
