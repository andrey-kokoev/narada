import { describe, expect, it } from 'vitest';
import {
  NonNeutralIdentityError,
  NonNeutralProjectionPolicyError,
  buildCompatibilityProjectionPolicy,
  buildSiteTaskLifecycleAdmissionContract,
  createMcpRegistrationSnippet,
} from '../src/index.js';
import { neutralRoster } from './fixtures/neutral-site.js';

describe('site task lifecycle admission contract', () => {
  it('records receiving-Site admission fields and rejected source evidence', () => {
    const contract = buildSiteTaskLifecycleAdmissionContract({
      packageVersion: '0.1.0',
      localSiteRoot: 'D:\\code\\narada',
      localTaskDbPath: 'D:\\code\\narada\\.ai\\task-lifecycle.db',
      taskSpecProjectionDir: 'D:\\code\\narada\\.ai\\do-not-open\\tasks',
      rosterInitializationSource: 'neutral_fixture',
      packageTests: [
        {
          command: 'pnpm --dir packages\\site-task-lifecycle typecheck',
          status: 'passed',
          summary: 'package-local typecheck',
        },
      ],
      localIdentityMappings: neutralRoster.map((localIdentity) => ({ localIdentity })),
      rejectedSourcePaths: [
        'C:\\Users\\Andrey\\Narada\\.ai\\task-lifecycle.db',
        'C:\\Users\\Andrey\\Narada\\.ai\\agents\\roster.json',
      ],
      compatibilityProjectionPolicy: buildCompatibilityProjectionPolicy(),
      admittedBy: 'narada-proper.task-0001',
      admittedAt: '2026-05-10T04:45:00.000Z',
    });

    expect(contract.schema).toBe('narada.site_task_lifecycle.admission_contract.v0');
    expect(contract.packageName).toBe('@narada2/site-task-lifecycle');
    expect(contract.mcpTransportRegistration.status).toBe('snippet_ready');
    expect(contract.rejectedSourceFindings.map((finding) => finding.reason)).toEqual([
      'source task lifecycle database',
      'source roster authority',
    ]);
    expect(contract.compatibilityProjectionPolicy.legacySourceTables).toContain('narada_andrey_task_role_preferences');
    expect(contract.compatibilityProjectionPolicy.tableName).toBe('site_task_role_preferences');
  });

  it('builds a neutral MCP registration snippet without registering live transport', () => {
    const snippet = createMcpRegistrationSnippet('D:\\code\\narada');

    expect(snippet.status).toBe('snippet_ready');
    expect(snippet.packageName).toBe('@narada2/site-task-lifecycle');
    expect(snippet.args).toContain('--site-root');
    expect(snippet.args).toContain('D:\\code\\narada');
  });

  it('rejects source-Site identities in local identity mappings', () => {
    expect(() => buildSiteTaskLifecycleAdmissionContract({
      packageVersion: '0.1.0',
      localSiteRoot: 'D:\\code\\narada',
      localTaskDbPath: 'D:\\code\\narada\\.ai\\task-lifecycle.db',
      taskSpecProjectionDir: 'D:\\code\\narada\\.ai\\do-not-open\\tasks',
      rosterInitializationSource: 'neutral_fixture',
      packageTests: [],
      localIdentityMappings: [{ localIdentity: { identityId: 'andrey-user.Kevin', role: 'architect' } }],
      rejectedSourcePaths: [],
      compatibilityProjectionPolicy: buildCompatibilityProjectionPolicy(),
      admittedBy: 'narada-proper.task-0001',
      admittedAt: '2026-05-10T04:45:00.000Z',
    })).toThrow(NonNeutralIdentityError);
  });

  it('rejects writing compatibility projection into a source-specific legacy table', () => {
    expect(() => buildSiteTaskLifecycleAdmissionContract({
      packageVersion: '0.1.0',
      localSiteRoot: 'D:\\code\\narada',
      localTaskDbPath: 'D:\\code\\narada\\.ai\\task-lifecycle.db',
      taskSpecProjectionDir: 'D:\\code\\narada\\.ai\\do-not-open\\tasks',
      rosterInitializationSource: 'neutral_fixture',
      packageTests: [],
      localIdentityMappings: neutralRoster.map((localIdentity) => ({ localIdentity })),
      rejectedSourcePaths: [],
      compatibilityProjectionPolicy: {
        ...buildCompatibilityProjectionPolicy(),
        tableName: 'narada_andrey_task_role_preferences',
      },
      admittedBy: 'narada-proper.task-0001',
      admittedAt: '2026-05-10T04:45:00.000Z',
    })).toThrow(NonNeutralProjectionPolicyError);
  });
});
