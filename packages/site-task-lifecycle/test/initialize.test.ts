import { readFile, rm, stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { initializeSiteTaskLifecycle, planSiteTaskLifecyclePaths } from '../src/index.js';
import { createNeutralInitOptions } from './fixtures/neutral-site.js';

describe('initializeSiteTaskLifecycle', () => {
  it('initializes receiving-Site task lifecycle directories and admission manifest', async () => {
    const options = await createNeutralInitOptions();
    try {
      const result = await initializeSiteTaskLifecycle(options);
      const paths = planSiteTaskLifecyclePaths(options.siteRoot);

      expect(result.status).toBe('initialized');
      expect(result.siteId).toBe('site-alpha');
      expect(result.paths).toEqual(paths);
      await expect(stat(paths.taskSpecDir)).resolves.toMatchObject({ isDirectory: expect.any(Function) });

      const manifest = JSON.parse(await readFile(paths.manifestPath, 'utf8')) as {
        schema: string;
        roster: Array<{ identityId: string }>;
        rejectedSourceImports: string[];
      };
      expect(manifest.schema).toBe('narada.site_task_lifecycle.admission.v0');
      expect(manifest.roster.map((identity) => identity.identityId)).toEqual([
        'site-alpha.Ada',
        'site-alpha.BuilderOne',
        'site-beta.Reviewer',
      ]);
      expect(manifest.rejectedSourceImports).toContain('source task lifecycle databases');
    } finally {
      await rm(options.siteRoot, { recursive: true, force: true });
    }
  });
});
