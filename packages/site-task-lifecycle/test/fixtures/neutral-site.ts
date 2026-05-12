import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { NeutralIdentity, SiteTaskLifecycleInitOptions } from '../../src/index.js';

export const neutralRoster: NeutralIdentity[] = [
  { identityId: 'site-alpha.Ada', role: 'architect' },
  { identityId: 'site-alpha.BuilderOne', role: 'builder' },
  { identityId: 'site-beta.Reviewer', role: 'reviewer' },
];

export async function createNeutralInitOptions(
  overrides: Partial<SiteTaskLifecycleInitOptions> = {},
): Promise<SiteTaskLifecycleInitOptions> {
  const siteRoot = overrides.siteRoot ?? await mkdtemp(join(tmpdir(), 'narada-site-task-lifecycle-'));
  return {
    siteRoot,
    siteId: 'site-alpha',
    initializedBy: 'site-alpha.Ada',
    roster: neutralRoster,
    now: '2026-05-10T00:00:00.000Z',
    ...overrides,
  };
}
