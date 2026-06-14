import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatSiteFileChangeProposalReviewText,
  parseSiteFileChangeProposalReviewArgs,
  readSiteFileChangeProposalReview,
} from './cloudflare-carrier-site-file-change-proposal-review.mjs';

test('parseSiteFileChangeProposalReviewArgs extends operation.read params with site file limits', () => {
  const parsed = parseSiteFileChangeProposalReviewArgs([
    '--url', 'https://carrier.example',
    '--site', 'site_narada_cloudflare',
    '--operation-id', 'operation_site_read',
    '--proposal-limit', '7',
    '--materialization-limit', '5',
    '--focus-ref', 'site_file_change_proposal_live_1',
    '--operator-session-cookie', 'operator-session-cookie',
  ], {});

  assert.equal(parsed.operation, 'operation.read');
  assert.equal(parsed.params.site_id, 'site_narada_cloudflare');
  assert.equal(parsed.params.operation_id, 'operation_site_read');
  assert.equal(parsed.params.site_file_change_proposal_limit, 7);
  assert.equal(parsed.params.site_file_materialization_limit, 5);
  assert.equal(parsed.focusRef, 'site_file_change_proposal_live_1');
});

test('parseSiteFileChangeProposalReviewArgs supports direct focused review without operation id', () => {
  const parsed = parseSiteFileChangeProposalReviewArgs([
    '--url', 'https://carrier.example',
    '--site', 'site_narada_cloudflare',
    '--focus-ref', 'site_file_change_proposal_live_1',
    '--operator-session-cookie', 'operator-session-cookie',
  ], {});

  assert.equal(parsed.operation, 'site_file_change_proposal.list');
  assert.equal(parsed.params.site_id, 'site_narada_cloudflare');
  assert.equal(parsed.params.site_file_change_proposal_limit, 200);
  assert.equal(parsed.params.site_file_materialization_limit, 200);
  assert.equal(parsed.focusRef, 'site_file_change_proposal_live_1');
});

test('readSiteFileChangeProposalReview summarizes focused proposal and linked materialization', async () => {
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    if (body.operation === 'operation.read') {
      return {
        status: 200,
        async text() {
          return JSON.stringify({
            ok: true,
            operation: { site_id: 'site_narada_cloudflare', operation_id: 'operation_site_read' },
            operation_focus_reviews: [
              {
                review_id: 'review_1',
                focus_kind: 'site_file_change_proposal',
                focus_ref: 'site_file_change_proposal_live_1',
                review_status: 'acknowledged',
                recorded_at: '2026-06-12T00:05:00.000Z',
              },
            ],
          });
        },
      };
    }
    if (body.operation === 'site_file_change_proposal.list') {
      return {
        status: 200,
        async text() {
          return JSON.stringify({
            ok: true,
            site_id: 'site_narada_cloudflare',
            site_file_change_proposals: [
              {
                proposal_id: 'site_file_change_proposal_live_1',
                proposal_ref: 'proposal:site-file-change-live:1',
                proposal_summary: 'live Cloudflare site file change proposal',
                proposal_posture: 'proposal_only_no_filesystem_write',
                authority_locus: 'cloudflare_carrier_site',
                filesystem_executor_authority: 'windows_filesystem_executor',
                filesystem_mutation_admission: 'not_admitted',
                repository_publication_admission: 'not_admitted',
                file_count: 1,
                recorded_at: '2026-06-12T00:00:00.000Z',
                recorded_by_principal_id: 'service',
                record: {
                  proposal: {
                    files: [
                      {
                        file_path: 'docs/architecture/cloudflare-carrier/target.md',
                        change_kind: 'update',
                        material_source_ref: 'material-source:1',
                      },
                    ],
                  },
                },
              },
              {
                proposal_id: 'site_file_change_proposal_live_2',
                proposal_ref: 'proposal:site-file-change-live:2',
                proposal_summary: 'another site file change proposal',
                proposal_posture: 'proposal_only_no_filesystem_write',
                authority_locus: 'cloudflare_carrier_site',
                filesystem_executor_authority: 'windows_filesystem_executor',
                filesystem_mutation_admission: 'not_admitted',
                repository_publication_admission: 'not_admitted',
                file_count: 1,
                recorded_at: '2026-06-12T00:01:00.000Z',
                recorded_by_principal_id: 'service',
              },
            ],
          });
        },
      };
    }
    if (body.operation === 'site_file_materialization.list') {
      return {
        status: 200,
        async text() {
          return JSON.stringify({
            ok: true,
            site_id: 'site_narada_cloudflare',
            site_file_materializations: [
              {
                proposal_id: 'site_file_change_proposal_live_1',
                materialization_id: 'site_file_materialization_live_1',
                materialization_posture: 'cloudflare_site_file_store_only_no_windows_filesystem_write_no_repository_publication',
                write_effect: 'cloudflare_site_file_materialization_record',
                file_path: 'docs/architecture/cloudflare-carrier/target.md',
              },
            ],
          });
        },
      };
    }
    throw new Error(`unexpected_operation:${body.operation}`);
  };

  const result = await readSiteFileChangeProposalReview({
    workerUrl: 'https://carrier.example',
    operation: 'operation.read',
    requestId: 'request_1',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    params: {
      site_id: 'site_narada_cloudflare',
      operation_id: 'operation_site_read',
      site_file_change_proposal_limit: 20,
      site_file_materialization_limit: 20,
    },
    format: 'json',
    focusRef: 'site_file_change_proposal_live_1',
  }, fetchImpl);

  assert.equal(result.summary.proposal_count, 1);
  assert.equal(result.summary.focused_proposal_id, 'site_file_change_proposal_live_1');
  assert.equal(result.summary.focused_first_file_path, 'docs/architecture/cloudflare-carrier/target.md');
  assert.equal(result.summary.linked_materialization_id, 'site_file_materialization_live_1');
  assert.equal(
    result.summary.current_proposal_posture,
    'cloudflare_site_file_store_only_no_windows_filesystem_write_no_repository_publication',
  );
  assert.equal(result.summary.requested_proposal_posture, 'proposal_only_no_filesystem_write');
  assert.equal(result.summary.latest_focus_review.review_status, 'acknowledged');
});

test('readSiteFileChangeProposalReview supports direct focused review without operation read', async () => {
  const calls = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (body.operation === 'site_file_change_proposal.list') {
      return {
        status: 200,
        async text() {
          return JSON.stringify({
            ok: true,
            site_id: 'site_narada_cloudflare',
            site_file_change_proposals: [
              {
                proposal_id: 'site_file_change_proposal_live_1',
                operation_id: 'operation_site_read',
                proposal_ref: 'proposal:site-file-change-live:1',
                proposal_summary: 'live Cloudflare site file change proposal',
                proposal_posture: 'proposal_only_no_filesystem_write',
                file_count: 1,
              },
              {
                proposal_id: 'site_file_change_proposal_live_2',
                operation_id: 'operation_other',
                proposal_ref: 'proposal:site-file-change-live:2',
                proposal_summary: 'another site file change proposal',
                proposal_posture: 'proposal_only_no_filesystem_write',
                file_count: 1,
              },
            ],
          });
        },
      };
    }
    if (body.operation === 'site_file_materialization.list') {
      return {
        status: 200,
        async text() {
          return JSON.stringify({
            ok: true,
            site_id: 'site_narada_cloudflare',
            site_file_materializations: [],
          });
        },
      };
    }
    throw new Error(`unexpected_operation:${body.operation}`);
  };

  const result = await readSiteFileChangeProposalReview({
    workerUrl: 'https://carrier.example',
    operation: 'site_file_change_proposal.list',
    requestId: 'request_2',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    params: {
      site_id: 'site_narada_cloudflare',
      site_file_change_proposal_limit: 200,
      site_file_materialization_limit: 200,
    },
    format: 'json',
    focusRef: 'site_file_change_proposal_live_1',
  }, fetchImpl);

  assert.deepEqual(calls.map((entry) => entry.operation), [
    'site_file_change_proposal.list',
    'site_file_materialization.list',
  ]);
  assert.equal(result.summary.proposal_count, 1);
  assert.equal(result.summary.focused_proposal_id, 'site_file_change_proposal_live_1');
  assert.equal(result.summary.operation_id, 'operation_site_read');
});

test('readSiteFileChangeProposalReview accepts direct live payload keys for proposals and materializations', async () => {
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    if (body.operation === 'site_file_change_proposal.list') {
      return {
        status: 200,
        async text() {
          return JSON.stringify({
            ok: true,
            site_id: 'site_narada_cloudflare',
            proposals: [
              {
                proposal_id: 'site_file_change_proposal_live_1',
                operation_id: 'operation_narada_cloudflare_control',
                proposal_ref: 'proposal:site-file-change-live:1',
                proposal_summary: 'live Cloudflare site file change proposal',
                proposal_posture: 'proposal_only_no_filesystem_write',
                file_count: 1,
                record: {
                  proposal: {
                    files: [{ file_path: 'docs/architecture/cloudflare-carrier/target.md', change_kind: 'update' }],
                  },
                },
                recorded_at: '2026-06-11T23:20:11.736Z',
              },
            ],
          });
        },
      };
    }
    if (body.operation === 'site_file_materialization.list') {
      return {
        status: 200,
        async text() {
          return JSON.stringify({
            ok: true,
            site_id: 'site_narada_cloudflare',
            materializations: [
              {
                materialization_id: 'site_file_materialization_live_1',
                proposal_id: 'site_file_change_proposal_live_1',
                file_path: 'docs/architecture/cloudflare-carrier/target.md',
                write_effect: 'cloudflare_site_file_materialization_record',
                materialization_posture: 'cloudflare_site_file_store_only_no_windows_filesystem_write_no_repository_publication',
              },
            ],
          });
        },
      };
    }
    throw new Error(`unexpected_operation:${body.operation}`);
  };

  const result = await readSiteFileChangeProposalReview({
    workerUrl: 'https://carrier.example',
    operation: 'site_file_change_proposal.list',
    requestId: 'request_direct_shape',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    params: {
      site_id: 'site_narada_cloudflare',
      site_file_change_proposal_limit: 200,
      site_file_materialization_limit: 200,
    },
    format: 'json',
    focusRef: 'site_file_change_proposal_live_1',
  }, fetchImpl);

  assert.equal(result.summary.proposal_count, 1);
  assert.equal(result.summary.focused_proposal_id, 'site_file_change_proposal_live_1');
  assert.equal(result.summary.linked_materialization_count, 1);
  assert.equal(result.summary.linked_materialization_id, 'site_file_materialization_live_1');
});

test('readSiteFileChangeProposalReview fails explicitly when focused proposal is missing', async () => {
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    if (body.operation === 'site_file_change_proposal.list') {
      return {
        status: 200,
        async text() {
          return JSON.stringify({
            ok: true,
            site_id: 'site_narada_cloudflare',
            site_file_change_proposals: [
              {
                proposal_id: 'site_file_change_proposal_live_1',
              },
            ],
          });
        },
      };
    }
    if (body.operation === 'site_file_materialization.list') {
      return {
        status: 200,
        async text() {
          return JSON.stringify({
            ok: true,
            site_id: 'site_narada_cloudflare',
            site_file_materializations: [],
          });
        },
      };
    }
    throw new Error(`unexpected_operation:${body.operation}`);
  };

  await assert.rejects(() => readSiteFileChangeProposalReview({
    workerUrl: 'https://carrier.example',
    operation: 'site_file_change_proposal.list',
    requestId: 'request_3',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    params: {
      site_id: 'site_narada_cloudflare',
      site_file_change_proposal_limit: 200,
      site_file_materialization_limit: 200,
    },
    format: 'json',
    focusRef: 'missing_focus_ref',
  }, fetchImpl), /site_file_change_proposal_review_focus_not_found:missing_focus_ref/);
});

test('readSiteFileChangeProposalReview falls back when workflow focus is unrelated but no explicit focus was requested', async () => {
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    if (body.operation === 'operation.read') {
      return {
        status: 200,
        async text() {
          return JSON.stringify({
            ok: true,
            operation: { site_id: 'site_narada_cloudflare', operation_id: 'operation_site_read' },
            operation_workflow_route: {
              next_action: 'review_site_file_change_proposal',
              reason: 'operation_operator_focus_needs_review',
              focus_ref: 'unrelated_focus_ref',
            },
          });
        },
      };
    }
    if (body.operation === 'site_file_change_proposal.list') {
      return {
        status: 200,
        async text() {
          return JSON.stringify({
            ok: true,
            site_id: 'site_narada_cloudflare',
            site_file_change_proposals: [
              {
                proposal_id: 'site_file_change_proposal_live_1',
                operation_id: 'operation_site_read',
                proposal_ref: 'proposal:site-file-change-live:1',
                proposal_summary: 'live Cloudflare site file change proposal',
                proposal_posture: 'proposal_only_no_filesystem_write',
                file_count: 1,
              },
            ],
          });
        },
      };
    }
    if (body.operation === 'site_file_materialization.list') {
      return {
        status: 200,
        async text() {
          return JSON.stringify({
            ok: true,
            site_id: 'site_narada_cloudflare',
            site_file_materializations: [],
          });
        },
      };
    }
    throw new Error(`unexpected_operation:${body.operation}`);
  };

  const result = await readSiteFileChangeProposalReview({
    workerUrl: 'https://carrier.example',
    operation: 'operation.read',
    requestId: 'request_4',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    params: {
      site_id: 'site_narada_cloudflare',
      operation_id: 'operation_site_read',
      site_file_change_proposal_limit: 20,
      site_file_materialization_limit: 20,
    },
    format: 'json',
    focusRef: null,
  }, fetchImpl);

  assert.equal(result.summary.proposal_count, 1);
  assert.equal(result.summary.focused_proposal_id, 'site_file_change_proposal_live_1');
});

test('readSiteFileChangeProposalReview keeps focused proposal empty when no proposals are visible', async () => {
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    if (body.operation === 'operation.read') {
      return {
        status: 200,
        async text() {
          return JSON.stringify({
            ok: true,
            operation: { site_id: 'site_narada_cloudflare', operation_id: 'operation_site_read' },
            operation_workflow_route: {
              next_action: 'refresh_site_continuity_loop',
              reason: 'operation_lifecycle_continuity_loop_stale',
              focus_ref: 'site_narada_cloudflare',
            },
          });
        },
      };
    }
    if (body.operation === 'site_file_change_proposal.list') {
      return {
        status: 200,
        async text() {
          return JSON.stringify({
            ok: true,
            site_id: 'site_narada_cloudflare',
            site_file_change_proposals: [],
          });
        },
      };
    }
    if (body.operation === 'site_file_materialization.list') {
      return {
        status: 200,
        async text() {
          return JSON.stringify({
            ok: true,
            site_id: 'site_narada_cloudflare',
            site_file_materializations: [],
          });
        },
      };
    }
    throw new Error(`unexpected_operation:${body.operation}`);
  };

  const result = await readSiteFileChangeProposalReview({
    workerUrl: 'https://carrier.example',
    operation: 'operation.read',
    requestId: 'request_5',
    auth: { kind: 'operator_session', value: 'operator-session-cookie', source: 'operator-session-cookie' },
    params: {
      site_id: 'site_narada_cloudflare',
      operation_id: 'operation_site_read',
      site_file_change_proposal_limit: 20,
      site_file_materialization_limit: 20,
    },
    format: 'json',
    focusRef: null,
  }, fetchImpl);

  assert.equal(result.summary.proposal_count, 0);
  assert.equal(result.summary.focused_proposal_id, null);
});

test('formatSiteFileChangeProposalReviewText surfaces review ack command', () => {
  const text = formatSiteFileChangeProposalReviewText({
    worker_url: 'https://carrier.example',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_narada_cloudflare',
      operation_id: 'operation_site_read',
      workflow_next_action: 'review_site_file_change_proposal',
      workflow_reason: 'operation_operator_focus_needs_review',
      proposal_count: 1,
      focused_proposal_id: 'site_file_change_proposal_live_1',
      focused_proposal_ref: 'proposal:site-file-change-live:1',
      focused_proposal_summary: 'live Cloudflare site file change proposal',
      current_proposal_posture: 'cloudflare_site_file_store_only_no_windows_filesystem_write_no_repository_publication',
      requested_proposal_posture: 'proposal_only_no_filesystem_write',
      focused_file_count: 1,
      focused_first_file_path: 'docs/architecture/cloudflare-carrier/target.md',
      focused_first_file_change_kind: 'update',
      focused_first_file_material_source_ref: 'material-source:1',
      proposal_authority: 'cloudflare_carrier_site',
      filesystem_executor_authority: 'windows_filesystem_executor',
      current_filesystem_mutation_admission: 'not_admitted',
      requested_filesystem_mutation_admission: 'not_admitted',
      current_repository_publication_admission: 'not_admitted',
      requested_repository_publication_admission: 'not_admitted',
      linked_materialization_count: 1,
      linked_materialization_id: 'site_file_materialization_live_1',
      linked_materialization_posture: 'cloudflare_site_file_store_only_no_windows_filesystem_write_no_repository_publication',
      linked_materialization_effect: 'cloudflare_site_file_materialization_record',
      latest_focus_review: {
        focus_kind: 'site_file_change_proposal',
        focus_ref: 'site_file_change_proposal_live_1',
        review_status: 'acknowledged',
      },
    },
  });

  assert.match(text, /Site File Change Proposal Review: ok/);
  assert.match(text, /Workflow Route: action=review_site_file_change_proposal/);
  assert.match(text, /Linked Materialization: site_file_materialization_live_1 posture=cloudflare_site_file_store_only_no_windows_filesystem_write_no_repository_publication effect=cloudflare_site_file_materialization_record/);
  assert.match(text, /Current Posture: cloudflare_site_file_store_only_no_windows_filesystem_write_no_repository_publication/);
  assert.match(text, /Focused Review: site_file_change_proposal:site_file_change_proposal_live_1 status=acknowledged/);
  assert.match(text, /Requested Posture: proposal_only_no_filesystem_write/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text/);
  assert.match(text, /Review Ack: pnpm --filter @narada2\/cloudflare-carrier product:operation:focus-review:text/);
});

test('formatSiteFileChangeProposalReviewText suppresses next workflow for passive routes', () => {
  const text = formatSiteFileChangeProposalReviewText({
    worker_url: 'https://carrier.example',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_narada_cloudflare',
      operation_id: 'operation_site_read',
      workflow_next_action: 'monitor_operation',
      workflow_reason: 'complete',
      proposal_count: 1,
      focused_proposal_id: 'site_file_change_proposal_live_1',
    },
  });

  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text/);
  assert.doesNotMatch(text, /Operation Next Workflow:/);
});

test('formatSiteFileChangeProposalReviewText omits synthetic operation ids from review ack', () => {
  const text = formatSiteFileChangeProposalReviewText({
    worker_url: 'https://carrier.example',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_narada_cloudflare',
      workflow_next_action: 'review_site_file_change_proposal',
      workflow_reason: 'proposal_requires_ack',
      proposal_count: 1,
      focused_proposal_id: 'site_file_change_proposal_live_1',
    },
  });

  assert.match(text, /Review Ack: pnpm --filter @narada2\/cloudflare-carrier product:operation:focus-review:text -- --url https:\/\/carrier\.example --site site_narada_cloudflare --focus-kind site_file_change_proposal --focus-ref site_file_change_proposal_live_1 --operator-session-file <operator-session-file>/);
  assert.doesNotMatch(text, /Review Ack:.*<operation-id>/);
});
test('formatSiteFileChangeProposalReviewText suppresses review ack without site id', () => {
  const text = formatSiteFileChangeProposalReviewText({
    worker_url: 'https://carrier.example',
    auth_source: 'operator-session-file',
    summary: {
      site_id: null,
      operation_id: 'operation_site_read',
      workflow_next_action: 'review_site_file_change_proposal',
      proposal_count: 1,
      focused_proposal_id: 'site_file_change_proposal_live_1',
    },
  });

  assert.equal(text.includes('Review Ack:'), false);
});

test('formatSiteFileChangeProposalReviewText suppresses worker-scoped handoffs without worker url', () => {
  const text = formatSiteFileChangeProposalReviewText({
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_narada_cloudflare',
      operation_id: 'operation_site_read',
      workflow_next_action: 'review_site_file_change_proposal',
      proposal_count: 1,
      focused_proposal_id: 'site_file_change_proposal_live_1',
    },
  });

  assert.doesNotMatch(text, /<worker-url>/);
  assert.equal(text.includes('Operation Review:'), false);
  assert.equal(text.includes('Operation Next Workflow:'), false);
  assert.equal(text.includes('Review Ack:'), false);
});
