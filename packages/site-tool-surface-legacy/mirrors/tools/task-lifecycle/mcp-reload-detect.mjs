/**
 * Detect whether MCP server source files have changed since a given baseline.
 * Returns a signal that agents (or operators) can use to decide whether to restart MCP servers.
 *
 * Usage: node mcp-reload-detect.mjs [cwd] [baseline-file]
 *
 * Baseline file defaults to .ai/tmp/mcp-baseline.json (written by mcp-reload-request.mjs).
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const cwd = resolve(process.argv[2] || process.cwd());
const baselinePath = process.argv[3] || join(cwd, '.ai', 'tmp', 'mcp-baseline.json');

const MCP_SOURCE_GLOBS = [
  'tools/typed-mcp/*.mjs',
  'tools/task-lifecycle/*.mjs',
  'tools/agent-context/*.mjs',
  'tools/operator-surface/*.mjs',
];

function getMcpSourceFiles() {
  const files = new Set();
  for (const glob of MCP_SOURCE_GLOBS) {
    try {
      const out = execSync(`git ls-files ${glob}`, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      out.split('\n').filter(l => l.trim()).forEach(f => files.add(join(cwd, f.trim())));
    } catch {
      // ignore
    }
  }
  return Array.from(files);
}

function getMaxMtime(files) {
  let max = 0;
  for (const f of files) {
    try {
      const s = statSync(f);
      if (s.mtimeMs > max) max = s.mtimeMs;
    } catch {
      // ignore
    }
  }
  return max;
}

const sourceFiles = getMcpSourceFiles();
const currentMaxMtime = getMaxMtime(sourceFiles);

let baselineMtime = 0;
if (existsSync(baselinePath)) {
  try {
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
    baselineMtime = baseline.baseline_mtime || 0;
  } catch {
    // ignore
  }
}

const restartNeeded = currentMaxMtime > baselineMtime;

console.log(JSON.stringify({
  schema: 'narada.mcp.reload_detect.v0',
  restart_needed: restartNeeded,
  source_files_count: sourceFiles.length,
  current_max_mtime: currentMaxMtime,
  baseline_mtime: baselineMtime,
  baseline_path: baselinePath,
}, null, 2));

process.exit(restartNeeded ? 1 : 0);
