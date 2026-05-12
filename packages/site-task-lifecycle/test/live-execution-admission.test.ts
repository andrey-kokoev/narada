import { describe, expect, it } from 'vitest';
import {
  buildLiveExecutionAdmissionChecklist,
  buildLiveExecutionAdmissionResult,
  buildReceivingSiteSetupPlan,
  buildTaskDbAdapterConformanceContract,
  decideTaskDbAdapterBoundary,
  projectInboxEnvelopeToTaskCandidate,
} from '../src/index.js';
import { neutralRoster } from './fixtures/neutral-site.js';

const authorityBasis = {
  siteId: 'narada-proper',
  taskSurfaceId: 'narada-proper.task-0001',
  carrierId: 'narada-proper.carrier.task-0001.package-implementation.v0',
  admittedBy: { identityId: 'narada.architect', role: 'architect' },
  admittedAt: '2026-05-10T19:10:00.000Z',
  liveRegistrationAdmitted: false,
  adapterBoundary: decideTaskDbAdapterBoundary(),
} as const;

const setupPlan = buildReceivingSiteSetupPlan({
  siteRoot: 'D:\\code\\narada',
  siteId: 'site-alpha',
  initializedBy: { identityId: 'site-alpha.Ada', role: 'architect' },
  roster: neutralRoster,
  candidate: projectInboxEnvelopeToTaskCandidate({
    envelopeId: 'env-neutral-live-admission-001',
    sourceSite: 'external-site-alpha',
    sourceRef: 'OSM:osm_neutral_live_admission_001',
    receivedAt: '2026-05-10T19:11:00.000Z',
    summary: 'Prepare live execution admission checklist',
  }),
  admittedAt: '2026-05-10T19:12:00.000Z',
  authorityBasis,
  adapterConformance: buildTaskDbAdapterConformanceContract({
    adapterId: 'receiving-site.adapter.neutral-memory',
    admittedBy: { identityId: 'site-alpha.Ada', role: 'architect' },
    admittedAt: '2026-05-10T19:12:30.000Z',
  }),
});

describe('live execution admission checklist', () => {
  it('names exact external admissions required before terminal live setup', () => {
    const checklist = buildLiveExecutionAdmissionChecklist(setupPlan);

    expect(checklist.schema).toBe('narada.site_task_lifecycle.live_execution_admission_checklist.v0');
    expect(checklist.terminalStateClaimable).toBe(false);
    expect(checklist.items.map((item) => item.kind)).toEqual([
      'initializer_execution',
      'real_adapter_admission',
      'db_mutation_execution',
      'live_mcp_registration',
    ]);
    expect(checklist.items.map((item) => item.status)).toEqual([
      'blocked_pending_admission',
      'blocked_pending_admission',
      'blocked_pending_admission',
      'blocked_pending_admission',
    ]);
  });

  it('records authority owner, evidence, refusal, rollback, and terminal criteria for every item', () => {
    const checklist = buildLiveExecutionAdmissionChecklist(setupPlan);

    for (const item of checklist.items) {
      expect(item.authorityOwner.length).toBeGreaterThan(0);
      expect(item.requiredEvidence.length).toBeGreaterThan(0);
      expect(item.refusalConditions.length).toBeGreaterThan(0);
      expect(item.rollbackPosture.length).toBeGreaterThan(0);
      expect(item.terminalCriterion.length).toBeGreaterThan(0);
    }
  });

  it('builds a blocked result and does not claim package execution', () => {
    const checklist = buildLiveExecutionAdmissionChecklist(setupPlan);
    const result = buildLiveExecutionAdmissionResult(checklist, '2026-05-10T19:13:00.000Z');

    expect(result.status).toBe('blocked_pending_live_execution');
    expect(result.terminalStateClaimable).toBe(false);
    expect(result.blockedBy).toEqual(checklist.terminalStateBlockedBy);
    expect(result.packageExecutedLiveRegistration).toBe(false);
    expect(result.packageExecutedSqliteMutation).toBe(false);
    expect(result.packageImportedSourceState).toBe(false);
  });
});
