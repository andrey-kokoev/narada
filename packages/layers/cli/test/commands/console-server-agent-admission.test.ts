import { describe, expect, it } from 'vitest';
import type { WorkspaceLaunchRecord } from '../../src/commands/workspace-launch-types.js';
import { createSiteAgentAdmissionGateway } from '../../src/commands/site-agent-admission-gateway.js';

function launchRecord(overrides: Partial<WorkspaceLaunchRecord> = {}): WorkspaceLaunchRecord {
  return {
    agent: 'site.resident',
    agent_identity_ref: {
      schema: 'narada.agent_identity_ref.v2',
      identity_scope: { kind: 'narada_site', site_id: 'site' },
      local_agent_id: 'resident',
      role: 'resident',
    },
    title: 'Resident',
    role: 'resident',
    site: 'site',
    narada_root: 'D:/code/narada',
    site_root: 'D:/code/site',
    workspace_root: 'D:/code/site',
    launcher_path: 'D:/code/site/site.ps1',
    operator_surface: 'agent-web-ui',
    runtime: 'narada-agent-runtime-server',
    authority: 'auto',
    enable_native_shell: false,
    mcp_scope: 'local-site',
    config_path: 'D:/code/site/config/launch/agents.json',
    ...overrides,
  };
}

function createFixture(records: WorkspaceLaunchRecord[]) {
  let written: unknown = null;
  let identityInput: Record<string, unknown> | null = null;
  const gateway = createSiteAgentAdmissionGateway({
    readLaunchRecords: async () => ({ records, siteCatalog: [] }),
    readSelectionChoices: async () => ({ provider_choices: ['codex'], model_choices: ['gpt-test'] }),
    writeLaunchRecord: async (_path, record) => { written = record; },
    addSurfaceIdentity: async (options) => {
      identityInput = options as unknown as Record<string, unknown>;
      return { exitCode: 0, result: { status: 'success' } };
    },
    now: () => new Date('2026-07-24T00:00:00.000Z'),
  });
  return { gateway, getWritten: () => written, getIdentityInput: () => identityInput };
}

describe('site-agent admission gateway', () => {
it('returns catalog-backed options and derives identity server-side', async () => {
  const fixture = createFixture([launchRecord()]);
  const options = await fixture.gateway.options('site');
  expect(options.status).toBe('success');
  expect(options.revision).toBeTruthy();
  expect(options.intelligence.selection_authority).toBeTruthy();
  expect(options.intelligence.provider_choices.map((item) => item.value)).toEqual(['codex']);

  const result = await fixture.gateway.admit({
    site_id: 'site',
    role: 'builder',
    agent_kind: 'codex_cli',
    runtime: 'narada-agent-runtime-server',
    operator_surface: 'agent-cli',
    intelligence_policy: 'catalog-and-materialized-policy',
    provider: 'codex',
    model: 'gpt-test',
    options_revision: options.revision!,
  });
  expect(result.status).toBe('admitted');
  expect(result.agent_id).toBe('site.builder');
  expect((fixture.getWritten() as { Agent: string }).Agent).toBe('site.builder');
  expect(fixture.getIdentityInput()?.identityName).toBe('site.builder');
  expect(result.intelligence.selection_authority?.launcher_selection).toBe(false);
});

it('refuses stale choices and duplicate derived identities', async () => {
  const fixture = createFixture([launchRecord()]);
  const options = await fixture.gateway.options('site');
  const stale = await fixture.gateway.admit({
    site_id: 'site',
    role: 'builder',
    agent_kind: 'codex_cli',
    runtime: 'narada-agent-runtime-server',
    operator_surface: 'agent-cli',
    options_revision: 'stale',
  });
  expect(stale.status).toBe('refused');
  expect(stale.reason).toBe('admission_options_stale');

  const duplicateFixture = createFixture([launchRecord({
    agent: 'site.builder',
    role: 'builder',
  })]);
  const duplicateOptions = await duplicateFixture.gateway.options('site');
  const duplicate = await duplicateFixture.gateway.admit({
    site_id: 'site',
    role: 'builder',
    agent_kind: 'codex_cli',
    runtime: 'narada-agent-runtime-server',
    operator_surface: 'agent-cli',
    options_revision: duplicateOptions.revision!,
  });
  expect(duplicate.status).toBe('refused');
  expect(duplicate.reason).toBe('agent_identity_duplicate');
  expect(options.revision).toBeTruthy();
});

it('refuses a Site without a canonical launch template', async () => {
  const fixture = createFixture([]);
  const options = await fixture.gateway.options('empty-site');
  expect(options.status).toBe('refused');
  expect(options.refusals.some((refusal) => refusal.includes('site_agent_admission_template_missing'))).toBe(true);
});
});

