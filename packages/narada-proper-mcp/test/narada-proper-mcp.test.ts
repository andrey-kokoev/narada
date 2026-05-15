import { describe, expect, it } from 'vitest';
import { PassThrough, Writable } from 'node:stream';
import { parseNaradaProperMcpArgs, runNaradaProperMcp, NARADA_PROPER_MCP_SURFACE } from '../src/index.js';

describe('narada proper MCP surface', () => {
  it('parses target-local startup identity arguments', () => {
    expect(parseNaradaProperMcpArgs([
      '--site-root', 'D:/code/narada',
      '--site-id', 'narada-proper',
      '--agent-id', 'narada.architect',
      '--agent-role', 'architect',
      '--agent-start-event-id', 'agent_start_test',
      '--carrier-session-id', 'carrier_session_test',
      '--agent-context-db', 'D:/code/narada/.ai/state/agent-context.sqlite',
    ])).toEqual({
      siteRoot: 'D:/code/narada',
      siteId: 'narada-proper',
      agentId: 'narada.architect',
      agentRole: 'architect',
      agentStartEventId: 'agent_start_test',
      carrierSessionId: 'carrier_session_test',
      agentContextDb: 'D:/code/narada/.ai/state/agent-context.sqlite',
    });
  });

  it('declares the old narada-mcp facade as replaced compatibility', () => {
    expect(NARADA_PROPER_MCP_SURFACE).toMatchObject({
      surface_id: 'narada-proper.surface.agent-facing-mcp.v1',
      package_name: '@narada2/narada-proper-mcp',
      compatibility_facade_replaced: 'narada-mcp',
      source_site_runtime_imported: false,
    });
  });

  it('lists tools and hydrates current launch evidence over stdio', async () => {
    const input = new PassThrough();
    const output = new CaptureStream();
    const running = runNaradaProperMcp({
      stdin: input,
      stdout: output,
      siteRoot: process.cwd(),
      siteId: 'narada-proper',
      agentId: 'narada.architect',
      agentRole: 'architect',
      agentStartEventId: 'agent_start_test',
      carrierSessionId: 'carrier_session_test',
      agentContextDb: 'agent-context.sqlite',
    });

    input.write('{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n');
    await output.waitForLineCount(1);
    input.write('{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"agent_context_hydrate_current","arguments":{}}}\n');
    await output.waitForLineCount(2);
    input.end();
    await running;

    const list = JSON.parse(output.lines[0]);
    expect(list.result.tools.map((tool: { name: string }) => tool.name)).toContain('agent_context_hydrate_current');
    expect(list.result.tools.map((tool: { name: string }) => tool.name)).toContain('site_task_lifecycle.read_task');

    const hydrated = JSON.parse(JSON.parse(output.lines[1]).result.content[0].text);
    expect(hydrated).toMatchObject({
      status: 'success',
      agent_id: 'narada.architect',
      start_event_id: 'agent_start_test',
      carrier_session_id: 'carrier_session_test',
      source: 'launcher_arguments',
      mutation_attempted: false,
      runtime_hydration_attempted: false,
    });
    expect(hydrated.source_state_imported ?? false).toBe(false);
  });

  it('refuses source runtime imports and supports read-only checkpoint calls', async () => {
    const input = new PassThrough();
    const output = new CaptureStream();
    const running = runNaradaProperMcp({
      stdin: input,
      stdout: output,
      siteRoot: process.cwd(),
      siteId: 'narada-proper',
    });

    input.write('{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"agent_context_memory.record_checkpoint","arguments":{"checkpoint_id":"checkpoint-refused","session_id":"session-refused","named_agent_id":"narada.architect","summary":"refused","source_import_refs":["C:/ProgramData/Narada/sites/pc/runtime/carrier-sessions/source.json"]}}}\n');
    await output.waitForLineCount(1);
    input.write('{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"agent_context_memory.read_checkpoint_summary","arguments":{"checkpoint_id":"checkpoint-missing"}}}\n');
    await output.waitForLineCount(2);
    input.end();
    await running;

    const refused = JSON.parse(JSON.parse(output.lines[0]).result.content[0].text);
    expect(refused).toMatchObject({
      status: 'error',
      error: 'denied_source_import_ref',
      mutationExecuted: false,
      sourceStateImported: false,
    });

    const readOnly = JSON.parse(JSON.parse(output.lines[1]).result.content[0].text);
    expect(readOnly).toMatchObject({
      status: 'not_found',
      checkpointId: 'checkpoint-missing',
      mutationAttempted: false,
      mutationExecuted: false,
    });
  });
});

class CaptureStream extends Writable {
  readonly lines: string[] = [];
  private buffer = '';
  private waiters: Array<() => void> = [];

  _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.buffer += chunk.toString('utf8');
    const parts = this.buffer.split(/\r?\n/);
    this.buffer = parts.pop() ?? '';
    this.lines.push(...parts.filter((line) => line.length > 0));
    this.waiters.splice(0).forEach((resolve) => resolve());
    callback();
  }

  waitForLineCount(count: number): Promise<void> {
    if (this.lines.length >= count) return Promise.resolve();
    return new Promise((resolve) => {
      this.waiters.push(() => {
        if (this.lines.length >= count) resolve();
        else this.waiters.push(resolve);
      });
    });
  }
}
