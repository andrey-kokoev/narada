import { describe, expect, it, vi } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createSiteAgentLaunchDiagnostics,
  SITE_AGENT_LAUNCH_FAILURE_ARTIFACT_SCHEMA,
} from '../../src/commands/site-agent-launch-diagnostics.js';

describe('site-agent launch diagnostics', () => {
  it('persists a redacted structured failure and emits a correlated log line', async () => {
    const root = mkdtempSync(join(tmpdir(), 'site-agent-failure-'));
    const log = vi.fn();
    const diagnostics = createSiteAgentLaunchDiagnostics({ root, log });
    const recorded = await diagnostics.recordFailure({
      requestId: 'request-1',
      siteId: 'sonar',
      agentId: 'sonar.resident',
      phase: 'workspace_launch',
      code: 'workspace_launch_exit',
      error: new Error('provider failed api_key=secret-value'),
      context: { exit_code: 1, workspace_result_path: 'D:/runtime/result.json' },
    });

    expect(recorded.failure).toMatchObject({
      phase: 'workspace_launch',
      code: 'workspace_launch_exit',
      message: 'provider failed api_key=<redacted>',
      diagnostic_ref: expect.any(String),
    });
    if (!recorded.artifactPath) throw new Error('expected a failure artifact');
    const artifact = await readFile(recorded.artifactPath, 'utf8');
    expect(JSON.parse(artifact)).toMatchObject({
      schema: SITE_AGENT_LAUNCH_FAILURE_ARTIFACT_SCHEMA,
      request_id: 'request-1',
      site_id: 'sonar',
      agent_id: 'sonar.resident',
      error: { message: 'provider failed api_key=<redacted>' },
      context: { exit_code: 1, workspace_result_path: 'D:/runtime/result.json' },
    });
    expect(artifact).not.toContain('secret-value');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"request_id":"request-1"'));
  });

  it('keeps only the configured number of recent artifacts', async () => {
    const root = mkdtempSync(join(tmpdir(), 'site-agent-failure-retention-'));
    const diagnostics = createSiteAgentLaunchDiagnostics({ root, maxArtifacts: 2, log: vi.fn() });
    for (let index = 0; index < 3; index += 1) {
      await diagnostics.recordFailure({
        requestId: `request-${index}`,
        siteId: 'sonar',
        agentId: 'sonar.resident',
        phase: 'workspace_launch',
        code: 'workspace_launch_failed',
        message: `failure-${index}`,
      });
    }
    const files = (await readdir(root)).filter((entry) => entry.endsWith('.json'));
    expect(files).toHaveLength(2);
  });
});
