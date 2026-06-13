import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatRepositoryPublicationRequestReviewText,
  parseRepositoryPublicationRequestReviewArgs,
  readRepositoryPublicationRequestReview,
  summarizeRepositoryPublicationRequestReview,
} from './cloudflare-carrier-repository-publication-request-review.mjs';

test('parseRepositoryPublicationRequestReviewArgs extends operation.read params with repository publication limits', () => {
  const parsed = parseRepositoryPublicationRequestReviewArgs([
    '--url', 'https://carrier.example',
    '--site', 'site_narada_cloudflare',
    '--operation-id', 'operation_site_read',
    '--request-limit', '7',
    '--admission-limit', '5',
    '--evidence-limit', '4',
    '--execution-limit', '3',
    '--focus-ref', 'repository_publication_request_live_1',
    '--operator-session-cookie', 'operator-session-cookie',
  ], {});

  assert.equal(parsed.operation, 'operation.read');
  assert.equal(parsed.params.site_id, 'site_narada_cloudflare');
  assert.equal(parsed.params.operation_id, 'operation_site_read');
  assert.equal(parsed.params.repository_publication_request_limit, 7);
  assert.equal(parsed.params.repository_publication_admission_limit, 5);
  assert.equal(parsed.params.repository_publication_evidence_limit, 4);
  assert.equal(parsed.params.repository_publication_execution_limit, 3);
  assert.equal(parsed.focusRef, 'repository_publication_request_live_1');
});

test('parseRepositoryPublicationRequestReviewArgs falls back to direct request review when no operation id is provided', () => {
  const parsed = parseRepositoryPublicationRequestReviewArgs([
    '--url', 'https://carrier.example',
    '--site', 'site_narada_cloudflare',
    '--repository-publication-request-id', 'repository_publication_request_live_1',
    '--operator-session-cookie', 'operator-session-cookie',
  ], {});

  assert.equal(parsed.operation, 'repository_publication.request.list');
  assert.equal(parsed.params.site_id, 'site_narada_cloudflare');
  assert.equal(parsed.focusRef, 'repository_publication_request_live_1');
});

test('readRepositoryPublicationRequestReview summarizes focused request and linked records', async () => {
  const fetchImpl = async () => ({
    status: 200,
    async text() {
      return JSON.stringify({
        ok: true,
        operation: { site_id: 'site_narada_cloudflare', operation_id: 'operation_site_read' },
        repository_publication_requests: [
          {
            repository_publication_request_id: 'repository_publication_request_live_1',
            publication_ref: 'repository-publication:live-smoke:1',
            repository_ref: 'github:andrey-kokoev/narada',
            branch_ref: 'cloudflare-publication',
            source_change_ref: 'git:commit:abc',
            requested_action_summary: 'request governed Cloudflare GitHub repository publication execution',
            request_posture: 'cloudflare_queued_repository_publication_request_windows_must_admit_publish_and_return_evidence',
            authority_locus: 'cloudflare_repository_publication_request_queue',
            repository_publication_executor_authority: 'windows_repository_publication_executor',
            repository_publication_admission: 'pending_windows_publication_admission',
            cloudflare_git_push_admission: 'not_admitted',
            direct_cloudflare_repository_mutation_admission: 'not_admitted',
            recorded_at: '2026-06-12T00:00:00.000Z',
            recorded_by_principal_id: 'service',
          },
        ],
        repository_publication_admissions: [
          {
            repository_publication_request_id: 'repository_publication_request_live_1',
            repository_publication_admission_id: 'admission_1',
            admission_action: 'admit',
            admission_reason: 'admitted',
          },
        ],
        repository_publication_cloudflare_executions: [
          {
            repository_publication_request_id: 'repository_publication_request_live_1',
            repository_publication_execution_id: 'execution_1',
            publication_status: 'completed',
            published_commit_ref: 'git:commit:def',
          },
        ],
        repository_publication_evidence: [
          {
            repository_publication_request_id: 'repository_publication_request_live_1',
            repository_publication_evidence_id: 'evidence_1',
            publication_status: 'completed',
          },
        ],
        operation_focus_reviews: [
          {
            review_id: 'review_1',
            focus_kind: 'repository_publication_request',
            focus_ref: 'repository_publication_request_live_1',
            review_status: 'acknowledged',
            recorded_at: '2026-06-12T00:05:00.000Z',
          },
        ],
      });
    },
  });

  const result = await readRepositoryPublicationRequestReview({
    workerUrl: 'https://carrier.example',
    operation: 'operation.read',
    requestId: 'request_1',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    params: {
      site_id: 'site_narada_cloudflare',
      operation_id: 'operation_site_read',
      repository_publication_request_limit: 20,
      repository_publication_admission_limit: 20,
      repository_publication_evidence_limit: 20,
      repository_publication_execution_limit: 20,
    },
    format: 'json',
    focusRef: 'repository_publication_request_live_1',
  }, fetchImpl);

  assert.equal(result.summary.focused_repository_publication_request_id, 'repository_publication_request_live_1');
  assert.equal(result.summary.current_request_posture, 'cloudflare_repository_publication_execution_completed');
  assert.equal(result.summary.current_repository_publication_admission, 'admitted_by_cloudflare_repository_publication');
  assert.equal(result.summary.current_direct_cloudflare_repository_mutation_admission, 'admitted_by_cloudflare_github_repository_publication');
  assert.equal(result.summary.linked_admission_id, 'admission_1');
  assert.equal(result.summary.linked_execution_id, 'execution_1');
  assert.equal(result.summary.current_publication_execution_id, 'execution_1');
  assert.equal(result.summary.current_execution_status, 'completed');
  assert.equal(result.summary.current_execution_source, 'cloudflare_execution');
  assert.equal(result.summary.current_execution_reason, null);
  assert.equal(result.summary.linked_evidence_id, 'evidence_1');
  assert.equal(result.summary.latest_focus_review.review_status, 'acknowledged');
});

test('readRepositoryPublicationRequestReview supports direct request review without operation.read context', async () => {
  const responses = new Map([
    ['repository_publication.request.list', {
      ok: true,
      site_id: 'site_narada_cloudflare',
      requests: [
        {
          repository_publication_request_id: 'repository_publication_request_live_1',
          operation_id: 'operation_site_read',
          publication_ref: 'repository-publication:live-smoke:1',
          repository_ref: 'github:andrey-kokoev/narada',
          branch_ref: 'cloudflare-publication',
          requested_action_summary: 'request governed Cloudflare GitHub repository publication execution',
          request_posture: 'cloudflare_queued_repository_publication_request_windows_must_admit_publish_and_return_evidence',
          authority_locus: 'cloudflare_repository_publication_request_queue',
          repository_publication_executor_authority: 'windows_repository_publication_executor',
          repository_publication_admission: 'pending_windows_publication_admission',
          cloudflare_git_push_admission: 'not_admitted',
          direct_cloudflare_repository_mutation_admission: 'not_admitted',
        },
        {
          repository_publication_request_id: 'repository_publication_request_live_2',
          operation_id: 'operation_other',
          publication_ref: 'repository-publication:live-smoke:20260611060000',
          repository_ref: 'github:andrey-kokoev/narada',
          branch_ref: 'main',
          source_change_ref: 'cloudflare-local-change:site_narada_cloudflare:20260611060000',
          requested_action_summary: 'request governed Cloudflare GitHub repository publication execution',
          request_posture: 'cloudflare_queued_repository_publication_request_windows_must_admit_publish_and_return_evidence',
          authority_locus: 'cloudflare_repository_publication_request_queue',
          repository_publication_executor_authority: 'windows_repository_publication_executor',
          repository_publication_admission: 'pending_windows_publication_admission',
          cloudflare_git_push_admission: 'not_admitted',
          direct_cloudflare_repository_mutation_admission: 'not_admitted',
        },
      ],
    }],
    ['repository_publication.admission.list', {
      ok: true,
      site_id: 'site_narada_cloudflare',
      admissions: [
        {
          repository_publication_request_id: 'repository_publication_request_live_1',
          repository_publication_admission_id: 'admission_1',
          admission_action: 'admit',
          admission_reason: 'admitted',
        },
      ],
    }],
    ['repository_publication.evidence.list', {
      ok: true,
      site_id: 'site_narada_cloudflare',
      evidence: [],
    }],
    ['repository_publication.cloudflare_execution.list', {
      ok: true,
      site_id: 'site_narada_cloudflare',
      executions: [],
    }],
  ]);
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    return {
      status: 200,
      async text() {
        return JSON.stringify(responses.get(body.operation));
      },
    };
  };

  const result = await readRepositoryPublicationRequestReview({
    workerUrl: 'https://carrier.example',
    operation: 'repository_publication.request.list',
    requestId: 'request_2',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    params: {
      site_id: 'site_narada_cloudflare',
      repository_publication_request_limit: 20,
      repository_publication_admission_limit: 20,
      repository_publication_evidence_limit: 20,
      repository_publication_execution_limit: 20,
    },
    format: 'json',
    focusRef: 'repository_publication_request_live_1',
  }, fetchImpl);

  assert.equal(result.summary.site_id, 'site_narada_cloudflare');
  assert.equal(result.summary.operation_id, 'operation_site_read');
  assert.equal(result.summary.request_count, 1);
  assert.equal(result.summary.focused_repository_publication_request_id, 'repository_publication_request_live_1');
  assert.equal(result.summary.current_request_posture, 'repository_publication_request_admitted_pending_execution');
  assert.equal(result.summary.linked_admission_id, 'admission_1');
  assert.equal(result.summary.linked_evidence_id, null);
});

test('readRepositoryPublicationRequestReview treats refused evidence as current state', async () => {
  const responses = new Map([
    ['repository_publication.request.list', {
      ok: true,
      site_id: 'site_narada_cloudflare',
      requests: [
        {
          repository_publication_request_id: 'repository_publication_request_live_1',
          request_posture: 'cloudflare_queued_repository_publication_request_windows_must_admit_publish_and_return_evidence',
          repository_publication_admission: 'pending_windows_publication_admission',
          cloudflare_git_push_admission: 'not_admitted',
          direct_cloudflare_repository_mutation_admission: 'not_admitted',
        },
      ],
    }],
    ['repository_publication.admission.list', {
      ok: true,
      site_id: 'site_narada_cloudflare',
      admissions: [
        {
          repository_publication_request_id: 'repository_publication_request_live_1',
          repository_publication_admission_id: 'admission_1',
          admission_action: 'admit',
        },
      ],
    }],
    ['repository_publication.evidence.list', {
      ok: true,
      site_id: 'site_narada_cloudflare',
      evidence: [
        {
          repository_publication_request_id: 'repository_publication_request_live_1',
          repository_publication_evidence_id: 'evidence_1',
          publication_execution_id: 'publication-execution-1',
          publication_status: 'refused',
          windows_admission_reason: 'repository_publication_push_not_enabled',
          repository_publication_admission: 'resolved_after_cloudflare_repository_publication_admission',
          cloudflare_git_push_admission: 'not_admitted',
          direct_cloudflare_repository_mutation_admission: 'not_admitted',
        },
      ],
    }],
    ['repository_publication.cloudflare_execution.list', {
      ok: true,
      site_id: 'site_narada_cloudflare',
      executions: [],
    }],
  ]);
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    return {
      status: 200,
      async text() {
        return JSON.stringify(responses.get(body.operation));
      },
    };
  };

  const result = await readRepositoryPublicationRequestReview({
    workerUrl: 'https://carrier.example',
    operation: 'repository_publication.request.list',
    requestId: 'request_3',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    params: {
      site_id: 'site_narada_cloudflare',
      repository_publication_request_limit: 20,
      repository_publication_admission_limit: 20,
      repository_publication_evidence_limit: 20,
      repository_publication_execution_limit: 20,
    },
    format: 'json',
    focusRef: 'repository_publication_request_live_1',
  }, fetchImpl);

  assert.equal(result.summary.current_request_posture, 'repository_publication_evidence_refused');
  assert.equal(result.summary.current_repository_publication_admission, 'resolved_after_cloudflare_repository_publication_admission');
  assert.equal(result.summary.current_publication_execution_id, 'publication-execution-1');
  assert.equal(result.summary.current_execution_status, 'refused');
  assert.equal(result.summary.current_execution_source, 'windows_evidence');
  assert.equal(result.summary.current_execution_reason, 'repository_publication_push_not_enabled');
  assert.equal(result.summary.linked_evidence_id, 'evidence_1');
});

test('summarizeRepositoryPublicationRequestReview keeps focus empty when no request matches an unrelated workflow focus', () => {
  const summary = summarizeRepositoryPublicationRequestReview({
    operation: {
      site_id: 'site_narada_cloudflare',
      operation_id: 'operation_site_read',
    },
    repository_publication_requests: [],
  }, {
    operationSummary: {
      workflow_focus_ref: 'site_narada_cloudflare',
    },
  });

  assert.equal(summary.request_count, 0);
  assert.equal(summary.focused_repository_publication_request_id, null);
});

test('formatRepositoryPublicationRequestReviewText surfaces review ack command', () => {
  const text = formatRepositoryPublicationRequestReviewText({
    worker_url: 'https://carrier.example',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_narada_cloudflare',
      operation_id: 'operation_site_read',
      workflow_next_action: 'review_repository_publication_request',
      workflow_reason: 'operation_operator_focus_needs_review',
      request_count: 1,
      focused_repository_publication_request_id: 'repository_publication_request_live_1',
      focused_publication_ref: 'repository-publication:live-smoke:1',
      focused_repository_ref: 'github:andrey-kokoev/narada',
      focused_branch_ref: 'cloudflare-publication',
      focused_source_change_ref: 'git:commit:abc',
      focused_requested_action_summary: 'request governed Cloudflare GitHub repository publication execution',
      focused_request_posture: 'cloudflare_queued_repository_publication_request_windows_must_admit_publish_and_return_evidence',
      current_request_posture: 'cloudflare_repository_publication_execution_completed',
      repository_publication_request_authority: 'cloudflare_repository_publication_request_queue',
      repository_publication_executor_authority: 'windows_repository_publication_executor',
      repository_publication_admission: 'pending_windows_publication_admission',
      current_repository_publication_admission: 'admitted_by_cloudflare_repository_publication',
      cloudflare_git_push_admission: 'not_admitted',
      current_cloudflare_git_push_admission: 'not_admitted',
      direct_cloudflare_repository_mutation_admission: 'not_admitted',
      current_direct_cloudflare_repository_mutation_admission: 'admitted_by_cloudflare_github_repository_publication',
      linked_admission_id: 'admission_1',
      linked_admission_action: 'admit',
      linked_execution_id: 'execution_1',
      linked_execution_status: 'completed',
      current_publication_execution_id: 'execution_1',
      current_execution_status: 'completed',
      current_execution_source: 'cloudflare_execution',
      current_execution_reason: null,
      linked_published_commit_ref: 'git:commit:def',
      current_published_commit_ref: 'git:commit:def',
      linked_evidence_id: 'evidence_1',
      linked_evidence_status: 'completed',
      latest_focus_review: {
        focus_kind: 'repository_publication_request',
        focus_ref: 'repository_publication_request_live_1',
        review_status: 'acknowledged',
      },
    },
  });

  assert.match(text, /Repository Publication Request Review: ok/);
  assert.match(text, /Workflow Route: action=review_repository_publication_request/);
  assert.match(text, /Current Posture: cloudflare_repository_publication_execution_completed/);
  assert.match(text, /Requested Posture: cloudflare_queued_repository_publication_request_windows_must_admit_publish_and_return_evidence/);
  assert.match(text, /Current Admissions: request=admitted_by_cloudflare_repository_publication cloudflare_git_push=not_admitted direct_cloudflare_repo_mutation=admitted_by_cloudflare_github_repository_publication/);
  assert.match(text, /Current Execution: execution_1 status=completed source=cloudflare_execution/);
  assert.match(text, /Focused Review: repository_publication_request:repository_publication_request_live_1 status=acknowledged/);
  assert.match(text, /Review Ack: pnpm --filter @narada2\/cloudflare-carrier product:operation:focus-review:text/);
});

test('formatRepositoryPublicationRequestReviewText surfaces current execution from evidence when no Cloudflare execution record exists', () => {
  const text = formatRepositoryPublicationRequestReviewText({
    worker_url: 'https://carrier.example',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_narada_cloudflare',
      operation_id: 'operation_site_read',
      workflow_next_action: 'none',
      workflow_reason: 'none',
      request_count: 1,
      focused_repository_publication_request_id: 'repository_publication_request_live_1',
      current_request_posture: 'repository_publication_evidence_refused',
      current_publication_execution_id: 'publication-execution-1',
      current_execution_status: 'refused',
      current_execution_source: 'windows_evidence',
      current_execution_reason: 'repository_publication_push_not_enabled',
      linked_evidence_id: 'evidence_1',
      linked_evidence_status: 'refused',
    },
  });

  assert.match(text, /Current Execution: publication-execution-1 status=refused source=windows_evidence reason=repository_publication_push_not_enabled/);
});

test('formatRepositoryPublicationRequestReviewText makes missing evidence explicit after execution', () => {
  const text = formatRepositoryPublicationRequestReviewText({
    worker_url: 'https://carrier.example',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_narada_cloudflare',
      operation_id: 'operation_site_read',
      workflow_next_action: 'refresh_site_continuity_loop',
      workflow_reason: 'operation_lifecycle_continuity_loop_stale',
      request_count: 1,
      focused_repository_publication_request_id: 'repository_publication_request_live_1',
      current_request_posture: 'cloudflare_repository_publication_execution_completed',
      linked_admission_id: 'admission_1',
      linked_execution_id: 'execution_1',
      linked_execution_status: 'completed',
    },
  });

  assert.match(text, /Linked Evidence: none status=unknown/);
});
