import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function waitFor(predicate, { timeoutMs = 1000 } = {}) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (predicate()) return resolve();
      if (Date.now() - startedAt > timeoutMs) return reject(new Error('waitFor timed out'));
      setTimeout(poll, 5);
    };
    poll();
  });
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function readJsonl(path) {
  return readFileSync(path, 'utf8')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function removeTempDir(path) {
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch (error) {
    if (error?.code === 'EBUSY' || error?.code === 'ENOTEMPTY') return;
    throw error;
  }
}

export function writeFixtureMcpSurface(siteRoot, { failToolCall = false } = {}) {
  mkdirSync(join(siteRoot, '.ai', 'mcp'), { recursive: true });
  mkdirSync(join(siteRoot, '.narada', 'capabilities'), { recursive: true });
  mkdirSync(join(siteRoot, 'tools'), { recursive: true });
  writeFileSync(join(siteRoot, 'tools', 'fixture-mcp.mjs'), `
let buffer = '';
const failToolCall = ${JSON.stringify(failToolCall)};
function write(message) {
  process.stdout.write(JSON.stringify(message) + '\\n');
}
function handle(request) {
  if (request.method === 'initialize') {
    write({ jsonrpc: '2.0', id: request.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'narada-fixture-mcp', version: '0.0.0-test' } } });
    return;
  }
  if (request.method === 'tools/list') {
    write({ jsonrpc: '2.0', id: request.id, result: { tools: [{ name: 'fixture_read', description: 'Read deterministic fixture data', inputSchema: { type: 'object', properties: { topic: { type: 'string' } } } }] } });
    return;
  }
  if (request.method === 'tools/call') {
    if (failToolCall) {
      write({ jsonrpc: '2.0', id: request.id, error: { code: -32000, message: 'fixture_mcp_forced_failure' } });
      setTimeout(() => process.exit(0), 0);
      return;
    }
    write({ jsonrpc: '2.0', id: request.id, result: { content: [{ type: 'text', text: JSON.stringify({ status: 'ok', tool: request.params?.name, topic: request.params?.arguments?.topic ?? null }) }] } });
    setTimeout(() => process.exit(0), 0);
    return;
  }
  write({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'unsupported method ' + request.method } });
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let newlineIndex;
  while ((newlineIndex = buffer.indexOf('\\n')) !== -1) {
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);
    if (!line) continue;
    handle(JSON.parse(line));
  }
});
`, 'utf8');
  writeFileSync(join(siteRoot, '.ai', 'mcp', 'fixture-mcp.json'), `${JSON.stringify({
    schema: 'narada.mcp.client_config.v0',
    mcpServers: {
      'narada-fixture': {
        command: 'node',
        args: ['{site_root}/tools/fixture-mcp.mjs'],
        surface_id: 'fixture.surface',
        target_site_root: '{site_root}',
      },
    },
  }, null, 2)}\n`, 'utf8');
  writeFileSync(join(siteRoot, '.narada', 'capabilities', 'mcp-surfaces.json'), `${JSON.stringify({
    schema: 'narada.site.capabilities.mcp_surfaces.v1',
    surfaces: [{
      surface_id: 'fixture.surface',
      client_config: { generated_path: '.ai/mcp/fixture-mcp.json' },
      tool_contract: {
        read_only_tools: ['fixture_read'],
        mutating_tools: [],
        refused_tools: [],
      },
    }],
  }, null, 2)}\n`, 'utf8');
}

export function tempRoot(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}
