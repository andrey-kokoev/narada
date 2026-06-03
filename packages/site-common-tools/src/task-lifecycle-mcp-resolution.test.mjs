import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolveTaskLifecycleMcpServer } from './task-lifecycle-mcp-resolution.mjs';

async function withSite(fn) {
  const siteRoot = await mkdtemp(join(tmpdir(), 'narada-task-lifecycle-resolution-'));
  try {
    await fn(siteRoot);
  } finally {
    await rm(siteRoot, { recursive: true, force: true });
  }
}

test('task lifecycle MCP resolution prefers explicit env server', async () => {
  await withSite(async (siteRoot) => {
    const configuredServer = join(siteRoot, 'configured-task-mcp-server.js');
    await writeFile(configuredServer, '');

    const server = resolveTaskLifecycleMcpServer(siteRoot, {
      NARADA_TASK_LIFECYCLE_MCP_SERVER: configuredServer,
    });

    assert.equal(server?.source, 'configured_task_lifecycle_mcp_server');
    assert.equal(server?.server_path, configuredServer);
  });
});

test('task lifecycle MCP resolution falls back through package bin, MCP config, then local tools', async () => {
  await withSite(async (siteRoot) => {
    const packageBinName = process.platform === 'win32' ? 'task-lifecycle-mcp.cmd' : 'task-lifecycle-mcp';
    const packageBin = join(siteRoot, 'node_modules', '.bin', packageBinName);
    await mkdir(join(siteRoot, 'node_modules', '.bin'), { recursive: true });
    await writeFile(packageBin, '');
    assert.equal(resolveTaskLifecycleMcpServer(siteRoot, {})?.source, 'site_package_task_lifecycle_mcp_bin');

    await rm(join(siteRoot, 'node_modules'), { recursive: true, force: true });
    const configuredServer = join(siteRoot, 'projected', 'task-mcp-server.js');
    await mkdir(join(siteRoot, 'projected'), { recursive: true });
    await mkdir(join(siteRoot, '.ai', 'mcp'), { recursive: true });
    await writeFile(configuredServer, '');
    await writeFile(join(siteRoot, '.ai', 'mcp', 'task-lifecycle-mcp.json'), JSON.stringify({
      mcpServers: {
        taskLifecycle: {
          command: process.execPath,
          args: ['{site_root}/projected/task-mcp-server.js'],
        },
      },
    }));
    assert.equal(resolveTaskLifecycleMcpServer(siteRoot, {})?.source, 'configured_mcp_projection');

    await rm(join(siteRoot, '.ai'), { recursive: true, force: true });
    await rm(join(siteRoot, 'projected'), { recursive: true, force: true });
    const localServer = join(siteRoot, 'tools', 'task-lifecycle', 'task-mcp-server.mjs');
    await mkdir(join(siteRoot, 'tools', 'task-lifecycle'), { recursive: true });
    await writeFile(localServer, '');
    assert.equal(resolveTaskLifecycleMcpServer(siteRoot, {})?.source, 'site_local_tools_tree');
  });
});

test('task lifecycle MCP resolution has no developer-machine fallback path', async () => {
  const sourcePath = fileURLToPath(new URL('./task-lifecycle-mcp-resolution.mjs', import.meta.url));
  const text = await readFile(sourcePath, 'utf8');
  assert.equal(text.includes('D:/code/mcp-surfaces'), false);
});
