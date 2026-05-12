import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildReceivingSiteSetupPlan,
  buildTaskAdmissionWriteRequest,
  buildTaskDbAdapterConformanceContract,
  buildTaskDbAdapterExecutionRequest,
  decideTaskDbAdapterBoundary,
  findDeniedSourceImports,
  planSiteTaskLifecyclePaths,
  projectInboxEnvelopeToTaskCandidate,
} from '../src/index.js';
import { neutralRoster } from './fixtures/neutral-site.js';

const neutralIdentity = neutralRoster[0]!;

describe('Windows PowerShell package portability', () => {
  it('documents repo-package consumption without live Site state copy as an implementation path', async () => {
    const doc = await readFile(join(process.cwd(), 'docs', 'windows-pwsh-consuming-site.md'), 'utf8');

    expect(doc).toContain('Consume From Repo Package');
    expect(doc).toContain('Do Not Copy Live Site State');
    expect(doc).toContain('D:\\code\\narada\\packages\\site-task-lifecycle');
    expect(doc).toContain('local concrete adapter outside `@narada2/site-task-lifecycle`');
    expect(doc).toContain('It cannot claim live setup until the receiving Site admits and verifies its own initializer');
  });

  it('lets a future Windows Site assemble descriptors from neutral package APIs only', () => {
    const siteId = 'windows-site-alpha';
    const siteRoot = 'D:\\Sites\\site-alpha';
    const paths = planSiteTaskLifecyclePaths(siteRoot);
    const adapterBoundary = decideTaskDbAdapterBoundary();
    const adapterExecution = buildTaskDbAdapterExecutionRequest(paths.taskDbPath);
    const adapterConformance = buildTaskDbAdapterConformanceContract({
      adapterId: 'windows-site-alpha.adapter.local-pwsh-sqlite3',
      admittedBy: neutralIdentity,
      admittedAt: '2026-05-10T23:55:00.000Z',
    });
    const candidate = projectInboxEnvelopeToTaskCandidate({
      envelopeId: 'env-windows-site-alpha-001',
      sourceSite: 'external-neutral-source',
      sourceRef: 'OSM:neutral-windows-package-portability',
      receivedAt: '2026-05-10T23:56:00.000Z',
      summary: 'Neutral Windows Site package portability candidate.',
    });
    const writeRequest = buildTaskAdmissionWriteRequest({
      taskDbPath: paths.taskDbPath,
      candidate,
      admittedBy: neutralIdentity,
      admittedAt: '2026-05-10T23:57:00.000Z',
    });
    const setupPlan = buildReceivingSiteSetupPlan({
      siteRoot,
      siteId,
      initializedBy: neutralIdentity,
      roster: neutralRoster,
      candidate,
      admittedAt: '2026-05-10T23:57:00.000Z',
      authorityBasis: {
        siteId: 'narada-proper',
        taskSurfaceId: 'narada-proper.task-0008',
        carrierId: 'narada-proper.carrier.task-0001.package-implementation.v0',
        admittedBy: neutralIdentity,
        admittedAt: '2026-05-10T23:58:00.000Z',
        liveRegistrationAdmitted: false,
        adapterBoundary,
      },
      adapterConformance,
    });

    expect(adapterBoundary.packageOwnsSqliteDependency).toBe(false);
    expect(adapterBoundary.packageExecutesSqliteMutation).toBe(false);
    expect(setupPlan.siteRoot).toBe('D:\\Sites\\site-alpha');
    expect(setupPlan.taskDbInitPlan.statements).toEqual(adapterExecution.statements);
    expect(setupPlan.remainingAdmissionsRequired).toContain('concrete adapter execution outside @narada2/site-task-lifecycle');
    expect(writeRequest.adapterDecision).toBe('adapter_interface_only');
    expect(writeRequest.operations).toHaveLength(3);
    expect(findDeniedSourceImports([
      'D:\\code\\narada\\.ai\\task-lifecycle.db',
      'D:\\code\\narada\\.ai\\mutation-evidence\\task_lifecycle\\mcp_582af2d48056b375.json',
    ]).map((finding) => finding.reason)).toEqual([
      'source task lifecycle database',
      'source task lifecycle mutation evidence',
    ]);
  });
});
