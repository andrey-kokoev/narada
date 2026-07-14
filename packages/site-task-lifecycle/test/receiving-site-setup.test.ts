import { describe, expect, it } from 'vitest';
import {
  DeniedSourceImportError,
  NonNeutralIdentityError,
  buildReceivingSiteSetupPlan,
  buildReceivingSiteSetupResult,
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
  admittedAt: '2026-05-10T19:00:00.000Z',
  liveRegistrationAdmitted: false,
  adapterBoundary: decideTaskDbAdapterBoundary(),
} as const;

const candidate = projectInboxEnvelopeToTaskCandidate({
  envelopeId: 'env-neutral-setup-001',
  sourceSite: 'external-site-alpha',
  sourceRef: 'OSM:osm_neutral_setup_001',
  receivedAt: '2026-05-10T19:01:00.000Z',
  summary: 'Set up neutral receiving Site task lifecycle',
  evidencePaths: ['kb/proposals/neutral-receiving-site-setup.md'],
});

const adapterConformance = buildTaskDbAdapterConformanceContract({
  adapterId: 'receiving-site.adapter.neutral-memory',
  admittedBy: { identityId: 'site-alpha.Ada', role: 'architect' },
  admittedAt: '2026-05-10T19:02:00.000Z',
});

describe('receiving-Site setup plan', () => {
  it('composes setup prerequisites without executing live registration or DB mutation', () => {
    const plan = buildReceivingSiteSetupPlan({
      siteRoot: 'D:\\code\\narada',
      siteId: 'site-alpha',
      initializedBy: { identityId: 'site-alpha.Ada', role: 'architect' },
      roster: neutralRoster,
      candidate,
      admittedAt: '2026-05-10T19:03:00.000Z',
      authorityBasis,
      adapterConformance,
    });

    expect(plan.schema).toBe('narada.site_task_lifecycle.receiving_site_setup_plan.v0');
    expect(plan.taskDbInitPlan.schema).toBe('narada.site_task_lifecycle.task_db_init_plan.v0');
    expect(plan.taskAdmissionWriteRequest.schema).toBe('narada.site_task_lifecycle.task_admission_write_request.v0');
    expect(plan.mcpRuntimeBindingRequest.schema).toBe('narada.site_task_lifecycle.mcp_runtime_binding_request.v0');
    expect(plan.steps.map((step) => step.kind)).toEqual([
      'plan_initializer',
      'verify_adapter_conformance',
      'prepare_db_write_request',
      'prepare_mcp_runtime_binding',
      'await_live_execution_admission',
    ]);
    expect(plan.remainingAdmissionsRequired).toContain('receiving-Site DB mutation execution');
  });

  it('builds a setup result that remains ready for admitted execution only', () => {
    const plan = buildReceivingSiteSetupPlan({
      siteRoot: 'D:\\code\\narada',
      siteId: 'site-alpha',
      initializedBy: { identityId: 'site-alpha.Ada', role: 'architect' },
      roster: neutralRoster,
      candidate,
      admittedAt: '2026-05-10T19:03:00.000Z',
      authorityBasis,
      adapterConformance,
    });
    const result = buildReceivingSiteSetupResult(plan, '2026-05-10T19:04:00.000Z');

    expect(result.status).toBe('ready_for_admitted_execution');
    expect(result.packageExecutedLiveRegistration).toBe(false);
    expect(result.packageExecutedSqliteMutation).toBe(false);
    expect(result.packageImportedSourceState).toBe(false);
  });

  it('rejects source Site state refs during setup planning', () => {
    expect(() => buildReceivingSiteSetupPlan({
      siteRoot: 'D:\\code\\narada',
      siteId: 'site-alpha',
      initializedBy: { identityId: 'site-alpha.Ada', role: 'architect' },
      roster: neutralRoster,
      candidate,
      admittedAt: '2026-05-10T19:03:00.000Z',
      authorityBasis,
      adapterConformance,
      sourceImportRefs: ['C:\\Users\\Andrey\\Narada\\.ai\\task-lifecycle.db'],
    })).toThrow(DeniedSourceImportError);
  });

  it('rejects non-neutral local setup identities', () => {
    expect(() => buildReceivingSiteSetupPlan({
      siteRoot: 'D:\\code\\narada',
      siteId: 'site-alpha',
      initializedBy: { identityId: 'andrey-user.Kevin', role: 'architect' },
      roster: neutralRoster,
      candidate,
      admittedAt: '2026-05-10T19:03:00.000Z',
      authorityBasis,
      adapterConformance,
    })).toThrow(NonNeutralIdentityError);
  });
});
