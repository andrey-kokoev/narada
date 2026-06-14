import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatSiteAuthorityReadText,
  parseSiteAuthorityReadArgs,
  readSiteAuthority,
  summarizeSiteAuthority,
} from './cloudflare-carrier-site-authority-read.mjs';

test('parseSiteAuthorityReadArgs reuses site.read parsing', () => {
  const parsed = parseSiteAuthorityReadArgs([
    '--url', 'https://carrier.example.test',
    '--site', 'site_alpha',
    '--operator-session-cookie', 'operator-session-cookie',
    '--format', 'text',
  ], {});

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.operation, 'site.read');
  assert.equal(parsed.params.site_id, 'site_alpha');
  assert.equal(parsed.format, 'text');
  assert.equal(parsed.auth.kind, 'operator_session');
});

test('summarizeSiteAuthority lifts map and decision counts', () => {
  const summary = summarizeSiteAuthority({
    site: { site_id: 'site_alpha' },
    site_product_status: { health: 'attention', next_action: 'read_site_authority' },
    focused_operation_lifecycle: {
      operation_id: 'operation_alpha',
      workflow_route: { next_action: 'refresh_site_continuity_loop' },
    },
    site_authority: {
      map: {
        site_id: 'site_alpha',
        classifier_version: 'site_authority_map.v1',
        embodiments: [{ embodiment_kind: 'cloudflare_carrier' }, { embodiment_kind: 'local_windows' }],
        entries: [
          { mutation_class: 'task_artifact_mutation', authority_locus: 'cloudflare-carrier-task-store' },
          { mutation_class: 'local_repository_filesystem_mutation', authority_locus: 'local-windows-site-authority' },
        ],
      },
      decisions: [
        { action: 'admit' },
        { action: 'refuse' },
        { action: 'projection_only' },
      ],
    },
  });

  assert.equal(summary.site_id, 'site_alpha');
  assert.equal(summary.entry_count, 2);
  assert.equal(summary.admitted_count, 1);
  assert.equal(summary.refused_count, 1);
  assert.equal(summary.projection_only_count, 1);
  assert.equal(summary.active_operation_id, 'operation_alpha');
  assert.equal(summary.active_operation_next_action, 'refresh_site_continuity_loop');
  assert.deepEqual(summary.mutation_classes, ['task_artifact_mutation', 'local_repository_filesystem_mutation']);
});

test('readSiteAuthority returns summarized authority read', async () => {
  const result = await readSiteAuthority({
    workerUrl: 'https://carrier.example.test',
    operation: 'site.read',
    params: { site_id: 'site_alpha' },
    auth: { kind: 'operator_session', value: 'cookie-value', source: 'operator-session-file' },
  }, async () => ({
    status: 200,
    ok: true,
    text: async () => JSON.stringify({
      site: { site_id: 'site_alpha' },
      site_product_status: { health: 'attention', next_action: 'read_site_authority' },
      site_authority: {
        map: {
          site_id: 'site_alpha',
          classifier_version: 'site_authority_map.v1',
          embodiments: [{ embodiment_kind: 'cloudflare_carrier' }],
          entries: [{ mutation_class: 'task_artifact_mutation', authority_locus: 'cloudflare-carrier-task-store' }],
        },
        decisions: [{ action: 'admit' }],
      },
    }),
  }));

  assert.equal(result.schema, 'narada.cloudflare_carrier.site_authority_read.v1');
  assert.equal(result.summary.site_id, 'site_alpha');
  assert.equal(result.summary.admitted_count, 1);
});

test('formatSiteAuthorityReadText prints authority summary', () => {
  const text = formatSiteAuthorityReadText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      active_operation_id: 'operation_alpha',
      active_operation_next_action: 'refresh_site_continuity_loop',
      classifier_version: 'site_authority_map.v1',
      embodiment_count: 2,
      entry_count: 3,
      decision_count: 3,
      admitted_count: 1,
      refused_count: 1,
      projection_only_count: 1,
      health: 'attention',
      next_action: 'read_site_authority',
      mutation_classes: ['task_artifact_mutation', 'read_model_projection'],
      authority_loci: ['cloudflare-carrier-task-store', 'cloudflare-carrier:projection'],
    },
  });

  assert.match(text, /Site Authority: ok/);
  assert.match(text, /Authority Map: classifier=site_authority_map\.v1 embodiments=2 entries=3/);
  assert.match(text, /Decisions: total=3 admitted=1 refused=1 projection_only=1/);
  assert.match(text, /Posture: health=attention next=read_site_authority/);
  assert.match(text, /Mutation Classes: task_artifact_mutation, read_model_projection/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file> --execute-site-next/);
  assert.match(text, /Site Action Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:action:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file> --execute-site-action/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file> --execute-operation-next/);
});
