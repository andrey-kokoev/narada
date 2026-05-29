#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const siteRoot = resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : process.cwd());
const flags = new Set(process.argv.filter((arg) => arg.startsWith('--')));
const outputJson = flags.has('--json');
const strict = flags.has('--strict');

const checks = [
  {
    id: 'mcp_only_surfaces',
    claim: 'AGENTS.md says agents are MCP-only for shell/script/filesystem execution.',
    evidence: [
      fileContains('AGENTS.md', ['MCP-only for script execution', 'mcp_only']),
      fileContains('tools/mcp-servers/shell/shell-mcp-server.mjs', ['capability_policy', 'direct_substrate_shell_access']),
      fileExists('tools/mcp-servers/filesystem/filesystem-mcp-server.mjs'),
      fileExists('tools/mcp-servers/test/test-mcp-server.mjs'),
    ],
  },
  {
    id: 'task_lifecycle_authority',
    claim: 'Task lifecycle mutations are MCP-only and mechanically identity-gated.',
    evidence: [
      fileContains('AGENTS.md', ['Agents MUST use the MCP server for all task lifecycle mutations', 'identity_mismatch']),
      fileContains('tools/task-lifecycle/task-mcp-server.mjs', ['enforceSessionIdentity', 'identity_mismatch_blocked']),
      fileContains('tools/task-lifecycle/mcp-guard.mjs', ['mcp_guard_violation']),
    ],
  },
  {
    id: 'inbox_routing',
    claim: 'Inbox routing is represented through canonical inbox MCP/read-path surfaces.',
    evidence: [
      fileContains('AGENTS.md', ['Inbox Routing', 'inbox_list', 'inbox_next']),
      registrySurface('inbox-mcp.local', ['inbox_list', 'inbox_next', 'capability_next']),
      fileExists('kb/operations/inbox-read-path-architecture.md'),
    ],
  },
  {
    id: 'operator_prohibition_persistence',
    claim: 'AGENTS.md says explicit Operator stop/prohibition instructions persist until explicitly lifted or narrowed.',
    evidence: [
      fileContains('AGENTS.md', ['explicit Operator stop, pause, prohibition', 'persists across turns until the Operator explicitly lifts or narrows it', 'Later task-like requests, generic continuation language']),
    ],
  },
  {
    id: 'security_sensitive_identity_values',
    claim: 'Agent identity doctrine forbids inventing security-sensitive authority values from examples or naming patterns.',
    evidence: [
      fileContains('AGENTS.md', ['Security-Sensitive Values Are Not Inferred', 'Examples, naming patterns', 'Do not synthesize replacements']),
      fileContains('docs/concepts/agent-identity.md', ['Examples and naming patterns are not authority', 'MUST NOT be promoted into an admissible', 'authorized read surface']),
    ],
  },
  {
    id: 'agent_bootstrap',
    claim: 'Agent startup and rehydration are exposed through agent-context MCP bootstrap/hydrate tools.',
    evidence: [
      fileContains('AGENTS.md', ['agent_context_hydrate_current', 'agent_context_show_bootstrap']),
      fileContains('tools/agent-context/agent-context-mcp-server.mjs', ['agent_context_hydrate_current', 'agent_context_show_bootstrap']),
      fileExists('tools/agent-context/session-start.mjs'),
    ],
  },
  {
    id: 'operator_surface_projection_authority',
    claim: 'Operator-surface authority is SQLite-owned and JSON files are compatibility projections.',
    evidence: [
      fileContains('AGENTS.md', ['Operator Surface SQLite Authority And JSON Projections', 'compatibility projections']),
      registrySurface('operator-surface-mcp.local', ['operator_surface_project_osl_state']),
      fileContains('tools/operator-surface/operator-surface-mcp-server.mjs', ['operator_surface_project_osl_state', 'operator_surface_register']),
    ],
  },
  {
    id: 'is_navigation_choice_protocol',
    claim: 'Inquiry-space navigation choices are represented in AGENTS.md and concept documentation.',
    evidence: [
      fileContains('AGENTS.md', ['IS Navigation Choice Protocol', 'Inquiry Space Nodes', 'Depth-first', 'Breadth-first', 'Back-up-the-chain']),
      fileContains('docs/concepts/inquiry-space.md', ['Inquiry Space Node', 'ISN Lifecycle', 'IS Navigation Choice Invariant', 'Depth-first', 'Breadth-first', 'Back-up-the-chain']),
    ],
  },
];

const results = checks.map(evaluateCheck);
const summary = {
  pass: results.filter((r) => r.status === 'pass').length,
  fail: results.filter((r) => r.status === 'fail').length,
  unknown: results.filter((r) => r.status === 'unknown').length,
};
const payload = {
  schema: 'narada.agents_posture_audit.v0',
  site_root: siteRoot,
  generated_at: new Date().toISOString(),
  status: summary.fail > 0 ? 'fail' : (summary.unknown > 0 ? 'unknown' : 'pass'),
  summary,
  checks: results,
};

if (outputJson) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
} else {
  process.stdout.write(renderHuman(payload));
}

if (strict && payload.status !== 'pass') {
  process.exit(1);
}

function evaluateCheck(check) {
  const evidence = check.evidence.map((entry) => entry());
  let status = 'pass';
  if (evidence.some((item) => item.status === 'fail')) status = 'fail';
  else if (evidence.some((item) => item.status === 'unknown')) status = 'unknown';
  return { id: check.id, status, claim: check.claim, evidence };
}

function fileExists(relativePath) {
  return () => {
    const absolutePath = join(siteRoot, relativePath);
    return {
      status: existsSync(absolutePath) ? 'pass' : 'fail',
      path: relativePath,
      assertion: 'file_exists',
    };
  };
}

function fileContains(relativePath, needles) {
  return () => {
    const absolutePath = join(siteRoot, relativePath);
    if (!existsSync(absolutePath)) {
      return { status: 'fail', path: relativePath, assertion: 'file_contains', missing: needles, reason: 'file_missing' };
    }
    const text = readFileSync(absolutePath, 'utf8');
    const missing = needles.filter((needle) => !text.includes(needle));
    return {
      status: missing.length === 0 ? 'pass' : 'fail',
      path: relativePath,
      assertion: 'file_contains',
      needles,
      missing,
    };
  };
}

function registrySurface(surfaceId, expectedTools) {
  return () => {
    const relativePath = '.narada/capabilities/mcp-surfaces.json';
    const absolutePath = join(siteRoot, relativePath);
    if (!existsSync(absolutePath)) {
      return { status: 'fail', path: relativePath, assertion: 'registry_surface', surface_id: surfaceId, reason: 'file_missing' };
    }
    let registry;
    try {
      registry = JSON.parse(readFileSync(absolutePath, 'utf8'));
    } catch (error) {
      return { status: 'fail', path: relativePath, assertion: 'registry_surface', surface_id: surfaceId, reason: `json_parse_failed: ${error.message}` };
    }
    const surface = Array.isArray(registry.surfaces)
      ? registry.surfaces.find((entry) => entry.surface_id === surfaceId)
      : null;
    if (!surface) {
      return { status: 'fail', path: relativePath, assertion: 'registry_surface', surface_id: surfaceId, reason: 'surface_missing' };
    }
    const exposed = surface.tool_contract?.exposed_tools ?? [];
    const missing = expectedTools.filter((tool) => !exposed.includes(tool));
    return {
      status: missing.length === 0 ? 'pass' : 'fail',
      path: relativePath,
      assertion: 'registry_surface_tools',
      surface_id: surfaceId,
      expected_tools: expectedTools,
      missing,
    };
  };
}

function renderHuman(payload) {
  const lines = [];
  lines.push(`AGENTS posture audit: ${payload.status}`);
  lines.push(`Summary: pass=${payload.summary.pass} fail=${payload.summary.fail} unknown=${payload.summary.unknown}`);
  lines.push('');
  for (const check of payload.checks) {
    lines.push(`- ${check.status.toUpperCase()} ${check.id}`);
    lines.push(`  ${check.claim}`);
    for (const evidence of check.evidence) {
      const suffix = evidence.missing?.length ? ` missing=${evidence.missing.join(', ')}` : '';
      lines.push(`  ${evidence.status}: ${evidence.path} (${evidence.assertion})${suffix}`);
    }
  }
  return `${lines.join('\n')}\n`;
}
