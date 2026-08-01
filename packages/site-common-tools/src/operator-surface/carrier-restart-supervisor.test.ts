import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { resolveNaradaSitePaths } from '@narada-core/site-paths';
import {
  authorityTransitionStatePathFromSessionPath,
  readAuthorityTransitionSourceState,
  writeNarsSessionStartedIndex,
} from '@narada-core/nars-session-core';
import {
  carrierRestartOperationPath,
  readCarrierRestartOutcome,
  requestCarrierRestart,
} from './carrier-restart-supervisor.js';

test('carrier restart supervisor persists a planned operation and is idempotent', async () => {
  const root = mkdtempSync(join(tmpdir(), 'carrier-restart-plan-'));
  try {
    const args = {
      operation_id: 'restart-plan-1',
      requested_by: 'principal-andrey',
      site_id: 'site-local',
      carrier_session_id: 'carrier_source_1',
      expected_state: {
        manifest_digest: null,
        observation_digest: 'a'.repeat(64),
        descriptor_digest: null,
      },
      reason: 'test plan',
      dry_run: true,
    };
    const first = await requestCarrierRestart(args, { siteRoot: root, pcSiteRoot: root });
    const second = await requestCarrierRestart(args, { siteRoot: root, pcSiteRoot: root });
    assert.equal(first.status, 'planned');
    assert.deepEqual(second, first);
    assert.equal(readCarrierRestartOutcome(root, 'restart-plan-1')?.status, 'planned');
    assert.equal(existsSync(carrierRestartOperationPath(root, 'restart-plan-1')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('carrier restart supervisor completes successor activation and source retirement with injected process seams', async () => {
  const root = mkdtempSync(join(tmpdir(), 'carrier-restart-live-'));
  const sourceSessionId = 'carrier_source_2';
  try {
    const sourcePaths = resolveNaradaSitePaths({ siteRoot: root, sessionId: sourceSessionId });
    mkdirSync(sourcePaths.narsSessionDir!, { recursive: true });
    writeFileSync(sourcePaths.narsControlPath!, '', 'utf8');
    const startedAt = '2026-07-30T00:00:00.000Z';
    const startedEvent = {
      event: 'session_started',
      sequence: 1,
      session_id: sourceSessionId,
      runtime_session_id: sourceSessionId,
      carrier_session_id: sourceSessionId,
      agent_id: 'andrey-user.resident',
      site_id: 'site-local',
      site_root: root,
      runtime: 'narada-agent-runtime-server',
      operator_surface_kind: 'agent-web-ui',
      started_at: startedAt,
      health_endpoint: null,
    };
    appendFileSync(sourcePaths.narsEventsPath!, `${JSON.stringify(startedEvent)}\n`, 'utf8');
    writeNarsSessionStartedIndex({ sessionStartedEvent: startedEvent, sessionPath: sourcePaths.narsSessionPath, siteRoot: root, now: new Date(startedAt) });

    let sourceCloseObserved = false;
    const outcome = await requestCarrierRestart({
      operation_id: 'restart-live-1',
      requested_by: 'principal-andrey',
      site_id: 'site-local',
      carrier_session_id: sourceSessionId,
      expected_state: {
        manifest_digest: null,
        observation_digest: 'b'.repeat(64),
        descriptor_digest: null,
      },
      reason: 'test controlled restart',
      timeout_ms: 10_000,
      mutating_authorized: 'carrier.restart',
    }, {
      siteRoot: root,
      pcSiteRoot: root,
      launch: async (spec) => {
        const targetPaths = resolveNaradaSitePaths({ siteRoot: root, sessionId: spec.sessionId });
        mkdirSync(targetPaths.narsSessionDir!, { recursive: true });
        appendFileSync(targetPaths.narsEventsPath!, `${JSON.stringify({
          event: 'session_started',
          sequence: 1,
          session_id: spec.sessionId,
          health_endpoint: `http://carrier.test/${spec.sessionId}/health`,
        })}\n`, 'utf8');
        writeFileSync(targetPaths.narsHeartbeatPath!, JSON.stringify({ last_written_at: new Date().toISOString() }), 'utf8');
        return { ok: true, exit_code: 0, signal: null, stdout: '', stderr: '' };
      },
      healthCheck: async (endpoint) => ({
        ready: true,
        status: 'healthy',
        lifecycle_state: 'ready',
        mcp_operational_state: 'healthy',
        endpoint,
        body: { status: 'healthy', lifecycle_state: 'ready', mcp_operational_state: 'healthy' },
      }),
      sleep: async () => {
        if (!sourceCloseObserved) {
          sourceCloseObserved = true;
          appendFileSync(sourcePaths.narsEventsPath!, `${JSON.stringify({ event: 'session_closed', sequence: 2 })}\n`, 'utf8');
        }
      },
    });

    assert.equal(outcome.status, 'completed');
    assert.equal(outcome.transition_state, 'source_retired');
    assert.equal(outcome.source_retired, true);
    assert.ok(outcome.target_session_id);
    const statePath = authorityTransitionStatePathFromSessionPath(sourcePaths.narsSessionPath!);
    assert.equal(readAuthorityTransitionSourceState(statePath).source_write_admission, 'retired');
    assert.match(readFileSync(sourcePaths.narsControlPath!, 'utf8'), /session\.close/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
