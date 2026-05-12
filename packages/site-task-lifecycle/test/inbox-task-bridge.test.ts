import { describe, expect, it } from 'vitest';
import {
  NonNeutralIdentityError,
  SourceInboxHistoryImportError,
  deriveTaskCandidateId,
  projectInboxEnvelopeToTaskCandidate,
} from '../src/index.js';

const neutralEnvelope = {
  envelopeId: 'env-neutral-001',
  sourceSite: 'external-site-alpha',
  sourceRef: 'OSM:osm_neutral_001',
  receivedAt: '2026-05-10T04:55:00.000Z',
  summary: 'Implement neutral task admission fixture',
  bodyText: 'External evidence asks for a neutral package fixture.',
  evidencePaths: ['kb/proposals/neutral-task-admission.md'],
};

describe('inbox-to-task bridge', () => {
  it('projects one envelope into a pending task candidate', () => {
    const candidate = projectInboxEnvelopeToTaskCandidate(neutralEnvelope, {
      identityId: 'site-alpha.Ada',
      role: 'architect',
    });

    expect(candidate.schema).toBe('narada.site_task_lifecycle.task_candidate.v0');
    expect(candidate.taskId).toBe(deriveTaskCandidateId(neutralEnvelope));
    expect(candidate.status).toBe('pending_admission');
    expect(candidate.evidenceRefs).toContain('OSM:osm_neutral_001');
    expect(candidate.requestedBy).toBe('site-alpha.Ada');
    expect(candidate.rejectedSourceFindings).toEqual([]);
  });

  it('rejects source inbox history imports', () => {
    expect(() => projectInboxEnvelopeToTaskCandidate({
      ...neutralEnvelope,
      sourceRef: 'C:\\Users\\Andrey\\Narada\\.ai\\inbox-envelopes\\source-history.json',
    })).toThrow(SourceInboxHistoryImportError);
  });

  it('rejects non-neutral requested-by identities', () => {
    expect(() => projectInboxEnvelopeToTaskCandidate(neutralEnvelope, {
      identityId: 'narada-andrey.Kevin',
      role: 'architect',
    })).toThrow(NonNeutralIdentityError);
  });
});
