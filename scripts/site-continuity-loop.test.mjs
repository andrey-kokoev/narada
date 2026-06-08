import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  SITE_CONTINUITY_EMBODIMENT_KINDS,
  SITE_CONTINUITY_EXCHANGE_CLASSES,
  classifySiteContinuityExchange,
  createSiteContinuityBinding,
  createSiteContinuityExchangePacket,
} from '../packages/site-continuity/src/site-continuity.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT_PATH = fileURLToPath(new URL('./site-continuity-loop.mjs', import.meta.url));

function runLoop(args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT_PATH, ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function createCloudflarePacket({ site_id, generated_at }) {
  const binding = createSiteContinuityBinding({
    site_id,
    local_windows_site_ref: `windows://site/${site_id}`,
    cloudflare_site_ref: `cloudflare://site/${site_id}`,
    authority_map_ref: 'site-authority-map:v1',
    generated_at,
  });
  const direction = {
    site_id,
    source_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
    target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
  };
  const decisions = [
    classifySiteContinuityExchange(binding, {
      ...direction,
      exchange_class: SITE_CONTINUITY_EXCHANGE_CLASSES.SITE_IDENTITY_BINDING,
    }),
    classifySiteContinuityExchange(binding, {
      ...direction,
      exchange_class: SITE_CONTINUITY_EXCHANGE_CLASSES.READ_MODEL_PROJECTION,
    }),
    classifySiteContinuityExchange(binding, {
      ...direction,
      exchange_class: SITE_CONTINUITY_EXCHANGE_CLASSES.MUTATION_EVIDENCE_REFERENCE,
    }),
  ];

  return createSiteContinuityExchangePacket({
    binding,
    source_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
    target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
    decisions,
    projections: [
      {
        projection_class: SITE_CONTINUITY_EXCHANGE_CLASSES.READ_MODEL_PROJECTION,
        source_cursor: generated_at,
        summary: 'Cloudflare Site continuity read-model projection',
      },
    ],
    evidence_refs: [
      {
        evidence_ref: `cloudflare://carrier/site/${site_id}/authority-events/1`,
        authority_locus: 'cloudflare-carrier',
      },
    ],
    generated_at,
  });
}

test('site continuity loop emits an idempotent offline operator report without token material', async () => {
  const workdir = await mkdtemp(join(tmpdir(), 'narada-site-continuity-loop-'));
  const packetPath = join(workdir, 'cloudflare-packet.json');
  const registryPath = join(workdir, 'registry.db');
  const siteId = 'site_loop_offline_fixture';
  const generatedAt = '2026-06-08T00:00:00.000Z';
  const importedAt = '2026-06-08T00:00:01.000Z';
  await mkdir(workdir, { recursive: true });
  await writeFile(packetPath, `${JSON.stringify({ packet: createCloudflarePacket({ site_id: siteId, generated_at: generatedAt }) }, null, 2)}\n`, 'utf8');

  const args = [
    'sync-cloudflare',
    '--site', siteId,
    '--cloudflare-packet', packetPath,
    '--skip-cloudflare-push',
    '--registry', registryPath,
    '--generated-at', generatedAt,
    '--imported-at', importedAt,
  ];

  const first = await runLoop(args);
  assert.equal(first.code, 0, first.stderr);
  const firstReport = JSON.parse(first.stdout);
  assert.equal(firstReport.schema, 'narada.site_continuity_productized_loop.v1');
  assert.equal(firstReport.status, 'ok');
  assert.equal(firstReport.site_id, siteId);
  assert.equal(firstReport.cloudflare_source, 'file');
  assert.equal(firstReport.cloudflare_worker_url, null);
  assert.equal(firstReport.cloudflare_credential_source, null);
  assert.equal(firstReport.cloudflare_push.status, 'skipped');
  assert.equal(firstReport.windows_packet_count, 1);
  assert.equal(firstReport.windows_packets.length, 1);
  assert.equal(firstReport.windows_packets[0].source_embodiment_kind, SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER);
  assert.equal(firstReport.windows_packets[0].target_embodiment_kind, SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS);
  assert.deepEqual(firstReport.authority_boundary, {
    executable_cross_embodiment_mutation: 'refused_by_site_continuity_classifier',
    durable_mutation_authority: 'unchanged; routed_by_site_authority_map',
  });
  assert.doesNotMatch(first.stdout, /test-token|Bearer|authorization/i);

  const second = await runLoop(args);
  assert.equal(second.code, 0, second.stderr);
  const secondReport = JSON.parse(second.stdout);
  assert.equal(secondReport.status, 'ok');
  assert.equal(secondReport.windows_packet_count, 1);
  assert.deepEqual(
    secondReport.windows_packets.map((packet) => packet.packet_id),
    firstReport.windows_packets.map((packet) => packet.packet_id),
  );
});
