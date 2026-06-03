import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';

export function resolveTaskLifecycleMcpServer(siteRoot, env = process.env) {
  const root = resolve(siteRoot);
  const configuredServerPath = env.NARADA_TASK_LIFECYCLE_MCP_SERVER;
  if (configuredServerPath && existsSync(configuredServerPath)) {
    return {
      command: process.execPath,
      args: [configuredServerPath, '--site-root', root],
      server_path: configuredServerPath,
      source: 'configured_task_lifecycle_mcp_server',
    };
  }

  const packageBinName = process.platform === 'win32' ? 'task-lifecycle-mcp.cmd' : 'task-lifecycle-mcp';
  const packageBinPath = join(root, 'node_modules', '.bin', packageBinName);
  if (existsSync(packageBinPath)) {
    return {
      command: packageBinPath,
      args: ['--site-root', root],
      server_path: packageBinPath,
      source: 'site_package_task_lifecycle_mcp_bin',
    };
  }

  for (const configPath of taskLifecycleMcpConfigPaths(root)) {
    const server = taskLifecycleServerFromMcpConfig(configPath, root);
    if (server) return server;
  }

  const localServerPath = join(root, 'tools', 'task-lifecycle', 'task-mcp-server.mjs');
  if (existsSync(localServerPath)) {
    return {
      command: process.execPath,
      args: [localServerPath, '--site-root', root],
      server_path: localServerPath,
      source: 'site_local_tools_tree',
    };
  }
  return null;
}

export function taskLifecycleReadinessPaths(siteRoot, env = process.env) {
  const root = resolve(siteRoot);
  const packageBinName = process.platform === 'win32' ? 'task-lifecycle-mcp.cmd' : 'task-lifecycle-mcp';
  const configuredServerPath = env.NARADA_TASK_LIFECYCLE_MCP_SERVER ?? null;
  const packageBinPath = join(root, 'node_modules', '.bin', packageBinName);
  const localServerPath = join(root, 'tools', 'task-lifecycle', 'task-mcp-server.mjs');
  return {
    configured_server_path: configuredServerPath,
    package_bin_path: packageBinPath,
    local_server_path: localServerPath,
    resolved_server: resolveTaskLifecycleMcpServer(root, env),
  };
}

function taskLifecycleMcpConfigPaths(siteRoot) {
  const mcpDir = join(siteRoot, '.ai', 'mcp');
  if (!existsSync(mcpDir)) return [];
  try {
    return readdirSync(mcpDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /task-lifecycle.*mcp\.json$/i.test(entry.name))
      .map((entry) => join(mcpDir, entry.name))
      .sort();
  } catch {
    return [];
  }
}

function taskLifecycleServerFromMcpConfig(configPath, siteRoot) {
  let config = null;
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    return null;
  }

  for (const candidate of taskLifecycleMcpConfigCandidates(config)) {
    const args = Array.isArray(candidate?.args) ? candidate.args.map((arg) => String(arg).replaceAll('{site_root}', siteRoot)) : [];
    const command = typeof candidate.command === 'string' && candidate.command.trim()
      ? candidate.command
      : process.execPath;
    const serverArg = args.find((arg) => /(^|[\\/])task-mcp-server\.(mjs|js)$/i.test(arg.replace(/\\/g, '/')));
    if (serverArg) {
      const serverPath = isAbsolute(serverArg) ? serverArg : resolve(siteRoot, serverArg);
      if (!existsSync(serverPath)) continue;
      return { command, args, server_path: serverPath, source: 'configured_mcp_projection', config_path: configPath };
    }
    if (String(command).toLowerCase().includes('task-lifecycle-mcp')) {
      return { command, args, server_path: command, source: 'configured_mcp_projection', config_path: configPath };
    }
  }
  return null;
}

function taskLifecycleMcpConfigCandidates(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return [];
  const candidates = [];
  if (typeof config.command === 'string' || Array.isArray(config.args)) candidates.push(config);
  for (const collection of [config.mcpServers, config.mcp_servers, config.servers]) {
    if (!collection || typeof collection !== 'object') continue;
    if (Array.isArray(collection)) {
      candidates.push(...collection.filter((entry) => entry && typeof entry === 'object'));
    } else {
      for (const [key, entry] of Object.entries(collection)) {
        if (entry && typeof entry === 'object') candidates.push({ ...entry, name: entry.name ?? entry.server_name ?? key });
      }
    }
  }
  return candidates.filter((entry) => {
    const name = String(entry.name ?? entry.server_name ?? basename(String(entry.id ?? ''))).toLowerCase();
    const normalizedName = name.replace(/[^a-z0-9]/g, '');
    const args = Array.isArray(entry.args) ? entry.args.join(' ').toLowerCase() : '';
    return normalizedName.includes('tasklifecycle') || args.includes('task-lifecycle') || args.includes('task-mcp-server');
  });
}
