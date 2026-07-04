import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sitesDepsSyncCommand } from '../../src/commands/sites.js';
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

async function createContainedSiteRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'narada-site-deps-sync-'));
  tempRoots.push(root);
  const siteRoot = join(root, '.narada');
  await mkdir(siteRoot, { recursive: true });
  await writeFile(join(siteRoot, 'site.json'), JSON.stringify({ schema: 'narada.site.seed.v0', site_id: 'test' }), 'utf8');
  return siteRoot;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('sites deps-sync', () => {
  it('points site-local mcp transport dependency at the current shared package locus', async () => {
    const siteRoot = await createContainedSiteRoot();

    const result = await sitesDepsSyncCommand({ root: siteRoot, format: 'json' }, createMockContext());

    expect(result.exitCode).toBe(0);
    const body = result.result as {
      packages: Array<{ package_name: string; source_locus: string; status: string }>;
    };
    const mcpTransport = body.packages.find((record) => record.package_name === '@narada2/mcp-transport');
    expect(mcpTransport?.status).toBe('stale');
    expect(mcpTransport?.source_locus.replaceAll('\\', '/')).toMatch(/mcp-surfaces\/packages\/shared\/mcp-transport$/);
  });
});
