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
    });
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
