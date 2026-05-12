import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DeniedSourceImportError,
  NonNeutralIdentityError,
  TASK_DB_SCHEMA_STATEMENTS,
  buildTaskAdmissionWriteRequest,
  buildTaskDbAdapterConformanceContract,
  buildTaskDbAdapterExecutionRequest,
  decideTaskDbAdapterBoundary,
  projectInboxEnvelopeToTaskCandidate,
  runNeutralTaskDbAdapterConformance,
} from '../src/index.js';
import { NeutralInMemoryTaskDbAdapter } from './fixtures/in-memory-task-db-adapter.js';

describe('SQLite adapter boundary', () => {
  it('chooses adapter interface only and refuses source DB imports', () => {
    const boundary = decideTaskDbAdapterBoundary([
      'C:\\Users\\Andrey\\Narada\\.ai\\task-lifecycle.db',
      'C:\\Users\\Andrey\\Narada\\.ai\\do-not-open\\tasks\\task.md',
    ]);

    expect(boundary.decision).toBe('adapter_interface_only');
    expect(boundary.packageOwnsSqliteDependency).toBe(false);
    expect(boundary.packageExecutesSqliteMutation).toBe(false);
    expect(boundary.requiredAdapterCapabilities.map((capability) => capability.name)).toEqual([
      'execute_schema_statement',
      'insert_task_record',
      'record_admission_event',
    ]);
    expect(boundary.sourceImportFindings.map((finding) => finding.reason)).toEqual([
      'source task lifecycle database',
      'source task history',
    ]);
  });

  it('builds an execution request without executing SQLite mutations', () => {
    const request = buildTaskDbAdapterExecutionRequest('D:\\code\\narada\\.ai\\task-lifecycle.db');

    expect(request.schema).toBe('narada.site_task_lifecycle.task_db_adapter_execution_request.v0');
    expect(request.statements).toBe(TASK_DB_SCHEMA_STATEMENTS);
    expect(request.adapterCapabilitiesRequired[0]?.status).toBe('required_for_future_write_path');
    expect(request.sourceImportFindings).toEqual([]);
  });

  it('does not add a concrete SQLite runtime dependency to this package', async () => {
    const packageJson = JSON.parse(
      await readFile(join(process.cwd(), 'package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    const dependencyNames = [
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
      ...Object.keys(packageJson.optionalDependencies ?? {}),
    ];

    expect(dependencyNames).not.toContain('better-sqlite3');
    expect(dependencyNames).not.toContain('sqlite3');
    expect(dependencyNames).not.toContain('@libsql/client');
  });

  it('builds a concrete-adapter conformance contract without source imports', () => {
    const contract = buildTaskDbAdapterConformanceContract({
      adapterId: 'receiving-site.adapter.neutral-memory',
      admittedBy: { identityId: 'site-alpha.Ada', role: 'architect' },
      admittedAt: '2026-05-10T18:55:00.000Z',
    });

    expect(contract.schema).toBe('narada.site_task_lifecycle.task_db_adapter_conformance_contract.v0');
    expect(contract.adapterDecision).toBe('adapter_interface_only');
    expect(contract.packageOwnsSqliteDependency).toBe(false);
    expect(contract.packageExecutesSqliteMutation).toBe(false);
    expect(contract.requiredMethods).toEqual(['executeSchemaStatement', 'executeAdmissionWriteOperation']);
  });

  it('runs conformance against a neutral in-memory fixture only', async () => {
    const adapter = new NeutralInMemoryTaskDbAdapter('receiving-site.adapter.neutral-memory');
    const contract = buildTaskDbAdapterConformanceContract({
      adapterId: adapter.adapterId,
      admittedBy: { identityId: 'site-alpha.Ada', role: 'architect' },
      admittedAt: '2026-05-10T18:55:00.000Z',
    });
    const candidate = projectInboxEnvelopeToTaskCandidate({
      envelopeId: 'env-neutral-adapter-001',
      sourceSite: 'external-site-alpha',
      sourceRef: 'OSM:osm_neutral_adapter_001',
      receivedAt: '2026-05-10T18:56:00.000Z',
      summary: 'Admit neutral adapter fixture task',
    });
    const writeRequest = buildTaskAdmissionWriteRequest({
      taskDbPath: 'D:\\code\\narada\\.ai\\task-lifecycle.db',
      candidate,
      admittedBy: { identityId: 'site-alpha.Ada', role: 'architect' },
      admittedAt: '2026-05-10T18:57:00.000Z',
    });

    const result = await runNeutralTaskDbAdapterConformance(
      adapter,
      contract,
      writeRequest,
      '2026-05-10T18:58:00.000Z',
    );

    expect(result.status).toBe('conforms');
    expect(result.fixtureKind).toBe('neutral_in_memory');
    expect(result.packageExecutesSqliteMutation).toBe(false);
    expect(adapter.schemaStatements).toHaveLength(TASK_DB_SCHEMA_STATEMENTS.length);
    expect(adapter.admissionOperations).toHaveLength(writeRequest.operations.length);
  });

  it('refuses source DB refs in adapter conformance contracts', () => {
    expect(() => buildTaskDbAdapterConformanceContract({
      adapterId: 'receiving-site.adapter.sqlite',
      admittedBy: { identityId: 'site-alpha.Ada', role: 'architect' },
      admittedAt: '2026-05-10T18:55:00.000Z',
      sourceImportRefs: ['C:\\Users\\Andrey\\Narada\\.ai\\task-lifecycle.db'],
    })).toThrow(DeniedSourceImportError);
  });

  it('refuses non-neutral adapter admission identities', () => {
    expect(() => buildTaskDbAdapterConformanceContract({
      adapterId: 'receiving-site.adapter.sqlite',
      admittedBy: { identityId: 'narada-andrey.Kevin', role: 'architect' },
      admittedAt: '2026-05-10T18:55:00.000Z',
    })).toThrow(NonNeutralIdentityError);
  });
});
