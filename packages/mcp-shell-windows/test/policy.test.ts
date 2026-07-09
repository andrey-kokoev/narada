import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnTestChild } from '@narada2/process-launch-posture';
import { buildWindowsShellEnvelope, decideWindowsShellPolicy } from '../src/index.js';
import { resolveAgentPathPolicy } from '../support/path-policy.mjs';

async function callShellServer(siteRoot: string, request: Record<string, unknown>) {
  const serverPath = fileURLToPath(new URL('../server.mjs', import.meta.url));
  const child = spawnTestChild(process.execPath, [serverPath, '--site-root', siteRoot], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  const response = new Promise<Record<string, unknown>>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`shell server response timed out; stderr=${stderr}`)), 3000);
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
      const line = stdout.split(/\r?\n/).find((entry) => entry.trim().length > 0);
      if (!line) return;
      clearTimeout(timeout);
      resolve(JSON.parse(line));
      child.kill();
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  child.stdin.write(`${JSON.stringify(request)}\n`);
  child.stdin.end();
  return await response;
}

describe('windows shell MCP descriptors', () => {
  it('allows descriptor-only read requests without granting live shell authority', () => {
    const envelope = buildWindowsShellEnvelope({
      command: 'Get-ChildItem',
      category: 'read_only',
      authority_basis: 'fixture-authority',
    });
    const decision = decideWindowsShellPolicy(envelope);

    expect(envelope.executed).toBe(false);
    expect(decision.status).toBe('allowed_descriptor');
    expect(decision.live_shell_authority_granted).toBe(false);
  });

  it('refuses raw WSL crossings and break-glass without local admission', () => {
    const decision = decideWindowsShellPolicy(buildWindowsShellEnvelope({
      command: 'wsl.exe',
      category: 'break_glass',
      authority_basis: 'fixture-authority',
    }));

    expect(decision.status).toBe('refused');
    expect(decision.reasons).toContain('raw_wsl_crossing_refused');
    expect(decision.reasons).toContain('break_glass_requires_receiving_site_admission');
  });

  it('makes support path-policy roster membership site opt-in', () => {
    const siteRoot = mkdtempSync(join(tmpdir(), 'narada-shell-path-policy-'));
    try {
      mkdirSync(join(siteRoot, '.ai', 'agents'), { recursive: true });
      const rosterPath = join(siteRoot, '.ai', 'agents', 'roster.json');

      writeFileSync(rosterPath, JSON.stringify({ agents: [] }), 'utf8');
      expect(resolveAgentPathPolicy(siteRoot, 'narada.architect')).toMatchObject({
        configured: false,
        allowed: true,
        roster_enforcement: 'disabled',
        reason: 'identity_not_in_roster_but_site_path_roster_enforcement_not_enabled',
      });

      writeFileSync(rosterPath, JSON.stringify({ enforce_agent_path_policy: true, agents: [] }), 'utf8');
      expect(resolveAgentPathPolicy(siteRoot, 'narada.architect')).toMatchObject({
        configured: true,
        allowed: false,
        roster_enforcement: 'enabled',
        error: 'path_policy_identity_not_in_roster: narada.architect',
      });
    } finally {
      rmSync(siteRoot, { recursive: true, force: true });
    }
  });

  it('makes execute_command payload creation discoverable in tools and refusal remediation', async () => {
    const siteRoot = mkdtempSync(join(tmpdir(), 'narada-shell-payload-discovery-'));
    try {
      const listResponse = await callShellServer(siteRoot, { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
      const tools = ((listResponse.result as { tools: Array<{ name: string; description?: string; inputSchema?: { properties?: Record<string, { description?: string }> } }> }).tools);
      const executeTool = tools.find((tool) => tool.name === 'execute_command');
      expect(tools.some((tool) => tool.name === 'mcp_payload_create')).toBe(true);
      expect(executeTool?.description).toContain('mcp_payload_create');
      expect(executeTool?.inputSchema?.properties?.payload_ref?.description).toContain('mcp_payload_create');

      const refusedResponse = await callShellServer(siteRoot, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'execute_command', arguments: {} },
      });
      expect((refusedResponse.error as { message: string }).message).toContain('execute_command_requires_payload_ref');
      expect((refusedResponse.error as { message: string }).message).toContain('mcp_payload_create');
    } finally {
      rmSync(siteRoot, { recursive: true, force: true });
    }
  });
});
