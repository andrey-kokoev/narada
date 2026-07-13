import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkWorkspaceDependencyPreflight,
  formatWorkspaceDependencyPreflightFailure,
} from '../../src/lib/workspace-dependency-preflight.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('workspace dependency preflight', () => {
  it('reports missing workspace links with a deterministic frozen-install repair', async () => {
    const root = join(process.cwd(), '.ai', 'tmp-tests', `workspace-preflight-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    temporaryRoots.push(root);
    await mkdir(join(root, 'packages', 'layers', 'cli'), { recursive: true });
    await mkdir(join(root, 'packages', 'agent-start'), { recursive: true });
    await writeFile(join(root, 'packages', 'layers', 'cli', 'package.json'), JSON.stringify({
      name: '@narada2/cli',
      dependencies: { '@narada2/missing-package': 'workspace:*' },
    }));
    await writeFile(join(root, 'packages', 'agent-start', 'package.json'), JSON.stringify({
      name: '@narada2/agent-start',
      dependencies: {},
    }));

    const result = checkWorkspaceDependencyPreflight(root);

    expect(result.status).toBe('not_ready');
    expect(result.missing).toEqual([
      expect.objectContaining({
        package_name: '@narada2/missing-package',
        importer: '@narada2/cli',
      }),
    ]);
    expect(formatWorkspaceDependencyPreflightFailure(result)).toContain('pnpm install --frozen-lockfile');
  });

  it('traverses installed workspace links before reporting transitive gaps', async () => {
    const root = join(process.cwd(), '.ai', 'tmp-tests', `workspace-preflight-transitive-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    temporaryRoots.push(root);
    await mkdir(join(root, 'packages', 'layers', 'cli'), { recursive: true });
    await mkdir(join(root, 'packages', 'agent-start'), { recursive: true });
    await mkdir(join(root, 'node_modules', '@narada2', 'transitive-package'), { recursive: true });
    await writeFile(join(root, 'packages', 'layers', 'cli', 'package.json'), JSON.stringify({
      name: '@narada2/cli',
      dependencies: { '@narada2/transitive-package': 'workspace:*' },
    }));
    await writeFile(join(root, 'packages', 'agent-start', 'package.json'), JSON.stringify({
      name: '@narada2/agent-start',
      dependencies: {},
    }));
    await writeFile(join(root, 'node_modules', '@narada2', 'transitive-package', 'package.json'), JSON.stringify({
      name: '@narada2/transitive-package',
      dependencies: { '@narada2/missing-transitive-package': 'workspace:*' },
    }));

    const result = checkWorkspaceDependencyPreflight(root);

    expect(result.status).toBe('not_ready');
    expect(result.missing).toEqual([
      expect.objectContaining({
        package_name: '@narada2/missing-transitive-package',
        importer: '@narada2/transitive-package',
      }),
    ]);
  });
});
