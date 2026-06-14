#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatSessionEvidenceText,
  parseSessionEvidenceReadArgs,
  readSessionEvidence,
  summarizeSessionEvidence,
} from './cloudflare-carrier-session-evidence-read.mjs';

test('parseSessionEvidenceReadArgs builds session evidence inputs', () => {
  const parsed = parseSessionEvidenceReadArgs([
    '--url', 'https://carrier.example.test',
    '--site', 'site_alpha',
    '--operation-id', 'operation_alpha',
    '--carrier-session-id', 'session_alpha',
    '--after-sequence', '5',
    '--limit', '25',
    '--request-id', 'session_evidence_read_1',
    '--format', 'text',
    '--token', 'secret-token',
  ]);

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.siteId, 'site_alpha');
  assert.equal(parsed.operationId, 'operation_alpha');
  assert.equal(parsed.carrierSessionId, 'session_alpha');
  assert.equal(parsed.afterSequence, 5);
  assert.equal(parsed.limit, 25);
  assert.equal(parsed.requestId, 'session_evidence_read_1');
  assert.equal(parsed.format, 'text');
  assert.deepEqual(parsed.auth, { kind: 'bearer', value: 'secret-token', source: 'flag:--token' });
});

test('parseSessionEvidenceReadArgs refuses missing required inputs', () => {
  assert.throws(
    () => parseSessionEvidenceReadArgs(['--carrier-session-id', 'session_alpha', '--token', 'secret-token']),
    /session_evidence_read_requires_--url_or_CLOUDFLARE_CARRIER_URL/,
  );
  assert.throws(
    () => parseSessionEvidenceReadArgs(['--url', 'https://carrier.example.test', '--token', 'secret-token']),
    /session_evidence_read_requires_--carrier-session-id_or_--session-id_or_CLOUDFLARE_CARRIER_SESSION_ID/,
  );
});

test('readSessionEvidence composes session.events.read and summarizes events', async () => {
  let capturedRequest = null;
  const result = await readSessionEvidence({
    workerUrl: 'https://carrier.example.test',
    siteId: 'site_alpha',
    operationId: 'operation_alpha',
    carrierSessionId: 'session_alpha',
    afterSequence: 0,
    limit: 20,
    requestId: 'session_evidence_read_1',
    auth: { kind: 'operator_session', value: 'session-cookie', source: 'operator-session-file' },
  }, async (url, init) => {
    capturedRequest = { url: String(url), init };
    return {
      status: 200,
      async text() {
        return JSON.stringify({
          ok: true,
          events: [
            { sequence: 1, event_kind: 'carrier_session_started' },
            { sequence: 2, event_kind: 'tool_call_requested' },
            { sequence: 3, event_kind: 'tool_result_received' },
          ],
          next_cursor: 3,
        });
      },
    };
  });

  assert.equal(capturedRequest.url, 'https://carrier.example.test/api/carrier');
  assert.equal(capturedRequest.init.method, 'POST');
  assert.equal(capturedRequest.init.headers.cookie, 'narada_operator_session=session-cookie');
  assert.deepEqual(JSON.parse(capturedRequest.init.body), {
    operation: 'session.events.read',
    request_id: 'session_evidence_read_1',
    carrier_session_id: 'session_alpha',
    params: {
      after_sequence: 0,
      limit: 20,
    },
  });
  assert.equal(result.summary.event_count, 3);
  assert.equal(result.summary.latest_event_kind, 'tool_result_received');
  assert.equal(result.summary.first_sequence, 1);
  assert.equal(result.summary.last_sequence, 3);
});

test('summaries and text output preserve session evidence detail', () => {
  const summary = summarizeSessionEvidence({
    events: [
      { sequence: 10, event_kind: 'carrier_command_executed' },
      { sequence: 11, event_kind: 'provider_request_recorded' },
    ],
    next_cursor: 11,
  }, {
    siteId: 'site_alpha',
    operationId: 'operation_alpha',
    carrierSessionId: 'session_alpha',
  });

  assert.equal(summary.site_id, 'site_alpha');
  assert.equal(summary.operation_id, 'operation_alpha');
  assert.equal(summary.carrier_session_id, 'session_alpha');
  assert.equal(summary.event_count, 2);
  assert.equal(summary.latest_event_kind, 'provider_request_recorded');

  const text = formatSessionEvidenceText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary,
  });
  assert.match(text, /Session Evidence: ok/);
  assert.match(text, /Session: session_alpha/);
  assert.match(text, /Latest Event: provider_request_recorded/);
  assert.match(text, /Event Kinds: carrier_command_executed=1 provider_request_recorded=1/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file> --execute-site-next/);
  assert.match(text, /Task Review: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:review:text -- --url https:\/\/carrier\.example\.test --site site_alpha --carrier-session-id session_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Task Workflow: pnpm --filter @narada2\/cloudflare-carrier product:task-lifecycle:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --carrier-session-id session_alpha --agent-id <agent-id> --operator-session-file <operator-session-file> --execute-task-lifecycle-next/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file> --execute-operation-next/);
});

test('formatSessionEvidenceText suppresses worker-scoped handoffs without worker url', () => {
  const text = formatSessionEvidenceText({
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      carrier_session_id: 'session_alpha',
      event_count: 2,
      latest_event_kind: 'provider_request_recorded',
      event_kind_counts: { provider_request_recorded: 2 },
    },
  });

  assert.doesNotMatch(text, /<worker-url>/);
  assert.doesNotMatch(text, /Site Read:/);
  assert.doesNotMatch(text, /Site Next Workflow:/);
  assert.doesNotMatch(text, /Task Review:/);
  assert.doesNotMatch(text, /Task Workflow:/);
  assert.doesNotMatch(text, /Operation Review:/);
  assert.doesNotMatch(text, /Operation Next Workflow:/);
});

test('formatSessionEvidenceText suppresses site-scoped handoffs without site id', () => {
  const text = formatSessionEvidenceText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      operation_id: 'operation_alpha',
      carrier_session_id: 'session_alpha',
      event_count: 2,
      latest_event_kind: 'provider_request_recorded',
      event_kind_counts: { provider_request_recorded: 2 },
    },
  });

  assert.doesNotMatch(text, /Site Read:/);
  assert.doesNotMatch(text, /Site Next Workflow:/);
  assert.doesNotMatch(text, /Task Review:/);
  assert.doesNotMatch(text, /Task Workflow:/);
  assert.doesNotMatch(text, /Operation Review:/);
  assert.doesNotMatch(text, /Operation Next Workflow:/);
  assert.doesNotMatch(text, /<site-id>/);
});
