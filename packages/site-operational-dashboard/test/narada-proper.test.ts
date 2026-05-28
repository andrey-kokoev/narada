import { describe, expect, it } from 'vitest';
import { renderDashboardHtml, validateDashboardSnapshot } from '../src/index.js';
import {
  buildNaradaProperDashboardSnapshot,
  collectNaradaProperDashboardSections,
  flattenDashboardRows,
  type NaradaProperArtifactSource,
} from '../src/narada-proper.js';

const generatedAt = '2026-05-17T12:30:00.000Z';

function fixtureArtifacts(): NaradaProperArtifactSource[] {
  return [
    {
      key: 'site_identity',
      evidence_ref: 'fixture:site-identity',
      observed_at: '2026-05-17T12:00:00.000Z',
      data: { site_id: 'narada-proper', authority_locus: 'narada_proper', roots: ['D:/code/narada'] },
    },
    { key: 'task_lifecycle', evidence_ref: 'fixture:task-lifecycle-status', data: { open: 2, claimed: 1, in_review: 1, blocked: 0 } },
    { key: 'roster', evidence_ref: 'fixture:roster-show', data: { agents: [{ agent_id: 'narada.builder2', status: 'working' }] } },
    { key: 'inbox', evidence_ref: 'fixture:inbox-list-summary', data: { received: 1, handling: 0, pending: 0 } },
    { key: 'inbox_drop', evidence_ref: 'fixture:inbox-drop-preview', data: { unadmitted_files: 0 } },
    { key: 'publication', evidence_ref: 'fixture:publication-posture', data: { dirty: true, unpublished_artifacts: 3 } },
    { key: 'telemetry', evidence_ref: 'fixture:telemetry-readiness', data: { readiness: 'locally_validated' } },
    { key: 'packages', evidence_ref: 'fixture:package-verification', data: { tests: 'passed', build: 'passed' } },
    {
      key: 'capabilities',
      evidence_ref: 'fixture:capability-preflight',
      data: { configured_refs: 4, missing_refs: 1, stale_refs: 0, secret_token: 'should-redact' },
    },
    { key: 'residuals', evidence_ref: 'fixture:residuals', data: { residuals: ['deploy approval absent'] } },
    { key: 'work_next', evidence_ref: 'fixture:work-next', data: { next_action: 'task_work', reason: 'task:1450' } },
  ];
}

describe('Narada proper local dashboard row providers', () => {
  it('builds bounded observation rows for every required local posture family', async () => {
    const sections = await collectNaradaProperDashboardSections({
      site_ref: 'narada-proper',
      generated_at: generatedAt,
      artifacts: fixtureArtifacts(),
    });
    const rows = flattenDashboardRows(sections);

    expect(sections.map((section) => section.id)).toEqual([
      'identity',
      'tasks',
      'agents',
      'inbox',
      'publication',
      'packages',
      'capabilities',
      'attention',
    ]);
    expect(rows.map((row) => row.id)).toEqual(expect.arrayContaining([
      'narada-proper-site-identity',
      'narada-proper-task-lifecycle',
      'narada-proper-roster-agents',
      'narada-proper-inbox',
      'narada-proper-inbox-drop',
      'narada-proper-publication',
      'narada-proper-telemetry',
      'narada-proper-package-build',
      'narada-proper-capability-secret',
      'narada-proper-residuals',
      'narada-proper-work-next',
    ]));
    for (const row of rows) {
      expect(row.basis).toBeTruthy();
      expect(row.observed_at).toBeTruthy();
      expect(row.freshness?.status).toBeTruthy();
      expect(row.evidence_refs?.length).toBeGreaterThan(0);
      expect(row.authority_limits).toContain('dashboard_row_is_observation_not_site_authority');
      expect(row.authority_limits).toContain('provider_must_not_mutate_task_inbox_lifecycle_roster_publication_or_secrets');
    }
  });

  it('composes provider sections into a renderable dashboard snapshot', async () => {
    const snapshot = await buildNaradaProperDashboardSnapshot({
      site_ref: 'narada-proper',
      generated_at: generatedAt,
      artifacts: fixtureArtifacts(),
    });
    const validation = validateDashboardSnapshot(snapshot);
    const html = renderDashboardHtml(snapshot);

    expect(validation.status).toBe('valid');
    expect(snapshot.sections).toHaveLength(8);
    expect(html).toContain('narada-proper operational posture');
    expect(html).toContain('dashboard_does_not_mutate_task_inbox_lifecycle_roster_publication_or_secrets');
    expect(html).not.toContain('[object Object]');
  });

  it('reports missing data as unknown or missing without reading live state', async () => {
    const sections = await collectNaradaProperDashboardSections({
      site_ref: 'narada-proper',
      generated_at: generatedAt,
      artifacts: [],
    });
    const rows = flattenDashboardRows(sections);

    expect(rows.every((row) => row.state === 'unknown')).toBe(true);
    expect(rows.every((row) => row.freshness?.status === 'missing')).toBe(true);
    expect(rows.every((row) => row.evidence_refs?.[0]?.ref?.startsWith('missing:'))).toBe(true);
    expect(rows.find((row) => row.id === 'narada-proper-task-lifecycle')?.basis).toContain('did not read SQLite directly');
  });

  it('redacts secret-like artifact detail and keeps the snapshot valid', async () => {
    const snapshot = await buildNaradaProperDashboardSnapshot({
      site_ref: 'narada-proper',
      generated_at: generatedAt,
      artifacts: fixtureArtifacts(),
    });
    const capability = flattenDashboardRows(snapshot.sections).find((row) => row.id === 'narada-proper-capability-secret');

    expect(JSON.stringify(capability?.detail)).not.toContain('should-redact');
    expect(JSON.stringify(capability?.detail)).not.toContain('secret_token');
    expect(validateDashboardSnapshot(snapshot).status).toBe('valid');
  });

  it('supports lazy artifact readers for caller-granted bounded command outputs', async () => {
    const sections = await collectNaradaProperDashboardSections({
      site_ref: 'narada-proper',
      generated_at: generatedAt,
      artifacts: [
        {
          key: 'work_next',
          evidence_ref: 'fixture:lazy-work-next',
          read: async () => ({ next_action: 'idle', reason: 'no_task_or_inbox_work' }),
        },
      ],
    });
    const row = flattenDashboardRows(sections).find((candidate) => candidate.id === 'narada-proper-work-next');

    expect(row?.state).toBe('ok');
    expect(row?.basis).toContain('next_action=idle');
    expect(row?.next_action).toBe('continue_observation');
  });
});
