import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { handleMcpRequest, resolveMcpSiteContext, runMcpServer } from '../../src/mcp-server.js';
import { taskCreateCommand } from '../../src/commands/task-create.js';
import { openTaskLifecycleStore } from '../../src/lib/task-lifecycle-store.js';

describe('Narada MCP facade', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-mcp-server-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('initializes with tool capability', async () => {
    const response = await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'initialize' });

    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: {
        capabilities: { tools: {} },
        serverInfo: { authority_posture: 'facade_only' },
      },
    });
  });

  it('lists bounded Narada MCP tools', async () => {
    const response = await handleMcpRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const tools = ((response?.result as { tools: Array<{ name: string }> }).tools).map((tool) => tool.name);

    expect(tools).toContain('narada_site_context');
    expect(tools).toContain('narada_mcp_fabric_context');
    expect(tools).toContain('site_task_lifecycle.plan_init');
    expect(tools).toContain('site_task_lifecycle.admit_task');
    expect(tools).toContain('site_task_lifecycle.read_task');
    expect(tools).toContain('narada_inbox_doctor');
    expect(tools).toContain('narada_inbox_work_next');
    expect(tools).toContain('narada_task_work_next');
    expect(tools).toContain('narada_inbox_submit_observation');
    expect(tools).toContain('narada_ee_mcp_doctor');
    expect(tools).not.toContain('narada_ee_run');
  });

  it('resolves Site context from Site config', () => {
    writeSiteConfig(tempDir, {
      site_id: 'mcp-project',
      site_kind: 'project',
      site_root: tempDir,
      workspace_root: join(tempDir, '..', 'workspace'),
      locus: { authority_locus: 'project' },
    });

    expect(resolveMcpSiteContext({ siteRoot: tempDir })).toMatchObject({
      site_id: 'mcp-project',
      site_kind: 'project',
      site_root: tempDir,
      workspace_root: join(tempDir, '..', 'workspace'),
      authority_locus: 'project',
      source: 'config',
    });
  });

  it('exposes Site identity through initialize and Site context tool', async () => {
    writeSiteConfig(tempDir, {
      site_id: 'mcp-client',
      site_kind: 'client_service',
      site_root: tempDir,
      locus: { authority_locus: 'client_service' },
    });

    const initialize = await handleMcpRequest(
      { jsonrpc: '2.0', id: 6, method: 'initialize' },
      { siteRoot: tempDir },
    );
    expect(initialize).toMatchObject({
      result: {
        serverInfo: {
          name: 'narada-mcp:mcp-client',
          site: { site_id: 'mcp-client', authority_locus: 'client_service' },
        },
      },
    });

    const context = await handleMcpRequest(
      { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'narada_site_context', arguments: {} } },
      { siteRoot: tempDir },
    );
    const result = JSON.parse(((context?.result as { content: Array<{ text: string }> }).content[0].text));
    expect(result).toMatchObject({
      status: 'success',
      authority_posture: 'facade_only',
      site: { site_id: 'mcp-client', site_root: tempDir },
    });
  });

  it('calls inbox work-next through the existing command surface', async () => {
    const response = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'narada_inbox_work_next',
        arguments: { cwd: tempDir },
      },
    });

    const result = response?.result as { content: Array<{ text: string }> };
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      status: 'success',
      primary: null,
      traversal: {
        resolution: 'source_site',
        cross_site: false,
        mutation_attempted: false,
        capability_status: 'not_required',
      },
    });
  });

  it('plans Site task lifecycle paths through the descriptor MCP tool', async () => {
    const response = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 16,
      method: 'tools/call',
      params: {
        name: 'site_task_lifecycle.plan_init',
        arguments: { site_root: tempDir },
      },
    }, { siteRoot: tempDir, siteId: 'task-lifecycle-site' });

    const result = JSON.parse(((response?.result as { content: Array<{ text: string }> }).content[0].text));
    expect(result).toMatchObject({
      status: 'success',
      schema: 'narada.site_task_lifecycle.mcp_plan_init_result.v0',
      packageName: '@narada2/site-task-lifecycle',
      siteId: 'task-lifecycle-site',
      mutationAttempted: false,
      sourceStateImported: false,
      packageExecutedSqliteMutation: false,
      traversal: {
        mutation_attempted: false,
        cross_site: false,
      },
    });
    expect(result.paths.taskDbPath).toBe(join(tempDir, '.ai', 'task-lifecycle.db'));
    expect(result.paths.manifestPath).toBe(join(tempDir, '.ai', 'site-task-lifecycle-admission.json'));
  });

  it('admits a local task through the mutating task lifecycle MCP tool', async () => {
    const response = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 17,
      method: 'tools/call',
      params: {
        name: 'site_task_lifecycle.admit_task',
        arguments: {
          task_id: 'site-alpha.task-1',
          title: 'MCP admitted task',
          source_ref: 'OSM:test-local-admission',
          summary: 'Admitted through MCP in a neutral fixture.',
          admitted_by: 'site-alpha.architect',
        },
      },
    }, { siteRoot: tempDir, siteId: 'site-alpha' });

    expect(response).not.toHaveProperty('error');
    const result = JSON.parse(((response?.result as { content: Array<{ text: string }> }).content[0].text));
    expect(result).toMatchObject({
      status: 'success',
      schema: 'narada.site_task_lifecycle.mcp_admit_task_result.v0',
      taskId: 'site-alpha.task-1',
      mutationAttempted: true,
      mutationExecuted: true,
      sourceStateImported: false,
      packageExecutedSqliteMutation: false,
      traversal: {
        mutation_attempted: true,
        cross_site: false,
      },
    });
    expect(result.readback).toEqual([
      {
        task_id: 'site-alpha.task-1',
        status: 'admitted',
        source_site: 'site-alpha',
        source_ref: 'OSM:test-local-admission',
      },
    ]);
    expect(readdirSync(join(tempDir, '.ai', 'mutation-evidence', 'task_lifecycle'))).toHaveLength(1);
  });

  it('refuses denied source-state refs before task lifecycle MCP mutation', async () => {
    const response = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 18,
      method: 'tools/call',
      params: {
        name: 'site_task_lifecycle.admit_task',
        arguments: {
          task_id: 'site-alpha.refused',
          title: 'Refused import',
          source_ref: 'C:\\Users\\Andrey\\Narada\\.ai\\task-lifecycle.db',
        },
      },
    }, { siteRoot: tempDir, siteId: 'site-alpha' });

    const result = JSON.parse(((response?.result as { content: Array<{ text: string }> }).content[0].text));
    expect(result).toMatchObject({
      status: 'error',
      error: 'denied_source_import_ref',
      mutationExecuted: false,
      sourceStateImported: false,
      packageExecutedSqliteMutation: false,
    });
    expect(() => readdirSync(join(tempDir, '.ai', 'mutation-evidence', 'task_lifecycle'))).toThrow();
  });

  it('reads admitted task lifecycle evidence without mutating', async () => {
    await handleMcpRequest({
      jsonrpc: '2.0',
      id: 19,
      method: 'tools/call',
      params: {
        name: 'site_task_lifecycle.admit_task',
        arguments: {
          task_id: 'site-alpha.task-readback',
          title: 'Readback task',
          source_ref: 'OSM:test-readback',
          evidence_refs: ['local:evidence'],
        },
      },
    }, { siteRoot: tempDir, siteId: 'site-alpha' });

    const response = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 20,
      method: 'tools/call',
      params: {
        name: 'site_task_lifecycle.read_task',
        arguments: { task_id: 'site-alpha.task-readback' },
      },
    }, { siteRoot: tempDir, siteId: 'site-alpha' });

    const result = JSON.parse(((response?.result as { content: Array<{ text: string }> }).content[0].text));
    expect(result).toMatchObject({
      status: 'success',
      schema: 'narada.site_task_lifecycle.mcp_read_task_result.v0',
      taskId: 'site-alpha.task-readback',
      mutationAttempted: false,
      mutationExecuted: false,
      sourceStateImported: false,
      packageExecutedSqliteMutation: false,
      task: { task_id: 'site-alpha.task-readback', status: 'admitted' },
    });
    expect(result.evidenceRefs).toHaveLength(2);
    expect(result.admissionEvents).toHaveLength(1);
  });

  it('returns not_found for missing task lifecycle readback', async () => {
    const response = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 21,
      method: 'tools/call',
      params: {
        name: 'site_task_lifecycle.read_task',
        arguments: { task_id: 'site-alpha.missing' },
      },
    }, { siteRoot: tempDir, siteId: 'site-alpha' });

    const result = JSON.parse(((response?.result as { content: Array<{ text: string }> }).content[0].text));
    expect(result).toMatchObject({
      status: 'not_found',
      taskId: 'site-alpha.missing',
      mutationAttempted: false,
      mutationExecuted: false,
    });
  });

  it('calls task work-next discovery through the existing task command surface', async () => {
    mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
    mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
    writeFileSync(join(tempDir, '.ai', 'agents', 'roster.json'), JSON.stringify({
      version: 1,
      updated_at: new Date().toISOString(),
      agents: [{
        agent_id: 'builder',
        role: 'builder',
        capabilities: ['claim', 'execute'],
        first_seen_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
        status: 'idle',
        task: null,
        last_done: null,
        updated_at: new Date().toISOString(),
      }],
    }, null, 2));
    const store = openTaskLifecycleStore(tempDir);
    try {
      store.upsertRosterEntry({
        agent_id: 'builder',
        role: 'builder',
        capabilities_json: JSON.stringify(['claim', 'execute']),
        first_seen_at: '2026-01-01T00:00:00Z',
        last_active_at: '2026-01-01T00:00:00Z',
        status: 'idle',
        task_number: null,
        last_done: null,
        updated_at: '2026-01-01T00:00:00Z',
      });
    } finally {
      store.db.close();
    }
    const created = await taskCreateCommand({
      cwd: tempDir,
      number: 501,
      title: 'MCP task discovery',
      goal: 'Discover this task through MCP.',
      requiredWork: 'Return the next task.',
      criteria: ['Task is discoverable'],
      format: 'json',
    });
    expect(created.exitCode).toBe(0);

    const response = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 12,
      method: 'tools/call',
      params: {
        name: 'narada_task_work_next',
        arguments: { cwd: tempDir, agent: 'builder' },
      },
    });

    const result = JSON.parse(((response?.result as { content: Array<{ text: string }> }).content[0].text));
    expect(result).toMatchObject({
      status: 'ok',
      action: 'peek_next',
      primary: {
        title: 'MCP task discovery',
      },
      traversal: {
        resolution: 'source_site',
        cross_site: false,
        mutation_attempted: false,
      },
    });
  });

  it('resolves an explicit target Site root and returns fabric traversal context', async () => {
    const sourceRoot = join(tempDir, 'source');
    const targetRoot = join(tempDir, 'target');
    mkdirSync(sourceRoot);
    mkdirSync(targetRoot);
    writeSiteConfig(sourceRoot, {
      site_id: 'source-site',
      site_kind: 'user',
      site_root: sourceRoot,
      locus: { authority_locus: 'user' },
    });
    writeSiteConfig(targetRoot, {
      site_id: 'target-site',
      site_kind: 'project',
      site_root: targetRoot,
      locus: { authority_locus: 'project' },
    });

    const response = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: {
        name: 'narada_mcp_fabric_context',
        arguments: { target: { kind: 'site', site_root: targetRoot } },
      },
    }, { siteRoot: sourceRoot });

    const result = JSON.parse(((response?.result as { content: Array<{ text: string }> }).content[0].text));
    expect(result).toMatchObject({
      status: 'success',
      fabric_posture: 'governed_traversal_facade',
      traversal: {
        source_site: { site_id: 'source-site' },
        target_site: { site_id: 'target-site' },
        resolution: 'explicit_site_root',
        cross_site: true,
        authority_posture: 'facade_only',
      },
    });
  });

  it('resolves a target Site through the routing registry for read-only tools', async () => {
    const sourceRoot = join(tempDir, 'source-routing');
    const targetRoot = join(tempDir, 'target-routing');
    mkdirSync(join(sourceRoot, '.ai'), { recursive: true });
    mkdirSync(targetRoot);
    writeSiteConfig(sourceRoot, {
      site_id: 'source-routing-site',
      site_kind: 'user',
      site_root: sourceRoot,
      locus: { authority_locus: 'user' },
    });
    writeSiteConfig(targetRoot, {
      site_id: 'target-routing-site',
      site_kind: 'project',
      site_root: targetRoot,
      locus: { authority_locus: 'project' },
    });
    writeFileSync(join(sourceRoot, '.ai', 'routing-addressing-registry.json'), JSON.stringify({
      registry_kind: 'routing_addressing_registry',
      registry_version: 1,
      routes: [{
        route_id: 'route_test_target',
        target_kind: 'site',
        target_ref: 'project-alpha',
        authority_locus: 'project',
        address_kind: 'site_root',
        address_ref: targetRoot,
        transport: 'filesystem',
        capability_kind: 'filesystem.write',
        priority: 10,
        active: true,
        fallback_target: null,
        evidence_ref: 'test:evidence',
        created_by: 'test',
        created_at: '2099-01-01T00:00:00.000Z',
        updated_at: '2099-01-01T00:00:00.000Z',
      }],
    }, null, 2), 'utf8');

    const response = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: {
        name: 'narada_inbox_work_next',
        arguments: { target: { kind: 'site', ref: 'project-alpha' } },
      },
    }, { siteRoot: sourceRoot });

    const result = JSON.parse(((response?.result as { content: Array<{ text: string }> }).content[0].text));
    expect(result).toMatchObject({
      status: 'success',
      primary: null,
      traversal: {
        target_site: { site_id: 'target-routing-site' },
        route: { route_id: 'route_test_target' },
        resolution: 'routing_registry',
        cross_site: true,
        mutation_attempted: false,
        capability_status: 'not_required',
      },
    });
  });

  it('reports WSL-to-Windows EE-MCP as superseded by Windows-native posture', async () => {
    const response = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 13,
      method: 'tools/call',
      params: {
        name: 'narada_ee_mcp_doctor',
        arguments: { cwd: tempDir },
      },
    });

    const result = JSON.parse(((response?.result as { content: Array<{ text: string }> }).content[0].text));
    expect(result).toMatchObject({
      status: 'superseded_by_windows_native',
      adapter_id: 'ee-mcp.windows-powershell-from-wsl',
      direction: 'wsl_to_windows',
      current_posture: 'not_current_narada_proper_path',
      superseded_by: 'windows_native_narada_proper_authority',
      command_id_grammar: {
        allowed_prefix: 'windows-pwsh.readonly.',
        side_effect_class: 'read_only',
      },
      refusal_posture: {
        refusal_code: 'superseded_by_windows_native',
        raw_windows_shell_forbidden: true,
        forbidden_shortcuts: ['powershell.exe', 'pwsh.exe', 'cmd.exe'],
      },
      traversal: {
        cross_site: false,
        mutation_attempted: false,
      },
    });
  });

  it('refuses direct WSL-to-Windows EE-MCP run requests as superseded compatibility calls', async () => {
    const response = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 14,
      method: 'tools/call',
      params: {
        name: 'narada_ee_run',
        arguments: {
          cwd: tempDir,
          command_id: 'windows-pwsh.readonly.hostname',
          requester: 'architect',
        },
      },
    });

    const result = response?.result as { content: Array<{ text: string }>; isError?: boolean };
    const payload = JSON.parse(result.content[0].text);
    expect(result.isError).toBe(true);
    expect(payload).toMatchObject({
      status: 'error',
      error: 'superseded_by_windows_native',
      adapter_id: 'ee-mcp.windows-powershell-from-wsl',
      command_id: 'windows-pwsh.readonly.hostname',
      execution_attempted: false,
      doctor: {
        status: 'superseded_by_windows_native',
        refusal_posture: {
          raw_windows_shell_forbidden: true,
        },
      },
      traversal: {
        mutation_attempted: true,
        cross_site: false,
      },
    });
  });

  it('rejects raw or malformed WSL-to-Windows EE-MCP command ids before adapter lookup', async () => {
    const response = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 15,
      method: 'tools/call',
      params: {
        name: 'narada_ee_run',
        arguments: {
          cwd: tempDir,
          command_id: 'powershell.exe -NoProfile hostname',
        },
      },
    });

    const result = response?.result as { content: Array<{ text: string }>; isError?: boolean };
    const payload = JSON.parse(result.content[0].text);
    expect(result.isError).toBe(true);
    expect(payload).toMatchObject({
      status: 'error',
      error: 'invalid_command_id',
      execution_attempted: false,
    });
  });

  it('refuses cross-Site MCP mutation before governed mutation fabric exists', async () => {
    const sourceRoot = join(tempDir, 'source-refuse');
    const targetRoot = join(tempDir, 'target-refuse');
    mkdirSync(sourceRoot);
    mkdirSync(targetRoot);
    writeSiteConfig(sourceRoot, {
      site_id: 'source-refuse-site',
      site_kind: 'user',
      site_root: sourceRoot,
      locus: { authority_locus: 'user' },
    });
    writeSiteConfig(targetRoot, {
      site_id: 'target-refuse-site',
      site_kind: 'project',
      site_root: targetRoot,
      locus: { authority_locus: 'project' },
    });

    const response = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 11,
      method: 'tools/call',
      params: {
        name: 'narada_inbox_submit_observation',
        arguments: {
          target: { kind: 'site', site_root: targetRoot },
          source_ref: 'mcp-test:refused-cross-site',
          title: 'Should be refused',
          principal: 'architect',
        },
      },
    }, { siteRoot: sourceRoot });

    const result = response?.result as { content: Array<{ text: string }>; isError?: boolean };
    const payload = JSON.parse(result.content[0].text);
    expect(result.isError).toBe(true);
    expect(payload).toMatchObject({
      status: 'error',
      traversal: {
        source_site: { site_id: 'source-refuse-site' },
        target_site: { site_id: 'target-refuse-site' },
        cross_site: true,
        mutation_attempted: true,
      },
    });
    expect(() => readdirSync(join(targetRoot, '.ai', 'mutation-evidence', 'inbox'))).toThrow();
  });

  it('refuses cross-Site task lifecycle MCP admission before target-local authority', async () => {
    const sourceRoot = join(tempDir, 'source-task-lifecycle-refuse');
    const targetRoot = join(tempDir, 'target-task-lifecycle-refuse');
    mkdirSync(sourceRoot);
    mkdirSync(targetRoot);
    writeSiteConfig(sourceRoot, {
      site_id: 'source-task-lifecycle-site',
      site_kind: 'user',
      site_root: sourceRoot,
      locus: { authority_locus: 'user' },
    });
    writeSiteConfig(targetRoot, {
      site_id: 'target-task-lifecycle-site',
      site_kind: 'project',
      site_root: targetRoot,
      locus: { authority_locus: 'project' },
    });

    const response = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 22,
      method: 'tools/call',
      params: {
        name: 'site_task_lifecycle.admit_task',
        arguments: {
          target: { kind: 'site', site_root: targetRoot },
          task_id: 'target-task-lifecycle-site.refused',
          title: 'Refused cross-Site task lifecycle admission',
          source_ref: 'OSM:test-cross-site-refusal',
        },
      },
    }, { siteRoot: sourceRoot });

    const result = response?.result as { content: Array<{ text: string }>; isError?: boolean };
    const payload = JSON.parse(result.content[0].text);
    expect(result.isError).toBe(true);
    expect(payload).toMatchObject({
      status: 'error',
      error: 'Cross-Site MCP mutation is not admitted in v1 fabric proof.',
      traversal: {
        source_site: { site_id: 'source-task-lifecycle-site' },
        target_site: { site_id: 'target-task-lifecycle-site' },
        cross_site: true,
        mutation_attempted: true,
      },
    });
    expect(() => readdirSync(join(targetRoot, '.ai', 'mutation-evidence', 'task_lifecycle'))).toThrow();
    expect(() => readdirSync(join(targetRoot, '.ai'))).toThrow();
  });

  it('defaults inbox tools to the MCP Site root when cwd is omitted', async () => {
    const siteRoot = join(tempDir, '.narada');
    mkdirSync(siteRoot);
    writeSiteConfig(siteRoot, {
      site_id: 'scoped-site',
      site_kind: 'project',
      site_root: siteRoot,
      locus: { authority_locus: 'project' },
    });

    const response = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: {
        name: 'narada_inbox_submit_observation',
        arguments: {
          source_ref: 'mcp-test:scoped-observation',
          title: 'Scoped MCP observation',
          principal: 'architect',
        },
      },
    }, { siteRoot });

    const result = JSON.parse(((response?.result as { content: Array<{ text: string }> }).content[0].text));
    expect(result).toMatchObject({ status: 'success' });
    expect(readdirSync(join(siteRoot, '.ai', 'mutation-evidence', 'inbox'))).toHaveLength(1);
    expect(() => readdirSync(join(tempDir, '.ai', 'mutation-evidence', 'inbox'))).toThrow();
  });

  it('submits inbox observations with read-back confirmation and mutation evidence', async () => {
    const response = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'narada_inbox_submit_observation',
        arguments: {
          cwd: tempDir,
          source_ref: 'mcp-test:observation',
          title: 'MCP observation',
          summary: 'Submitted through MCP facade.',
          principal: 'architect',
        },
      },
    });

    const result = JSON.parse(((response?.result as { content: Array<{ text: string }> }).content[0].text));
    expect(result).toMatchObject({
      status: 'success',
      confirmation: { payload_equivalent: true },
      envelope: {
        kind: 'observation',
        status: 'received',
        authority: { principal: 'architect' },
      },
    });

    const evidenceDir = join(tempDir, '.ai', 'mutation-evidence', 'inbox');
    const evidence = readdirSync(evidenceDir).map((file) => JSON.parse(readFileSync(join(evidenceDir, file), 'utf8')));
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      command: 'inbox submit',
      subject: { id: result.envelope.envelope_id },
      confirmation: { status: 'confirmed' },
    });
  });

  it('enforces message routing authority on MCP inbox mutation tools', async () => {
    writeSiteConfig(tempDir, {
      site_id: 'mcp-routing-site',
      site_kind: 'project',
      site_root: tempDir,
      locus: { authority_locus: 'project' },
      message_routing_authority: {
        default_policy: 'deny_cross_locus_unless_allowed',
        principals: {
          builder: {
            may_not_send: [
              { target_locus: 'narada_proper', kinds: ['*'], reason: 'Builder reports locally; Architect escalates upstream.' },
            ],
          },
          architect: {
            may_send: [
              { target_locus: 'narada_proper', kinds: ['observation'], authority_levels: ['agent_reported'], condition: 'after_local_admission_or_explicit_operator_instruction' },
            ],
          },
        },
      },
    });

    const refused = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: {
        name: 'narada_inbox_submit_observation',
        arguments: {
          source_ref: 'mcp-test:builder-upstream',
          title: 'Builder upstream',
          principal: 'builder',
          target_locus: 'narada_proper',
        },
      },
    }, { siteRoot: tempDir });
    const refusedResult = JSON.parse(((refused?.result as { content: Array<{ text: string }> }).content[0].text));
    expect(refusedResult).toMatchObject({ status: 'error' });
    expect(refusedResult.error).toContain('Builder reports locally');

    const admitted = await handleMcpRequest({
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: {
        name: 'narada_inbox_submit_observation',
        arguments: {
          source_ref: 'mcp-test:architect-upstream',
          title: 'Architect upstream',
          principal: 'architect',
          target_locus: 'narada_proper',
        },
      },
    }, { siteRoot: tempDir });
    const admittedResult = JSON.parse(((admitted?.result as { content: Array<{ text: string }> }).content[0].text));
    expect(admittedResult).toMatchObject({
      status: 'success',
      routing: { status: 'admitted' },
    });
  });

  it('responds to stdio messages before stream shutdown', async () => {
    const input = new PassThrough();
    const output = new CaptureStream();
    const running = runMcpServer({ stdin: input, stdout: output });

    input.write('{"jsonrpc":"2.0","id":5,"method":"initialize"}\n');
    await output.waitForLine();
    input.end();
    await running;

    expect(JSON.parse(output.lines[0])).toMatchObject({
      id: 5,
      result: { serverInfo: { authority_posture: 'facade_only' } },
    });
  });
});

function writeSiteConfig(siteRoot: string, config: Record<string, unknown>): void {
  writeFileSync(join(siteRoot, 'config.json'), JSON.stringify(config, null, 2), 'utf8');
}

class CaptureStream extends Writable {
  readonly lines: string[] = [];
  private buffer = '';
  private waiter: (() => void) | null = null;

  _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.buffer += chunk.toString('utf8');
    const parts = this.buffer.split(/\r?\n/);
    this.buffer = parts.pop() ?? '';
    this.lines.push(...parts.filter((line) => line.length > 0));
    if (this.lines.length > 0 && this.waiter) {
      this.waiter();
      this.waiter = null;
    }
    callback();
  }

  waitForLine(): Promise<void> {
    if (this.lines.length > 0) return Promise.resolve();
    return new Promise((resolve) => {
      this.waiter = resolve;
    });
  }
}
