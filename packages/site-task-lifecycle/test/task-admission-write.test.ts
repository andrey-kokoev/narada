import { describe, expect, it } from 'vitest';
import {
  DeniedSourceImportError,
  NonNeutralIdentityError,
  TaskCandidateNotPendingAdmissionError,
  buildTaskAdmissionWriteRequest,
  buildTaskAdmissionWriteResult,
  projectInboxEnvelopeToTaskCandidate,
} from '../src/index.js';

const candidate = projectInboxEnvelopeToTaskCandidate({
  envelopeId: 'env-neutral-write-001',
  sourceSite: 'external-site-alpha',
  sourceRef: 'OSM:osm_neutral_write_001',
  receivedAt: '2026-05-10T05:05:00.000Z',
  summary: 'Admit neutral task candidate',
  bodyText: 'Neutral candidate evidence only.',
  evidencePaths: ['kb/proposals/neutral-write-path.md'],
});

describe('task admission write request', () => {
  it('builds descriptor-only operations for an admitted adapter', () => {
    const request = buildTaskAdmissionWriteRequest({
      taskDbPath: 'D:\\code\\narada\\.ai\\task-lifecycle.db',
      candidate,
      admittedBy: { identityId: 'site-alpha.Ada', role: 'architect' },
      admittedAt: '2026-05-10T05:06:00.000Z',
    });

    expect(request.schema).toBe('narada.site_task_lifecycle.task_admission_write_request.v0');
    expect(request.adapterDecision).toBe('adapter_interface_only');
    expect(request.adapterCapabilitiesRequired.map((capability) => capability.name)).toContain('insert_task_record');
    expect(request.operations.map((operation) => operation.kind)).toEqual([
      'insert_task_record',
      'insert_evidence_ref',
      'insert_evidence_ref',
      'record_admission_event',
    ]);
    expect(request.operations[0]?.parameters.status).toBe('admitted');
  });

  it('builds a ready-for-adapter result without claiming package mutation', () => {
    const request = buildTaskAdmissionWriteRequest({
      taskDbPath: 'D:\\code\\narada\\.ai\\task-lifecycle.db',
      candidate,
      admittedBy: { identityId: 'site-alpha.Ada', role: 'architect' },
      admittedAt: '2026-05-10T05:06:00.000Z',
    });
    const result = buildTaskAdmissionWriteResult(request, 'receiving-site.sqlite-adapter.v0', '2026-05-10T05:07:00.000Z');

    expect(result.status).toBe('ready_for_adapter');
    expect(result.mutationExecutedByPackage).toBe(false);
    expect(result.operationCount).toBe(request.operations.length);
  });

  it('rejects non-pending candidates', () => {
    expect(() => buildTaskAdmissionWriteRequest({
      taskDbPath: 'D:\\code\\narada\\.ai\\task-lifecycle.db',
      candidate: { ...candidate, status: 'admitted' as 'pending_admission' },
      admittedBy: { identityId: 'site-alpha.Ada', role: 'architect' },
      admittedAt: '2026-05-10T05:06:00.000Z',
    })).toThrow(TaskCandidateNotPendingAdmissionError);
  });

  it('rejects non-neutral admitting identities', () => {
    expect(() => buildTaskAdmissionWriteRequest({
      taskDbPath: 'D:\\code\\narada\\.ai\\task-lifecycle.db',
      candidate,
      admittedBy: { identityId: 'andrey-user.Kevin', role: 'architect' },
      admittedAt: '2026-05-10T05:06:00.000Z',
    })).toThrow(NonNeutralIdentityError);
  });

  it('rejects source Site DB or history evidence refs before adapter handoff', () => {
    expect(() => buildTaskAdmissionWriteRequest({
      taskDbPath: 'D:\\code\\narada\\.ai\\task-lifecycle.db',
      candidate: {
        ...candidate,
        evidenceRefs: [
          ...candidate.evidenceRefs,
          'C:\\Users\\Andrey\\Narada\\.ai\\task-lifecycle.db',
        ],
      },
      admittedBy: { identityId: 'site-alpha.Ada', role: 'architect' },
      admittedAt: '2026-05-10T05:06:00.000Z',
    })).toThrow(DeniedSourceImportError);
  });
});
