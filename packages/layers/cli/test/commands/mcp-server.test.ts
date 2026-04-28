import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { handleMcpRequest, resolveMcpSiteContext, runMcpServer } from '../../src/mcp-server.js';

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
    expect(tools).toContain('narada_inbox_doctor');
    expect(tools).toContain('narada_inbox_work_next');
    expect(tools).toContain('narada_inbox_submit_observation');
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
