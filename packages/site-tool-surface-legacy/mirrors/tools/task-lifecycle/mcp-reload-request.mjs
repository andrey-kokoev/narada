/**
 * Request an MCP server restart by writing a baseline file.
 * After mutating MCP server code, agents run this to signal that restart is needed.
 * The operator (or Kimi CLI) must then restart the MCP server processes.
 *
 * Usage: node mcp-reload-request.mjs [cwd]
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const cwd = resolve(process.argv[2] || process.cwd());
const baselinePath = join(cwd, '.ai', 'tmp', 'mcp-baseline.json');

try {
  mkdirSync(join(cwd, '.ai', 'tmp'), { recursive: true });
} catch {
  // ignore
}

const payload = {
  schema: 'narada.mcp.reload_request.v0',
  requested_at: new Date().toISOString(),
  baseline_mtime: Date.now(),
  note: 'MCP server source files were modified. Restart the stdio MCP servers in Kimi CLI settings to pick up changes.',
};

writeFileSync(baselinePath, JSON.stringify(payload, null, 2), 'utf8');

console.log(JSON.stringify({
  status: 'ok',
  message: payload.note,
  baseline_path: baselinePath,
  requested_at: payload.requested_at,
}, null, 2));
