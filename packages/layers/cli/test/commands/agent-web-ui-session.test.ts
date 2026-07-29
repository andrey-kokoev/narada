import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAttachSessionId, AttachSessionDiscoveryError } from '../../src/commands/agent-web-ui-session.js';
import { silentCommandContext } from '../../src/lib/command-wrapper.js';

describe('agent-web-ui session resolution', () => {
  it('attaches to the exact session in a current launch binding', async () => {
    const root = await mkdtemp(join(tmpdir(), 'narada-web-ui-binding-'));
    const bindingPath = join(root, 'binding.json');
    try {
      await writeFile(bindingPath, JSON.stringify({
        schema: 'narada.operator_projection_launch_binding.v1',
        status: 'ready',
        updated_at: new Date().toISOString(),
        session_ref: { kind: 'runtime', id: 'runtime-linux-2391' },
        site_root: root,
        agent: 'linux-site.resident',
      }), 'utf8');

      const resolved = await resolveAttachSessionId({
        launchBindingPath: bindingPath,
        siteRoot: root,
        waitForSessionMs: 1000,
      }, silentCommandContext(), () => {});

      expect(resolved.sessionId).toBe('runtime-linux-2391');
      expect(resolved.reason).toBe('launch_binding');
      expect(resolved.selection.source).toBe('launch_binding');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps agent discovery site-scoped and rejects ambiguous matches', async () => {
    const sessions = [
      {
        session_id: 'old-site-session',
        agent_id: 'linux-site.resident',
        site_id: 'other-site',
        site_root: 'D:/other-site',
        display_state: 'active',
        health_status: 'healthy',
        terminal_state: null,
        started_at: '2026-07-28T00:00:00.000Z',
      },
      {
        session_id: 'target-site-session',
        agent_id: 'linux-site.resident',
        site_id: 'linux-site',
        site_root: 'D:/linux-site',
        display_state: 'active',
        health_status: 'healthy',
        terminal_state: null,
        started_at: '2026-07-28T01:00:00.000Z',
      },
    ];

    const resolved = await resolveAttachSessionId({
      agent: 'linux-site.resident',
      siteRoot: 'D:/linux-site',
    }, silentCommandContext(), () => {}, {
      discoverSessions: async () => ({ exitCode: 0, result: { sessions } }),
    });
    expect(resolved.sessionId).toBe('target-site-session');

    await expect(resolveAttachSessionId({
      agent: 'linux-site.resident',
      siteRoot: 'D:/linux-site',
      site: 'linux-site',
    }, silentCommandContext(), () => {}, {
      discoverSessions: async () => ({
        exitCode: 0,
        result: { sessions: [sessions[1], { ...sessions[1], session_id: 'second-target-session' }] },
      }),
    })).rejects.toMatchObject({
      reason: 'nars_session_ambiguous_for_agent',
    } satisfies Partial<AttachSessionDiscoveryError>);
  });
});
