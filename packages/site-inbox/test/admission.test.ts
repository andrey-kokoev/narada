import { describe, expect, it } from 'vitest';
import {
  buildSiteInboxEnvelopeAdmissionRequest,
  buildSiteInboxPortableArtifactPlan,
  decideSiteInboxAdmission,
} from '../src/index.js';

describe('site inbox admission descriptors', () => {
  it('plans inert envelope admission without writing DB or artifacts', () => {
    const request = buildSiteInboxEnvelopeAdmissionRequest({
      envelope_id: 'env_fixture',
      received_at: '2026-05-12T00:00:00.000Z',
      source: { kind: 'agent_report', ref: 'osm:fixture', site: 'external-site' },
      target_locus: 'narada-proper',
      kind: 'proposal',
      authority: { level: 'external_evidence', principal: 'external.agent' },
      payload: { title: 'Fixture proposal' },
    });

    const decision = decideSiteInboxAdmission(request);

    expect(decision).toEqual({
      schema: 'narada.site_inbox.admission_decision.v0',
      status: 'admissible_descriptor',
      refusals: [],
      warnings: [],
      descriptor_only: true,
      envelope_written: false,
      db_mutated: false,
      source_state_imported: false,
    });
  });

  it('refuses source DB/history/runtime imports and credentials', () => {
    const decision = decideSiteInboxAdmission(buildSiteInboxEnvelopeAdmissionRequest({
      envelope_id: 'env_fixture',
      received_at: '2026-05-12T00:00:00.000Z',
      source: { kind: 'agent_report', ref: 'wsl.exe cat .ai/inbox.db' },
      target_locus: 'narada-proper',
      kind: 'observation',
      authority: { level: 'agent_reported', principal: 'external.agent' },
      payload: {},
      source_db_import_requested: true,
      source_history_import_requested: true,
      runtime_state_import_requested: true,
      credentials_requested: true,
    }));

    expect(decision.status).toBe('refused');
    expect(decision.refusals).toEqual([
      'empty_payload_refused_without_explicit_allowance',
      'source_inbox_db_import_refused',
      'source_inbox_history_import_refused',
      'runtime_state_import_refused',
      'credential_import_refused',
      'unsafe_source_ref_refused',
    ]);
  });

  it('requires review state for review crossings', () => {
    const decision = decideSiteInboxAdmission(buildSiteInboxEnvelopeAdmissionRequest({
      envelope_id: 'env_fixture',
      received_at: '2026-05-12T00:00:00.000Z',
      source: { kind: 'role_handoff', ref: 'task:fixture' },
      target_locus: 'narada-proper',
      kind: 'task_candidate',
      authority: { level: 'agent_reported', principal: 'builder.fixture' },
      payload: { title: 'Review fixture' },
      crossing: {
        scale: 'role',
        authority_scope: 'narada-proper',
        from_locus: 'builder:narada-proper',
        to_locus: 'architect:narada-proper',
        owning_site: 'narada-proper',
        target_authority: 'task_lifecycle',
        requested_crossing: 'review_request',
        admission_state: 'received',
      },
    }));

    expect(decision.refusals).toEqual(['review_crossing_requires_review_state']);
  });

  it('plans portable envelope artifact paths without exporting DB state', () => {
    const plan = buildSiteInboxPortableArtifactPlan({
      envelope_id: 'env_fixture',
      received_at: '2026-05-12T01:02:03.004Z',
    });

    expect(plan.artifact_path).toBe('.ai/inbox-envelopes/2026-05-12T01-02-03-004Z-env_fixture.json');
    expect(plan.git_visible).toBe(true);
    expect(plan.db_export).toBe(false);
    expect(plan.source_history_imported).toBe(false);
  });
});
