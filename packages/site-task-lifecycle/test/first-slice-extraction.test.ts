import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildMcpRuntimeBindingRequest,
  decideTaskDbAdapterBoundary,
  findDeniedSourceImports,
} from '../src/index.js';

describe('first slice extraction posture', () => {
  it('keeps the package pure descriptor/contract without SQLite runtime ownership', async () => {
    const packageJson = JSON.parse(
      await readFile(join(process.cwd(), 'package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    const dependencies = new Set([
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
      ...Object.keys(packageJson.optionalDependencies ?? {}),
    ]);
    const boundary = decideTaskDbAdapterBoundary();

    expect(boundary.decision).toBe('adapter_interface_only');
    expect(boundary.packageOwnsSqliteDependency).toBe(false);
    expect(boundary.packageExecutesSqliteMutation).toBe(false);
    expect(dependencies.has('sqlite3')).toBe(false);
    expect(dependencies.has('better-sqlite3')).toBe(false);
    expect(dependencies.has('@libsql/client')).toBe(false);
  });

  it('keeps live MCP binding descriptor-mediated and source-state refusing', () => {
    const adapterBoundary = decideTaskDbAdapterBoundary();
    const request = buildMcpRuntimeBindingRequest({
      siteRoot: 'D:\\code\\narada',
      authorityBasis: {
        siteId: 'narada-proper',
        taskSurfaceId: 'narada-proper.task-0007',
        carrierId: 'narada-proper.carrier.task-0001.package-implementation.v0',
        admittedBy: { identityId: 'narada-proper.architect', role: 'architect' },
        admittedAt: '2026-05-10T23:38:51.688Z',
        liveRegistrationAdmitted: false,
        adapterBoundary,
      },
      sourceImportRefs: [],
    });
    const findings = findDeniedSourceImports([
      'C:\\Users\\Andrey\\Narada\\.ai\\task-lifecycle.db',
      'C:\\ProgramData\\Narada\\sites\\pc\\desktop-sunroom-2\\runtime\\operator-surface-input-events\\input.json',
    ]);

    expect(request.authorityBasis.adapterBoundary.packageOwnsSqliteDependency).toBe(false);
    expect(request.authorityBasis.adapterBoundary.packageExecutesSqliteMutation).toBe(false);
    expect(request.liveRegistrationRequested).toBe(false);
    expect(request.runtimeTools.every((tool) => tool.invocationMode === 'descriptor_request_result')).toBe(true);
    expect(findings.map((finding) => finding.reason)).toEqual([
      'source task lifecycle database',
      'PC-locus runtime state',
    ]);
  });
});
