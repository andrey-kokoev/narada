import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildRemoteSiteInboxFinalizePayload,
  buildRemoteSiteInboxMessage,
  planRemoteSiteInboxLocalAdmission,
  receiptFromRemoteSiteInboxFinalize,
  type RemoteSiteInboxFinalizePayload,
  type RemoteSiteInboxMessage,
} from '../src/index.js';

function readRemoteCandidateFixture(): {
  cases: Array<{
    case_id: string;
    duplicate_of?: string;
    candidate: {
      schema: 'narada.remote_candidate.message.v0';
      candidate_id: string;
      target_site_id: string;
      source: RemoteSiteInboxMessage['source'];
      idempotency_key: string;
      kind: RemoteSiteInboxMessage['kind'];
      subject?: string;
      body: string;
      payload: Record<string, unknown>;
      received_at: string;
      admission_posture: {
        remote_surface_authority: 'candidate_only';
        local_admission_required: true;
      };
    };
    local_admission?: {
      envelope_id: string;
      received_at: string;
      finalize: Omit<RemoteSiteInboxFinalizePayload, 'schema'>;
    };
    expected_replay_posture?: {
      status: string;
      cloud_receipt_only: boolean;
      local_admission_replayed: boolean;
    };
  }>;
  authority_limits: string[];
} {
  return JSON.parse(readFileSync(new URL('../../../docs/product/fixtures/remote-candidate-exchange/receiving-site-admission.json', import.meta.url), 'utf8'));
}

function remoteCandidateToSiteInboxMessage(
  candidate: ReturnType<typeof readRemoteCandidateFixture>['cases'][number]['candidate'],
): Omit<RemoteSiteInboxMessage, 'schema' | 'status' | 'receipt'> {
  return {
    message_id: candidate.candidate_id,
    target_site_id: candidate.target_site_id,
    source: candidate.source,
    idempotency_key: candidate.idempotency_key,
    kind: candidate.kind,
    ...(candidate.subject ? { subject: candidate.subject } : {}),
    body: candidate.body,
    payload: {
      schema: 'narada.remote_candidate.local_payload.v0',
      remote_candidate: {
        candidate_id: candidate.candidate_id,
        idempotency_key: candidate.idempotency_key,
      },
      payload: candidate.payload,
    },
    received_at: candidate.received_at,
  };
}

describe('remote Site inbox message exchange', () => {
  it('builds a pending remote message with a stable receipt shape', () => {
    const message = buildRemoteSiteInboxMessage({
      message_id: 'msg_1',
      target_site_id: 'staccato-client-service',
      source: { kind: 'cloudflare_worker', ref: 'published-surface', principal: 'operator.surface' },
      idempotency_key: 'operator.surface:msg_1',
      kind: 'proposal',
      subject: 'Review hosted report freshness',
      body: 'The hosted report should expose source freshness.',
      payload: { priority: 'normal' },
      received_at: '2026-05-15T00:00:00.000Z',
    });

    expect(message.schema).toBe('narada.site_inbox.remote_message.v0');
    expect(message.status).toBe('pending');
    expect(message.receipt).toEqual({
      schema: 'narada.site_inbox.remote_message_receipt.v0',
      receipt_id: 'remote-site-inbox-receipt:msg_1',
      message_id: 'msg_1',
      status: 'pending',
      remote_received: {
        received_at: '2026-05-15T00:00:00.000Z',
        source_ref: 'published-surface',
        idempotency_key: 'operator.surface:msg_1',
      },
    });
  });

  it('plans local canonical inbox admission without mutating artifacts or DB state', () => {
    const message = buildRemoteSiteInboxMessage({
      message_id: 'msg_1',
      target_site_id: 'narada-proper',
      source: { kind: 'cloudflare_worker', ref: 'site-message-surface', site: 'remote-site' },
      idempotency_key: 'remote-site:msg_1',
      kind: 'observation',
      body: 'A remote operator left this observation.',
      payload: { evidence_ref: 'remote:surface:msg_1' },
      received_at: '2026-05-15T00:00:00.000Z',
    });

    const plan = planRemoteSiteInboxLocalAdmission(message, {
      envelope_id: 'env_msg_1',
      received_at: '2026-05-15T00:05:00.000Z',
      authority_principal: 'remote.operator',
    });

    expect(plan).toMatchObject({
      schema: 'narada.site_inbox.remote_local_admission_plan.v0',
      remote_message_id: 'msg_1',
      target_site_id: 'narada-proper',
      status: 'local_admission_required',
      remote_surface_authority: 'candidate_only',
      local_site_admission_required: true,
      db_mutated: false,
      envelope_written: false,
      decision: {
        status: 'admissible_descriptor',
        descriptor_only: true,
        db_mutated: false,
        envelope_written: false,
      },
    });
    expect(plan.request.target_locus).toBe('narada-proper');
    expect(plan.request.crossing).toMatchObject({
      target_authority: 'canonical_inbox',
      requested_crossing: 'admission_request',
      admission_state: 'received',
    });
  });

  it('refuses to plan local admission for an already finalized remote message', () => {
    const message = buildRemoteSiteInboxMessage({
      message_id: 'msg_1',
      target_site_id: 'narada-proper',
      status: 'admitted',
      source: { kind: 'cloudflare_worker', ref: 'site-message-surface' },
      idempotency_key: 'remote-site:msg_1',
      kind: 'observation',
      body: 'Already handled.',
      payload: {},
      received_at: '2026-05-15T00:00:00.000Z',
    });

    expect(() => planRemoteSiteInboxLocalAdmission(message, {
      envelope_id: 'env_msg_1',
      received_at: '2026-05-15T00:05:00.000Z',
    })).toThrow('remote_message_not_pending:admitted');
  });

  it('builds admitted finalization receipts from local admission evidence', () => {
    const message = buildRemoteSiteInboxMessage({
      message_id: 'msg_1',
      target_site_id: 'narada-proper',
      source: { kind: 'cloudflare_worker', ref: 'site-message-surface' },
      idempotency_key: 'remote-site:msg_1',
      kind: 'task_candidate',
      body: 'Please create the follow-up task.',
      payload: { title: 'Follow-up task' },
      received_at: '2026-05-15T00:00:00.000Z',
    });
    const finalize = buildRemoteSiteInboxFinalizePayload({
      status: 'admitted',
      local_site_id: 'narada-proper',
      local_admission_id: 'env_msg_1',
      local_kind: 'task_candidate',
      local_admitted_at: '2026-05-15T00:05:00.000Z',
    });

    const receipt = receiptFromRemoteSiteInboxFinalize(message, finalize);

    expect(receipt.status).toBe('admitted');
    expect(receipt.local_admission).toEqual({
      site_id: 'narada-proper',
      admission_id: 'env_msg_1',
      kind: 'task_candidate',
      admitted_at: '2026-05-15T00:05:00.000Z',
    });
  });

  it('builds rejected and error finalization receipts without local admission claims', () => {
    const message = buildRemoteSiteInboxMessage({
      message_id: 'msg_1',
      target_site_id: 'narada-proper',
      source: { kind: 'cloudflare_worker', ref: 'site-message-surface' },
      idempotency_key: 'remote-site:msg_1',
      kind: 'proposal',
      body: 'Maybe import this DB.',
      payload: { unsafe_request: true },
      received_at: '2026-05-15T00:00:00.000Z',
    });

    const rejected = receiptFromRemoteSiteInboxFinalize(message, buildRemoteSiteInboxFinalizePayload({
      status: 'rejected',
      rejected_reason: 'source_db_import_refused',
    }));
    const errored = receiptFromRemoteSiteInboxFinalize(message, buildRemoteSiteInboxFinalizePayload({
      status: 'error',
      error: { code: 'local_admission_failed', message: 'temporary sqlite lock', retryable: true },
    }));

    expect(rejected).toMatchObject({
      status: 'rejected',
      rejection: { reason: 'source_db_import_refused' },
    });
    expect(rejected.local_admission).toBeUndefined();
    expect(errored).toMatchObject({
      status: 'error',
      error: { code: 'local_admission_failed', message: 'temporary sqlite lock', retryable: true },
    });
    expect(errored.local_admission).toBeUndefined();
  });

  it('proves receiving Site admission fixture keeps cloud receipt separate from local admission', () => {
    const fixture = readRemoteCandidateFixture();
    const messages = new Map<string, RemoteSiteInboxMessage>();

    for (const testCase of fixture.cases) {
      const existing = [...messages.values()].find((message) =>
        message.source.ref === testCase.candidate.source.ref
        && message.idempotency_key === testCase.candidate.idempotency_key);

      if (testCase.duplicate_of) {
        expect(existing?.message_id).toBe('remote_msg_accept');
        expect(testCase.expected_replay_posture).toEqual({
          status: 'duplicate',
          cloud_receipt_only: true,
          local_admission_replayed: false,
        });
        expect(existing?.receipt.status).toBe('admitted');
        continue;
      }

      expect(testCase.candidate.schema).toBe('narada.remote_candidate.message.v0');
      expect(testCase.candidate.admission_posture).toEqual({
        remote_surface_authority: 'candidate_only',
        local_admission_required: true,
      });
      const message = buildRemoteSiteInboxMessage(remoteCandidateToSiteInboxMessage(testCase.candidate));
      messages.set(message.message_id, message);

      expect(message.status).toBe('pending');
      expect(message.receipt.status).toBe('pending');
      expect(message.receipt.local_admission).toBeUndefined();

      const admission = testCase.local_admission;
      if (!admission) continue;
      const plan = planRemoteSiteInboxLocalAdmission(message, {
        envelope_id: admission.envelope_id,
        received_at: admission.received_at,
      });
      const receipt = receiptFromRemoteSiteInboxFinalize(
        message,
        buildRemoteSiteInboxFinalizePayload(admission.finalize),
      );

      expect(plan.remote_surface_authority).toBe('candidate_only');
      expect(plan.local_site_admission_required).toBe(true);
      expect(plan.envelope_written).toBe(false);
      expect(plan.db_mutated).toBe(false);

      if (admission.finalize.status === 'admitted') {
        expect(receipt.status).toBe('admitted');
        expect(receipt.local_admission?.admission_id).toBe(admission.finalize.local_admission_id);
      } else if (admission.finalize.status === 'rejected') {
        expect(receipt.status).toBe('rejected');
        expect(receipt.local_admission).toBeUndefined();
      } else {
        expect(receipt.status).toBe('error');
        expect(receipt.error?.code).toBe('local_admission_deferred');
        expect(receipt.local_admission).toBeUndefined();
      }

      messages.set(message.message_id, { ...message, status: receipt.status, receipt });
    }

    expect(fixture.authority_limits).toContain('cloud_receipt_is_not_local_admission');
    expect(fixture.authority_limits).toContain('duplicate_replay_does_not_reapply_local_admission');
  });
});
