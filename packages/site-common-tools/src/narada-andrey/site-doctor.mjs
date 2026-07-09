#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { runGovernedCommandSync } from '@narada2/process-launch-posture';
import { validateAgentExecutionPolicy } from '../site-config/agent-execution-policy.mjs';
import { taskLifecycleReadinessPaths } from '../task-lifecycle-mcp-resolution.mjs';

const args = parseArgs(process.argv.slice(2));
const siteRoot = resolve(args.siteRoot ?? process.cwd());

const checks = [];
checks.push(registryValidation());
checks.push(agentExecutionPolicy());
checks.push(routingConfiguration());
checks.push(inboxBacklog());
checks.push(gitWorktree());
checks.push(taskLifecycleReadiness());
checks.push(agentContextReadiness());
checks.push(mcpAvailability());

const blocking = checks.filter((check) => check.severity === 'blocking' && check.status !== 'pass');
const warnings = checks.filter((check) => check.severity === 'advisory' && check.status !== 'pass');
const result = {
  schema: 'narada.site.readiness.v0',
  status: blocking.length > 0 ? 'blocked' : warnings.length > 0 ? 'attention' : 'ready',
  generated_at: new Date().toISOString(),
  site_root: siteRoot,
  summary: {
    blocking_count: blocking.length,
    advisory_count: warnings.length,
    check_count: checks.length,
  },
  checks,
  blocking_failures: blocking.map(({ id, title, evidence }) => ({ id, title, evidence })),
  advisory_warnings: warnings.map(({ id, title, evidence }) => ({ id, title, evidence })),
};

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(`${result.status}: ${result.summary.blocking_count} blocking, ${result.summary.advisory_count} advisory\n`);
  for (const check of checks) {
    process.stdout.write(`${check.status.padEnd(9)} ${check.severity.padEnd(8)} ${check.id} - ${check.title}\n`);
  }
}

function registryValidation() {
  const script = join(siteRoot, 'tools', 'typed-mcp', 'validate-mcp-surface-registry.mjs');
  if (!existsSync(script)) return check('mcp_registry_validation', 'MCP registry validation', 'blocking', 'fail', { reason: 'validator_missing', path: script });
  const run = runGovernedCommandSync(process.execPath, [script], { cwd: siteRoot, encoding: 'utf8' });
  return check('mcp_registry_validation', 'MCP registry validation', 'blocking', run.status === 0 ? 'pass' : 'fail', {
    exit_code: run.status,
    stdout: run.stdout.trim(),
    stderr: run.stderr.trim(),
  });
}

function agentExecutionPolicy() {
  try {
    const result = validateAgentExecutionPolicy(siteRoot);
    return check('agent_execution_policy', 'Agent execution allowlist policy', 'blocking', result.status === 'ok' ? 'pass' : 'fail', result);
  } catch (error) {
    return check('agent_execution_policy', 'Agent execution allowlist policy', 'blocking', 'fail', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function routingConfiguration() {
  const agentsPath = join(siteRoot, 'AGENTS.md');
  const text = existsSync(agentsPath) ? readFileSync(agentsPath, 'utf8') : '';
  const hasBuilderRouting = text.includes('Builder Upstream Routing');
  const hasTaskClaimPolicy = text.includes('Task Claim Authority Policy');
  return check('routing_configuration', 'Routing and claim authority guidance', 'blocking', hasBuilderRouting && hasTaskClaimPolicy ? 'pass' : 'fail', {
    agents_path: agentsPath,
    builder_upstream_routing: hasBuilderRouting,
    task_claim_authority_policy: hasTaskClaimPolicy,
  });
}

function inboxBacklog() {
  const inboxRoot = join(siteRoot, 'inbox');
  const total = existsSync(inboxRoot) ? countMatchingFiles(inboxRoot, (path) => path.endsWith('.json') || path.endsWith('.md')) : 0;
  return check('inbox_backlog', 'Inbox backlog visibility', 'advisory', total > 0 ? 'warn' : 'pass', {
    inbox_root: inboxRoot,
    discovered_records: total,
    note: total > 0 ? 'Backlog is visible; inspect inbox MCP/read-path for priorities.' : 'No inbox records discovered by filesystem fallback.',
  });
}

function gitWorktree() {
  const run = runGovernedCommandSync('git', ['status', '--short'], { cwd: siteRoot, encoding: 'utf8' });
  if (run.status !== 0) return check('git_worktree', 'Git worktree status', 'blocking', 'fail', { exit_code: run.status, stderr: run.stderr.trim() });
  const files = run.stdout.split(/\r?\n/).filter(Boolean);
  return check('git_worktree', 'Git worktree status', 'advisory', files.length > 0 ? 'warn' : 'pass', {
    dirty_count: files.length,
    dirty_files: files.slice(0, 50),
  });
}

function taskLifecycleReadiness() {
  const db = join(siteRoot, '.ai', 'task-lifecycle.db');
  const readiness = taskLifecycleReadinessPaths(siteRoot);
  const server = readiness.resolved_server;
  return check('task_lifecycle_readiness', 'Task lifecycle DB and MCP server', 'blocking', existsSync(db) && server ? 'pass' : 'fail', {
    db_path: db,
    db_exists: existsSync(db),
    server_path: server?.server_path ?? readiness.local_server_path,
    server_exists: Boolean(server),
    local_server_path: readiness.local_server_path,
    package_bin_path: readiness.package_bin_path,
    configured_server_path: readiness.configured_server_path,
    resolution_source: server?.source ?? null,
  });
}

function agentContextReadiness() {
  const db = join(siteRoot, '.ai', 'state', 'agent-context.sqlite');
  const server = join(siteRoot, 'tools', 'agent-context', 'agent-context-mcp-server.mjs');
  return check('agent_context_readiness', 'Agent context DB and MCP server', 'blocking', existsSync(db) && existsSync(server) ? 'pass' : 'fail', {
    db_path: db,
    db_exists: existsSync(db),
    server_path: server,
    server_exists: existsSync(server),
  });
}

function mcpAvailability() {
  const registryPath = join(siteRoot, '.narada', 'capabilities', 'mcp-surfaces.json');
  if (!existsSync(registryPath)) return check('mcp_availability', 'Declared MCP surface entrypoints', 'blocking', 'fail', { registry_path: registryPath, reason: 'registry_missing' });
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  const surfaces = Array.isArray(registry.surfaces) ? registry.surfaces : [];
  const expected = ['task-lifecycle-mcp.local', 'agent-context-mcp.local', 'inbox-mcp.local', 'operator-surface-mcp.local'];
  const declared = expected.map((surfaceId) => {
    const surface = surfaces.find((candidate) => candidate.surface_id === surfaceId);
    const entrypoint = surface?.runtime_binding?.entrypoint;
    return {
      surface_id: surfaceId,
      declared: Boolean(surface),
      entrypoint,
      entrypoint_exists: entrypoint ? existsSync(join(siteRoot, entrypoint)) : false,
    };
  });
  const ok = declared.every((entry) => entry.declared && entry.entrypoint_exists);
  return check('mcp_availability', 'Declared MCP surface entrypoints', 'blocking', ok ? 'pass' : 'fail', { registry_path: registryPath, surfaces: declared });
}

function check(id, title, severity, status, evidence) {
  return { id, title, severity, status, evidence };
}

function countMatchingFiles(root, predicate) {
  let count = 0;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) count += countMatchingFiles(path, predicate);
    else if ((entry.isFile() || statSync(path).isFile()) && predicate(path)) count += 1;
  }
  return count;
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--site-root' && argv[i + 1]) { parsed.siteRoot = argv[i + 1]; i += 1; }
    else if (arg === '--json') parsed.json = true;
  }
  return parsed;
}
