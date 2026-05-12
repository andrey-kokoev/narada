import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  assertNeutralIdentities,
  assertNoDeniedSourceImports,
  findDeniedSourceImports,
} from './import-refusal.js';
import type { SiteTaskLifecycleInitOptions, SiteTaskLifecycleInitResult, SiteTaskLifecyclePaths } from './types.js';

export function planSiteTaskLifecyclePaths(siteRoot: string): SiteTaskLifecyclePaths {
  const root = resolve(siteRoot);
  return {
    siteRoot: root,
    taskDbPath: join(root, '.ai', 'task-lifecycle.db'),
    taskSpecDir: join(root, '.ai', 'do-not-open', 'tasks'),
    manifestPath: join(root, '.ai', 'site-task-lifecycle-admission.json'),
  };
}

export async function initializeSiteTaskLifecycle(
  options: SiteTaskLifecycleInitOptions,
): Promise<SiteTaskLifecycleInitResult> {
  assertNoDeniedSourceImports(options.sourceImportRefs ?? []);
  assertNeutralIdentities(options.roster);

  const initializedAt = options.now ?? new Date().toISOString();
  const paths = planSiteTaskLifecyclePaths(options.siteRoot);
  await mkdir(join(paths.siteRoot, '.ai'), { recursive: true });
  await mkdir(paths.taskSpecDir, { recursive: true });

  const rejectedSourceImports = [
    'source task lifecycle databases',
    'source task history',
    'source inbox databases and envelopes',
    'source rosters',
    'source checkpoints and agent-context databases',
    'source operator-surface bindings',
    'PC-locus runtime state',
    'secrets and credentials',
  ];

  const result: SiteTaskLifecycleInitResult = {
    status: 'initialized',
    siteId: options.siteId,
    initializedBy: options.initializedBy,
    initializedAt,
    paths,
    roster: options.roster,
    rejectedSourceImports,
  };

  await writeFile(paths.manifestPath, `${JSON.stringify({
    schema: 'narada.site_task_lifecycle.admission.v0',
    ...result,
    deniedSourceImportFindings: findDeniedSourceImports(options.sourceImportRefs ?? []),
  }, null, 2)}\n`, 'utf8');

  return result;
}
