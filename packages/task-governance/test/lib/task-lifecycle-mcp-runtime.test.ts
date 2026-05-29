import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('task lifecycle MCP runtime packaging', () => {
  it('imports as a runtime module without starting stdio or opening a site store', async () => {
    const runtimePath = resolve(packageRoot, 'runtime/task-lifecycle/task-mcp-server.mjs');
    const result = spawnSync(
      process.execPath,
      ['-e', `import(${JSON.stringify(pathToFileURL(runtimePath).href)}).then((m) => console.log(Object.keys(m).sort().join(',')))`],
      { encoding: 'utf8', timeout: 3000 }
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('configureTaskLifecycleMcpRuntime');
    expect(result.stdout).toContain('handleTaskLifecycleMcpRequest');
    expect(result.stdout).toContain('runTaskLifecycleMcpStdioServer');
  });

  it('does not expose raw runtime internals through package wildcard exports', () => {
    const packageJson = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as {
      exports: Record<string, unknown>;
    };

    expect(Object.keys(packageJson.exports)).not.toContain('./runtime/task-lifecycle/*.mjs');
    expect(packageJson.exports).toHaveProperty('./task-lifecycle-mcp-server');
    expect(packageJson.exports).toHaveProperty('./task-lifecycle-runtime/unified-workboard');
    expect(packageJson.exports).toHaveProperty('./task-lifecycle-runtime/task-lifecycle-mutation-services');
  });
});
