import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatRepositoryPublicationRequestReviewText,
  parseRepositoryPublicationRequestReviewArgs,
  readRepositoryPublicationRequestReview,
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
  assert.equal(result.summary.linked_evidence_id, 'evidence_1');
  assert.equal(result.summary.latest_focus_review.review_status, 'acknowledged');
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
      linked_published_commit_ref: 'git:commit:def',
      linked_evidence_id: 'evidence_1',
      linked_evidence_status: 'completed',
    },
  });

  assert.match(text, /Repository Publication Request Review: ok/);
  assert.match(text, /Workflow Route: action=review_repository_publication_request/);
  assert.match(text, /Current Posture: cloudflare_repository_publication_execution_completed/);
  assert.match(text, /Requested Posture: cloudflare_queued_repository_publication_request_windows_must_admit_publish_and_return_evidence/);
  assert.match(text, /Current Admissions: request=admitted_by_cloudflare_repository_publication cloudflare_git_push=not_admitted direct_cloudflare_repo_mutation=admitted_by_cloudflare_github_repository_publication/);
  assert.match(text, /Review Ack: pnpm --filter @narada2\/cloudflare-carrier product:operation:focus-review:text/);
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
