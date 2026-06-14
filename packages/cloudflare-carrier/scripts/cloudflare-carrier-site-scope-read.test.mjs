import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatSiteScopeReadText,
  parseSiteScopeReadArgs,
  readSiteScope,
  summarizeSiteScope,
} from './cloudflare-carrier-site-scope-read.mjs';

test('parseSiteScopeReadArgs reuses site.read parsing', () => {
  const parsed = parseSiteScopeReadArgs([
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

test('summarizeSiteScope lifts scope and inventory details', () => {
  const summary = summarizeSiteScope({
    site: { site_id: 'site_alpha', display_name: 'Alpha', status: 'active' },
    site_product_status: { health: 'attention', next_action: 'focus_site_operation' },
    focused_operation_lifecycle: {
      operation_id: 'operation_alpha',
      workflow_route: {
        next_action: 'refresh_site_continuity_loop',
        focus_kind: 'site_continuity_reconciliation_execution',
        focus_ref: 'focus-ref',
      },
    },
    operations: [{ operation_id: 'op1' }, { operation_id: 'op2' }],
    memberships: [{ principal: 'a' }],
    authority_events: [{ event_id: 'evt1' }],
    site_authority: { decisions: [{ action: 'admit' }, { action: 'refuse' }] },
    cloudflare_persistence_posture: { state: 'durable' },
    cloudflare_recovery_posture: { state: 'reconstructable' },
  });

  assert.equal(summary.scope_loaded, true);
  assert.equal(summary.operation_count, 2);
  assert.equal(summary.membership_count, 1);
  assert.equal(summary.authority_count, 3);
  assert.equal(summary.next_action, 'focus_site_operation');
  assert.equal(summary.active_operation_id, 'operation_alpha');
  assert.equal(summary.active_operation_next_action, 'refresh_site_continuity_loop');
  assert.equal(summary.active_operation_focus_kind, 'site_continuity_reconciliation_execution');
  assert.equal(summary.active_operation_focus_ref, 'focus-ref');
});

test('readSiteScope returns summarized site scope', async () => {
  const result = await readSiteScope({
    workerUrl: 'https://carrier.example.test',
    operation: 'site.read',
    params: { site_id: 'site_alpha' },
    auth: { kind: 'operator_session', value: 'cookie-value', source: 'operator-session-file' },
  }, async () => ({
    status: 200,
    ok: true,
    text: async () => JSON.stringify({
      site: { site_id: 'site_alpha', display_name: 'Alpha', status: 'active' },
      site_product_status: { health: 'ready', next_action: 'monitor_site' },
      operations: [{ operation_id: 'op1' }],
      memberships: [{ principal: 'a' }],
      site_authority: { decisions: [{ action: 'admit' }] },
    }),
  }));

  assert.equal(result.schema, 'narada.cloudflare_carrier.site_scope_read.v1');
  assert.equal(result.summary.site_id, 'site_alpha');
  assert.equal(result.summary.operation_count, 1);
});

test('formatSiteScopeReadText prints scope summary', () => {
  const text = formatSiteScopeReadText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      display_name: 'Alpha',
      scope_loaded: true,
      health: 'attention',
      next_action: 'focus_site_operation',
      active_operation_id: 'operation_alpha',
      active_operation_next_action: 'refresh_site_continuity_loop',
      active_operation_focus_kind: 'site_continuity_reconciliation_execution',
      active_operation_focus_ref: 'focus-ref',
      status: 'active',
      operation_count: 2,
      membership_count: 1,
      authority_count: 3,
      persistence_state: 'durable',
      recovery_state: 'reconstructable',
    },
  });

  assert.match(text, /Site Scope: ok/);
  assert.match(text, /Scope Loaded: yes/);
  assert.match(text, /Posture: health=attention next=focus_site_operation status=active/);
  assert.match(text, /Inventory: operations=2 memberships=1 authority=3/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file> --execute-site-next/);
  assert.match(text, /Site Action Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:action:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file> --execute-site-action/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file> --execute-operation-next/);
  assert.match(text, /Continuity Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:continuity:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --expected-pre-action refresh_site_continuity_loop --operator-session-file <operator-session-file> --execute-operation-continuity/);
  assert.doesNotMatch(text, /Review Ack:/);
});

test('formatSiteScopeReadText suppresses scoped handoffs without worker url', () => {
  const text = formatSiteScopeReadText({
    worker_url: null,
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      display_name: 'Alpha',
      scope_loaded: true,
      health: 'attention',
      next_action: 'focus_site_operation',
      active_operation_id: 'operation_alpha',
      active_operation_next_action: 'refresh_site_continuity_loop',
      active_operation_focus_kind: 'site_continuity_reconciliation_execution',
      active_operation_focus_ref: 'focus-ref',
      status: 'active',
      operation_count: 2,
      membership_count: 1,
      authority_count: 3,
      persistence_state: 'durable',
      recovery_state: 'reconstructable',
    },
  });

  assert.doesNotMatch(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text/);
  assert.doesNotMatch(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text/);
  assert.doesNotMatch(text, /Site Action Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:action:workflow:live:text/);
  assert.doesNotMatch(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.doesNotMatch(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
  assert.doesNotMatch(text, /Continuity Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:continuity:workflow:live:text/);
  assert.doesNotMatch(text, /Review Ack: pnpm --filter @narada2\/cloudflare-carrier product:operation:focus-review:text/);
});

test('formatSiteScopeReadText renders review ack from active operation route', () => {
  const text = formatSiteScopeReadText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      display_name: 'Alpha',
      scope_loaded: true,
      health: 'attention',
      next_action: 'focus_site_operation',
      active_operation_id: 'operation_alpha',
      active_operation_next_action: 'review_site_continuity_reconciliation_execution',
      active_operation_focus_kind: 'site_continuity_reconciliation_execution',
      active_operation_focus_ref: 'focus-ref',
      status: 'active',
      operation_count: 1,
      membership_count: 1,
      authority_count: 1,
      persistence_state: 'durable',
      recovery_state: 'reconstructable',
    },
  });

  assert.match(text, /Review Ack: pnpm --filter @narada2\/cloudflare-carrier product:operation:focus-review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --focus-kind site_continuity_reconciliation_execution --focus-ref focus-ref --operator-session-file <operator-session-file>/);
});
