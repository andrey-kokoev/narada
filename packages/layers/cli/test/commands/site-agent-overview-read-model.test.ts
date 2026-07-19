import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildAgentIdentityRefV2 } from '@narada2/agent-identity';
import { createSiteAgentOverviewReadModel } from '../../src/commands/site-agent-overview-read-model.js';
import { siteAuthorityRootForRoot } from '../../src/lib/site-authority-paths.js';
import type { WorkspaceLaunchRecord } from '../../src/commands/workspace-launch-types.js';

function launchRecord(site: string, localAgentId: string, overrides: Partial<WorkspaceLaunchRecord> = {}): WorkspaceLaunchRecord {
  return {
    agent: localAgentId,
    agent_identity_ref: buildAgentIdentityRefV2({
      identity_scope: { kind: 'narada_site', site_id: site },
      local_agent_id: localAgentId,
      role: localAgentId,
    }),
    title: localAgentId === 'resident' ? 'Resident' : localAgentId,
    role: localAgentId,
    site,
    narada_root: `D:/sites/${site}`,
    site_root: `D:/sites/${site}`,
    workspace_root: `D:/sites/${site}`,
    launcher_path: `D:/sites/${site}/start.ps1`,
    operator_surface: 'agent-web-ui',
    runtime: 'narada-agent-runtime-server',
    authority: null,
    enable_native_shell: false,
    mcp_scope: 'all',
    config_path: 'C:/Users/test/Narada/config/launch/agents.json',
    ...overrides,
  };
}

describe('site-agent overview read model', () => {
  it('groups explicit Site kinds and composes session and principal state independently', async () => {
    const model = createSiteAgentOverviewReadModel({
      registryReadModel: {
        list: async () => ({
          exitCode: 0,
          result: {
            sites: [
              { site_id: 'andrey-user', site_root: 'C:/Users/test/Narada', observation_status: 'present' },
              { site_id: 'sonar', site_root: 'D:/sites/sonar', observation_status: 'present' },
            ],
          },
        }),
      } as never,
      agentSessions: {
        list: async () => ({
          schema: 'narada.operator_console.agent_sessions.v1',
          status: 'success',
          generated_at: '2026-07-18T00:00:00.000Z',
          count: 1,
          refusals: [],
          sessions: [{
            session_id: 'session-sonar',
            site_id: 'sonar',
            agent_id: 'sonar.resident',
            runtime_kind: 'narada-agent-runtime-server',
            launch_operator_surface_kind: 'agent-web-ui',
            started_at: '2026-07-18T00:00:00.000Z',
            last_seen_at: '2026-07-18T00:00:01.000Z',
            terminal_state: null,
            display_state: 'active',
            display_state_reason: 'healthy',
            heartbeat_fresh: true,
            heartbeat_age_ms: 10,
            health_status: 'healthy',
          }],
        }),
      },
      readLaunchRecords: async () => ({
        records: [launchRecord('andrey-user', 'resident'), launchRecord('sonar', 'resident')],
        siteCatalog: [],
      }),
      readSiteMetadata: async (record) => ({
        site_id: record.site,
        display_name: record.site === 'andrey-user' ? 'User Site' : 'Sonar',
        site_kind: record.site === 'andrey-user' ? 'user_site' : 'site',
      }),
      readPrincipalStates: async (record) => record.site_root.includes('sonar') ? [{
        runtime_id: 'principal-sonar-resident',
        principal_id: 'sonar.resident',
        principal_type: 'worker',
        state: 'executing',
        scope_id: 'sonar',
        attachment_mode: null,
        state_changed_at: '2026-07-18T00:00:00.000Z',
        last_heartbeat_at: null,
        active_work_item_id: 'task-42',
        budget_remaining: null,
        budget_unit: null,
        detail: null,
      }] : [],
    });

    const result = await model.read();
    const infrastructure = result.groups.find((group) => group.id === 'personal-infrastructure');
    const sites = result.groups.find((group) => group.id === 'sites');
    expect(infrastructure?.sites.map((site) => site.site_id)).toEqual(['andrey-user']);
    expect(sites?.sites.map((site) => site.site_id)).toEqual(['sonar']);
    expect(sites?.sites[0]?.agents[0]?.runtime).toMatchObject({
      state: 'running',
      selected_session_id: 'session-sonar',
    });
    expect(sites?.sites[0]?.agents[0]?.work).toEqual({
      state: 'executing',
      detail: 'task-42',
      source: 'principal-runtime',
    });
  });

  it('refuses when the admitted launch registry cannot be read', async () => {
    const model = createSiteAgentOverviewReadModel({
      registryReadModel: { list: async () => ({ exitCode: 0, result: { sites: [] } }) } as never,
      agentSessions: { list: async () => { throw new Error('unavailable'); } },
      readLaunchRecords: async () => { throw new Error('unavailable'); },
    });
    expect(await model.read()).toMatchObject({
      status: 'refused',
      refusals: ['launch_registry_read_failed'],
    });
  });
});

function principalSnapshot(principalId: string, state: string, detail: string | null = null) {
  return {
    runtime_id: `runtime-${principalId}`,
    principal_id: principalId,
    principal_type: 'worker',
    state,
    scope_id: 'scope',
    attachment_mode: null,
    state_changed_at: '2026-07-18T00:00:00.000Z',
    last_heartbeat_at: null,
    active_work_item_id: detail,
    budget_remaining: null,
    budget_unit: null,
    detail: null,
  };
}

function quietDependencies() {
  return {
    registryReadModel: { list: async () => ({ exitCode: 0, result: { sites: [] } }) } as never,
    agentSessions: { list: async () => ({ refusals: [], sessions: [] }) } as never,
  };
}

describe('site-agent overview authority and identity (findings 1, 3, 5)', () => {
  it('reads work posture from the Site authority locus and ignores workspace_root state', async () => {
    const siteRoot = mkdtempSync(join(tmpdir(), 'site-agent-authority-'));
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'site-agent-workspace-'));
    const authorityRoot = siteAuthorityRootForRoot(siteRoot);
    mkdirSync(authorityRoot, { recursive: true });
    writeFileSync(
      join(authorityRoot, '.principal-runtimes.json'),
      JSON.stringify([principalSnapshot('sonar.resident', 'executing', 'task-authority')]),
    );
    writeFileSync(
      join(workspaceRoot, '.principal-runtimes.json'),
      JSON.stringify([principalSnapshot('sonar.resident', 'claiming', 'task-workspace-decoy')]),
    );
    const model = createSiteAgentOverviewReadModel({
      ...quietDependencies(),
      readLaunchRecords: async () => ({
        records: [launchRecord('sonar', 'resident', { site_root: siteRoot, workspace_root: workspaceRoot })],
        siteCatalog: [],
      }),
      readSiteMetadata: async (record) => ({ site_id: record.site, display_name: record.site, site_kind: 'site' }),
    });
    const result = await model.read();
    const agent = result.groups.flatMap((group) => group.sites)[0]?.agents[0];
    expect(agent?.work).toEqual({ state: 'executing', detail: 'task-authority', source: 'principal-runtime' });
  });

  it('reads principal state from the authority .ai convention when present', async () => {
    const siteRoot = mkdtempSync(join(tmpdir(), 'site-agent-authority-ai-'));
    const authorityAi = join(siteAuthorityRootForRoot(siteRoot), '.ai');
    mkdirSync(authorityAi, { recursive: true });
    writeFileSync(
      join(authorityAi, 'principal-runtimes.json'),
      JSON.stringify([principalSnapshot('sonar.resident', 'executing', 'task-ai')]),
    );
    const model = createSiteAgentOverviewReadModel({
      ...quietDependencies(),
      readLaunchRecords: async () => ({
        records: [launchRecord('sonar', 'resident', { site_root: siteRoot, workspace_root: siteRoot })],
        siteCatalog: [],
      }),
      readSiteMetadata: async (record) => ({ site_id: record.site, display_name: record.site, site_kind: 'site' }),
    });
    const result = await model.read();
    const agent = result.groups.flatMap((group) => group.sites)[0]?.agents[0];
    expect(agent?.work).toEqual({ state: 'executing', detail: 'task-ai', source: 'principal-runtime' });
  });

  it('binds the canonical site-qualified principal over bare-id principals', async () => {
    const model = createSiteAgentOverviewReadModel({
      ...quietDependencies(),
      readLaunchRecords: async () => ({ records: [launchRecord('andrey-user', 'kevin')], siteCatalog: [] }),
      readSiteMetadata: async (record) => ({ site_id: record.site, display_name: record.site, site_kind: 'site' }),
      readPrincipalStates: async () => [
        principalSnapshot('kevin', 'claiming'),
        principalSnapshot('andrey-user.kevin', 'executing'),
      ],
    });
    const result = await model.read();
    const agent = result.groups.flatMap((group) => group.sites)[0]?.agents[0];
    expect(agent?.work.state).toBe('executing');
  });

  it('marks work ambiguous when only colliding bare-id principals match', async () => {
    const model = createSiteAgentOverviewReadModel({
      ...quietDependencies(),
      readLaunchRecords: async () => ({ records: [launchRecord('andrey-user', 'kevin')], siteCatalog: [] }),
      readSiteMetadata: async (record) => ({ site_id: record.site, display_name: record.site, site_kind: 'site' }),
      readPrincipalStates: async () => [
        principalSnapshot('kevin', 'executing'),
        principalSnapshot('Kevin', 'claiming'),
      ],
    });
    const result = await model.read();
    const agent = result.groups.flatMap((group) => group.sites)[0]?.agents[0];
    expect(agent?.work.state).toBe('ambiguous');
  });

  it('classifies from declared site config and marks the source declared', async () => {
    const siteRoot = mkdtempSync(join(tmpdir(), 'site-agent-declared-'));
    writeFileSync(join(siteRoot, 'config.json'), JSON.stringify({ site: { site_id: 'andrey-user', site_kind: 'user_site' } }));
    const model = createSiteAgentOverviewReadModel({
      ...quietDependencies(),
      readLaunchRecords: async () => ({
        records: [launchRecord('andrey-user', 'resident', { site_root: siteRoot, workspace_root: siteRoot })],
        siteCatalog: [],
      }),
      readPrincipalStates: async () => [],
    });
    const result = await model.read();
    const site = result.groups.flatMap((group) => group.sites)[0];
    expect(site).toMatchObject({ site_kind: 'user_site', classification_source: 'declared', group_id: 'personal-infrastructure' });
  });

  it('marks classification fallback when no descriptor exists and diagnoses unreadable descriptors', async () => {
    const fallbackRoot = mkdtempSync(join(tmpdir(), 'site-agent-fallback-'));
    const unreadableRoot = mkdtempSync(join(tmpdir(), 'site-agent-unreadable-'));
    writeFileSync(join(unreadableRoot, 'config.json'), 'not json');
    const model = createSiteAgentOverviewReadModel({
      ...quietDependencies(),
      readLaunchRecords: async () => ({
        records: [
          launchRecord('alpha', 'resident', { site_root: fallbackRoot, workspace_root: fallbackRoot }),
          launchRecord('beta', 'resident', { site_root: unreadableRoot, workspace_root: unreadableRoot }),
        ],
        siteCatalog: [],
      }),
      readPrincipalStates: async () => [],
    });
    const result = await model.read();
    const sites = result.groups.flatMap((group) => group.sites);
    expect(sites.find((site) => site.site_id === 'alpha')).toMatchObject({ site_kind: 'site', classification_source: 'fallback' });
    expect(sites.find((site) => site.site_id === 'beta')).toMatchObject({ site_kind: 'site', classification_source: 'fallback' });
    expect(result.refusals).toContain('site_metadata_unreadable:beta');
    expect(result.refusals).not.toContain('site_metadata_unreadable:alpha');
  });

  it('classifies registry-only Sites from registry authority locus and marks registry_only', async () => {
    const model = createSiteAgentOverviewReadModel({
      registryReadModel: {
        list: async () => ({
          exitCode: 0,
          result: {
            sites: [{
              site_id: 'andrey-user',
              site_root: 'C:/Users/test/Narada',
              observation_status: 'present',
              aim_json: JSON.stringify({ authority_locus: 'user' }),
            }],
          },
        }),
      } as never,
      agentSessions: { list: async () => ({ refusals: [], sessions: [] }) } as never,
      readLaunchRecords: async () => ({ records: [], siteCatalog: [] }),
    });
    const result = await model.read();
    const site = result.groups.flatMap((group) => group.sites)[0];
    expect(site).toMatchObject({ site_kind: 'user_site', classification_source: 'registry_only', group_id: 'personal-infrastructure' });
  });

  it('diagnoses duplicate canonical agent identities instead of rendering them silently', async () => {
    const model = createSiteAgentOverviewReadModel({
      ...quietDependencies(),
      readLaunchRecords: async () => ({
        records: [launchRecord('sonar', 'resident'), launchRecord('sonar', 'resident')],
        siteCatalog: [],
      }),
      readSiteMetadata: async (record) => ({ site_id: record.site, display_name: record.site, site_kind: 'site' }),
      readPrincipalStates: async () => [],
    });
    const result = await model.read();
    const site = result.groups.flatMap((group) => group.sites)[0];
    expect(site?.agents).toHaveLength(1);
    expect(result.refusals).toContain('duplicate_agent_identity:sonar:sonar.resident');
  });
});
