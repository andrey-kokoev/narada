import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatContinuationResumeText,
  parseContinuationResumeArgs,
  resumeCloudflareContinuation,
  summarizeContinuationResume,
  summarizeContinuationResumeFailure,
} from './cloudflare-carrier-continuation-resume.mjs';

test('parseContinuationResumeArgs builds activation and session.start params', () => {
  const parsed = parseContinuationResumeArgs([
    '--url', 'https://carrier.example.test/',
    '--token', 'secret-token',
    '--site', 'site_alpha',
    '--operation-id', 'operation_alpha',
    '--agent-id', 'agent.operator',
    '--site-root', 'cloudflare://site_alpha',
    '--reason', 'operator_resuming_continuation',
    '--request-id', 'request_resume_alpha',
    '--format', 'text',
  ], {}, () => 123);

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.requestId, 'request_resume_alpha');
  assert.equal(parsed.format, 'text');
  assert.equal(parsed.activateOperation, true);
  assert.deepEqual(parsed.params, {
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    carrier_session_id: 'carrier_session_operation_alpha_123',
    agent_id: 'agent.operator',
    site_root: 'cloudflare://site_alpha',
    reason: 'operator_resuming_continuation',
  });
  assert.deepEqual(parsed.auth, { kind: 'bearer', value: 'secret-token', source: 'flag:--token' });
});

test('parseContinuationResumeArgs accepts explicit session id and skip activate', () => {
  const parsed = parseContinuationResumeArgs([
    '--url', 'https://carrier.example.test',
    '--token', 'secret-token',
    '--site', 'site_alpha',
    '--operation-id', 'operation_alpha',
    '--agent', 'agent.operator',
    '--session', 'carrier_session_existing',
    '--skip-activate',
  ], {}, () => 123);

  assert.equal(parsed.activateOperation, false);
  assert.equal(parsed.params.carrier_session_id, 'carrier_session_existing');
  assert.equal(parsed.params.agent_id, 'agent.operator');
});

test('parseContinuationResumeArgs refuses missing required operator inputs', () => {
  assert.throws(
    () => parseContinuationResumeArgs(['--token', 'secret-token', '--site', 'site_alpha', '--operation-id', 'operation_alpha', '--agent-id', 'agent.operator'], {}),
    /continuation_resume_requires_--url_or_CLOUDFLARE_CARRIER_URL/,
  );
  assert.throws(
    () => parseContinuationResumeArgs(['--url', 'https://carrier.example.test', '--token', 'secret-token', '--operation-id', 'operation_alpha', '--agent-id', 'agent.operator'], {}),
    /continuation_resume_requires_--site_or_CLOUDFLARE_CARRIER_SITE_ID/,
  );
  assert.throws(
    () => parseContinuationResumeArgs(['--url', 'https://carrier.example.test', '--token', 'secret-token', '--site', 'site_alpha', '--agent-id', 'agent.operator'], {}),
    /continuation_resume_requires_--operation-id_or_CLOUDFLARE_CARRIER_OPERATION_ID/,
  );
  assert.throws(
    () => parseContinuationResumeArgs(['--url', 'https://carrier.example.test', '--token', 'secret-token', '--site', 'site_alpha', '--operation-id', 'operation_alpha'], {}),
    /continuation_resume_requires_--agent-id_or_CLOUDFLARE_CARRIER_AGENT_ID/,
  );
  assert.throws(
    () => parseContinuationResumeArgs(['--url', 'https://carrier.example.test', '--site', 'site_alpha', '--operation-id', 'operation_alpha', '--agent-id', 'agent.operator'], {}),
    /continuation_resume_requires_bearer_token_or_operator_session/,
  );
});

test('resumeCloudflareContinuation activates operation then starts bound session without leaking auth', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: url.toString(), init });
    if (calls.length === 1) {
      return {
        status: 200,
        async text() {
          return JSON.stringify({
            ok: true,
            previous_status: 'needs_continuation',
            transition: 'needs_continuation_to_active',
            operation: {
              site_id: 'site_alpha',
              operation_id: 'operation_alpha',
              status: 'active',
              updated_at: '2026-06-11T00:00:00.000Z',
            },
          });
        },
      };
    }
    return {
      status: 200,
      async text() {
        return JSON.stringify({
          ok: true,
          operation: 'session.start',
          carrier_session_id: 'carrier_session_alpha',
          event: {
            event_kind: 'carrier_session_started',
            sequence: 1,
            carrier_session_id: 'carrier_session_alpha',
            payload: {
              site_id: 'site_alpha',
              operation_id: 'operation_alpha',
              agent_id: 'agent.operator',
            },
          },
        });
      },
    };
  };

  const result = await resumeCloudflareContinuation({
    workerUrl: 'https://carrier.example.test',
    requestId: 'request_resume_alpha',
    format: 'json',
    activateOperation: true,
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
    params: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      carrier_session_id: 'carrier_session_alpha',
      agent_id: 'agent.operator',
      site_root: 'cloudflare://site_alpha',
      reason: 'operator_resuming_continuation',
    },
  }, fetchImpl);

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://carrier.example.test/api/carrier');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    operation: 'operation.status.put',
    request_id: 'request_resume_alpha_activate',
    params: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      status: 'active',
      reason: 'operator_resuming_continuation',
    },
  });
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    operation: 'session.start',
    request_id: 'request_resume_alpha_session_start',
    params: {
      carrier_session_id: 'carrier_session_alpha',
      agent_id: 'agent.operator',
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      site_root: 'cloudflare://site_alpha',
    },
  });
  assert.equal(result.schema, 'narada.cloudflare_carrier.continuation_resume.v1');
  assert.equal(result.auth_source, 'flag:--token');
  assert.equal(JSON.stringify(result).includes('secret-token'), false);
  assert.deepEqual(result.summary, {
    site_id: 'site_alpha',
    operation_id: 'operation_alpha',
    carrier_session_id: 'carrier_session_alpha',
    agent_id: 'agent.operator',
    activation_status: 'active',
    activation_transition: 'needs_continuation_to_active',
    activation_reason: 'operator_resuming_continuation',
    session_event_kind: 'carrier_session_started',
    session_event_sequence: 1,
  });
});

test('resumeCloudflareContinuation can start session without status activation', async () => {
  const calls = [];
  const result = await resumeCloudflareContinuation({
    workerUrl: 'https://carrier.example.test',
    requestId: 'request_resume_alpha',
    activateOperation: false,
    auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
    params: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      carrier_session_id: 'carrier_session_alpha',
      agent_id: 'agent.operator',
    },
  }, async (url, init) => {
    calls.push({ url: url.toString(), init });
    return {
      status: 200,
      async text() {
        return JSON.stringify({
          ok: true,
          carrier_session_id: 'carrier_session_alpha',
          event: { event_kind: 'carrier_session_started', sequence: 1 },
        });
      },
    };
  });

  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0].init.body).operation, 'session.start');
  assert.equal(result.summary.activation_status, 'skipped');
});

test('resumeCloudflareContinuation surfaces structured session.start refusal evidence', async () => {
  await assert.rejects(
    async () => resumeCloudflareContinuation({
      workerUrl: 'https://carrier.example.test',
      requestId: 'request_resume_denied',
      format: 'text',
      activateOperation: false,
      auth: { kind: 'bearer', value: 'secret-token', source: 'flag:--token' },
      params: {
        site_id: 'site_alpha',
        operation_id: 'operation_alpha',
        carrier_session_id: 'carrier_session_alpha',
        agent_id: 'agent.operator',
      },
    }, async () => ({
      status: 403,
      async text() {
        return JSON.stringify({
          ok: false,
          code: 'operation_not_bindable',
          action: 'deny',
          reason: 'closed_operation_is_terminal',
          site_id: 'site_alpha',
          operation_id: 'operation_alpha',
        });
      },
    })),
    (error) => {
      assert.match(error.message, /continuation_resume_session_start_failed:operation_not_bindable/);
      assert.equal(error.code, 'operation_not_bindable');
      assert.equal(error.http_status, 403);
      assert.deepEqual(error.summary, {
        ok: false,
        code: 'operation_not_bindable',
        action: 'deny',
        reason: 'closed_operation_is_terminal',
        site_id: 'site_alpha',
        operation_id: 'operation_alpha',
        carrier_session_id: 'carrier_session_alpha',
        agent_id: 'agent.operator',
      });
      return true;
    },
  );
});

test('formatContinuationResumeText renders operator summary without auth material', () => {
  const text = formatContinuationResumeText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    params: {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      carrier_session_id: 'carrier_session_alpha',
      agent_id: 'agent.operator',
      reason: 'operator_resuming_continuation',
    },
    summary: summarizeContinuationResume({
      activation: {
        summary: {
          status: 'active',
          transition: 'needs_continuation_to_active',
          reason: 'operator_resuming_continuation',
        },
      },
      session_start: {
        carrier_session_id: 'carrier_session_alpha',
        event: { event_kind: 'carrier_session_started', sequence: 1 },
      },
    }, {
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
      carrier_session_id: 'carrier_session_alpha',
      agent_id: 'agent.operator',
      reason: 'operator_resuming_continuation',
    }),
    auth: { kind: 'bearer', value: 'secret-token' },
  });

  assert.match(text, /Continuation Resume: ok/);
  assert.match(text, /Operation: operation_alpha/);
  assert.match(text, /Session: carrier_session_alpha/);
  assert.match(text, /Activation: status=active transition=needs_continuation_to_active reason=operator_resuming_continuation/);
  assert.match(text, /Session Event: kind=carrier_session_started sequence=1/);
  assert.equal(text.includes('secret-token'), false);
});

test('formatContinuationResumeText renders refused resume evidence', () => {
  const text = formatContinuationResumeText({
    status: 'refused',
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    params: { site_id: 'site_alpha', operation_id: 'operation_alpha', carrier_session_id: 'carrier_session_alpha', agent_id: 'agent.operator' },
    summary: summarizeContinuationResumeFailure({
      ok: false,
      code: 'operation_not_bindable',
      action: 'deny',
      reason: 'closed_operation_is_terminal',
      site_id: 'site_alpha',
      operation_id: 'operation_alpha',
    }, { carrier_session_id: 'carrier_session_alpha', agent_id: 'agent.operator' }),
    auth: { kind: 'bearer', value: 'secret-token' },
  });

  assert.match(text, /Continuation Resume: refused/);
  assert.match(text, /Code: operation_not_bindable/);
  assert.match(text, /Refusal: action=deny reason=closed_operation_is_terminal/);
  assert.equal(text.includes('secret-token'), false);
});
