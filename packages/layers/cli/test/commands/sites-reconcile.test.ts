import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { readFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  sitesReconcileAgentCliWrapperCommand,
  sitesReconcileToolSurfaceManifestCommand,
} from '../../src/commands/sites.js';
import type { CommandContext } from '../../src/lib/command-wrapper.js';

const tempRoots: string[] = [];

function createMockContext(): CommandContext {
  return {
    configPath: join(tmpdir(), 'narada-test-config.json'),
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      trace: vi.fn(),
    },
    verbose: false,
  };
}

async function createWorkspace(): Promise<{ workspaceRoot: string; siteControlRoot: string }> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'narada-sites-reconcile-'));
  tempRoots.push(workspaceRoot);
  const siteControlRoot = join(workspaceRoot, '.narada');
  await mkdir(siteControlRoot, { recursive: true });
  await writeFile(
    join(siteControlRoot, 'site.json'),
    JSON.stringify({ schema: 'narada.site.seed.v0', site_id: 'test' }),
    'utf8',
  );
  return { workspaceRoot, siteControlRoot };
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('sites reconcile', () => {
  it('keeps generated tools under the control root while publishing the workspace as site_root', async () => {
    const { workspaceRoot, siteControlRoot } = await createWorkspace();
    const context = createMockContext();

    const wrapperResult = await sitesReconcileAgentCliWrapperCommand(
      { root: siteControlRoot, apply: true, format: 'json' },
      context,
    );
    expect(wrapperResult.exitCode).toBe(0);
    expect(wrapperResult.result).toMatchObject({
      status: 'current',
      site_root: workspaceRoot,
      site_control_root: siteControlRoot,
      mutation_performed: true,
    });

    const wrapperPath = join(siteControlRoot, 'tools', 'operator-surface-carriers', 'Start-AgentCliSession.ps1');
    const wrapperText = await readFile(wrapperPath, 'utf8');
    expect(wrapperText).toContain('$SiteControlRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)');
    expect(wrapperText).toContain('$SiteRoot = Split-Path -Parent $SiteControlRoot');
    expect(wrapperText).toContain('Intelligence: resolved at invocation time from the Site registry');
    expect(wrapperText).not.toContain('[string]$IntelligenceProvider');

    const manifestResult = await sitesReconcileToolSurfaceManifestCommand(
      { root: siteControlRoot, apply: true, format: 'json' },
      context,
    );
    expect(manifestResult.exitCode).toBe(0);
    expect(manifestResult.result).toMatchObject({
      status: 'repaired',
      site_root: workspaceRoot,
      site_control_root: siteControlRoot,
      mutation_performed: true,
    });

    const manifest = JSON.parse(
      await readFile(join(siteControlRoot, 'site-tool-surface.manifest.json'), 'utf8'),
    ) as {
      site_root: string;
      tool_root: string;
      entries: Array<{ path: string; class: string; owner: string }>;
    };
    expect(manifest.site_root).toBe(workspaceRoot);
    expect(manifest.tool_root).toBe(join(siteControlRoot, 'tools'));
    expect(manifest.entries).toContainEqual(expect.objectContaining({
      path: 'tools/operator-surface-carriers/Start-AgentCliSession.ps1',
      class: 'generated_wrapper',
      owner: 'narada-proper',
    }));

    const workspaceWrapperReadback = await sitesReconcileAgentCliWrapperCommand(
      { root: workspaceRoot, format: 'json' },
      context,
    );
    expect(workspaceWrapperReadback.result).toMatchObject({
      status: 'current',
      site_root: workspaceRoot,
      site_control_root: siteControlRoot,
      mutation_performed: false,
    });

    const workspaceManifestReadback = await sitesReconcileToolSurfaceManifestCommand(
      { root: workspaceRoot, format: 'json' },
      context,
    );
    expect(workspaceManifestReadback.result).toMatchObject({
      status: 'current',
      site_root: workspaceRoot,
      site_control_root: siteControlRoot,
      mutation_performed: false,
    });
  });
});
