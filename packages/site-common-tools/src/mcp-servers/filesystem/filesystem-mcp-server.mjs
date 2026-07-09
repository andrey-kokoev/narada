#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep, posix } from 'node:path';
import { glob } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { runGovernedCommandSync } from '@narada2/process-launch-posture';
import { enforceAgentPathPolicy } from '../../agent-context/path-policy.mjs';
import { buildOutputRefToolContent, listOutputTools, outputShow } from '../../mcp-payload-file.mjs';

const PROTOCOL_VERSION = '2024-11-05';
let activeOutputToolName = null;

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  process.stdout.write(`Usage: node tools/mcp-servers/filesystem/filesystem-mcp-server.mjs --site-root <path> [--audit-log-dir <path>] [--allow-outside-root]\n`);
  process.exit(0);
}

runStdioServer(options).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

async function runStdioServer(serverOptions) {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    buffer += chunk;

    let requests = [];
    if (buffer.includes('Content-Length:')) {
      const drained = drainJsonRpcFrames(buffer);
      buffer = drained.remaining;
      requests = drained.requests;
    } else {
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      requests = lines
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line));
    }

    for (const request of requests) {
      const response = handleRequest(request, serverOptions);
      if (response) writeMcpFrame(response);
    }
  }
  const trailing = buffer.trim();
  if (trailing.length > 0) {
    for (const request of parseJsonRpcInput(trailing)) {
      const response = handleRequest(request, serverOptions);
      if (response) writeMcpFrame(response);
    }
  }
}

function writeMcpFrame(response) {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

function handleRequest(request, serverOptions) {
  if (!request?.id && typeof request?.method === 'string' && request.method.startsWith('notifications/')) return null;
  try {
    const result = dispatchMethod(request.method, request.params ?? {}, serverOptions);
    return { jsonrpc: '2.0', id: request.id ?? null, result };
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id: request?.id ?? null,
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function dispatchMethod(method, params, serverOptions) {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: params.protocolVersion ?? PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: {
          name: 'narada-filesystem-mcp',
          version: '0.1.0',
        },
      };
    case 'tools/list':
      return { tools: listTools() };
    case 'tools/call':
      return callTool(params, serverOptions);
    default:
      throw new Error(`unsupported_mcp_method: ${method}`);
  }
}

function listTools() {
  return [
    {
      name: 'read_file',
      description: 'Read a text file. Returns content with optional line offset and limit.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute or relative path to the file' },
          offset: { type: 'integer', description: 'Line number to start reading from (1-based)', default: 1 },
          limit: { type: 'integer', description: 'Maximum number of lines to read', default: 1000 },
        },
        required: ['path'],
      },
    },
    {
      name: 'write_file',
      description: 'Write or overwrite a text file. Logs mutation for audit.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute or relative path to the file' },
          content: { type: 'string', description: 'Full content to write' },
        },
        required: ['path', 'content'],
      },
    },
    {
      name: 'str_replace_file',
      description: 'Replace a specific string in a file. Logs mutation for audit.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute or relative path to the file' },
          old: { type: 'string', description: 'Exact string to replace' },
          new: { type: 'string', description: 'Replacement string' },
        },
        required: ['path', 'old', 'new'],
      },
    },
    {
      name: 'glob_search',
      description: 'Search for files matching a glob pattern.',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern (e.g., "src/**/*.js")' },
          directory: { type: 'string', description: 'Directory to search in', default: '.' },
        },
        required: ['pattern'],
      },
    },
    {
      name: 'grep_search',
      description: 'Search file contents using ripgrep.',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regular expression pattern' },
          path: { type: 'string', description: 'File or directory to search in', default: '.' },
          output_mode: { type: 'string', enum: ['content', 'files_with_matches', 'count_matches'], default: 'content' },
          head_limit: { type: 'integer', description: 'Max results to return', default: 250 },
        },
        required: ['pattern'],
      },
    },
    {
      name: 'external_site_inventory',
      description: 'Read-only inventory for an explicitly named external Site root. Requires authority basis and returns guarded tree, metadata, snippets, hashes, and evidence refs without mutation.',
      inputSchema: {
        type: 'object',
        properties: {
          target_site_root: { type: 'string', description: 'Absolute external Site root to inventory.' },
          target_locus: { type: 'string', description: 'Operator-declared target locus or Site label.' },
          authority_basis: {
            type: 'object',
            properties: {
              kind: { type: 'string' },
              summary: { type: 'string' },
            },
            required: ['kind', 'summary'],
          },
          allowed_read_scope: { type: 'array', items: { type: 'string' }, description: 'Relative paths under target_site_root. Defaults to Site planning surfaces.' },
          include_snippets: { type: 'boolean', default: false },
          max_depth: { type: 'integer', default: 4 },
          max_entries: { type: 'integer', default: 250 },
          max_file_bytes: { type: 'integer', default: 65536 },
          snippet_line_limit: { type: 'integer', default: 40 },
        },
        required: ['target_site_root', 'target_locus', 'authority_basis'],
      },
    },
    ...listOutputTools(),
    {
      name: 'read_media_file',
      description: 'Read an image or video file for media analysis.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute or relative path to the media file' },
        },
        required: ['path'],
      },
    },
  ];
}

function callTool(params, serverOptions) {
  const record = asRecord(params);
  const name = stringField(record, 'name');
  const args = asRecord(record.arguments);
  if (!name) throw new Error('tools_call_requires_name');

  activeOutputToolName = name;
  const root = resolve(serverOptions.siteRoot ?? process.cwd());

  switch (name) {
    case 'read_file':
      return toolResult(readFile(args, root));
    case 'write_file':
      return toolResult(writeFile(args, root, serverOptions));
    case 'str_replace_file':
      return toolResult(strReplaceFile(args, root, serverOptions));
    case 'glob_search':
      return toolResult(globSearch(args, root));
    case 'grep_search':
      return toolResult(grepSearch(args, root));
    case 'external_site_inventory':
      return toolResult(externalSiteInventory(args));
    case 'read_media_file':
      return toolResult(readMediaFile(args, root));
    case 'mcp_output_show':
      return toolResult(outputShow({ siteRoot: root, args }));
    default:
      throw new Error(`filesystem_mcp_refused_unknown_tool: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Path boundary enforcement
// ---------------------------------------------------------------------------
function resolvePath(inputPath, root) {
  if (!inputPath) throw new Error('path_required');
  const p = isAbsolute(inputPath) ? resolve(inputPath) : resolve(root, inputPath);
  const rel = relative(root, p);
  if (rel.startsWith('..') || rel === '..') {
    throw new Error(`path_outside_root: ${inputPath} resolves outside ${root}`);
  }
  return p;
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------
function readFile(args, root) {
  const filePath = resolvePath(stringField(args, 'path'), root);
  enforceAgentPathPolicy({ siteRoot: root, absolutePath: filePath, operation: 'read_file' });
  const offset = Math.max(1, integerField(args, 'offset') ?? 1);
  const limit = Math.min(1000, Math.max(1, integerField(args, 'limit') ?? 1000));

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const totalLines = lines.length;
  const start = offset - 1;
  const end = Math.min(start + limit, totalLines);
  const selected = lines.slice(start, end);

  return {
    path: filePath,
    total_lines: totalLines,
    offset,
    limit,
    returned_lines: selected.length,
    content: selected.join('\n'),
  };
}

function writeFile(args, root, serverOptions = {}) {
  const filePath = resolvePath(stringField(args, 'path'), root);
  enforceAgentPathPolicy({ siteRoot: root, absolutePath: filePath, operation: 'write_file' });
  const content = stringField(args, 'content') ?? '';

  const dir = filePath.substring(0, filePath.lastIndexOf(sep));
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });

  writeFileSync(filePath, content, 'utf-8');
  logMutation(root, 'write_file', filePath, { size: content.length }, serverOptions);

  return { path: filePath, operation: 'write_file', size: content.length };
}

function strReplaceFile(args, root, serverOptions = {}) {
  const filePath = resolvePath(stringField(args, 'path'), root);
  enforceAgentPathPolicy({ siteRoot: root, absolutePath: filePath, operation: 'str_replace_file' });
  const oldStr = stringField(args, 'old') ?? '';
  const newStr = stringField(args, 'new') ?? '';

  if (!oldStr) throw new Error('str_replace_requires_old');

  const content = readFileSync(filePath, 'utf-8');
  const occurrences = content.split(oldStr).length - 1;
  if (occurrences === 0) throw new Error(`str_replace_not_found: "${oldStr}" not found in ${filePath}`);
  if (occurrences > 1) throw new Error(`str_replace_ambiguous: "${oldStr}" found ${occurrences} times in ${filePath}`);

  const replaced = content.replace(oldStr, newStr);
  writeFileSync(filePath, replaced, 'utf-8');
  logMutation(root, 'str_replace_file', filePath, { old_length: oldStr.length, new_length: newStr.length }, serverOptions);

  return { path: filePath, operation: 'str_replace_file', occurrences: 1 };
}

function globSearch(args, root) {
  const pattern = stringField(args, 'pattern') ?? '';
  const directory = resolvePath(stringField(args, 'directory') ?? '.', root);
  enforceAgentPathPolicy({ siteRoot: root, absolutePath: directory, operation: 'glob_search' });

  // Use PowerShell/Get-ChildItem for glob on Windows
  // Convert forward slashes to backslashes for the filter, but keep the path as-is
  const psPattern = pattern.replace(/\//g, '\\');
  const result = runGovernedCommandSync(
    'pwsh.exe',
    ['-NoProfile', '-Command',
      `Get-ChildItem -LiteralPath "${directory}" -Filter "${psPattern}" -Recurse -File -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName`
    ],
    { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
  );

  const lines = (result.stdout || '').split(/\r?\n/).filter((l) => l.trim().length > 0);
  return { pattern, directory, count: lines.length, matches: lines.slice(0, 250) };
}

function grepSearch(args, root) {
  const pattern = stringField(args, 'pattern') ?? '';
  const searchPath = resolvePath(stringField(args, 'path') ?? '.', root);
  enforceAgentPathPolicy({ siteRoot: root, absolutePath: searchPath, operation: 'grep_search' });
  const outputMode = stringField(args, 'output_mode') ?? 'content';
  const headLimit = Math.min(250, Math.max(1, integerField(args, 'head_limit') ?? 250));

  if (!pattern) throw new Error('grep_requires_pattern');

  const rg = runGovernedCommandSync('rg', [
    pattern,
    searchPath,
    outputMode === 'files_with_matches' ? '-l' : outputMode === 'count_matches' ? '-c' : '',
    '-n',
    '--max-count', String(headLimit),
  ].filter(Boolean), { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });

  const lines = (rg.stdout || '').split(/\r?\n/).filter((l) => l.trim().length > 0);

  return {
    pattern,
    path: searchPath,
    output_mode: outputMode,
    count: lines.length,
    matches: lines.slice(0, headLimit),
  };
}

function externalSiteInventory(args) {
  const targetRootInput = stringField(args, 'target_site_root');
  const targetLocus = stringField(args, 'target_locus');
  const authorityBasis = asRecord(args.authority_basis);
  if (!targetRootInput) throw new Error('external_site_inventory_requires_target_site_root');
  if (!isAbsolute(targetRootInput)) throw new Error('external_site_inventory_requires_absolute_target_site_root');
  if (!targetLocus) throw new Error('external_site_inventory_requires_target_locus');
  validateInventoryAuthorityBasis(authorityBasis);

  const targetRoot = resolve(targetRootInput);
  if (!existsSync(targetRoot)) throw new Error(`external_site_inventory_target_root_not_found: ${targetRoot}`);
  const rootStat = statSync(targetRoot);
  if (!rootStat.isDirectory()) throw new Error(`external_site_inventory_target_root_not_directory: ${targetRoot}`);

  const includeSnippets = booleanField(args, 'include_snippets') ?? false;
  const maxDepth = Math.min(8, Math.max(0, integerField(args, 'max_depth') ?? 4));
  const maxEntries = Math.min(1000, Math.max(1, integerField(args, 'max_entries') ?? 250));
  const maxFileBytes = Math.min(1024 * 1024, Math.max(0, integerField(args, 'max_file_bytes') ?? 65536));
  const snippetLineLimit = Math.min(100, Math.max(1, integerField(args, 'snippet_line_limit') ?? 40));
  const allowedReadScope = arrayField(args, 'allowed_read_scope');
  const scopes = allowedReadScope.length > 0
    ? allowedReadScope
    : ['.narada', 'AGENTS.md', 'config.json', 'kb', 'docs', 'capabilities', 'admission', 'operator-surfaces'];

  const entries = [];
  const safeguards = {
    read_only: true,
    writes_performed: false,
    external_root_requires_explicit_authority: true,
    secret_name_patterns_redacted: true,
    large_files_summarized: true,
    max_depth: maxDepth,
    max_entries: maxEntries,
    max_file_bytes: maxFileBytes,
    snippet_line_limit: snippetLineLimit,
  };

  for (const scope of scopes) {
    if (entries.length >= maxEntries) break;
    const relativeScope = normalizeInventoryRelativePath(scope);
    const absoluteScope = resolve(targetRoot, relativeScope);
    assertUnderTargetRoot(targetRoot, absoluteScope, scope);
    if (!existsSync(absoluteScope)) {
      entries.push({ relative_path: relativeScope || '.', type: 'missing', scope });
      continue;
    }
    collectInventoryEntries({
      targetRoot,
      absolutePath: absoluteScope,
      relativePath: relativeScope,
      depth: 0,
      maxDepth,
      maxEntries,
      maxFileBytes,
      snippetLineLimit,
      includeSnippets,
      entries,
    });
  }

  const evidenceDigest = createHash('sha256').update(JSON.stringify({ targetRoot, targetLocus, scopes, entries })).digest('hex');
  return {
    schema: 'narada.filesystem.external_site_inventory.v0',
    status: 'ok',
    target_site_root: targetRoot,
    target_locus: targetLocus,
    authority_basis: authorityBasis,
    allowed_read_scope: scopes,
    evidence_ref: `external_site_inventory:${evidenceDigest}`,
    generated_at: new Date().toISOString(),
    projection_not_authority: true,
    mutation_authority_granted: false,
    safeguards,
    counts: {
      returned_entries: entries.length,
      files: entries.filter((entry) => entry.type === 'file').length,
      directories: entries.filter((entry) => entry.type === 'directory').length,
      redacted: entries.filter((entry) => entry.redaction?.redacted).length,
      summarized_large_files: entries.filter((entry) => entry.guard === 'large_file_summarized').length,
      missing_scopes: entries.filter((entry) => entry.type === 'missing').length,
    },
    entries,
  };
}

function collectInventoryEntries({ targetRoot, absolutePath, relativePath, depth, maxDepth, maxEntries, maxFileBytes, snippetLineLimit, includeSnippets, entries }) {
  if (entries.length >= maxEntries) return;
  const stat = statSync(absolutePath);
  const normalizedRelative = normalizeInventoryRelativePath(relativePath || '.');
  const secretName = hasSecretLikeName(normalizedRelative);

  if (stat.isDirectory()) {
    entries.push({ relative_path: normalizedRelative || '.', type: 'directory', mtime: stat.mtime.toISOString() });
    if (depth >= maxDepth) return;
    const children = readdirSync(absolutePath, { withFileTypes: true })
      .filter((entry) => !shouldSkipInventoryName(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      if (entries.length >= maxEntries) break;
      const childRelative = normalizedRelative && normalizedRelative !== '.' ? `${normalizedRelative}/${child.name}` : child.name;
      const childAbsolute = resolve(absolutePath, child.name);
      assertUnderTargetRoot(targetRoot, childAbsolute, childRelative);
      collectInventoryEntries({ targetRoot, absolutePath: childAbsolute, relativePath: childRelative, depth: depth + 1, maxDepth, maxEntries, maxFileBytes, snippetLineLimit, includeSnippets, entries });
    }
    return;
  }

  if (!stat.isFile()) {
    entries.push({ relative_path: normalizedRelative, type: 'other', size_bytes: stat.size, mtime: stat.mtime.toISOString() });
    return;
  }

  const entry = {
    relative_path: normalizedRelative,
    type: 'file',
    size_bytes: stat.size,
    mtime: stat.mtime.toISOString(),
    sha256: stat.size <= maxFileBytes ? sha256File(absolutePath) : null,
  };
  if (secretName) {
    entry.redaction = { redacted: true, reason: 'secret_like_path' };
  } else if (stat.size > maxFileBytes) {
    entry.guard = 'large_file_summarized';
  } else if (includeSnippets && isTextInventoryFile(normalizedRelative)) {
    const content = readFileSync(absolutePath, 'utf8');
    const lines = content.split(/\r?\n/).slice(0, snippetLineLimit);
    entry.snippet = {
      line_count_returned: lines.length,
      truncated: content.split(/\r?\n/).length > lines.length,
      content: lines.join('\n'),
    };
  }
  entries.push(entry);
}

function validateInventoryAuthorityBasis(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('external_site_inventory_requires_authority_basis');
  if (typeof value.kind !== 'string' || value.kind.trim().length === 0) throw new Error('external_site_inventory_requires_authority_basis_kind');
  if (typeof value.summary !== 'string' || value.summary.trim().length === 0) throw new Error('external_site_inventory_requires_authority_basis_summary');
  const allowedKinds = new Set(['operator_direct_instruction', 'directed_obligation', 'task_owner_handoff']);
  if (!allowedKinds.has(value.kind)) throw new Error(`external_site_inventory_invalid_authority_basis_kind: ${value.kind}`);
}

function normalizeInventoryRelativePath(inputPath) {
  const raw = String(inputPath ?? '.').replace(/\\/g, '/').trim();
  if (!raw || raw === '.') return '.';
  return raw.replace(/^\/+/, '').replace(/\/+$/, '');
}

function assertUnderTargetRoot(targetRoot, absolutePath, sourcePath) {
  const rel = relative(targetRoot, absolutePath);
  if (rel.startsWith('..') || rel === '..' || isAbsolute(rel)) {
    throw new Error(`external_site_inventory_scope_outside_target_root: ${sourcePath}`);
  }
}

function shouldSkipInventoryName(name) {
  return ['.git', 'node_modules', 'vendor', '.venv', '__pycache__'].includes(name);
}

function hasSecretLikeName(relativePath) {
  return /(^|[/._-])(secret|secrets|token|tokens|credential|credentials|password|passwd|apikey|api_key|private-key|private_key|\.env)([/._-]|$)/i.test(relativePath);
}

function isTextInventoryFile(relativePath) {
  return /\.(md|txt|json|jsonl|yaml|yml|toml|ini|ps1|mjs|js|ts|tsx|css|html|csv)$/i.test(relativePath) || !relativePath.includes('.');
}

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function readMediaFile(args, root) {
  const filePath = resolvePath(stringField(args, 'path'), root);
  enforceAgentPathPolicy({ siteRoot: root, absolutePath: filePath, operation: 'read_media_file' });
  const data = readFileSync(filePath);
  const mime = inferMimeType(filePath);
  return {
    path: filePath,
    mime_type: mime,
    size_bytes: data.length,
    data_base64: data.toString('base64'),
  };
}

function inferMimeType(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  return 'application/octet-stream';
}

// ---------------------------------------------------------------------------
// Audit logging
// ---------------------------------------------------------------------------
function logMutation(root, operation, filePath, metadata, serverOptions = {}) {
  const configuredLogDir = serverOptions.auditLogDir ? resolvePath(serverOptions.auditLogDir, root) : null;
  const logDir = resolve(root, '..', '..', 'runtime', 'operator-surface-session-restore');
  // Fallback: log into PC site runtime if we can find it
  const pcLogDir = findPcRuntimeDir(root);
  const dir = configuredLogDir || pcLogDir || logDir;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const entry = {
    schema: 'narada.operator_surfaces.filesystem_mcp_mutation.v0',
    observed_at: new Date().toISOString(),
    operation,
    path: filePath,
    root,
    metadata,
  };
  appendFileSync(
    resolve(dir, 'filesystem-mcp-mutations.jsonl'),
    JSON.stringify(entry) + '\n',
    'utf-8'
  );
}

function findPcRuntimeDir(root) {
  // Heuristic: if root contains operator-surfaces, the PC runtime is at
  // C:\ProgramData\Narada\sites\pc\desktop-sunroom-2\runtime
  try {
    const candidate = resolve(root, '..', '..', '..', 'ProgramData', 'Narada', 'sites', 'pc', 'desktop-sunroom-2', 'runtime');
    if (existsSync(candidate)) return candidate;
  } catch {}
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const opts = { siteRoot: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--site-root' && i + 1 < argv.length) {
      opts.siteRoot = resolve(argv[i + 1]);
      i++;
    } else if (argv[i] === '--audit-log-dir' && i + 1 < argv.length) {
      opts.auditLogDir = argv[i + 1];
      i++;
    } else if (argv[i] === '--allow-outside-root') {
      opts.allowOutsideRoot = true;
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      opts.help = true;
    }
  }
  return opts;
}

function asRecord(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return {};
}

function stringField(record, key) {
  const v = record[key];
  if (typeof v === 'string') return v;
  if (v === undefined || v === null) return null;
  return String(v);
}

function integerField(record, key) {
  const v = record[key];
  if (typeof v === 'number') return Number.isFinite(v) ? Math.floor(v) : null;
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function booleanField(record, key) {
  const v = record[key];
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return null;
}

function arrayField(record, key) {
  const v = record[key];
  if (!Array.isArray(v)) return [];
  return v.map((item) => String(item)).filter((item) => item.trim().length > 0);
}

function toolResult(data, toolName = null) {
  return buildOutputRefToolContent({ siteRoot: resolve(options.siteRoot ?? process.cwd()), toolName: toolName ?? activeOutputToolName, value: data });
}

function drainJsonRpcFrames(buffer) {
  const requests = [];
  let remaining = buffer;
  while (true) {
    const lenMatch = remaining.match(/Content-Length:\s*(\d+)/i);
    if (!lenMatch) break;
    const len = parseInt(lenMatch[1], 10);
    const headerEnd = remaining.indexOf('\r\n\r\n');
    if (headerEnd < 0) break;
    const bodyStart = headerEnd + 4;
    if (remaining.length < bodyStart + len) break;
    const body = remaining.substring(bodyStart, bodyStart + len);
    try {
      requests.push(JSON.parse(body));
    } catch {
      // skip malformed
    }
    remaining = remaining.substring(bodyStart + len);
  }
  return { requests, remaining };
}

function parseJsonRpcInput(text) {
  const requests = [];
  try {
    requests.push(JSON.parse(text));
  } catch {
    // skip malformed
  }
  return requests;
}
