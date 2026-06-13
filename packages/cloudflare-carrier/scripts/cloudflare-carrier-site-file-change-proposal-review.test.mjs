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

test('readSiteFileChangeProposalReview summarizes focused proposal and linked materialization', async () => {
  const fetchImpl = async () => ({
    status: 200,
    async text() {
      return JSON.stringify({
        ok: true,
        operation: { site_id: 'site_narada_cloudflare', operation_id: 'operation_site_read' },
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
        ],
        site_file_materializations: [
          {
            proposal_id: 'site_file_change_proposal_live_1',
            materialization_id: 'site_file_materialization_live_1',
            materialization_posture: 'cloudflare_site_file_store_only_no_windows_filesystem_write_no_repository_publication',
            write_effect: 'cloudflare_site_file_materialization_record',
            file_path: 'docs/architecture/cloudflare-carrier/target.md',
          },
        ],
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
  });

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
    },
  });

  assert.match(text, /Site File Change Proposal Review: ok/);
  assert.match(text, /Workflow Route: action=review_site_file_change_proposal/);
  assert.match(text, /Current Posture: cloudflare_site_file_store_only_no_windows_filesystem_write_no_repository_publication/);
  assert.match(text, /Requested Posture: proposal_only_no_filesystem_write/);
  assert.match(text, /Review Ack: pnpm --filter @narada2\/cloudflare-carrier product:operation:focus-review:text/);
});
