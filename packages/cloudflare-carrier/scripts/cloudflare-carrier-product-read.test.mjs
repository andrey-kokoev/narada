import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  authHeaders,
  formatProductSurfaceText,
  parseProductReadArgs,
  readProductSurface,
  resolveAuth,
  summarizeProductReadFailure,
  summarizeProductSurface,
} from './cloudflare-carrier-product-read.mjs';

test('parseProductReadArgs builds site.list request with bearer token', () => {
  const parsed = parseProductReadArgs([
    '--url', 'https://carrier.example.test/',
    '--token', 'secret-token',
    '--limit', '5',
    '--request-id', 'request_fixture',
  ], {});

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.operation, 'site.list');
  assert.equal(parsed.requestId, 'request_fixture');
  assert.deepEqual(parsed.params, { limit: 5 });
  assert.deepEqual(parsed.auth, { kind: 'bearer', value: 'secret-token', source: 'flag:--token' });
});

test('parseProductReadArgs accepts operator text format', () => {
  const parsed = parseProductReadArgs([
    '--url', 'https://carrier.example.test',
    '--token', 'secret-token',
    '--format', 'text',
  ], {});

  assert.equal(parsed.format, 'text');
});

test('parseProductReadArgs accepts continuation selector for operation list only', () => {
  const parsed = parseProductReadArgs([
    '--operation', 'operation.list',
    '--url', 'https://carrier.example.test',
    '--token', 'secret-token',
    '--site', 'site_fixture',
    '--continuation',
  ], {});

  assert.equal(parsed.operation, 'operation.list');
  assert.equal(parsed.continuation, true);
  assert.deepEqual(parsed.params, { site_id: 'site_fixture' });

  assert.throws(
    () => parseProductReadArgs([
      '--operation', 'operation.read',
      '--url', 'https://carrier.example.test',
      '--token', 'secret-token',
      '--site', 'site_fixture',
      '--operation-id', 'operation_fixture',
      '--continuation',
    ], {}),
    /product_read_continuation_requires_operation\.list/,
  );
});

test('parseProductReadArgs builds site.read operation.list and operation.read params', () => {
  const siteRead = parseProductReadArgs([
    'site.read',
    '--url', 'https://carrier.example.test',
    '--token', 'secret-token',
    '--site', 'site_fixture',
  ], {});
  assert.equal(siteRead.operation, 'site.read');
  assert.deepEqual(siteRead.params, { site_id: 'site_fixture' });

  const operationList = parseProductReadArgs([
    '--operation', 'operation.list',
    '--url', 'https://carrier.example.test',
    '--token', 'secret-token',
    '--site', 'site_fixture',
    '--limit', '3',
  ], {});
  assert.equal(operationList.operation, 'operation.list');
  assert.deepEqual(operationList.params, { site_id: 'site_fixture', limit: 3 });

  const operationRead = parseProductReadArgs([
    '--operation', 'operation.read',
    '--url', 'https://carrier.example.test',
    '--token', 'secret-token',
    '--site', 'site_fixture',
    '--operation-id', 'operation_fixture',
  ], {});
  assert.equal(operationRead.operation, 'operation.read');
  assert.deepEqual(operationRead.params, { site_id: 'site_fixture', operation_id: 'operation_fixture' });
});

test('parseProductReadArgs refuses missing required operation identifiers', () => {
  assert.throws(
    () => parseProductReadArgs(['site.read', '--url', 'https://carrier.example.test', '--token', 'secret-token'], {}),
    /product_read_site\.read_requires_--site/,
  );
  assert.throws(
    () => parseProductReadArgs(['operation.list', '--url', 'https://carrier.example.test', '--token', 'secret-token'], {}),
    /product_read_operation\.list_requires_--site/,
  );
  assert.throws(
    () => parseProductReadArgs(['operation.read', '--url', 'https://carrier.example.test', '--token', 'secret-token', '--site', 'site_fixture'], {}),
    /product_read_operation\.read_requires_--operation-id_or_--carrier-operation/,
  );
});

test('resolveAuth accepts captured operator session file without exposing cookie in headers source', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'narada-product-read-'));
  const sessionFile = join(dir, 'operator-session.json');
  await writeFile(sessionFile, JSON.stringify({ cookie: 'narada_operator_session=cookie-value; Path=/' }), 'utf8');

  const auth = resolveAuth(['--operator-session-file', sessionFile], {});
  assert.deepEqual(auth, { kind: 'operator_session', value: 'cookie-value', source: 'operator-session-file' });
  assert.deepEqual(authHeaders(auth), { cookie: 'narada_operator_session=cookie-value' });

  const explicitOperatorAuth = resolveAuth(['--operator-session-file', sessionFile], {
    CLOUDFLARE_CARRIER_TOKEN: 'ambient-token',
  });
  assert.deepEqual(explicitOperatorAuth, { kind: 'operator_session', value: 'cookie-value', source: 'operator-session-file' });
});

test('readProductSurface posts operation envelope and redacts auth material from result envelope', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: url.toString(), init });
    return {
      status: 200,
      async text() {
        return JSON.stringify({
          sites: [{ site_id: 'site_alpha' }],
          site_product_overview: {
            site_count: 1,
            next_site_id: 'site_alpha',
            next_health: 'ready',
            next_action: 'monitor_sites',
            next_reason: 'sites_ready',
            health_counts: { ready: 1, attention: 0, incomplete: 0, other: 0 },
          },
          site_posture_route: {
            schema: 'narada.cloudflare_site_posture_route.v1',
            domain: 'site_posture',
            command_state: 'site_posture_ready',
            command_action: 'monitor_sites',
            next_action: 'monitor_sites',
            target: 'site_alpha',
            status: 'ready',
            reason: 'sites_ready',
          },
        });
      },
    };
  };

  const result = await readProductSurface({
    workerUrl: 'https://carrier.example.test',
    operation: 'site.list',
    requestId: 'request_fixture',
    params: { limit: 10 },
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
  }, fetchImpl);

  assert.equal(calls[0].url, 'https://carrier.example.test/api/carrier');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(calls[0].init.headers, {
    'content-type': 'application/json',
    authorization: 'Bearer secret-token',
  });
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    operation: 'site.list',
    request_id: 'request_fixture',
    params: { limit: 10 },
  });
  assert.equal(result.schema, 'narada.cloudflare_carrier.product_read.v1');
  assert.equal(result.auth_source, 'flag:--token');
  assert.equal(JSON.stringify(result).includes('secret-token'), false);
  assert.deepEqual(result.summary, {
    operation: 'site.list',
    site_count: 1,
    next_site_id: 'site_alpha',
    next_health: 'ready',
    next_action: 'monitor_sites',
    next_reason: 'sites_ready',
    next_operation_id: null,
    next_operation_next_action: null,
    next_operation_reason: null,
    next_operation_active_session_id: null,
    next_operation_local_ingress_request_count: 0,
    next_operation_local_ingress_evidence_count: 0,
    next_operation_local_ingress_provider_heartbeat_count: 0,
    next_operation_repository_publication_request_count: 0,
    next_operation_repository_publication_execution_count: 0,
    next_operation_repository_publication_evidence_count: 0,
    next_operation_repository_publication_provider_heartbeat_count: 0,
    next_operation_focus_kind: null,
    next_operation_focus_ref: null,
    health_counts: { ready: 1, attention: 0, incomplete: 0, other: 0 },
    route_domain: 'site_posture',
    route_command_state: 'site_posture_ready',
    route_command_action: 'monitor_sites',
    route_next_action: 'monitor_sites',
    route_target: 'site_alpha',
    route_status: 'ready',
    route_reason: 'sites_ready',
  });
});

test('readProductSurface preserves structured Worker refusal evidence', async () => {
  await assert.rejects(
    async () => {
      await readProductSurface({
        workerUrl: 'https://carrier.example.test',
        operation: 'operation.read',
        requestId: 'request_denied',
        params: { site_id: 'site_alpha', operation_id: 'operation_missing' },
        format: 'text',
        auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
      }, async () => ({
        status: 404,
        async text() {
          return JSON.stringify({
            ok: false,
            code: 'operation_not_found',
            action: 'deny',
            reason: 'operation_read_target_missing',
            site_id: 'site_alpha',
            operation_id: 'operation_missing',
          });
        },
      }));
    },
    (error) => {
      assert.match(error.message, /product_read_request_failed:operation_not_found/);
      assert.equal(error.code, 'operation_not_found');
      assert.equal(error.http_status, 404);
      assert.equal(error.response.reason, 'operation_read_target_missing');
      assert.deepEqual(error.summary, {
        operation: 'operation.read',
        ok: false,
        code: 'operation_not_found',
        action: 'deny',
        reason: 'operation_read_target_missing',
        site_id: 'site_alpha',
        operation_id: 'operation_missing',
        status: null,
      });
      assert.equal(error.config.format, 'text');
      return true;
    },
  );
});

test('formatProductSurfaceText renders operator-readable summaries without auth material', () => {
  const siteListText = formatProductSurfaceText({
    operation: 'site.list',
    worker_url: 'https://carrier.example.test',
    auth_source: 'flag:--token',
    summary: {
      operation: 'site.list',
      site_count: 2,
      next_site_id: 'site_alpha',
      next_health: 'attention',
      next_action: 'bind_cloudflare_product_next_site_locally',
      next_reason: 'continuity_direction',
      health_counts: { ready: 1, attention: 1 },
      route_domain: 'site_posture',
      route_command_state: 'site_posture_ready',
      route_command_action: 'monitor_sites',
      route_next_action: 'return_local_windows_continuity_packet',
      route_target: 'site_alpha',
      route_status: 'ready',
      route_reason: 'continuity_direction',
    },
    auth: { kind: 'bearer', value: 'secret-token' },
  });
  assert.match(siteListText, /Product Read: site\.list/);
  assert.match(siteListText, /Sites: count=2/);
  assert.match(siteListText, /Overview Candidate: site=site_alpha health=attention action=bind_cloudflare_product_next_site_locally reason=continuity_direction/);
  assert.match(siteListText, /Site Route: domain=site_posture state=site_posture_ready action=return_local_windows_continuity_packet target=site_alpha status=ready reason=continuity_direction/);
  assert.match(siteListText, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file> --execute-site-next/);
  assert.equal(siteListText.includes('secret-token'), false);

  const siteListFocusText = formatProductSurfaceText({
    operation: 'site.list',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'site.list',
      site_count: 2,
      next_site_id: 'site_alpha',
      next_health: 'attention',
      next_action: 'focus_next_operation',
      next_reason: 'operation_posture',
      next_operation_id: 'operation_alpha',
      next_operation_next_action: 'refresh_site_continuity_loop',
      next_operation_reason: 'operation_lifecycle_continuity_loop_stale',
      next_operation_active_session_id: 'session_alpha',
      next_operation_local_ingress_request_count: 7,
      next_operation_local_ingress_evidence_count: 4,
      next_operation_local_ingress_provider_heartbeat_count: 20,
      next_operation_repository_publication_request_count: 25,
      next_operation_repository_publication_execution_count: 25,
      next_operation_repository_publication_evidence_count: 13,
      next_operation_repository_publication_provider_heartbeat_count: 20,
      next_operation_focus_kind: 'site_continuity_loop',
      next_operation_focus_ref: 'site_alpha',
      route_domain: 'site_posture',
      route_command_state: 'site_posture_attention',
      route_command_action: 'focus_next_site',
      route_next_action: 'focus_next_site',
      route_target: 'site_alpha',
      route_status: 'needs_attention',
      route_reason: 'operation_posture',
    },
  });
  assert.match(siteListFocusText, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file> --execute-site-next/);
  assert.match(siteListFocusText, /Candidate Operation Route: operation=operation_alpha action=refresh_site_continuity_loop reason=operation_lifecycle_continuity_loop_stale/);
  assert.match(siteListFocusText, /Candidate Operation Focus: kind=site_continuity_loop ref=site_alpha/);
  assert.match(siteListFocusText, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(siteListFocusText, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(siteListFocusText, /Task Review: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(siteListFocusText, /Session Evidence: pnpm --filter @narada2\/cloudflare-carrier product:session:evidence:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --carrier-session-id session_alpha --operator-session-file <operator-session-file>/);
  assert.match(siteListFocusText, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --carrier-session-id session_alpha --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next/);
  assert.match(siteListFocusText, /Persistence Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:persistence:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(siteListFocusText, /Recovery Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:recovery:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(siteListFocusText, /Local Ingress: requests=7 evidence=4 heartbeats=20/);
  assert.match(siteListFocusText, /Local Ingress Request Review: pnpm --filter @narada2\/cloudflare-carrier product:local-ingress:request:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(siteListFocusText, /Local Ingress Evidence Review: pnpm --filter @narada2\/cloudflare-carrier product:local-ingress:evidence:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(siteListFocusText, /Local Ingress Provider Liveness: pnpm --filter @narada2\/cloudflare-carrier product:local-ingress:provider:liveness:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(siteListFocusText, /Repository Publication: requests=25 executions=25 evidence=13 heartbeats=20/);
  assert.match(siteListFocusText, /Repository Publication Review: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:request:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(siteListFocusText, /Repository Publication Execution Read: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:cloudflare-execution:list:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(siteListFocusText, /Repository Publication Evidence Read: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:evidence:list:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(siteListFocusText, /Repository Publication Provider Liveness: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:provider:liveness:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(siteListFocusText, /Focus Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:focus:workflow:live:text -- --url https:\/\/carrier\.example\.test --focused-site-id site_alpha --operator-session-file <operator-session-file> --execute-site-focus/);
  assert.match(siteListFocusText, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file> --execute-operation-next/);
  assert.match(siteListFocusText, /Continuity Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:continuity:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --expected-pre-action refresh_site_continuity_loop --operator-session-file <operator-session-file> --execute-operation-continuity/);

  const siteListContinuityReviewText = formatProductSurfaceText({
    operation: 'site.list',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'site.list',
      site_count: 2,
      next_site_id: 'site_alpha',
      next_health: 'attention',
      next_action: 'focus_next_operation',
      next_reason: 'operation_posture',
      next_operation_id: 'operation_alpha',
      next_operation_next_action: 'review_site_continuity_reconciliation_execution',
      next_operation_reason: 'operation_operator_focus_needs_review',
      next_operation_focus_kind: 'site_continuity_reconciliation_execution',
      next_operation_focus_ref: 'site-continuity-reconciliation-execution:site_alpha:2026-06-13T23:54:54.778Z:completed',
      route_domain: 'site_posture',
      route_command_state: 'site_posture_attention',
      route_command_action: 'focus_next_site',
      route_next_action: 'focus_next_site',
      route_target: 'site_alpha',
      route_status: 'needs_attention',
      route_reason: 'operation_posture',
    },
  });
  assert.match(siteListContinuityReviewText, /Candidate Operation Focus: kind=site_continuity_reconciliation_execution ref=site-continuity-reconciliation-execution:site_alpha:2026-06-13T23:54:54.778Z:completed/);
  assert.match(siteListContinuityReviewText, /Review Ack: pnpm --filter @narada2\/cloudflare-carrier product:operation:focus-review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --focus-kind site_continuity_reconciliation_execution --focus-ref site-continuity-reconciliation-execution:site_alpha:2026-06-13T23:54:54.778Z:completed --operator-session-file <operator-session-file>/);

  const operationFallbackText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      current_status: 'active',
      status_transition_count: 1,
      phase: 'active_uninhabited',
      health: 'incomplete',
      next_action: 'session',
      workflow_next_action: 'request_windows_fallback_resident_dispatch',
      workflow_reason: 'windows_fallback_request_not_recorded',
      workflow_focus_ref: 'resident_dispatch_alpha',
      session_count: 0,
      task_count: 0,
    },
  });
  assert.match(operationFallbackText, /Resident Dispatch Windows Fallback Request: pnpm --filter @narada2\/cloudflare-carrier product:resident-dispatch:windows-fallback-request:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --dispatch-decision-id resident_dispatch_alpha --operator-session-file <operator-session-file>/);

  const operationFallbackWithoutDecisionText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      current_status: 'active',
      status_transition_count: 1,
      phase: 'active_uninhabited',
      health: 'incomplete',
      next_action: 'session',
      workflow_next_action: 'request_windows_fallback_resident_dispatch',
      workflow_reason: 'windows_fallback_request_not_recorded',
      session_count: 0,
      task_count: 0,
    },
  });
  assert.doesNotMatch(operationFallbackWithoutDecisionText, /Resident Dispatch Windows Fallback Request:/);

  const operationFallbackPendingText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      current_status: 'active',
      status_transition_count: 1,
      phase: 'active_uninhabited',
      health: 'incomplete',
      next_action: 'session',
      workflow_next_action: 'await_windows_fallback_resident_dispatch',
      workflow_reason: 'windows_fallback_request_pending_execution',
      session_count: 0,
      task_count: 0,
    },
  });
  assert.match(operationFallbackPendingText, /Resident Dispatch Windows Fallback Execute: pnpm --filter @narada2\/cloudflare-carrier product:resident-dispatch:windows-fallback:execute:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file> --execute-windows-fallback/);
  assert.match(operationFallbackPendingText, /Resident Dispatch Windows Fallback Read: pnpm --filter @narada2\/cloudflare-carrier product:resident-dispatch:windows-fallback-request:text -- --operation resident_dispatch\.windows_fallback_request\.list --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);

  const operationFallbackEvidenceText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      current_status: 'active',
      status_transition_count: 1,
      phase: 'active_uninhabited',
      health: 'attention',
      next_action: 'session',
      workflow_next_action: 'review_windows_fallback_resident_dispatch_evidence',
      workflow_reason: 'windows_fallback_execution_recorded',
      session_count: 0,
      task_count: 0,
    },
  });
  assert.match(operationFallbackEvidenceText, /Resident Dispatch Windows Fallback Evidence Review: pnpm --filter @narada2\/cloudflare-carrier product:resident-dispatch:windows-fallback-evidence:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(operationFallbackEvidenceText, /Resident Dispatch Windows Fallback Evidence: pnpm --filter @narada2\/cloudflare-carrier product:resident-dispatch:windows-fallback-evidence:text -- --operation resident_dispatch\.windows_fallback_evidence\.list --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);

  const operationResidentDispatchText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      current_status: 'active',
      status_transition_count: 1,
      phase: 'active_uninhabited',
      health: 'attention',
      next_action: 'session',
      workflow_next_action: 'start_resident_dispatch',
      workflow_reason: 'resident_dispatch_not_recorded',
      session_count: 0,
      task_count: 0,
    },
  });
  assert.match(operationResidentDispatchText, /Resident Dispatch Workflow: pnpm --filter @narada2\/cloudflare-carrier product:resident-dispatch:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);

  const operationTaskFocusText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      current_status: 'active',
      status_transition_count: 1,
      phase: 'inhabited',
      health: 'attention',
      next_action: 'task',
      workflow_next_action: 'focus_open_task',
      route_target: 'task_123',
      session_count: 0,
      task_count: 1,
    },
  });
  assert.match(operationTaskFocusText, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --task-id task_123 --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next/);

  const operationTaskFocusWithoutTargetText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      current_status: 'active',
      status_transition_count: 1,
      phase: 'inhabited',
      health: 'attention',
      next_action: 'task',
      workflow_next_action: 'focus_open_task',
      session_count: 0,
      task_count: 1,
    },
  });
  assert.doesNotMatch(operationTaskFocusWithoutTargetText, /Task Workflow:.*--task-id/);

  const siteReadText = formatProductSurfaceText({
    operation: 'site.read',
    worker_url: 'https://carrier.example.test',
    summary: {
      operation: 'site.read',
      site_id: 'site_alpha',
      display_name: 'Alpha Site',
      active_operation_id: 'operation_live',
      active_operation_next_action: 'refresh_site_continuity_loop',
      active_operation_workflow_reason: 'operation_lifecycle_continuity_loop_stale',
      active_session_id: 'session_alpha',
      health: 'ready',
      next_action: 'monitor_sites',
      continuity_state: 'packet_observed',
      continuity_direction_state: 'bidirectional',
      continuity_direction_missing: [],
      continuity_loop_state: 'loop_report_observed',
      continuity_reconciliation_execution_state: 'reconciliation_execution_observed',
      continuity_reconciliation_execution_health: 'ready',
      continuity_packet_count: 2,
      continuity_loop_report_count: 1,
      continuity_reconciliation_execution_count: 1,
      persistence_state: 'durable',
      recovery_state: 'reconstructable',
      local_ingress_request_count: 7,
      local_ingress_evidence_count: 4,
      local_ingress_provider_heartbeat_count: 20,
      repository_publication_request_count: 25,
      repository_publication_execution_count: 25,
      repository_publication_evidence_count: 13,
      repository_publication_provider_heartbeat_count: 20,
      membership_count: 2,
      session_count: 3,
    },
  });
  assert.match(siteReadText, /Site Action Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:action:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --operator-session-file <operator-session-file> --execute-site-action/);
  assert.match(siteReadText, /Active Operation Route: operation=operation_live action=refresh_site_continuity_loop reason=operation_lifecycle_continuity_loop_stale/);
  assert.match(siteReadText, /Durability: persistence=durable recovery=reconstructable/);
  assert.match(siteReadText, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --operator-session-file <operator-session-file>/);
  assert.match(siteReadText, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --operator-session-file <operator-session-file> --execute-operation-next/);
  assert.match(siteReadText, /Task Review: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --operator-session-file <operator-session-file>/);
  assert.match(siteReadText, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --carrier-session-id session_alpha --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next/);
  assert.match(siteReadText, /Local Ingress: requests=7 evidence=4 heartbeats=20/);
  assert.match(siteReadText, /Local Ingress Request Review: pnpm --filter @narada2\/cloudflare-carrier product:local-ingress:request:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --operator-session-file <operator-session-file>/);
  assert.match(siteReadText, /Local Ingress Evidence Review: pnpm --filter @narada2\/cloudflare-carrier product:local-ingress:evidence:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --operator-session-file <operator-session-file>/);
  assert.match(siteReadText, /Local Ingress Provider Liveness: pnpm --filter @narada2\/cloudflare-carrier product:local-ingress:provider:liveness:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(siteReadText, /Repository Publication: requests=25 executions=25 evidence=13 heartbeats=20/);
  assert.match(siteReadText, /Repository Publication Review: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:request:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --operator-session-file <operator-session-file>/);
  assert.match(siteReadText, /Repository Publication Execution Read: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:cloudflare-execution:list:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --operator-session-file <operator-session-file>/);
  assert.match(siteReadText, /Repository Publication Evidence Read: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:evidence:list:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --operator-session-file <operator-session-file>/);
  assert.match(siteReadText, /Repository Publication Provider Liveness: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:provider:liveness:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);

  const operationListText = formatProductSurfaceText({
    operation: 'operation.list',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.list',
      site_id: 'site_alpha',
      operation_count: 1,
      active_operation_id: 'operation_live',
      next_operation_id: 'operation_live',
      next_operation_active_session_id: 'session_alpha',
      next_operation_status: 'inactive',
      operation_status_counts: { inactive: 1 },
      next_status: 'needs_attention',
      next_action: 'review_operation',
      next_reason: 'operation_needs_review',
      route_domain: 'operation_posture',
      route_command_state: 'operation_posture_attention',
      route_command_action: 'focus_next_operation',
      route_next_action: 'focus_next_operation',
      route_target: 'operation_live',
      route_status: 'needs_attention',
      route_reason: 'operation_needs_review',
    },
  });
  assert.match(operationListText, /Operations: count=1 active=operation_live next=operation_live/);
  assert.match(operationListText, /Lifecycle Statuses: inactive=1/);
  assert.match(operationListText, /Next Operation Status: inactive/);
  assert.match(operationListText, /Focused Read: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --operator-session-file <operator-session-file>/);
  assert.match(operationListText, /Task Review: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --operator-session-file <operator-session-file>/);
  assert.match(operationListText, /Session Evidence: pnpm --filter @narada2\/cloudflare-carrier product:session:evidence:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --carrier-session-id session_alpha --operator-session-file <operator-session-file>/);
  assert.match(operationListText, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --carrier-session-id session_alpha --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next/);
  assert.match(operationListText, /Persistence Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:persistence:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --operator-session-file <operator-session-file>/);
  assert.match(operationListText, /Recovery Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:recovery:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --operator-session-file <operator-session-file>/);
  assert.match(operationListText, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --operator-session-file <operator-session-file> --execute-operation-next/);
  assert.match(operationListText, /Operation Route: domain=operation_posture state=operation_posture_attention action=focus_next_operation target=operation_live status=needs_attention reason=operation_needs_review/);
  assert.match(operationListText, /Focus Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:focus:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --operator-session-file <operator-session-file> --execute-operation-focus/);

  const operationListEvidenceText = formatProductSurfaceText({
    operation: 'operation.list',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.list',
      site_id: 'site_alpha',
      operation_count: 1,
      active_operation_id: 'operation_live',
      next_operation_id: 'operation_live',
      next_operation_status: 'active',
      operation_status_counts: { active: 1 },
      next_status: 'ready',
      next_action: 'inspect_operation_evidence',
      next_reason: 'evidence_review',
      route_domain: 'operation_posture',
      route_command_state: 'operation_posture_ready',
      route_command_action: 'monitor_operations',
      route_next_action: 'monitor_operations',
      route_target: 'operation_live',
      route_status: 'ready',
      route_reason: 'evidence_review',
    },
  });
  assert.match(operationListEvidenceText, /Evidence Read: pnpm --filter @narada2\/cloudflare-carrier product:operation:evidence:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --operator-session-file <operator-session-file>/);

  const operationListContinuityText = formatProductSurfaceText({
    operation: 'operation.list',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.list',
      site_id: 'site_alpha',
      operation_count: 1,
      active_operation_id: 'operation_live',
      next_operation_id: 'operation_live',
      next_operation_status: 'active',
      operation_status_counts: { active: 1 },
      next_status: 'needs_attention',
      next_action: 'refresh_site_continuity_loop',
      next_reason: 'operation_lifecycle_continuity_loop_stale',
      next_operation_focus_kind: 'site_continuity_loop',
      next_operation_focus_ref: 'site_alpha',
      route_domain: 'operation_posture',
      route_command_state: 'operation_posture_ready',
      route_command_action: 'monitor_operations',
      route_next_action: 'monitor_operations',
      route_target: 'operation_live',
      route_status: 'ready',
      route_reason: 'operation_lifecycle_continuity_loop_stale',
    },
  });
  assert.match(operationListContinuityText, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --operator-session-file <operator-session-file> --execute-operation-next/);
  assert.match(operationListContinuityText, /Continuity Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:continuity:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --expected-pre-action refresh_site_continuity_loop --operator-session-file <operator-session-file> --execute-operation-continuity/);
  assert.match(operationListContinuityText, /Next Operation Focus: kind=site_continuity_loop ref=site_alpha/);

  const operationListContinuityReviewText = formatProductSurfaceText({
    operation: 'operation.list',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.list',
      site_id: 'site_alpha',
      operation_count: 1,
      active_operation_id: 'operation_live',
      next_operation_id: 'operation_live',
      next_operation_status: 'active',
      operation_status_counts: { active: 1 },
      next_status: 'needs_attention',
      next_action: 'review_site_continuity_reconciliation_execution',
      next_reason: 'operation_operator_focus_needs_review',
      next_operation_focus_kind: 'site_continuity_reconciliation_execution',
      next_operation_focus_ref: 'site-continuity-reconciliation-execution:site_alpha:2026-06-13T23:54:54.778Z:completed',
    },
  });
  assert.match(operationListContinuityReviewText, /Next Operation Focus: kind=site_continuity_reconciliation_execution ref=site-continuity-reconciliation-execution:site_alpha:2026-06-13T23:54:54.778Z:completed/);
  assert.match(operationListContinuityReviewText, /Review Ack: pnpm --filter @narada2\/cloudflare-carrier product:operation:focus-review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --focus-kind site_continuity_reconciliation_execution --focus-ref site-continuity-reconciliation-execution:site_alpha:2026-06-13T23:54:54.778Z:completed --operator-session-file <operator-session-file>/);

  const continuationListText = formatProductSurfaceText({
    operation: 'operation.list',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.list',
      continuation_mode: true,
      site_id: 'site_alpha',
      operation_count: 2,
      active_operation_id: null,
      next_operation_id: 'operation_continue',
      next_operation_status: 'needs_continuation',
      needs_continuation_count: 1,
      next_continuation_operation_id: 'operation_continue',
      continuation_next_action: 'read_operation_for_continuation',
      operation_status_counts: { needs_continuation: 1, active: 1 },
      next_status: 'needs_attention',
      next_action: 'review_operation',
      next_reason: 'operation_needs_continuation',
    },
    auth: { kind: 'bearer', value: 'secret-token' },
  });
  assert.match(continuationListText, /Continuation: needed=1 next=operation_continue action=read_operation_for_continuation/);
  assert.match(continuationListText, /Continuation Read: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_continue --operator-session-file <operator-session-file>/);
  assert.match(continuationListText, /Continuation Resume: pnpm --filter @narada2\/cloudflare-carrier product:operation:continuation:resume:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_continue --agent-id <agent-id> --operator-session-file <operator-session-file>/);
  assert.match(continuationListText, /Continuation Resume Guard: operation\.read must route to resume_operation_continuation before mutation; use --skip-route-check only for explicit recovery\./);
  assert.equal(continuationListText.includes('secret-token'), false);

  const operationReadText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_live',
      current_status: 'paused',
      status_transition_count: 1,
      latest_status_from: 'active',
      latest_status_to: 'paused',
      latest_status_recorded_at: '2026-06-11T00:00:00.000Z',
      phase: 'inhabited',
      health: 'attention',
      next_action: 'continuity_packet',
      session_count: 1,
      task_count: 3,
      workflow_next_action: 'review_site_continuity_reconciliation_execution',
      workflow_reason: 'operation_lifecycle_continuity_reconciliation_execution_attention',
      workflow_focus_kind: 'site_continuity_reconciliation_execution',
      workflow_focus_ref: 'reconciliation_execution_failed',
      workflow_action_command_kind: 'site_continuity_reconciliation_review',
      workflow_action_command: 'pnpm site:continuity:reconciliation -- review --id reconciliation_execution_failed',
      workflow_continuity_direction_state: 'cloudflare_to_local_windows_only',
      workflow_continuity_direction_missing: ['local_windows_to_cloudflare'],
      posture_next_status: 'needs_attention',
      posture_next_action: 'review_operation',
      posture_reason: 'operation_needs_review',
      persistence_state: 'durable',
      recovery_state: 'reconstructable',
      recovery_boundary_count: 12,
      recovery_boundary_keys: ['site_registry', 'carrier_evidence_index', 'site_file_materialization_store'],
      recovery_gap_count: 0,
      recovery_gap_keys: [],
      recovery_next_action: 'monitor_recovery_posture',
    },
  });
  assert.match(operationReadText, /Status: current=paused transitions=1/);
  assert.match(operationReadText, /Latest Status: active -> paused at 2026-06-11T00:00:00\.000Z/);
  assert.match(operationReadText, /Lifecycle: phase=inhabited health=attention/);
  assert.match(operationReadText, /Workflow Route: action=review_site_continuity_reconciliation_execution reason=operation_lifecycle_continuity_reconciliation_execution_attention/);
  assert.match(operationReadText, /Workflow Focus: kind=site_continuity_reconciliation_execution ref=reconciliation_execution_failed/);
  assert.match(operationReadText, /Workflow Continuity: direction=cloudflare_to_local_windows_only missing=local_windows_to_cloudflare/);
  assert.match(operationReadText, /Workflow Command: kind=site_continuity_reconciliation_review command=pnpm site:continuity:reconciliation -- review --id reconciliation_execution_failed/);
  assert.match(operationReadText, /Review Ack: pnpm --filter @narada2\/cloudflare-carrier product:operation:focus-review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --focus-kind site_continuity_reconciliation_execution --focus-ref reconciliation_execution_failed --operator-session-file <operator-session-file>/);

  const operationReadContinuityLoopText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    summary: {
      site_id: 'site_alpha',
      operation_id: 'operation_live',
      current_status: 'active',
      status_transition_count: 0,
      latest_status_from: null,
      latest_status_to: null,
      latest_status_recorded_at: null,
      phase: 'inhabited',
      health: 'attention',
      next_action: 'refresh_site_continuity_loop',
      session_count: 1,
      task_count: 0,
      workflow_next_action: 'refresh_site_continuity_loop',
      workflow_reason: 'operation_lifecycle_continuity_loop_stale',
      workflow_focus_kind: 'site_continuity_loop',
      workflow_focus_ref: 'site_alpha',
      workflow_action_command_kind: 'site_continuity_loop_refresh',
      workflow_action_command: 'pnpm site:continuity:loop -- sync-cloudflare --site site_alpha --url <worker-url> --token-file <token-file>',
      workflow_continuity_direction_state: 'bidirectional_packets_observed',
      workflow_continuity_direction_missing: [],
      posture_next_status: 'ready',
      posture_next_action: 'monitor_operations',
      posture_reason: 'all_operations_monitoring',
      persistence_state: 'durable',
      recovery_state: 'reconstructable',
      recovery_boundary_count: 12,
      recovery_boundary_keys: ['site_registry'],
      recovery_gap_count: 0,
      recovery_gap_keys: [],
      recovery_next_action: 'monitor_recovery_posture',
    },
  });
  assert.match(operationReadContinuityLoopText, /Workflow Focus: kind=site_continuity_loop ref=site_alpha/);
  assert.match(operationReadText, /Posture Route: status=needs_attention action=review_operation reason=operation_needs_review/);
  assert.match(operationReadText, /Durability: persistence=durable recovery=reconstructable/);
  assert.match(operationReadText, /Recovery: state=reconstructable boundaries=12 gaps=0/);
  assert.match(operationReadText, /Recovery Next: action=monitor_recovery_posture gaps=none/);
  assert.match(operationReadText, /Recovery Boundaries: site_registry, carrier_evidence_index, site_file_materialization_store/);
  assert.match(operationReadText, /Evidence Counts: sessions=1 tasks=3/);

  const operationReadLifecycleSurfaceText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_live',
      current_status: 'active',
      phase: 'inhabited',
      health: 'ready',
      next_action: 'monitor_operation',
      active_session_id: 'session_alpha',
      session_count: 5,
      task_count: 3,
      posture_next_action: 'monitor_operations',
    },
  });
  assert.match(operationReadLifecycleSurfaceText, /Task Review: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --operator-session-file <operator-session-file>/);
  assert.match(operationReadLifecycleSurfaceText, /Session Evidence: pnpm --filter @narada2\/cloudflare-carrier product:session:evidence:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --carrier-session-id session_alpha --operator-session-file <operator-session-file>/);
  assert.match(operationReadLifecycleSurfaceText, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --carrier-session-id session_alpha --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next/);

  const operationReadEvidenceText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_live',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'inhabited',
      health: 'ready',
      next_action: 'inspect_operation_evidence',
      session_count: 1,
      task_count: 0,
      posture_next_status: 'needs_attention',
      posture_next_action: 'focus_next_operation',
      posture_target: 'operation_focus_target',
      posture_reason: 'use_focused_operation',
    },
  });
  assert.match(operationReadEvidenceText, /Evidence Read: pnpm --filter @narada2\/cloudflare-carrier product:operation:evidence:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --operator-session-file <operator-session-file>/);

  const operationListReplayText = formatProductSurfaceText({
    operation: 'operation.list',
    worker_url: 'https://carrier.example.test',
    summary: {
      site_id: 'site_alpha',
      operation_count: 1,
      active_operation_id: 'operation_live',
      next_operation_id: 'operation_live',
      next_operation_status: 'active',
      next_status: 'needs_attention',
      next_action: 'review_carrier_evidence_replay',
      next_reason: 'carrier_evidence_read_degraded',
      route_domain: 'operation',
      route_command_state: 'needs_attention',
      route_next_action: 'focus_next_operation',
      route_target: 'operation_live',
      route_status: 'active',
      route_reason: 'carrier_evidence_read_degraded',
      operation_status_counts: { active: 1 },
      health_counts: { needs_attention: 1 },
    },
  });
  assert.match(operationListReplayText, /Evidence Read: pnpm --filter @narada2\/cloudflare-carrier product:operation:evidence:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --operator-session-file <operator-session-file>/);

  const operationListFocusEvidenceText = formatProductSurfaceText({
    operation: 'operation.list',
    worker_url: 'https://carrier.example.test',
    summary: {
      site_id: 'site_alpha',
      operation_count: 1,
      active_operation_id: 'operation_live',
      next_operation_id: 'operation_live',
      next_operation_status: 'active',
      next_status: 'needs_attention',
      next_action: 'focus_evidence',
      next_reason: 'operation_evidence_scope_not_loaded',
      route_domain: 'operation',
      route_command_state: 'needs_attention',
      route_next_action: 'focus_next_operation',
      route_target: 'operation_live',
      route_status: 'active',
      route_reason: 'operation_evidence_scope_not_loaded',
      operation_status_counts: { active: 1 },
      health_counts: { needs_attention: 1 },
    },
  });
  assert.match(operationListFocusEvidenceText, /Evidence Read: pnpm --filter @narada2\/cloudflare-carrier product:operation:evidence:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --operator-session-file <operator-session-file>/);

  const operationReadReplayText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    summary: {
      site_id: 'site_alpha',
      operation_id: 'operation_live',
      current_status: 'active',
      phase: 'inhabited',
      health: 'attention',
      next_action: 'carrier_evidence',
      workflow_next_action: 'review_carrier_evidence_replay',
      workflow_reason: 'carrier_evidence_read_degraded',
      posture_next_action: 'monitor_operations',
    },
  });
  assert.match(operationReadReplayText, /Evidence Read: pnpm --filter @narada2\/cloudflare-carrier product:operation:evidence:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --operator-session-file <operator-session-file>/);

  const operationReadFocusEvidenceText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    summary: {
      site_id: 'site_alpha',
      operation_id: 'operation_live',
      current_status: 'active',
      phase: 'inhabited',
      health: 'attention',
      next_action: 'carrier_evidence',
      workflow_next_action: 'focus_evidence',
      workflow_reason: 'operation_evidence_scope_not_loaded',
      posture_next_action: 'monitor_operations',
    },
  });
  assert.match(operationReadFocusEvidenceText, /Evidence Read: pnpm --filter @narada2\/cloudflare-carrier product:operation:evidence:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --operator-session-file <operator-session-file>/);
  assert.match(operationReadEvidenceText, /Posture Route: status=needs_attention action=focus_next_operation reason=use_focused_operation target=operation_focus_target/);

  const operationReadSessionPathEvidenceText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    summary: {
      site_id: 'site_alpha',
      operation_id: 'operation_live',
      active_session_id: 'session_alpha',
      current_status: 'active',
      phase: 'inhabited',
      health: 'attention',
      next_action: 'carrier_evidence',
      workflow_next_action: 'focus_session_path_evidence',
      workflow_reason: 'session_path_has_failures',
      posture_next_action: 'monitor_operations',
    },
  });
  assert.match(operationReadSessionPathEvidenceText, /Session Evidence: pnpm --filter @narada2\/cloudflare-carrier product:session:evidence:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --carrier-session-id session_alpha --operator-session-file <operator-session-file>/);

  const operationReadSessionEvidenceText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    summary: {
      site_id: 'site_alpha',
      operation_id: 'operation_live',
      active_session_id: 'session_alpha',
      current_status: 'active',
      phase: 'inhabited',
      health: 'attention',
      next_action: 'session',
      workflow_next_action: 'read_session_evidence',
      workflow_reason: 'evidence_needed',
      posture_next_action: 'monitor_operations',
    },
  });
  assert.match(operationReadSessionEvidenceText, /Session Evidence: pnpm --filter @narada2\/cloudflare-carrier product:session:evidence:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --carrier-session-id session_alpha --operator-session-file <operator-session-file>/);

  const operationReadInspectSessionEvidenceText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    summary: {
      site_id: 'site_alpha',
      operation_id: 'operation_live',
      active_session_id: 'session_alpha',
      current_status: 'active',
      phase: 'inhabited',
      health: 'ready',
      next_action: 'session',
      workflow_next_action: 'inspect_session_evidence',
      workflow_reason: 'evidence_ready',
      posture_next_action: 'monitor_operations',
    },
  });
  assert.match(operationReadInspectSessionEvidenceText, /Session Evidence: pnpm --filter @narada2\/cloudflare-carrier product:session:evidence:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --carrier-session-id session_alpha --operator-session-file <operator-session-file>/);

  const operationReadSessionPathTaskText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    summary: {
      site_id: 'site_alpha',
      operation_id: 'operation_live',
      active_session_id: 'session_alpha',
      current_status: 'active',
      phase: 'inhabited',
      health: 'attention',
      next_action: 'carrier_evidence',
      workflow_next_action: 'focus_session_path_task',
      workflow_reason: 'session_path_has_open_task',
      posture_next_action: 'monitor_operations',
    },
  });
  assert.match(operationReadSessionPathTaskText, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --carrier-session-id session_alpha --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next/);

  const operationReadSessionPathTaskWithoutSessionText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    summary: {
      site_id: 'site_alpha',
      operation_id: 'operation_live',
      current_status: 'active',
      phase: 'inhabited',
      health: 'attention',
      next_action: 'carrier_evidence',
      workflow_next_action: 'focus_session_path_task',
      workflow_reason: 'session_path_has_open_task',
      posture_next_action: 'monitor_operations',
    },
  });
  assert.doesNotMatch(operationReadSessionPathTaskWithoutSessionText, /Task Workflow:.*--carrier-session-id/);

  const operationReadOperationPathTaskText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    summary: {
      site_id: 'site_alpha',
      operation_id: 'operation_live',
      current_status: 'active',
      phase: 'inhabited',
      health: 'attention',
      next_action: 'task',
      workflow_next_action: 'focus_operation_path_task',
      workflow_reason: 'operation_path_has_open_task',
      posture_next_action: 'monitor_operations',
    },
  });
  assert.match(operationReadOperationPathTaskText, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next/);

  const operationReadContinuityReviewWithoutKindText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_live',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'inhabited',
      health: 'ready',
      next_action: 'review_site_continuity_reconciliation_execution',
      workflow_next_action: 'review_site_continuity_reconciliation_execution',
      workflow_reason: 'operation_operator_focus_needs_review',
      workflow_focus_kind: null,
      workflow_focus_ref: 'site-continuity-reconciliation-execution:site_alpha:2026-06-13T21:59:01.308Z:completed',
      session_count: 1,
      task_count: 0,
      recovery_state: 'reconstructable',
      recovery_boundary_count: 0,
      recovery_gap_count: 0,
    },
  });
  assert.match(operationReadContinuityReviewWithoutKindText, /Next Action: review_site_continuity_reconciliation_execution/);
  assert.match(operationReadContinuityReviewWithoutKindText, /Review Ack: pnpm --filter @narada2\/cloudflare-carrier product:operation:focus-review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --focus-kind site_continuity_reconciliation_execution --focus-ref site-continuity-reconciliation-execution:site_alpha:2026-06-13T21:59:01.308Z:completed --operator-session-file <operator-session-file>/);

  const operationReadContinuityReviewWithoutRefText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_live',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'inhabited',
      health: 'ready',
      next_action: 'review_site_continuity_reconciliation_execution',
      workflow_next_action: 'review_site_continuity_reconciliation_execution',
      workflow_reason: 'operation_operator_focus_needs_review',
      workflow_focus_kind: 'site_continuity_reconciliation_execution',
      session_count: 1,
      task_count: 0,
      recovery_state: 'reconstructable',
      recovery_boundary_count: 0,
      recovery_gap_count: 0,
    },
  });
  assert.doesNotMatch(operationReadContinuityReviewWithoutRefText, /Review Ack:/);

  const operationReadLifecycleSessionText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    summary: {
      site_id: 'site_alpha',
      operation_id: 'operation_live',
      current_status: 'active',
      phase: 'active_uninhabited',
      health: 'incomplete',
      next_action: 'session',
      workflow_next_action: 'focus_lifecycle_start_session',
      workflow_reason: 'operation_lifecycle_missing_session',
    },
  });
  assert.match(operationReadLifecycleSessionText, /Session Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:session:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --operator-session-file <operator-session-file> --execute-operation-session/);

  const operationReadLifecycleContinuityText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    summary: {
      site_id: 'site_alpha',
      operation_id: 'operation_live',
      current_status: 'active',
      phase: 'inhabited',
      health: 'attention',
      next_action: 'continuity_packet',
      workflow_next_action: 'focus_lifecycle_continuity',
      workflow_reason: 'operation_lifecycle_missing_continuity_packet',
    },
  });
  assert.match(operationReadLifecycleContinuityText, /Continuity Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:continuity:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_live --expected-pre-action focus_lifecycle_continuity --operator-session-file <operator-session-file> --execute-operation-continuity/);

  const operationReadMailboxText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_mailbox',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'active_uninhabited',
      health: 'incomplete',
      next_action: 'session',
      workflow_next_action: 'review_mailbox_draft_reply_proposal',
      workflow_reason: 'operation_operator_focus_needs_review',
      workflow_focus_ref: 'mailbox_draft_reply_proposal_live_1',
      session_count: 0,
      task_count: 0,
      recovery_state: 'ready_no_sessions',
      recovery_boundary_count: 1,
      recovery_gap_count: 0,
    },
  });
  assert.match(operationReadMailboxText, /Mailbox Proposal Read: pnpm --filter @narada2\/cloudflare-carrier product:mailbox:draft-reply-proposal:text -- --url https:\/\/carrier\.example\.test --site site_alpha --focus-ref mailbox_draft_reply_proposal_live_1 --operator-session-file <operator-session-file>/);

  const operationReadDirectiveText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_directive',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'inhabited',
      health: 'attention',
      next_action: 'directive_delivery',
      workflow_next_action: 'review_directive_delivery',
      workflow_reason: 'undelivered_directives',
      workflow_focus_ref: 'directive_record_focus',
      session_count: 1,
      task_count: 0,
      recovery_state: 'reconstructable',
      recovery_boundary_count: 1,
      recovery_gap_count: 0,
    },
  });
  assert.match(operationReadDirectiveText, /Directive Delivery Review: pnpm --filter @narada2\/cloudflare-carrier product:directive:delivery:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_directive --operator-session-file <operator-session-file>/);

  const operationReadDirectiveIntentFocusText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_directive',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'inhabited',
      health: 'attention',
      next_action: 'directive_intent_focus',
      workflow_next_action: 'focus_webhook_delay_directive_intent',
      workflow_reason: 'directive_intent_record_needs_operator_focus',
      workflow_focus_ref: 'directive_record_focus',
      session_count: 1,
      task_count: 0,
    },
  });
  assert.match(operationReadDirectiveIntentFocusText, /Directive Delivery Review: pnpm --filter @narada2\/cloudflare-carrier product:directive:delivery:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_directive --operator-session-file <operator-session-file>/);

  const operationReadShadowText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_shadow',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'inhabited',
      health: 'attention',
      next_action: 'shadow_focus',
      workflow_next_action: 'focus_webhook_delay_shadow_read',
      workflow_reason: 'directive_intent_not_recorded_from_shadow_read',
      workflow_focus_ref: 'shadow_focus',
      session_count: 1,
      task_count: 0,
    },
  });
  assert.match(operationReadShadowText, /Webhook Delay Shadow Read: pnpm --filter @narada2\/cloudflare-carrier product:webhook-delay:shadow-read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_shadow --operator-session-file <operator-session-file>/);

  const operationReadOutlookDraftText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_mailbox_draft',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'active_uninhabited',
      health: 'attention',
      next_action: 'mailbox_outlook_draft_create',
      workflow_next_action: 'review_mailbox_outlook_draft_create',
      workflow_reason: 'operation_operator_focus_needs_review',
      workflow_focus_ref: 'mailbox_outlook_draft_create_live_1',
      session_count: 0,
      task_count: 0,
    },
  });
  assert.match(operationReadOutlookDraftText, /Mailbox Outlook Draft Review: pnpm --filter @narada2\/cloudflare-carrier product:mailbox:outlook-draft:text -- --url https:\/\/carrier\.example\.test --site site_alpha --focus-ref mailbox_outlook_draft_create_live_1 --operator-session-file <operator-session-file>/);

  const operationReadOutlookDraftEvidenceText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_mailbox_draft',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'active_uninhabited',
      health: 'attention',
      next_action: 'mailbox_outlook_draft_create',
      workflow_next_action: 'review_outlook_draft_create_evidence',
      workflow_reason: 'operation_operator_focus_needs_review',
      workflow_focus_ref: 'mailbox_outlook_draft_evidence_live_1',
      session_count: 0,
      task_count: 0,
    },
  });
  assert.match(operationReadOutlookDraftEvidenceText, /Mailbox Outlook Draft Review: pnpm --filter @narada2\/cloudflare-carrier product:mailbox:outlook-draft:text -- --url https:\/\/carrier\.example\.test --site site_alpha --focus-ref mailbox_outlook_draft_evidence_live_1 --operator-session-file <operator-session-file>/);

  const operationReadRepositoryPublicationText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_repo_pub',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'active_uninhabited',
      health: 'incomplete',
      next_action: 'session',
      workflow_next_action: 'review_repository_publication_request',
      workflow_reason: 'operation_operator_focus_needs_review',
      workflow_focus_ref: 'repository_publication_request_live_1',
      session_count: 0,
      task_count: 0,
      recovery_state: 'ready_no_sessions',
      recovery_boundary_count: 1,
      recovery_gap_count: 0,
    },
  });
  assert.match(operationReadRepositoryPublicationText, /Repository Publication Review: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:request:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_repo_pub --operator-session-file <operator-session-file>/);

  const operationReadRepositoryPublicationExecutionText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_repo_pub_execution',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'active_uninhabited',
      health: 'attention',
      next_action: 'session',
      workflow_next_action: 'review_cloudflare_github_repository_publication_execution',
      workflow_reason: 'repository_publication_execution_failed',
      session_count: 0,
      task_count: 0,
      recovery_state: 'reconstructable',
      recovery_boundary_count: 1,
      recovery_gap_count: 0,
    },
  });
  assert.match(operationReadRepositoryPublicationExecutionText, /Repository Publication Execution Read: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:cloudflare-execution:list:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);

  const operationReadRepositoryPublicationEvidenceText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_repo_pub_evidence',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'active_uninhabited',
      health: 'attention',
      next_action: 'session',
      workflow_next_action: 'review_repository_publication_evidence',
      workflow_reason: 'repository_publication_operation_posture_has_returned_evidence',
      session_count: 0,
      task_count: 0,
      recovery_state: 'reconstructable',
      recovery_boundary_count: 1,
      recovery_gap_count: 0,
    },
  });
  assert.match(operationReadRepositoryPublicationEvidenceText, /Repository Publication Evidence Read: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:evidence:list:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);

  const operationReadProviderLifecycleSurfaceText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_lifecycle',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'inhabited',
      health: 'ready',
      next_action: 'monitor_operation',
      workflow_next_action: 'monitor_operation',
      workflow_reason: 'operation_ready',
      session_count: 1,
      active_session_id: 'carrier_session_alpha',
      task_count: 2,
      local_ingress_request_count: 3,
      local_ingress_evidence_count: 2,
      local_ingress_provider_heartbeat_count: 4,
      repository_publication_request_count: 5,
      repository_publication_execution_count: 6,
      repository_publication_evidence_count: 7,
      repository_publication_provider_heartbeat_count: 8,
      persistence_state: 'durable',
      recovery_state: 'reconstructable',
      recovery_boundary_count: 1,
      recovery_gap_count: 0,
    },
  });
  assert.match(operationReadProviderLifecycleSurfaceText, /Local Ingress: requests=3 evidence=2 heartbeats=4/);
  assert.match(operationReadProviderLifecycleSurfaceText, /Local Ingress Request Review: pnpm --filter @narada2\/cloudflare-carrier product:local-ingress:request:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_lifecycle --operator-session-file <operator-session-file>/);
  assert.match(operationReadProviderLifecycleSurfaceText, /Local Ingress Evidence Review: pnpm --filter @narada2\/cloudflare-carrier product:local-ingress:evidence:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_lifecycle --operator-session-file <operator-session-file>/);
  assert.match(operationReadProviderLifecycleSurfaceText, /Local Ingress Provider Liveness: pnpm --filter @narada2\/cloudflare-carrier product:local-ingress:provider-liveness:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(operationReadProviderLifecycleSurfaceText, /Repository Publication: requests=5 executions=6 evidence=7 heartbeats=8/);
  assert.match(operationReadProviderLifecycleSurfaceText, /Repository Publication Review: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:request:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_lifecycle --operator-session-file <operator-session-file>/);
  assert.match(operationReadProviderLifecycleSurfaceText, /Repository Publication Execution Read: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:cloudflare-execution:list:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(operationReadProviderLifecycleSurfaceText, /Repository Publication Evidence Read: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:evidence:list:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(operationReadProviderLifecycleSurfaceText, /Repository Publication Provider Liveness: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:provider-liveness:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);

  const operationReadGenericFocusReviewText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_focus_review',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'inhabited',
      health: 'attention',
      next_action: 'carrier_evidence',
      workflow_next_action: 'review_operation_operator_focus',
      workflow_reason: 'operation_operator_focus_needs_review',
      session_count: 1,
      task_count: 0,
      recovery_state: 'reconstructable',
      recovery_boundary_count: 1,
      recovery_gap_count: 0,
    },
  });
  assert.match(operationReadGenericFocusReviewText, /Evidence Read: pnpm --filter @narada2\/cloudflare-carrier product:operation:evidence:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_focus_review --operator-session-file <operator-session-file>/);

  const operationReadSiteFileProposalText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_site_file',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'active_uninhabited',
      health: 'incomplete',
      next_action: 'session',
      workflow_next_action: 'review_site_file_change_proposal',
      workflow_reason: 'operation_operator_focus_needs_review',
      workflow_focus_ref: 'site_file_change_proposal_live_1',
      session_count: 0,
      task_count: 0,
      recovery_state: 'ready_no_sessions',
      recovery_boundary_count: 1,
      recovery_gap_count: 0,
    },
  });
  assert.match(operationReadSiteFileProposalText, /Site File Change Proposal Review: pnpm --filter @narada2\/cloudflare-carrier product:site-file-change:proposal:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_site_file --operator-session-file <operator-session-file>/);

  const operationReadSiteFileMaterializationText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_site_file',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'active_uninhabited',
      health: 'attention',
      next_action: 'site_file_materialization',
      workflow_next_action: 'review_site_file_materialization',
      workflow_reason: 'operation_operator_focus_needs_review',
      session_count: 0,
      task_count: 0,
    },
  });
  assert.match(operationReadSiteFileMaterializationText, /Site File Materialization Review: pnpm --filter @narada2\/cloudflare-carrier product:site-file:materialization:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);

  const operationReadRecoveryText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_recovery',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'inhabited',
      health: 'incomplete',
      next_action: 'local_resident_carrier_evidence',
      workflow_next_action: 'review_recovery_posture',
      workflow_reason: 'recovery_posture_needs_attention',
      workflow_focus_ref: 'local_resident_carrier_evidence_not_admitted',
      session_count: 0,
      task_count: 0,
      recovery_state: 'local_resident_inhabitance_not_replayable',
      recovery_boundary_count: 12,
      recovery_gap_count: 1,
    },
  });
  assert.match(operationReadRecoveryText, /Recovery Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:recovery:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_recovery --operator-session-file <operator-session-file>/);
  assert.match(operationReadRecoveryText, /Persistence Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:persistence:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_recovery --operator-session-file <operator-session-file>/);

  const operationReadPersistenceText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_persistence',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'inhabited',
      health: 'incomplete',
      next_action: 'carrier_evidence',
      workflow_next_action: 'review_persistence_posture',
      workflow_reason: 'persistence_posture_needs_attention',
      session_count: 0,
      task_count: 0,
      persistence_state: 'degraded',
      recovery_state: 'reconstructable',
    },
  });
  assert.match(operationReadPersistenceText, /Persistence Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:persistence:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_persistence --operator-session-file <operator-session-file>/);
  assert.match(operationReadPersistenceText, /Recovery Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:recovery:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_persistence --operator-session-file <operator-session-file>/);

  const operationReadContinuityText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_continuity',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'inhabited',
      health: 'attention',
      next_action: 'continuity_loop_report',
      workflow_next_action: 'review_continuity_loop_report',
      workflow_reason: 'operation_lifecycle_missing_continuity_loop_report',
      session_count: 0,
      task_count: 0,
      persistence_state: 'durable',
      recovery_state: 'reconstructable',
    },
  });
  assert.match(operationReadContinuityText, /Continuity Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:continuity:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_continuity --expected-pre-action review_continuity_loop_report --operator-session-file <operator-session-file> --execute-operation-continuity/);

  const operationReadObserveContinuityText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_continuity_observe',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'inhabited',
      health: 'attention',
      next_action: 'continuity_packet',
      workflow_next_action: 'observe_continuity_packet',
      workflow_reason: 'operation_continuity_direction_needs_attention',
      session_count: 0,
      task_count: 0,
      persistence_state: 'durable',
      recovery_state: 'reconstructable',
    },
  });
  assert.match(operationReadObserveContinuityText, /Continuity Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:continuity:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_continuity_observe --expected-pre-action observe_continuity_packet --operator-session-file <operator-session-file> --execute-operation-continuity/);
  const operationReadLocalResidentBridgeText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_bridge',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'inhabited',
      health: 'incomplete',
      next_action: 'local_resident_carrier_evidence',
      workflow_next_action: 'bridge_local_resident_carrier_evidence',
      workflow_reason: 'operation_lifecycle_missing_local_resident_carrier_evidence',
      workflow_focus_ref: 'operation_bridge',
      session_count: 0,
      task_count: 0,
      recovery_state: 'local_resident_inhabitance_not_replayable',
      recovery_boundary_count: 12,
      recovery_gap_count: 1,
    },
  });
  assert.match(operationReadLocalResidentBridgeText, /Local Resident Carrier Bridge: pnpm --filter @narada2\/cloudflare-carrier product:resident-dispatch:local-resident-carrier-bridge:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_bridge --operator-session-file <operator-session-file>/);
});

test('formatProductSurfaceText renders refused product reads without auth material', () => {
  const text = formatProductSurfaceText({
    status: 'refused',
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'flag:--token',
    params: { site_id: 'site_alpha', operation_id: 'operation_missing' },
    summary: summarizeProductReadFailure('operation.read', {
      ok: false,
      code: 'operation_not_found',
      action: 'deny',
      reason: 'operation_read_target_missing',
      site_id: 'site_alpha',
      operation_id: 'operation_missing',
    }, { site_id: 'site_alpha', operation_id: 'operation_missing' }),
    auth: { kind: 'bearer', value: 'secret-token' },
  });

  assert.match(text, /Product Read: operation\.read refused/);
  assert.match(text, /Code: operation_not_found/);
  assert.match(text, /Site: site_alpha/);
  assert.match(text, /Operation: operation_missing/);
  assert.match(text, /Refusal: action=deny reason=operation_read_target_missing/);
  assert.equal(text.includes('secret-token'), false);
});

test('formatProductSurfaceText renders structured operation projection errors', () => {
  const text = formatProductSurfaceText({
    status: 'ok',
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    response: {
      operation: { site_id: 'site_alpha', operation_id: 'operation_broken', status: 'active' },
      operation_product_projection_error: {
        stage: 'carrier_evidence_read',
        code: 'operation_product_projection_failed',
        message: 'projection blew up',
      },
      operation_status_history: { current_status: 'active', transition_count: 1 },
      operation_lifecycle_status: { phase: 'unknown', health: 'attention', next_action: 'inspect_projection_error', session_count: 0, task_count: 0 },
      operation_workflow_route: { next_action: 'inspect_projection_error', reason: 'projection_failed' },
      cloudflare_recovery_posture: { recovery_boundaries: [], recovery_gaps: [] },
    },
    summary: summarizeProductSurface('operation.read', {
      operation: { site_id: 'site_alpha', operation_id: 'operation_broken', status: 'active' },
      operation_product_projection_error: {
        stage: 'carrier_evidence_read',
        code: 'operation_product_projection_failed',
        message: 'projection blew up',
      },
      operation_status_history: { current_status: 'active', transition_count: 1 },
      operation_lifecycle_status: { phase: 'unknown', health: 'attention', next_action: 'inspect_projection_error', session_count: 0, task_count: 0 },
      operation_workflow_route: { next_action: 'inspect_projection_error', reason: 'projection_failed' },
      cloudflare_recovery_posture: { recovery_boundaries: [], recovery_gaps: [] },
    }),
  });

  assert.match(text, /Projection Error: stage=carrier_evidence_read code=operation_product_projection_failed message=projection blew up/);
  assert.match(text, /Operation: operation_broken/);
  assert.match(text, /Workflow Route: action=inspect_projection_error reason=projection_failed/);
});

test('formatProductSurfaceText emits provider liveness operator commands for operation review routes', () => {
  const localIngressText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_local_ingress_provider',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'inhabited',
      health: 'attention',
      next_action: 'local_ingress_provider_liveness_missing',
      workflow_next_action: 'review_local_ingress_provider_liveness',
      workflow_reason: 'local_ingress_provider_liveness_missing',
      session_count: 1,
      task_count: 0,
    },
  });
  assert.match(localIngressText, /Local Ingress Provider Liveness: pnpm --filter @narada2\/cloudflare-carrier product:local-ingress:provider-liveness:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);

  const localIngressRestoreText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_local_ingress_provider',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'inhabited',
      health: 'attention',
      next_action: 'local_ingress_provider_liveness_missing',
      workflow_next_action: 'restore_windows_local_ingress_executor',
      workflow_reason: 'local_ingress_operation_posture_requires_windows_executor',
      session_count: 1,
      task_count: 0,
    },
  });
  assert.match(localIngressRestoreText, /Local Ingress Provider Liveness: pnpm --filter @narada2\/cloudflare-carrier product:local-ingress:provider-liveness:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);

  const localIngressRequestText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_local_ingress_request',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'inhabited',
      health: 'attention',
      next_action: 'local_ingress_request_attention',
      workflow_next_action: 'review_local_ingress_request',
      workflow_reason: 'local_ingress_operation_posture_has_pending_requests',
      session_count: 1,
      task_count: 0,
    },
  });
  assert.match(localIngressRequestText, /Local Ingress Request Review: pnpm --filter @narada2\/cloudflare-carrier product:local-ingress:request:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);

  const localIngressEvidenceText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_local_ingress_evidence',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'inhabited',
      health: 'attention',
      next_action: 'local_ingress_evidence_attention',
      workflow_next_action: 'review_local_ingress_evidence',
      workflow_reason: 'local_ingress_operation_posture_has_returned_evidence',
      session_count: 1,
      task_count: 0,
    },
  });
  assert.match(localIngressEvidenceText, /Local Ingress Evidence Review: pnpm --filter @narada2\/cloudflare-carrier product:local-ingress:evidence:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);

  const repositoryPublicationText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_repository_publication_provider',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'inhabited',
      health: 'attention',
      next_action: 'repository_publication_provider_liveness_missing',
      workflow_next_action: 'review_repository_publication_provider_liveness',
      workflow_reason: 'repository_publication_provider_liveness_missing',
      session_count: 1,
      task_count: 0,
    },
  });
  assert.match(repositoryPublicationText, /Repository Publication Provider Liveness: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:provider-liveness:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);

  const repositoryPublicationRestoreText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_repository_publication_provider',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'inhabited',
      health: 'attention',
      next_action: 'repository_publication_provider_liveness_missing',
      workflow_next_action: 'restore_windows_repository_publication_provider',
      workflow_reason: 'repository_publication_operation_posture_requires_windows_provider',
      session_count: 1,
      task_count: 0,
    },
  });
  assert.match(repositoryPublicationRestoreText, /Repository Publication Provider Liveness: pnpm --filter @narada2\/cloudflare-carrier product:repository-publication:provider-liveness:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
});

test('formatProductSurfaceText emits site authority operator command for site authority route', () => {
  const siteAuthorityText = formatProductSurfaceText({
    operation: 'site.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'site.read',
      site_id: 'site_alpha',
      display_name: 'Site Alpha',
      health: 'attention',
      next_action: 'read_site_authority',
      continuity_state: 'packet_observed',
      continuity_direction_state: 'bidirectional_packets_observed',
      continuity_direction_missing: [],
      continuity_loop_state: 'loop_report_observed',
      continuity_reconciliation_execution_state: 'reconciliation_execution_observed',
      continuity_reconciliation_execution_health: 'ready',
      continuity_packet_count: 3,
      continuity_loop_report_count: 20,
      continuity_reconciliation_execution_count: 20,
      persistence_state: 'durable',
      recovery_state: 'reconstructable',
      membership_count: 2,
      session_count: 4,
    },
  });

  assert.match(siteAuthorityText, /Site Authority: pnpm --filter @narada2\/cloudflare-carrier product:site:authority:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
});

test('formatProductSurfaceText emits site authority operator command for membership authority routes', () => {
  const membershipAuthorityText = formatProductSurfaceText({
    operation: 'site.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'site.read',
      site_id: 'site_alpha',
      display_name: 'Site Alpha',
      health: 'attention',
      next_action: 'focus_membership_authority',
      continuity_state: 'packet_observed',
      continuity_direction_state: 'bidirectional_packets_observed',
      continuity_direction_missing: [],
      continuity_loop_state: 'loop_report_observed',
      continuity_reconciliation_execution_state: 'reconciliation_execution_observed',
      continuity_reconciliation_execution_health: 'ready',
      continuity_packet_count: 3,
      continuity_loop_report_count: 20,
      continuity_reconciliation_execution_count: 20,
      persistence_state: 'durable',
      recovery_state: 'reconstructable',
      membership_count: 1,
      session_count: 4,
    },
  });
  assert.match(membershipAuthorityText, /Site Authority: pnpm --filter @narada2\/cloudflare-carrier product:site:authority:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);

  const inactiveMembershipText = formatProductSurfaceText({
    operation: 'site.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'site.read',
      site_id: 'site_alpha',
      display_name: 'Site Alpha',
      health: 'attention',
      next_action: 'inspect_inactive_membership',
      continuity_state: 'packet_observed',
      continuity_direction_state: 'bidirectional_packets_observed',
      continuity_direction_missing: [],
      continuity_loop_state: 'loop_report_observed',
      continuity_reconciliation_execution_state: 'reconciliation_execution_observed',
      continuity_reconciliation_execution_health: 'ready',
      continuity_packet_count: 3,
      continuity_loop_report_count: 20,
      continuity_reconciliation_execution_count: 20,
      persistence_state: 'durable',
      recovery_state: 'reconstructable',
      membership_count: 1,
      session_count: 4,
    },
  });
  assert.match(inactiveMembershipText, /Site Authority: pnpm --filter @narada2\/cloudflare-carrier product:site:authority:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);

  const authorityTransferText = formatProductSurfaceText({
    operation: 'site.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'site.read',
      site_id: 'site_alpha',
      display_name: 'Site Alpha',
      active_operation_id: 'operation_alpha',
      health: 'attention',
      next_action: 'continue_authority_transfer',
      continuity_state: 'packet_observed',
      continuity_direction_state: 'bidirectional_packets_observed',
      continuity_direction_missing: [],
      continuity_loop_state: 'loop_report_observed',
      continuity_reconciliation_execution_state: 'reconciliation_execution_observed',
      continuity_reconciliation_execution_health: 'ready',
      continuity_packet_count: 3,
      continuity_loop_report_count: 20,
      continuity_reconciliation_execution_count: 20,
      persistence_state: 'durable',
      recovery_state: 'reconstructable',
      membership_count: 1,
      session_count: 4,
    },
  });
  assert.match(authorityTransferText, /Authority Transfer: pnpm --filter @narada2\/cloudflare-carrier product:authority-transfer:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
});

test('formatProductSurfaceText emits site authority operator command for authority evidence routes', () => {
  const authorityEvidenceText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_authority_alpha',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'inhabited',
      health: 'attention',
      next_action: 'focus_authority_evidence',
      workflow_next_action: 'focus_authority_evidence',
      workflow_reason: 'authority_path_needs_evidence_or_locus_attention',
      session_count: 1,
      task_count: 0,
    },
  });

  assert.match(authorityEvidenceText, /Site Authority: pnpm --filter @narada2\/cloudflare-carrier product:site:authority:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
});

test('formatProductSurfaceText omits synthetic operation ids from authority transfer handoff', () => {
  const authorityTransferText = formatProductSurfaceText({
    operation: 'site.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'site.read',
      site_id: 'site_alpha',
      display_name: 'Site Alpha',
      health: 'attention',
      next_action: 'continue_authority_transfer',
      continuity_state: 'packet_observed',
      continuity_direction_state: 'bidirectional_packets_observed',
      continuity_direction_missing: [],
      continuity_loop_state: 'loop_report_observed',
      continuity_reconciliation_execution_state: 'reconciliation_execution_observed',
      continuity_reconciliation_execution_health: 'ready',
      continuity_packet_count: 3,
      continuity_loop_report_count: 20,
      continuity_reconciliation_execution_count: 20,
      persistence_state: 'durable',
      recovery_state: 'reconstructable',
      membership_count: 1,
      session_count: 4,
    },
  });

  assert.match(authorityTransferText, /Authority Transfer: pnpm --filter @narada2\/cloudflare-carrier product:authority-transfer:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.doesNotMatch(authorityTransferText, /Authority Transfer:.*<operation-id>/);
});

test('formatProductSurfaceText emits site authority operator command for authority path evidence route', () => {
  const authorityPathText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_authority_alpha',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'inhabited',
      health: 'attention',
      next_action: 'focus_authority_path_evidence',
      workflow_next_action: 'focus_authority_path_evidence',
      workflow_reason: 'authority_path_needs_evidence_or_locus_attention',
      session_count: 1,
      task_count: 0,
    },
  });

  assert.match(authorityPathText, /Site Authority: pnpm --filter @narada2\/cloudflare-carrier product:site:authority:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
});

test('formatProductSurfaceText emits directive intent task create operator command', () => {
  const taskCreateText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'inhabited',
      health: 'attention',
      next_action: 'directive_intent_task_missing',
      workflow_next_action: 'create_task_from_directive_intent',
      workflow_reason: 'directive_intent_has_no_task',
      session_count: 1,
      task_count: 0,
    },
  });

  assert.match(taskCreateText, /Task Create From Directive Intent: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:create-from-directive-intent:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
});

test('formatProductSurfaceText emits mailbox send review operator commands for operation review routes', () => {
  const confirmationText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_mailbox_confirmation',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'inhabited',
      health: 'attention',
      next_action: 'monitor_operation',
      workflow_next_action: 'review_mailbox_send_confirmation',
      workflow_reason: 'operation_operator_focus_needs_review',
      workflow_focus_ref: 'mailbox_send_confirmation_live_1',
      session_count: 1,
      task_count: 0,
    },
  });
  assert.match(confirmationText, /Mailbox Send Confirmation: pnpm --filter @narada2\/cloudflare-carrier product:mailbox:send-confirmation:text -- --url https:\/\/carrier\.example\.test --site site_alpha --focus-ref mailbox_send_confirmation_live_1 --operator-session-file <operator-session-file>/);

  const acceptedText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_mailbox_accepted',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'inhabited',
      health: 'attention',
      next_action: 'monitor_operation',
      workflow_next_action: 'review_mailbox_send_acceptance',
      workflow_reason: 'operation_operator_focus_needs_review',
      workflow_focus_ref: 'mailbox_send_accepted_live_1',
      session_count: 1,
      task_count: 0,
    },
  });
  assert.match(acceptedText, /Mailbox Send Accepted: pnpm --filter @narada2\/cloudflare-carrier product:mailbox:send-accepted:text -- --url https:\/\/carrier\.example\.test --site site_alpha --focus-ref mailbox_send_accepted_live_1 --operator-session-file <operator-session-file>/);
});

test('summarizeProductSurface summarizes site and operation reads', () => {
  assert.deepEqual(summarizeProductSurface('site.list', {
    sites: [{ site_id: 'site_fixture' }],
    site_product_overview: {
      site_count: 1,
      next_site_id: 'site_fixture',
      next_health: 'attention',
      next_action: 'focus_next_operation',
      next_reason: 'operation_posture',
      next_operation_id: 'operation_fixture',
      next_operation_next_action: 'refresh_site_continuity_loop',
      next_operation_reason: 'operation_lifecycle_continuity_loop_stale',
      next_operation_active_session_id: 'session_fixture',
      next_operation_local_ingress_request_count: 7,
      next_operation_local_ingress_evidence_count: 4,
      next_operation_local_ingress_provider_heartbeat_count: 20,
      next_operation_repository_publication_request_count: 25,
      next_operation_repository_publication_execution_count: 25,
      next_operation_repository_publication_evidence_count: 13,
      next_operation_repository_publication_provider_heartbeat_count: 20,
      next_operation_focus_kind: 'site_continuity_loop',
      next_operation_focus_ref: 'site_fixture',
      health_counts: { ready: 0, attention: 1, incomplete: 0, other: 0 },
    },
    site_posture_route: {
      domain: 'site_posture',
      command_state: 'site_posture_attention',
      command_action: 'focus_next_site',
      next_action: 'focus_next_site',
      target: 'site_fixture',
      status: 'needs_attention',
      reason: 'operation_posture',
    },
  }), {
    operation: 'site.list',
    site_count: 1,
    next_site_id: 'site_fixture',
    next_health: 'attention',
    next_action: 'focus_next_operation',
    next_reason: 'operation_posture',
    next_operation_id: 'operation_fixture',
    next_operation_next_action: 'refresh_site_continuity_loop',
    next_operation_reason: 'operation_lifecycle_continuity_loop_stale',
    next_operation_active_session_id: 'session_fixture',
    next_operation_local_ingress_request_count: 7,
    next_operation_local_ingress_evidence_count: 4,
    next_operation_local_ingress_provider_heartbeat_count: 20,
    next_operation_repository_publication_request_count: 25,
    next_operation_repository_publication_execution_count: 25,
    next_operation_repository_publication_evidence_count: 13,
    next_operation_repository_publication_provider_heartbeat_count: 20,
    next_operation_focus_kind: 'site_continuity_loop',
    next_operation_focus_ref: 'site_fixture',
    health_counts: { ready: 0, attention: 1, incomplete: 0, other: 0 },
    route_domain: 'site_posture',
    route_command_state: 'site_posture_attention',
    route_command_action: 'focus_next_site',
    route_next_action: 'focus_next_site',
    route_target: 'site_fixture',
    route_status: 'needs_attention',
    route_reason: 'operation_posture',
  });

  assert.deepEqual(summarizeProductSurface('site.read', {
    site: { site_id: 'site_fixture', display_name: 'Fixture Site' },
    focused_operation_lifecycle: {
      operation_id: 'operation_fixture',
      workflow_route: {
        next_action: 'review_site_continuity_reconciliation_execution',
        reason: 'operation_operator_focus_needs_review',
        focus_ref: 'site-continuity-reconciliation-execution:site_fixture:2026-06-13T23:19:01.404Z:completed',
      },
    },
    site_product_status: {
      health: 'attention',
      next_action: 'return_local_windows_continuity_packet',
      session_count: 2,
      continuity_state: 'packet_observed',
      continuity_direction_state: 'local_windows_to_cloudflare_only',
      continuity_direction_missing: ['cloudflare_to_local_windows'],
      continuity_loop_state: 'loop_report_observed',
      continuity_reconciliation_execution_state: 'reconciliation_execution_observed',
      site_continuity_reconciliation_execution_status: { health: 'ready' },
      continuity_packet_count: 2,
      continuity_loop_report_count: 1,
      continuity_reconciliation_execution_count: 1,
    },
    cloudflare_persistence_posture: { state: 'durable' },
    cloudflare_recovery_posture: { state: 'reconstructable' },
    memberships: [{}, {}],
    sessions: [
      {
        carrier_session_id: 'session_fixture',
        operation_id: 'operation_fixture',
      },
    ],
  }), {
    operation: 'site.read',
    site_id: 'site_fixture',
    display_name: 'Fixture Site',
    active_operation_id: 'operation_fixture',
    active_session_id: 'session_fixture',
    active_operation_next_action: 'review_site_continuity_reconciliation_execution',
    active_operation_workflow_reason: 'operation_operator_focus_needs_review',
    active_operation_focus_kind: 'site_continuity_reconciliation_execution',
    active_operation_focus_ref: 'site-continuity-reconciliation-execution:site_fixture:2026-06-13T23:19:01.404Z:completed',
    health: 'attention',
    next_action: 'return_local_windows_continuity_packet',
    continuity_state: 'packet_observed',
    continuity_direction_state: 'local_windows_to_cloudflare_only',
    continuity_direction_missing: ['cloudflare_to_local_windows'],
    continuity_loop_state: 'loop_report_observed',
    continuity_reconciliation_execution_state: 'reconciliation_execution_observed',
    continuity_reconciliation_execution_health: 'ready',
    continuity_packet_count: 2,
    continuity_loop_report_count: 1,
    continuity_reconciliation_execution_count: 1,
    persistence_state: 'durable',
    recovery_state: 'reconstructable',
    local_ingress_request_count: 0,
    local_ingress_evidence_count: 0,
    local_ingress_provider_heartbeat_count: 0,
    repository_publication_request_count: 0,
    repository_publication_execution_count: 0,
    repository_publication_evidence_count: 0,
    repository_publication_provider_heartbeat_count: 0,
    scope_loaded: true,
    membership_count: 2,
    member_principal_id: null,
    membership_role: null,
    session_count: 1,
  });

  assert.deepEqual(summarizeProductSurface('operation.list', {
    site_id: 'site_fixture',
    operations: [
      { site_id: 'site_fixture', operation_id: 'operation_control', status: 'inactive' },
      { site_id: 'site_fixture', operation_id: 'operation_continue', status: 'needs_continuation' },
    ],
    operation_posture_overview: {
      operation_count: 2,
      active_operation_id: 'operation_control',
      next_operation_id: 'operation_control',
      next_status: 'needs_attention',
      next_action: 'review_operation',
      next_reason: 'operation_needs_review',
      next_focus_kind: 'operation_review',
      next_focus_ref: 'operation_control',
      health_counts: { ready: 0, needs_attention: 1 },
    },
    focused_operation_lifecycle: {
      operation_id: 'operation_control',
      activity_timeline: [
        {
          focus_kind: 'operation_session',
          focus_ref: 'carrier_session_operation_control',
        },
      ],
    },
    operation_posture_route: {
      domain: 'operation_posture',
      command_state: 'operation_posture_attention',
      command_action: 'focus_next_operation',
      next_action: 'focus_next_operation',
      target: 'operation_control',
      status: 'needs_attention',
      reason: 'operation_needs_review',
    },
  }, { continuation: true }), {
    operation: 'operation.list',
    continuation_mode: true,
    site_id: 'site_fixture',
    operation_count: 2,
    active_operation_id: 'operation_control',
    next_operation_id: 'operation_control',
    next_operation_active_session_id: 'carrier_session_operation_control',
    next_operation_status: 'inactive',
    needs_continuation_count: 1,
    next_continuation_operation_id: 'operation_continue',
    next_continuation_operation_status: 'needs_continuation',
    continuation_next_action: 'read_operation_for_continuation',
    operation_status_counts: { inactive: 1, needs_continuation: 1 },
    next_status: 'needs_attention',
    next_action: 'review_operation',
    next_reason: 'operation_needs_review',
    next_operation_focus_kind: 'operation_review',
    next_operation_focus_ref: 'operation_control',
    health_counts: { ready: 0, needs_attention: 1 },
    route_domain: 'operation_posture',
    route_command_state: 'operation_posture_attention',
    route_command_action: 'focus_next_operation',
    route_next_action: 'focus_next_operation',
    route_target: 'operation_control',
    route_status: 'needs_attention',
    route_reason: 'operation_needs_review',
    projection_error_stage: null,
    projection_error_code: null,
    projection_error_message: null,
  });

  assert.deepEqual(summarizeProductSurface('operation.read', {
    operation: { site_id: 'site_fixture', operation_id: 'operation_control', status: 'active' },
    operation_status_history: {
      current_status: 'paused',
      transition_count: 1,
      latest_transition: {
        from_status: 'active',
        to_status: 'paused',
        recorded_at: '2026-06-11T00:00:00.000Z',
      },
    },
    operation_lifecycle_status: { phase: 'inhabited', health: 'attention', next_action: 'continuity_packet', session_count: 1, task_count: 3 },
    operation_workflow_route: {
      next_action: 'review_site_continuity_reconciliation_execution',
      reason: 'operation_lifecycle_continuity_reconciliation_execution_attention',
      target: 'reconciliation_execution_failed',
      focus_kind: 'site_continuity_reconciliation_execution',
      focus_ref: 'reconciliation_execution_failed',
      action_command_kind: 'site_continuity_reconciliation_review',
      action_command: 'pnpm site:continuity:reconciliation -- review --id reconciliation_execution_failed',
      continuity_direction_state: 'cloudflare_to_local_windows_only',
      continuity_direction_missing: ['local_windows_to_cloudflare'],
    },
    operation_posture_route: {
      next_status: 'needs_attention',
      next_action: 'review_operation',
      reason: 'operation_needs_review',
    },
    cloudflare_persistence_posture: {
      state: 'durable',
    },
    cloudflare_recovery_posture: {
      state: 'reconstructable',
      recovery_boundary_count: 12,
      recovery_boundaries: [
        { key: 'site_registry' },
        { key: 'carrier_evidence_index' },
        { key: 'site_file_materialization_store' },
      ],
      recovery_gaps: [],
      next_action: 'monitor_recovery_posture',
    },
  }), {
    operation: 'operation.read',
    site_id: 'site_fixture',
    operation_id: 'operation_control',
    current_status: 'paused',
    status_transition_count: 1,
    latest_status_from: 'active',
    latest_status_to: 'paused',
    latest_status_recorded_at: '2026-06-11T00:00:00.000Z',
    phase: 'inhabited',
    health: 'attention',
    next_action: 'continuity_packet',
    session_count: 1,
    active_session_id: null,
    task_count: 3,
    local_ingress_request_count: 0,
    local_ingress_evidence_count: 0,
    local_ingress_provider_heartbeat_count: 0,
    repository_publication_request_count: 0,
    repository_publication_execution_count: 0,
    repository_publication_evidence_count: 0,
    repository_publication_provider_heartbeat_count: 0,
    scope_loaded: true,
    workflow_next_action: 'review_site_continuity_reconciliation_execution',
    workflow_reason: 'operation_lifecycle_continuity_reconciliation_execution_attention',
    workflow_focus_kind: 'site_continuity_reconciliation_execution',
    workflow_focus_ref: 'reconciliation_execution_failed',
    workflow_action_command_kind: 'site_continuity_reconciliation_review',
    workflow_action_command: 'pnpm site:continuity:reconciliation -- review --id reconciliation_execution_failed',
    workflow_continuity_direction_state: 'cloudflare_to_local_windows_only',
    workflow_continuity_direction_missing: ['local_windows_to_cloudflare'],
    posture_next_status: 'needs_attention',
    posture_next_action: 'review_operation',
    posture_target: null,
    posture_reason: 'operation_needs_review',
    persistence_state: 'durable',
    recovery_state: 'reconstructable',
    recovery_boundary_count: 12,
    recovery_boundary_keys: ['site_registry', 'carrier_evidence_index', 'site_file_materialization_store'],
    recovery_gap_count: 0,
    recovery_gap_keys: [],
    recovery_next_action: 'monitor_recovery_posture',
    projection_error_stage: null,
    projection_error_code: null,
    projection_error_message: null,
  });

  assert.equal(summarizeProductSurface('operation.read', {
    operation: { site_id: 'site_fixture', operation_id: 'operation_control', status: 'active' },
    operation_lifecycle_status: { phase: 'inhabited', health: 'ready', next_action: 'monitor_operation', session_count: 1, task_count: 0 },
    operation_workflow_route: {
      next_action: 'review_site_continuity_reconciliation_execution',
      reason: 'operation_operator_focus_needs_review',
      focus_ref: 'site-continuity-reconciliation-execution:site_fixture:2026-06-13T21:59:01.308Z:completed',
    },
  }).next_action, 'review_site_continuity_reconciliation_execution');
  assert.equal(summarizeProductSurface('operation.read', {
    operation: { site_id: 'site_fixture', operation_id: 'operation_control', status: 'active' },
    operation_lifecycle_status: { phase: 'inhabited', health: 'ready', next_action: 'monitor_operation', session_count: 1, task_count: 0 },
    operation_workflow_route: {
      next_action: 'review_site_continuity_reconciliation_execution',
      reason: 'operation_operator_focus_needs_review',
      focus_ref: 'site-continuity-reconciliation-execution:site_fixture:2026-06-13T21:59:01.308Z:completed',
    },
  }).workflow_focus_kind, 'site_continuity_reconciliation_execution');
});
test('formatProductSurfaceText surfaces site scope and site operation focus commands', () => {
  const siteReadScopeText = formatProductSurfaceText({
    operation: 'site.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'site.read',
      site_id: 'site_alpha',
      display_name: 'Alpha Site',
      health: 'attention',
      next_action: 'read_site_scope',
      scope_loaded: false,
      continuity_state: 'unknown',
      continuity_direction_state: 'unknown',
      continuity_loop_state: 'unknown',
      continuity_reconciliation_execution_state: 'unknown',
      continuity_reconciliation_execution_health: 'unknown',
      continuity_packet_count: 0,
      continuity_loop_report_count: 0,
      continuity_reconciliation_execution_count: 0,
      persistence_state: 'unknown',
      recovery_state: 'unknown',
      membership_count: 0,
      session_count: 0,
    },
  });
  assert.match(siteReadScopeText, /Scope Loaded: no/);
  assert.match(siteReadScopeText, /Site Scope: pnpm --filter @narada2\/cloudflare-carrier product:site:scope:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);

  const membershipScopeText = formatProductSurfaceText({
    operation: 'site.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'site.read',
      site_id: 'site_alpha',
      display_name: 'Alpha Site',
      health: 'attention',
      next_action: 'read_membership_site',
      scope_loaded: true,
      continuity_state: 'unknown',
      continuity_direction_state: 'unknown',
      continuity_loop_state: 'unknown',
      continuity_reconciliation_execution_state: 'unknown',
      continuity_reconciliation_execution_health: 'unknown',
      continuity_packet_count: 0,
      continuity_loop_report_count: 0,
      continuity_reconciliation_execution_count: 0,
      persistence_state: 'unknown',
      recovery_state: 'unknown',
      membership_count: 0,
      session_count: 0,
    },
  });
  assert.match(membershipScopeText, /Site Scope: pnpm --filter @narada2\/cloudflare-carrier product:site:scope:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);

  const siteReadContinuityReviewText = formatProductSurfaceText({
    operation: 'site.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'site.read',
      site_id: 'site_alpha',
      display_name: 'Alpha Site',
      active_operation_id: 'operation_alpha',
      active_operation_next_action: 'review_site_continuity_reconciliation_execution',
      active_operation_workflow_reason: 'operation_operator_focus_needs_review',
      active_operation_focus_kind: 'site_continuity_reconciliation_execution',
      active_operation_focus_ref: 'site-continuity-reconciliation-execution:site_alpha:2026-06-13T23:19:01.404Z:completed',
      health: 'attention',
      next_action: 'focus_next_operation',
      scope_loaded: true,
      continuity_state: 'packet_observed',
      continuity_direction_state: 'bidirectional_packets_observed',
      continuity_loop_state: 'loop_report_observed',
      continuity_reconciliation_execution_state: 'reconciliation_execution_observed',
      continuity_reconciliation_execution_health: 'ready',
      continuity_packet_count: 3,
      continuity_loop_report_count: 20,
      continuity_reconciliation_execution_count: 20,
      persistence_state: 'durable',
      recovery_state: 'reconstructable',
      membership_count: 2,
      session_count: 4,
    },
  });
  assert.match(siteReadContinuityReviewText, /Active Operation Route: operation=operation_alpha action=review_site_continuity_reconciliation_execution reason=operation_operator_focus_needs_review/);
  assert.match(siteReadContinuityReviewText, /Active Operation Focus: kind=site_continuity_reconciliation_execution ref=site-continuity-reconciliation-execution:site_alpha:2026-06-13T23:19:01.404Z:completed/);
  assert.match(siteReadContinuityReviewText, /Review Ack: pnpm --filter @narada2\/cloudflare-carrier product:operation:focus-review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --focus-kind site_continuity_reconciliation_execution --focus-ref site-continuity-reconciliation-execution:site_alpha:2026-06-13T23:19:01.404Z:completed --operator-session-file <operator-session-file>/);

  const siteReadContinuityRefreshText = formatProductSurfaceText({
    operation: 'site.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'site.read',
      site_id: 'site_alpha',
      display_name: 'Alpha Site',
      active_operation_id: 'operation_alpha',
      active_operation_next_action: 'refresh_site_continuity_loop',
      active_operation_workflow_reason: 'operation_lifecycle_continuity_loop_stale',
      active_operation_focus_kind: null,
      active_operation_focus_ref: 'site_alpha',
      health: 'attention',
      next_action: 'focus_next_operation',
      scope_loaded: true,
      continuity_state: 'packet_observed',
      continuity_direction_state: 'bidirectional_packets_observed',
      continuity_loop_state: 'loop_report_observed',
      continuity_reconciliation_execution_state: 'reconciliation_execution_observed',
      continuity_reconciliation_execution_health: 'ready',
      continuity_packet_count: 3,
      continuity_loop_report_count: 20,
      continuity_reconciliation_execution_count: 20,
      persistence_state: 'durable',
      recovery_state: 'reconstructable',
      membership_count: 2,
      session_count: 4,
    },
  });
  assert.match(siteReadContinuityRefreshText, /Continuity Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:continuity:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --expected-pre-action refresh_site_continuity_loop --operator-session-file <operator-session-file> --execute-operation-continuity/);

  const siteReadMembershipPutText = formatProductSurfaceText({
    operation: 'site.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'site.read',
      site_id: 'site_alpha',
      display_name: 'Alpha Site',
      health: 'attention',
      next_action: 'load_or_create_membership',
      scope_loaded: true,
      continuity_state: 'unknown',
      continuity_direction_state: 'unknown',
      continuity_loop_state: 'unknown',
      continuity_reconciliation_execution_state: 'unknown',
      continuity_reconciliation_execution_health: 'unknown',
      continuity_packet_count: 0,
      continuity_loop_report_count: 0,
      continuity_reconciliation_execution_count: 0,
      persistence_state: 'unknown',
      recovery_state: 'unknown',
      membership_count: 0,
      session_count: 0,
    },
  });
  assert.doesNotMatch(siteReadMembershipPutText, /Site Membership Put:/);

  const siteReadMembershipPutReadyText = formatProductSurfaceText({
    operation: 'site.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'site.read',
      site_id: 'site_alpha',
      display_name: 'Alpha Site',
      health: 'attention',
      next_action: 'load_or_create_membership',
      member_principal_id: 'principal:alpha',
      membership_role: 'viewer',
      scope_loaded: true,
      continuity_state: 'unknown',
      continuity_direction_state: 'unknown',
      continuity_loop_state: 'unknown',
      continuity_reconciliation_execution_state: 'unknown',
      continuity_reconciliation_execution_health: 'unknown',
      continuity_packet_count: 0,
      continuity_loop_report_count: 0,
      continuity_reconciliation_execution_count: 0,
      persistence_state: 'unknown',
      recovery_state: 'unknown',
      membership_count: 0,
      session_count: 0,
    },
  });
  assert.match(siteReadMembershipPutReadyText, /Site Membership Put: pnpm --filter @narada2\/cloudflare-carrier product:site:membership:put:text -- --url https:\/\/carrier\.example\.test --site site_alpha --member-principal-id principal:alpha --role viewer --operator-session-file <operator-session-file>/);


  const siteReadFocusText = formatProductSurfaceText({
    operation: 'site.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'site.read',
      site_id: 'site_alpha',
      display_name: 'Alpha Site',
      health: 'attention',
      next_action: 'focus_site_operation',
      scope_loaded: true,
      continuity_state: 'unknown',
      continuity_direction_state: 'unknown',
      continuity_loop_state: 'unknown',
      continuity_reconciliation_execution_state: 'unknown',
      continuity_reconciliation_execution_health: 'unknown',
      continuity_packet_count: 0,
      continuity_loop_report_count: 0,
      continuity_reconciliation_execution_count: 0,
      persistence_state: 'durable',
      recovery_state: 'reconstructable',
      membership_count: 1,
      session_count: 0,
    },
  });
  assert.match(siteReadFocusText, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file> --execute-operation-next/);

  const siteReadNextOperationText = formatProductSurfaceText({
    operation: 'site.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'site.read',
      site_id: 'site_alpha',
      display_name: 'Alpha Site',
      health: 'attention',
      next_action: 'focus_next_operation',
      scope_loaded: true,
      continuity_state: 'packet_observed',
      continuity_direction_state: 'bidirectional_packets_observed',
      continuity_loop_state: 'loop_report_observed',
      continuity_reconciliation_execution_state: 'reconciliation_execution_observed',
      continuity_reconciliation_execution_health: 'ready',
      continuity_packet_count: 3,
      continuity_loop_report_count: 20,
      continuity_reconciliation_execution_count: 20,
      persistence_state: 'durable',
      recovery_state: 'reconstructable',
      membership_count: 1,
      session_count: 2,
    },
  });
  assert.match(siteReadNextOperationText, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file> --execute-operation-next/);
});

test('formatProductSurfaceText omits synthetic next operation ids from site list handoff', () => {
  const siteListText = formatProductSurfaceText({
    operation: 'site.list',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'site.list',
      site_count: 1,
      next_site_id: 'site_alpha',
      next_health: 'attention',
      next_action: 'focus_next_operation',
      next_reason: 'focused_site_has_pending_operation',
      route_domain: 'site_posture',
      route_command_state: 'site_posture_focus_next_site',
      route_next_action: 'focus_next_site',
      route_target: 'site_alpha',
      route_status: 'attention',
      route_reason: 'focused_site_has_pending_operation',
    },
  });

  assert.match(siteListText, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file> --execute-operation-next/);
  assert.doesNotMatch(siteListText, /Operation Next Workflow:.*<operation-id>/);
});

test('formatProductSurfaceText surfaces operation scope command', () => {
  const operationReadScopeText = formatProductSurfaceText({
    operation: 'operation.read',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation: 'operation.read',
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      current_status: 'active',
      status_transition_count: 0,
      phase: 'active_uninhabited',
      health: 'attention',
      next_action: 'session',
      scope_loaded: false,
      workflow_next_action: 'read_operation_scope',
      workflow_reason: 'operation_scope_not_loaded',
      session_count: 0,
      task_count: 0,
      recovery_state: 'unknown',
      recovery_boundary_count: 0,
      recovery_gap_count: 0,
    },
  });

  assert.match(operationReadScopeText, /Scope Loaded: no/);
  assert.match(operationReadScopeText, /Operation Scope: pnpm --filter @narada2\/cloudflare-carrier product:operation:scope:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
});

