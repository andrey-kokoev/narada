import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { listLaunchRegistrySites } from '../../src/lib/site-root-resolver.js';

const tempDirs: string[] = [];

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'site-root-resolver-'));
  tempDirs.push(dir);
  return dir;
}

function writeSiteConfig(root: string, config: unknown): void {
  writeFileSync(join(root, 'config.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function writeRegistry(path: string, agents: Array<Record<string, string>>): void {
  mkdirSync(join(path, '..'), { recursive: true });
  const blocks = agents.map((agent) => [
    '    @{',
    ...Object.entries(agent).map(([key, value]) => `      ${key} = "${value}"`),
    '      EnableNativeShell = $false',
    '    }',
  ].join('\n'));
  writeFileSync(path, ['@{', '  Agents = @(', ...blocks, '  )', '}', ''].join('\n'), 'utf8');
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('listLaunchRegistrySites identity precedence', () => {
  it('honors the declared static_config site_id when the record has no Site field', () => {
    const siteRoot = tempRoot();
    writeSiteConfig(siteRoot, { schema: 'narada.site.config.v0', static_config: { site_id: 'andrey-user' } });
    const registry = join(tempRoot(), 'agents.psd1');
    writeRegistry(registry, [{
      Agent: 'andrey-user.resident',
      Title: 'Andrey Resident',
      NaradaRoot: siteRoot,
      WorkspaceRoot: siteRoot,
      SiteRoot: siteRoot,
      Launcher: 'andrey-user.ps1',
      OperatorSurface: 'agent-web-ui',
      Runtime: 'narada-agent-runtime-server',
    }]);
    const sites = listLaunchRegistrySites(registry);
    expect(sites).toHaveLength(1);
    expect(sites[0]).toMatchObject({ site_root: siteRoot, site_id: 'andrey-user' });
  });

  it('keeps an explicit Site field ahead of the config declaration', () => {
    const siteRoot = tempRoot();
    writeSiteConfig(siteRoot, { schema: 'narada.site.config.v0', static_config: { site_id: 'narada-proper' } });
    const registry = join(tempRoot(), 'agents.psd1');
    writeRegistry(registry, [{
      Agent: 'narada.resident',
      Title: 'Narada Resident',
      Site: 'narada',
      NaradaRoot: siteRoot,
      SiteRoot: siteRoot,
      Launcher: 'narada.ps1',
      OperatorSurface: 'agent-web-ui',
      Runtime: 'narada-agent-runtime-server',
    }]);
    const sites = listLaunchRegistrySites(registry);
    expect(sites[0]).toMatchObject({ site_root: siteRoot, site_id: 'narada' });
  });

  it('falls back to directory-name inference when neither Site nor config declares an id', () => {
    const siteRoot = join(tempRoot(), 'Narada');
    mkdirSync(siteRoot, { recursive: true });
    const registry = join(tempRoot(), 'agents.psd1');
    writeRegistry(registry, [{
      Agent: 'andrey-user.Kevin',
      Title: 'Kevin',
      NaradaRoot: siteRoot,
      SiteRoot: siteRoot,
      Launcher: 'andrey-user.ps1',
      OperatorSurface: 'agent-web-ui',
      Runtime: 'narada-agent-runtime-server',
    }]);
    const sites = listLaunchRegistrySites(registry);
    expect(sites[0]?.site_id).toBe('narada');
  });
});
