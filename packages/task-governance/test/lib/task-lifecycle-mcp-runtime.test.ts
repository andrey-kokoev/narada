import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHiddenPostureCommandSync } from '@narada2/process-launch-posture';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('task lifecycle MCP runtime cutover', () => {
  it('does not expose the retired task lifecycle MCP server export', () => {
    const packageJson = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as {
      exports: Record<string, unknown>;
    };

    expect(packageJson.exports).not.toHaveProperty('./task-lifecycle-mcp-server');
    expect(Object.keys(packageJson.exports).filter((key) => key.startsWith('./task-lifecycle-runtime/'))).toEqual([]);
  });

  it('fails clearly when the stale runtime file is executed directly', () => {
    const runtimePath = resolve(packageRoot, 'runtime/task-lifecycle/task-mcp-server.mjs');
    const result = runHiddenPostureCommandSync(process.execPath, [runtimePath], { encoding: 'utf8', timeout: 3000, posture: 'test_child' });

    expect(result.status).toBe(64);
    expect(result.stderr).toContain('retired_task_lifecycle_mcp_entrypoint');
    expect(result.stderr).toContain('@narada2/task-lifecycle-mcp');
  });
});
