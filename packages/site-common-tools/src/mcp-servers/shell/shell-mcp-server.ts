#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { runGovernedCommand, runGovernedCommandSync } from '@narada-core/process-launch-posture';
import { validateIdentityAgainstRoster } from '@narada-core/agent-context-mcp/session-start';
import { enforceAgentPathPolicy } from '@narada-core/agent-context-mcp/path-policy';
import {
  attachPayloadSource,
  enforceInlinePayloadLimit,
  buildOutputRefToolContent,
  listOutputTools,
  listPayloadTools,
  outputShow,
  payloadCreate,
  payloadDerive,
  payloadShow,
  payloadValidate,
  resolveToolPayloadArgs,
} from '../../mcp-payload-file.js';

const PROTOCOL_VERSION: any = '2024-11-05';
let activeOutputToolName: any = null;

// Approval categories
const APPROVAL_AUTO: any = 'auto';
const APPROVAL_PROMPT: any = 'prompt';
const APPROVAL_BLOCK: any = 'block';
const GIT_AUTHORITY_BASIS_KINDS: any = ['operator_direct_instruction', 'task_closeout_policy'];
const GIT_AUTHORITY_BASIS_DESCRIPTION: any = `Required shape: { kind: one of ${GIT_AUTHORITY_BASIS_KINDS.join(', ')}, summary: non-empty string }.`;
const EXECUTE_PAYLOAD_REF_REMEDIATION: any = 'Create the command packet with this same Shell MCP surface using mcp_payload_create, payload { command, working_directory?, timeout?, break_glass_operation_id? }, then pass the returned payload_ref to execute_command.';

// Whitelist: safe commands that never need approval
const WHITELIST_PATTERNS: any = [
  /^\s*(dir|ls|Get-ChildItem)\s/,
  /^\s*(git\s+(status|log|diff|show|branch|remote|config\s+--list))\s*/,
  /^\s*(node\s+-v|node\s+--version)\s*/,
  /^\s*node\s+--check\s+["']?\.?[/\\]?tools[/\\][A-Za-z0-9._/-]+\.ts["']?\s*$/i,
  /^\s*(npm\s+--version|pnpm\s+--version|yarn\s+--version)\s*/,
  /^\s*(komorebic\s+(state|query))\s*/,
  /^\s*(ver|systeminfo|hostname|whoami)\s*/,
  /^\s*(Get-Content|type)\s/,
  /^\s*(Findstr|Select-String)\s/,
  /^\s*(where|Get-Command)\s/,
  /^\s*codex\s+(--help|-h|help)\s*$/i,
  /^\s*codex\s+resume\s+(--help|-h)\s*$/i,
];

// Blacklist: commands that are always blocked
const BLACKLIST_PATTERNS: any = [
  /\bwsl\b/,
  /\bwsl\.exe\b/,
  /\brm\s+-rf\s+\//,
  /\bformat\s/,
  /\bdiskpart\b/,
  /\breg\s+delete\b/,
  /\bcd\s+\.\.\s*&&\s*rmdir\s+\/s\s+\/q\s+C:\\/,
  /\bdel\s+\/f\s+\/s\s+\/q\s+C:\\/,
  /\berase\s+\/f\s+\/s\s+\/q\s+C:\\/,
  /\bRemove-Item\s+.*\s+-Recurse\s+.*C:\\/,
  /\bGet-Process\s+(kimi|codex)(\.exe)?\b[\s\S]*\|\s*Stop-Process\b/i,
  /\bStop-Process\b[\s\S]*\b(kimi|codex)(\.exe)?\b/i,
  /\btaskkill\b[\s\S]*\b(kimi|codex)(\.exe)?\b/i,
  /\bwmic\b[\s\S]*\b(kimi|codex)(\.exe)?\b[\s\S]*\b(delete|terminate|call\s+terminate)\b/i,
  /Invoke-Expression.*IEX/,
  /DownloadString/,
  /bitsadmin.*\/(transfer|create)/,
  /certutil.*-urlcache.*-split.*-f/,
];

const options: any = parseArgs(process.argv.slice(2));

if (options.help) {
  process.stdout.write(`Usage: node tools/mcp-servers/shell/shell-mcp-server.ts --site-root <path> [--auto-approve] [--timeout <seconds>]\n`);
  process.exit(0);
}

runStdioServer(options).catch((error: any) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

async function runStdioServer(serverOptions: any) : Promise<any>{
  let buffer: any = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    buffer += chunk;

    let requests: any = [];
    const framedInput: any = hasJsonRpcFrame(buffer);
    if (framedInput) {
      const drained: any = drainJsonRpcFrames(buffer);
      buffer = drained.remaining;
      requests = drained.requests;
    } else {
      const lines: any = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      requests = lines
        .filter((line: any) => line.trim().length > 0)
        .map((line: any) => JSON.parse(line));
    }

    for (const request of requests) {
      const response: any = await handleRequest(request, serverOptions);
      if (response) writeMcpFrame(response, framedInput ? 'framed' : 'ndjson');
    }
  }
  const trailing: any = buffer.trim();
  if (trailing.length > 0) {
    for (const request of parseJsonRpcInput(trailing)) {
      const response: any = await handleRequest(request, serverOptions);
      if (response) writeMcpFrame(response, hasJsonRpcFrame(buffer) ? 'framed' : 'ndjson');
    }
  }
}

function writeMcpFrame(response: any, mode: any = 'ndjson') : any{
  const payload: any = JSON.stringify(response);
  if (mode === 'framed') {
    process.stdout.write(`Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n${payload}`);
    return;
  }
  process.stdout.write(`${payload}\n`);
}

async function handleRequest(request: any, serverOptions: any) : Promise<any>{
  if (!request?.id && typeof request?.method === 'string' && request.method.startsWith('notifications/')) return null;
  try {
    const result: any = await dispatchMethod(request.method, request.params ?? {}, serverOptions);
    return { jsonrpc: '2.0', id: request.id ?? null, result };
  } catch (error: any) {
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

async function dispatchMethod(method: any, params: any, serverOptions: any) : Promise<any>{
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: params.protocolVersion ?? PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: {
          name: 'narada-shell-mcp',
          version: '0.1.0',
        },
      };
    case 'tools/list':
      return { tools: listTools() };
    case 'tools/call':
      return await callTool(params, serverOptions);
    default:
      throw new Error(`unsupported_mcp_method: ${method}`);
  }
}

function listTools() : any{
  return [
    {
      name: 'execute_command',
      description: `Execute a shell command from an immutable payload_ref with structured output, approval gates, and audit logging. ${EXECUTE_PAYLOAD_REF_REMEDIATION}`,
      inputSchema: {
        type: 'object',
        properties: {
          payload_ref: {
            type: 'string',
            description: `Required immutable transient payload ref such as mcp_payload:<id>@v1. Payload must contain command plus optional timeout, working_directory, and break_glass_operation_id. Create it first with mcp_payload_create on this Shell MCP surface.`,
          },
        },
        required: ['payload_ref'],
      },
    },
    {
      name: 'break_glass_open',
      description: 'Open a scoped append-only break-glass operation for prompt-gated Shell MCP execution.',
      inputSchema: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Why ordinary MCP/domain authority is insufficient.' },
          operator_authorization_ref: { type: 'string', description: 'Durable reference to explicit operator authorization.' },
          operator_authorization_text: { type: 'string', description: 'Exact or summarized operator authorization.' },
          expires_at: { type: 'string', description: 'ISO timestamp when this operation expires.' },
          ttl_seconds: { type: 'integer', description: 'Optional lifetime in seconds when expires_at is omitted. Max 3600.' },
          scope: {
            type: 'object',
            description: 'Allowed roots and command strings/prefixes.',
            properties: {
              allowed_roots: { type: 'array', items: { type: 'string' } },
              allowed_commands: { type: 'array', items: { type: 'string' } },
              allowed_command_prefixes: { type: 'array', items: { type: 'string' } },
              forbidden_actions: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        required: ['reason', 'operator_authorization_ref', 'operator_authorization_text', 'scope'],
      },
    },
    {
      name: 'break_glass_status',
      description: 'Read reconstructed status for one break-glass operation or list recent operations.',
      inputSchema: {
        type: 'object',
        properties: {
          operation_id: { type: 'string', description: 'Operation id to show. Omit to list recent operations.' },
          limit: { type: 'integer', description: 'Maximum operations to list. Default 20.' },
        },
      },
    },
    {
      name: 'break_glass_close',
      description: 'Close an open break-glass operation with verification and residual-risk evidence.',
      inputSchema: {
        type: 'object',
        properties: {
          operation_id: { type: 'string' },
          closure_status: { type: 'string', enum: ['completed', 'blocked', 'aborted'] },
          summary: { type: 'string' },
          verification: { type: 'array', items: { type: 'string' } },
          residual_risk: { type: 'string' },
        },
        required: ['operation_id', 'closure_status', 'summary', 'verification', 'residual_risk'],
      },
    },
    {
      name: 'normalize_line_endings',
      description: 'Normalize explicit tracked text files to the line-ending style stored in HEAD.',
      inputSchema: {
        type: 'object',
        properties: {
          paths: { type: 'array', items: { type: 'string' }, description: 'Explicit repo-relative tracked file paths.' },
          mode: { type: 'string', description: 'Only match_head is supported. Default: match_head.' },
          dry_run: { type: 'boolean', description: 'Report planned rewrites without writing files. Default: false.' },
        },
        required: ['paths'],
      },
    },
    {
      name: 'git_stage_paths',
      description: 'Stage explicit repo-relative paths for a task-owned Git increment.',
      inputSchema: {
        type: 'object',
        properties: {
          paths: { type: 'array', items: { type: 'string' }, description: 'Explicit repo-relative paths to stage.' },
          working_directory: { type: 'string', description: 'Working directory inside the target Git repository. Default: site root.' },
          authority_basis: gitAuthorityBasisSchema('Structured authority basis for the Git mutation.'),
          dry_run: { type: 'boolean', description: 'Report planned staging without mutating the index. Default: false.' },
        },
        required: ['paths', 'authority_basis'],
      },
    },
    {
      name: 'git_commit',
      description: 'Commit the current Git index with an audited authority basis.',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Commit message.' },
          working_directory: { type: 'string', description: 'Working directory inside the target Git repository. Default: site root.' },
          authority_basis: gitAuthorityBasisSchema('Structured authority basis for the Git mutation.'),
          dry_run: { type: 'boolean', description: 'Report planned commit without creating it. Default: false.' },
        },
        required: ['message', 'authority_basis'],
      },
    },
    {
      name: 'git_push_current',
      description: 'Push the current branch to its configured upstream without force.',
      inputSchema: {
        type: 'object',
        properties: {
          working_directory: { type: 'string', description: 'Working directory inside the target Git repository. Default: site root.' },
          authority_basis: gitAuthorityBasisSchema('Structured authority basis for the Git mutation.'),
          dry_run: { type: 'boolean', description: 'Report planned push without pushing. Default: false.' },
        },
        required: ['authority_basis'],
      },
    },
    {
      name: 'git_commit_and_push_increment',
      description: 'Stage explicit paths, commit them, and push the current branch to upstream.',
      inputSchema: {
        type: 'object',
        properties: {
          paths: { type: 'array', items: { type: 'string' }, description: 'Explicit repo-relative paths to stage.' },
          message: { type: 'string', description: 'Commit message.' },
          working_directory: { type: 'string', description: 'Working directory inside the target Git repository. Default: site root.' },
          authority_basis: gitAuthorityBasisSchema('Structured authority basis for the Git mutation.'),
          dry_run: { type: 'boolean', description: 'Report planned stage/commit/push without mutating. Default: false.' },
          allow_staged_outside_scope: { type: 'boolean', description: 'Explicitly allow already-staged paths outside declared paths. Default false.' },
          intended_source_paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional implementation/source paths to classify as staged, already_in_head, absent, ignored, untracked, or not_owned.',
          },
          payload_path: { type: 'string', description: 'Optional JSON payload path under .ai/tmp/mcp-payloads. Transient transport only; loaded payload is validated like inline arguments.' },
          payload_ref: { type: 'string', description: 'Optional immutable transient payload ref such as mcp_payload:<id>@v1. Loaded payload is validated like inline arguments.' },
        },
      },
    },
    {
      name: 'git_closeout_preflight',
      description: 'Dry-run a task closeout against current dirty files and declared shared-file ownership claims.',
      inputSchema: {
        type: 'object',
        properties: {
          task_number: { type: 'integer', description: 'Task number being closed out.' },
          paths: { type: 'array', items: { type: 'string' }, description: 'Repo-relative paths the task intends to own/stage.' },
          shared_file_claims: {
            type: 'array',
            items: { type: 'object' },
            description: 'Optional ownership claims for shared files: { path, task_number, summary }.',
          },
          allow_shared_integration: { type: 'boolean', description: 'When true, report mixed ownership as integration_required instead of blocked. Default false.' },
          working_directory: { type: 'string', description: 'Working directory inside the target Git repository. Default: site root.' },
          authority_basis: gitAuthorityBasisSchema('Structured authority basis for the closeout preflight.'),
        },
        required: ['task_number', 'paths', 'authority_basis'],
      },
    },
    {
      name: 'git_handoff_inbox_envelope_export',
      description: 'Force-stage, commit, and push one admitted .ai/inbox-envelopes JSON export through a narrow audited handoff path.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Exact repo-relative .ai/inbox-envelopes/*.json export path.' },
          message: { type: 'string', description: 'Commit message.' },
          working_directory: { type: 'string', description: 'Working directory inside the target Git repository. Default: site root.' },
          authority_basis: gitAuthorityBasisSchema('Structured authority basis for the Git handoff mutation.'),
          dry_run: { type: 'boolean', description: 'Report planned force-stage/commit/push without mutating. Default: false.' },
        },
        required: ['path', 'message', 'authority_basis'],
      },
    },
    {
      name: 'git_task_closeout_commit_and_push',
      description: 'Stage task-owned paths plus the task projection markdown, then commit and push the closeout increment through audited Shell MCP.',
      inputSchema: {
        type: 'object',
        properties: {
          task_number: { type: 'integer', description: 'Task number whose projection markdown must be included.' },
          paths: { type: 'array', items: { type: 'string' }, description: 'Additional explicit repo-relative task-owned paths to stage.' },
          message: { type: 'string', description: 'Commit message.' },
          working_directory: { type: 'string', description: 'Working directory inside the target Git repository. Default: site root.' },
          authority_basis: gitAuthorityBasisSchema('Structured authority basis for the Git closeout mutation.'),
          dry_run: { type: 'boolean', description: 'Report planned closeout commit/push without mutating. Default: false.' },
          allow_staged_outside_scope: { type: 'boolean', description: 'Explicitly allow already-staged paths outside declared task-owned paths. Default false.' },
          intended_source_paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional implementation/source paths to classify as staged, already_in_head, absent, ignored, untracked, or not_owned.',
          },
          payload_path: { type: 'string', description: 'Optional JSON payload path under .ai/tmp/mcp-payloads. Transient transport only; loaded payload is validated like inline arguments.' },
          payload_ref: { type: 'string', description: 'Optional immutable transient payload ref such as mcp_payload:<id>@v1. Loaded payload is validated like inline arguments.' },
        },
      },
    },
    ...listPayloadTools(),
    ...listOutputTools(),
  ];
}

function gitAuthorityBasisSchema(prefix: any) : any{
  return {
    type: 'object',
    description: `${prefix} ${GIT_AUTHORITY_BASIS_DESCRIPTION}`,
    properties: {
      kind: { type: 'string', enum: GIT_AUTHORITY_BASIS_KINDS },
      summary: { type: 'string', description: 'Non-empty human-readable authority summary.' },
    },
    required: ['kind', 'summary'],
  };
}

async function callTool(params: any, serverOptions: any) : Promise<any>{
  const record: any = asRecord(params);
  const name: any = stringField(record, 'name');
  const args: any = asRecord(record.arguments);
  if (!name) throw new Error('tools_call_requires_name');
  activeOutputToolName = name;

  const root: any = resolve(serverOptions.siteRoot ?? process.cwd());
  enforceInlinePayloadLimit({ toolName: name, args, allowPayloadCreation: true });
  if (name === 'execute_command') {
    const commandArgs: any = resolveExecuteCommandPayloadArgs(args, root);
    return await executeCommand(commandArgs.args, root, serverOptions, commandArgs.payloadSource);
  }

  const payloadResolution: any = resolveToolPayloadArgs({
    siteRoot: root,
    toolName: name,
    args,
    allowedTools: ['git_commit_and_push_increment', 'git_task_closeout_commit_and_push'],
  });
  const effectiveArgs: any = payloadResolution.payloadSource
    ? { ...payloadResolution.args, __payload_source: payloadResolution.payloadSource }
    : payloadResolution.args;

  switch (name) {
    case 'break_glass_open':
      return toolResult(breakGlassOpen(args, root));
    case 'break_glass_status':
      return toolResult(breakGlassStatus(args, root));
    case 'break_glass_close':
      return toolResult(breakGlassClose(args, root));
    case 'normalize_line_endings':
      return toolResult(normalizeLineEndings(args, root));
    case 'git_stage_paths':
      return toolResult(gitStagePaths(args, root));
    case 'git_commit':
      return toolResult(gitCommit(args, root));
    case 'git_push_current':
      return toolResult(gitPushCurrent(args, root));
    case 'git_commit_and_push_increment':
      return toolResult(attachPayloadSource(gitCommitAndPushIncrement(effectiveArgs, root), payloadResolution.payloadSource));
    case 'mcp_payload_create':
      return toolResult(payloadCreate({ siteRoot: root, args }));
    case 'mcp_payload_show':
      return toolResult(payloadShow({ siteRoot: root, args }));
    case 'mcp_output_show':
      return toolResult(outputShow({ siteRoot: root, args }));
    case 'mcp_payload_derive':
      return toolResult(payloadDerive({ siteRoot: root, args }));
    case 'mcp_payload_validate':
      return toolResult(payloadValidate({ siteRoot: root, args }));
    case 'git_closeout_preflight':
      return toolResult(gitCloseoutPreflight(args, root));
    case 'git_handoff_inbox_envelope_export':
      return toolResult(gitHandoffInboxEnvelopeExport(args, root));
    case 'git_task_closeout_commit_and_push':
      return toolResult(attachPayloadSource(gitTaskCloseoutCommitAndPush(effectiveArgs, root), payloadResolution.payloadSource));
    default:
      throw new Error(`shell_mcp_refused_unknown_tool: ${name}`);
  }
}

function resolveExecuteCommandPayloadArgs(args: any, root: any) : any{
  const input: any = asRecord(args);
  if (Object.prototype.hasOwnProperty.call(input, 'command')) {
    throw new Error(`execute_command_inline_command_refused: command text must be supplied by immutable payload_ref, not inline tool arguments. remediation=${EXECUTE_PAYLOAD_REF_REMEDIATION}`);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'payload_path')) {
    throw new Error(`execute_command_payload_path_refused: execute_command requires immutable payload_ref, not payload_path. remediation=${EXECUTE_PAYLOAD_REF_REMEDIATION}`);
  }
  if (!stringField(input, 'payload_ref')) {
    throw new Error(`execute_command_requires_payload_ref: ${EXECUTE_PAYLOAD_REF_REMEDIATION}`);
  }
  const payloadResolution: any = resolveToolPayloadArgs({
    siteRoot: root,
    toolName: 'execute_command',
    args: input,
    allowedTools: ['execute_command'],
  });
  if (!payloadResolution.payloadSource?.ref) {
    throw new Error(`execute_command_requires_payload_ref: ${EXECUTE_PAYLOAD_REF_REMEDIATION}`);
  }
  return payloadResolution;
}

function classifyCommand(command: any, context: any = {}) : any{
  if (!command || typeof command !== 'string') return APPROVAL_BLOCK;

  for (const pattern of BLACKLIST_PATTERNS) {
    if (pattern.test(command)) return APPROVAL_BLOCK;
  }

  if (isSiteConfigValidatorCommand(command, context)) return APPROVAL_AUTO;
  if (isBoundedStartSleepCommand(command)) return APPROVAL_AUTO;

  for (const pattern of WHITELIST_PATTERNS) {
    if (pattern.test(command)) return APPROVAL_AUTO;
  }

  return APPROVAL_PROMPT;
}

function isSiteConfigValidatorCommand(command: any, { root, workingDir, agentPolicy }: any = {}) : any{
  const tokens: any = tokenizeSimpleCommand(command);
  if (!tokens) return false;
  if (tokens.length < 3) return false;
  if (!/^node(?:\.exe)?$/i.test(tokens[0])) return false;

  const scriptPath: any = normalizeRelativePath(tokens[1].replace(/^\.\//, '').replace(/^\.\\/, ''));
  if (scriptPath !== 'tools/site-config/validate-site-config.ts') return false;

  const allowedFlags: any = new Set(['--override-static', '--override-structural', '--json']);
  const seenFlags: any = new Set();
  for (const flag of tokens.slice(3)) {
    if (!allowedFlags.has(flag) || seenFlags.has(flag)) return false;
    seenFlags.add(flag);
  }

  const siteRoot: any = resolve(workingDir ?? root, tokens[2]);
  const serverRoot: any = resolve(root ?? '.');
  const rel: any = relative(serverRoot, siteRoot);
  if (rel === '..' || rel.startsWith('..\\') || rel.startsWith('../')) return false;

  // This validator is admitted because it is deterministic and read-only. Keep
  // both the command working directory and target Site root inside the existing
  // per-agent path allowlist when one is configured.
  enforceAgentPathPolicy({
    siteRoot: serverRoot,
    agentId: agentPolicy?.agent_id,
    absolutePath: resolve(workingDir ?? serverRoot),
    operation: 'shell_mcp_execute_site_config_validator_working_directory',
  });
  enforceAgentPathPolicy({
    siteRoot: serverRoot,
    agentId: agentPolicy?.agent_id,
    absolutePath: siteRoot,
    operation: 'shell_mcp_execute_site_config_validator_site_root',
  });

  return true;
}

function isBoundedStartSleepCommand(command: any) : any{
  const tokens: any = tokenizeSimpleCommand(command);
  if (!tokens) return false;
  if (tokens.length !== 3) return false;
  if (!/^Start-Sleep$/i.test(tokens[0])) return false;
  if (!/^-Seconds$/i.test(tokens[1])) return false;
  if (!/^\d+$/.test(tokens[2])) return false;

  const seconds: any = Number.parseInt(tokens[2], 10);
  return seconds >= 1 && seconds <= 300;
}

function tokenizeSimpleCommand(command: any) : any{
  const trimmed: any = command.trim();
  if (trimmed.length === 0) return null;
  if (/[\r\n;&|<>]/.test(trimmed)) return null;

  const tokens: any = [];
  let token: any = '';
  let quote: any = null;

  for (let i = 0; i < trimmed.length; i += 1) {
    const char: any = trimmed[i];
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        token += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (token.length > 0) {
        tokens.push(token);
        token = '';
      }
      continue;
    }
    token += char;
  }

  if (quote) return null;
  if (token.length > 0) tokens.push(token);
  return tokens;
}

async function executeCommand(args: any, root: any, serverOptions: any, payloadSource: any) : Promise<any>{
  const command: any = stringField(args, 'command') ?? '';
  const timeoutSec: any = Math.min(300, Math.max(1, integerField(args, 'timeout') ?? 60));
  const workingDir: any = resolve(root, stringField(args, 'working_directory') ?? '.');
  const breakGlassOperationId: any = stringField(args, 'break_glass_operation_id');

  if (!command) throw new Error('execute_command_requires_command');

  const agentPolicy: any = resolveAgentShellPolicy(root);
  if (!agentPolicy.allowed) {
    throw new Error(agentPolicy.error);
  }

  const category: any = classifyCommand(command, { root, workingDir, agentPolicy });

  if (category === APPROVAL_BLOCK) {
    throw new Error(`shell_mcp_command_blocked: "${command}" matches a blocked pattern`);
  }

  let breakGlass: any = null;
  if (breakGlassOperationId) {
    if (category !== APPROVAL_PROMPT) {
      throw new Error(`break_glass_operation_unnecessary_for_category: ${category}`);
    }
    breakGlass = validateBreakGlassExecution({
      root,
      operationId: breakGlassOperationId,
      command,
      workingDir,
      agentPolicy,
    });
  }

  if (category === APPROVAL_PROMPT && !serverOptions.autoApprove) {
    if (breakGlass) {
      // A valid open operation is the explicit operator approval record for
      // this otherwise prompt-gated command.
    } else {
      return toolResult({
        command,
        working_directory: workingDir,
        approval_required: true,
        approval_category: APPROVAL_PROMPT,
        payload_source: payloadSource,
        payload_ref: payloadSource?.ref ?? null,
        payload_sha256: payloadSource?.sha256 ?? null,
        reason: 'Command is not on the auto-approve whitelist. Client must obtain operator approval before executing.',
      });
    }
  }

  const start: any = Date.now();
  const result: any = await runShell(command, workingDir, timeoutSec * 1000);
  const duration: any = Date.now() - start;

  logExecution(root, command, workingDir, result.exitCode, duration, agentPolicy, payloadSource);
  if (breakGlass) {
    appendBreakGlassEvent(root, {
      event_type: 'command_executed',
      operation_id: breakGlass.operation.operation_id,
      agent_id: agentPolicy.agent_id,
      role: agentPolicy.role,
      carrier_session_id: process.env.NARADA_CARRIER_SESSION_ID ?? null,
      command: command.slice(0, 1000),
      payload_source: payloadSource,
      payload_ref: payloadSource?.ref ?? null,
      payload_sha256: payloadSource?.sha256 ?? null,
      working_directory: workingDir,
      approval_category: category,
      exit_code: result.exitCode,
      duration_ms: duration,
      stdout_preview: result.stdout.slice(0, 2000),
      stderr_preview: result.stderr.slice(0, 2000),
      timed_out: result.timed_out,
    });
  }

  return toolResult({
    agent_id: agentPolicy.agent_id,
    role: agentPolicy.role,
    capability_policy: agentPolicy.capability_policy,
    command,
    payload_source: payloadSource,
    payload_ref: payloadSource?.ref ?? null,
    payload_sha256: payloadSource?.sha256 ?? null,
    working_directory: workingDir,
    exit_code: result.exitCode,
    duration_ms: duration,
    stdout: result.stdout,
    stderr: result.stderr,
    approval_category: category,
    break_glass_operation_id: breakGlass?.operation.operation_id ?? null,
    break_glass_authority: breakGlass ? 'operator_explicit_break_glass_record' : null,
  });
}

function breakGlassOpen(args: any, root: any) : any{
  const agentPolicy: any = resolveAgentShellPolicy(root);
  if (!agentPolicy.allowed) throw new Error(agentPolicy.error);

  const reason: any = requiredString(args, 'reason');
  const operatorAuthorizationRef: any = requiredString(args, 'operator_authorization_ref');
  const operatorAuthorizationText: any = requiredString(args, 'operator_authorization_text');
  const scope: any = normalizeBreakGlassScope(args.scope, root);
  const expiresAt: any = resolveBreakGlassExpiry(args);
  const now: any = new Date().toISOString();
  const operationId: any = `bg_${now.replace(/[-:.TZ]/g, '').slice(0, 14)}_${randomUUID().slice(0, 8)}`;
  const event: any = {
    event_type: 'opened',
    operation_id: operationId,
    agent_id: agentPolicy.agent_id,
    role: agentPolicy.role,
    carrier_session_id: process.env.NARADA_CARRIER_SESSION_ID ?? null,
    reason,
    operator_authorization_ref: operatorAuthorizationRef,
    operator_authorization_text: operatorAuthorizationText,
    scope,
    expires_at: expiresAt,
    status_after: 'open',
  };
  appendBreakGlassEvent(root, event, now);
  return {
    schema: 'narada.break_glass.operation.v0',
    status: 'open',
    operation_id: operationId,
    agent_id: agentPolicy.agent_id,
    carrier_session_id: event.carrier_session_id,
    reason,
    operator_authorization_ref: operatorAuthorizationRef,
    scope,
    expires_at: expiresAt,
    record_path: breakGlassLedgerPath(root),
  };
}

function breakGlassStatus(args: any, root: any) : any{
  const agentPolicy: any = resolveAgentShellPolicy(root);
  if (!agentPolicy.allowed) throw new Error(agentPolicy.error);

  const operationId: any = stringField(args, 'operation_id');
  if (operationId) {
    const operation: any = readBreakGlassOperation(root, operationId);
    if (!operation) throw new Error(`break_glass_operation_not_found: ${operationId}`);
    return {
      schema: 'narada.break_glass.status.v0',
      status: 'ok',
      operation,
    };
  }

  const limit: any = Math.min(100, Math.max(1, integerField(args, 'limit') ?? 20));
  return {
    schema: 'narada.break_glass.status_list.v0',
    status: 'ok',
    operations: listBreakGlassOperations(root).slice(-limit).reverse(),
  };
}

function breakGlassClose(args: any, root: any) : any{
  const agentPolicy: any = resolveAgentShellPolicy(root);
  if (!agentPolicy.allowed) throw new Error(agentPolicy.error);

  const operationId: any = requiredString(args, 'operation_id');
  const operation: any = readBreakGlassOperation(root, operationId);
  if (!operation) throw new Error(`break_glass_operation_not_found: ${operationId}`);
  if (operation.status !== 'open') throw new Error(`break_glass_operation_not_open: ${operationId} status=${operation.status}`);
  if (operation.agent_id !== agentPolicy.agent_id) {
    throw new Error(`break_glass_operation_agent_mismatch: operation=${operation.agent_id} caller=${agentPolicy.agent_id}`);
  }

  const closureStatus: any = requiredString(args, 'closure_status');
  if (!['completed', 'blocked', 'aborted'].includes(closureStatus)) {
    throw new Error(`break_glass_close_invalid_closure_status: ${closureStatus}`);
  }
  const verification: any = arrayField(args, 'verification').map((item: any) => item.trim()).filter(Boolean);
  if (verification.length === 0) throw new Error('break_glass_close_requires_verification');
  const residualRisk: any = requiredString(args, 'residual_risk');
  const summary: any = requiredString(args, 'summary');
  const statusAfter: any = closureStatus === 'completed' ? 'closed' : closureStatus;

  appendBreakGlassEvent(root, {
    event_type: 'closed',
    operation_id: operationId,
    agent_id: agentPolicy.agent_id,
    role: agentPolicy.role,
    carrier_session_id: process.env.NARADA_CARRIER_SESSION_ID ?? null,
    closure_status: closureStatus,
    status_after: statusAfter,
    summary,
    verification,
    residual_risk: residualRisk,
  });

  return {
    schema: 'narada.break_glass.close.v0',
    status: statusAfter,
    operation_id: operationId,
    closure_status: closureStatus,
    summary,
    verification,
    residual_risk: residualRisk,
  };
}

function validateBreakGlassExecution({ root, operationId, command, workingDir, agentPolicy }: any) : any{
  const operation: any = readBreakGlassOperation(root, operationId);
  if (!operation) throw new Error(`break_glass_operation_not_found: ${operationId}`);
  if (operation.status !== 'open') throw new Error(`break_glass_operation_not_open: ${operationId} status=${operation.status}`);
  if (operation.agent_id !== agentPolicy.agent_id) {
    throw new Error(`break_glass_operation_agent_mismatch: operation=${operation.agent_id} caller=${agentPolicy.agent_id}`);
  }
  const callerCarrier: any = process.env.NARADA_CARRIER_SESSION_ID ?? null;
  if (operation.carrier_session_id && operation.carrier_session_id !== callerCarrier) {
    throw new Error(`break_glass_operation_carrier_mismatch: operation=${operation.carrier_session_id} caller=${callerCarrier ?? 'none'}`);
  }
  if (Date.parse(operation.expires_at) <= Date.now()) {
    throw new Error(`break_glass_operation_expired: ${operationId}`);
  }

  const allowedRoots: any = operation.scope?.allowed_roots ?? [];
  if (!allowedRoots.some((allowedRoot: any) => isPathWithin(workingDir, allowedRoot))) {
    throw new Error(`break_glass_working_directory_out_of_scope: ${workingDir}`);
  }

  const allowedCommands: any = operation.scope?.allowed_commands ?? [];
  const allowedPrefixes: any = operation.scope?.allowed_command_prefixes ?? [];
  const commandAllowed: any = allowedCommands.includes(command)
    || allowedPrefixes.some((prefix: any) => command.startsWith(prefix));
  if (!commandAllowed) {
    throw new Error(`break_glass_command_out_of_scope: ${command}`);
  }

  return { operation };
}

function normalizeBreakGlassScope(scopeValue: any, root: any) : any{
  const scope: any = asRecord(scopeValue);
  const allowedRoots: any = arrayField(scope, 'allowed_roots');
  const allowedCommands: any = arrayField(scope, 'allowed_commands').map((command: any) => command.trim()).filter(Boolean);
  const allowedCommandPrefixes: any = arrayField(scope, 'allowed_command_prefixes').map((command: any) => command.trim()).filter(Boolean);
  const forbiddenActions: any = arrayField(scope, 'forbidden_actions').map((item: any) => item.trim()).filter(Boolean);

  if (allowedRoots.length === 0) throw new Error('break_glass_open_requires_allowed_roots');
  if (allowedCommands.length === 0 && allowedCommandPrefixes.length === 0) {
    throw new Error('break_glass_open_requires_allowed_commands');
  }

  return {
    allowed_roots: allowedRoots.map((inputPath: any) => resolveUnderRoot(inputPath, root)),
    allowed_commands: allowedCommands,
    allowed_command_prefixes: allowedCommandPrefixes,
    forbidden_actions: forbiddenActions,
  };
}

function resolveBreakGlassExpiry(args: any) : any{
  const explicit: any = stringField(args, 'expires_at');
  if (explicit) {
    const parsed: any = Date.parse(explicit);
    if (!Number.isFinite(parsed)) throw new Error(`break_glass_invalid_expires_at: ${explicit}`);
    if (parsed <= Date.now()) throw new Error(`break_glass_expires_at_must_be_future: ${explicit}`);
    return new Date(parsed).toISOString();
  }

  const ttlSeconds: any = Math.min(3600, Math.max(60, integerField(args, 'ttl_seconds') ?? 900));
  return new Date(Date.now() + ttlSeconds * 1000).toISOString();
}

function appendBreakGlassEvent(root: any, event: any, observedAt: any = new Date().toISOString()) : any{
  const path: any = breakGlassLedgerPath(root);
  const dir: any = resolve(path, '..');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const entry: any = {
    schema: 'narada.break_glass.operation_event.v0',
    observed_at: observedAt,
    ...event,
  };
  appendFileSync(path, `${JSON.stringify(entry)}\n`, 'utf-8');
}

function breakGlassLedgerPath(root: any) : any{
  return resolve(root, '.ai', 'break-glass', 'operations.jsonl');
}

function readBreakGlassOperation(root: any, operationId: any) : any{
  return listBreakGlassOperations(root).find((operation: any) => operation.operation_id === operationId) ?? null;
}

function listBreakGlassOperations(root: any) : any{
  const path: any = breakGlassLedgerPath(root);
  if (!existsSync(path)) return [];
  const events: any = readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((line: any) => line.trim())
    .filter(Boolean)
    .map((line: any) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
  const byId: any = new Map();
  for (const event of events) {
    const operationId: any = event.operation_id;
    if (!operationId) continue;
    if (!byId.has(operationId)) {
      byId.set(operationId, {
        operation_id: operationId,
        status: 'unknown',
        events: [],
        commands: [],
      });
    }
    const operation: any = byId.get(operationId);
    operation.events.push(event);
    if (event.event_type === 'opened') {
      Object.assign(operation, {
        schema: 'narada.break_glass.operation.v0',
        status: event.status_after ?? 'open',
        agent_id: event.agent_id,
        role: event.role,
        carrier_session_id: event.carrier_session_id ?? null,
        reason: event.reason,
        operator_authorization_ref: event.operator_authorization_ref,
        operator_authorization_text: event.operator_authorization_text,
        scope: event.scope,
        opened_at: event.observed_at,
        expires_at: event.expires_at,
      });
    } else if (event.event_type === 'command_executed') {
      operation.commands.push({
        observed_at: event.observed_at,
        command: event.command,
        payload_source: event.payload_source ?? null,
        payload_ref: event.payload_ref ?? null,
        payload_sha256: event.payload_sha256 ?? null,
        working_directory: event.working_directory,
        exit_code: event.exit_code,
        duration_ms: event.duration_ms,
        timed_out: event.timed_out,
      });
    } else if (event.event_type === 'closed') {
      Object.assign(operation, {
        status: event.status_after ?? 'closed',
        closure_status: event.closure_status,
        closed_at: event.observed_at,
        summary: event.summary,
        verification: event.verification ?? [],
        residual_risk: event.residual_risk,
      });
    }
  }
  return [...byId.values()];
}

function isPathWithin(candidate: any, root: any) : any{
  const rel: any = relative(root, candidate);
  return rel === '' || (!rel.startsWith('..\\') && !rel.startsWith('../') && rel !== '..');
}

function requiredString(record: any, key: any) : any{
  const value: any = stringField(record, key)?.trim();
  if (!value) throw new Error(`${key}_required`);
  return value;
}

function normalizeLineEndings(args: any, root: any) : any{
  const agentPolicy: any = resolveAgentShellPolicy(root);
  if (!agentPolicy.allowed) {
    throw new Error(agentPolicy.error);
  }

  const mode: any = stringField(args, 'mode') ?? 'match_head';
  if (mode !== 'match_head') throw new Error(`normalize_line_endings_unsupported_mode: ${mode}`);

  const paths: any = arrayField(args, 'paths');
  if (paths.length === 0) throw new Error('normalize_line_endings_requires_paths');
  if (paths.length > 20) throw new Error('normalize_line_endings_too_many_paths');

  const dryRun: any = booleanField(args, 'dry_run') ?? false;
  const results: any = [];

  for (const inputPath of paths) {
    const { absolutePath, relativePath }: any = resolveExplicitTrackedPath(inputPath, root);
    enforceAgentPathPolicy({
      siteRoot: root,
      agentId: agentPolicy.agent_id,
      absolutePath,
      operation: 'normalize_line_endings',
    });
    const headBytes: any = readHeadBlob(root, relativePath);
    const workingBytes: any = readFileSync(absolutePath);
    const headStyle: any = detectLineEndingStyle(headBytes);
    const targetStyle: any = headStyle === 'none' ? 'lf' : headStyle;
    const normalizedBytes: any = applyLineEndingStyle(workingBytes, targetStyle);
    const changed: any = !normalizedBytes.equals(workingBytes);

    if (changed && !dryRun) {
      writeFileSync(absolutePath, normalizedBytes);
    }

    results.push({
      path: relativePath,
      tracked: true,
      mode,
      dry_run: dryRun,
      head_line_ending: headStyle,
      target_line_ending: targetStyle,
      working_line_ending_before: detectLineEndingStyle(workingBytes),
      changed,
      bytes_before: workingBytes.length,
      bytes_after: normalizedBytes.length,
    });
  }

  logNormalization(root, results, dryRun, agentPolicy);

  return {
    status: 'ok',
    agent_id: agentPolicy.agent_id,
    role: agentPolicy.role,
    operation: 'normalize_line_endings',
    dry_run: dryRun,
    results,
  };
}

function resolveExplicitTrackedPath(inputPath: any, root: any) : any{
  rejectSuspiciousPath(inputPath);
  if (/[*?[\]{}]/.test(inputPath)) throw new Error(`normalize_line_endings_rejects_globs: ${inputPath}`);
  const absolutePath: any = resolveUnderRoot(inputPath, root);
  const relativePath: any = normalizeRelativePath(relative(root, absolutePath));
  if (!existsSync(absolutePath)) throw new Error(`normalize_line_endings_path_not_found: ${relativePath}`);
  ensureTrackedPath(root, relativePath);
  return { absolutePath, relativePath };
}

function ensureTrackedPath(root: any, relativePath: any) : any{
  const result: any = runProcessSync('git', ['ls-files', '--error-unmatch', '--', relativePath], root);
  if (result.status !== 0) throw new Error(`normalize_line_endings_untracked_path: ${relativePath}`);
}

function readHeadBlob(root: any, relativePath: any) : any{
  const result: any = runProcessSync('git', ['show', `HEAD:${relativePath}`], root);
  if (result.status !== 0) throw new Error(`normalize_line_endings_head_blob_unavailable: ${relativePath}`);
  return result.stdout;
}

function gitStagePaths(args: any, root: any) : any{
  const agentPolicy: any = resolveAgentShellPolicy(root);
  if (!agentPolicy.allowed) {
    throw new Error(agentPolicy.error);
  }
  const authorityBasis: any = requireGitAuthority(args);
  const dryRun: any = booleanField(args, 'dry_run') ?? false;
  const work: any = resolveGitWorkContext(args, root);
  const paths: any = resolveGitStagePaths(args, work.repoRoot, root, agentPolicy);
  let stagedPaths: any = paths;

  if (!dryRun) {
    const result: any = runGitSync(work.repoRoot, ['add', '--', ...paths]);
    if (result.status !== 0) throw new Error(`git_stage_paths_failed: ${result.stderrText || result.stdoutText}`);
    const stagedSet: any = new Set(readGitStagedFiles(work.repoRoot));
    stagedPaths = paths.filter((path: any) => stagedSet.has(path));
  }

  const residuals: any = readGitDirtyFiles(work.repoRoot).filter((path: any) => !stagedPaths.includes(path));
  const payload: any = {
    status: 'ok',
    operation: 'git_stage_paths',
    agent_id: agentPolicy.agent_id,
    role: agentPolicy.role,
    dry_run: dryRun,
    working_directory: work.workingDir,
    repo_root: work.repoRoot,
    authority_basis: authorityBasis,
    requested_paths: paths,
    staged_paths: stagedPaths,
    residual_dirty_files: residuals,
  };
  logGitOperation(root, payload, agentPolicy);
  return payload;
}

function gitCommit(args: any, root: any) : any{
  const agentPolicy: any = resolveAgentShellPolicy(root);
  if (!agentPolicy.allowed) {
    throw new Error(agentPolicy.error);
  }
  const authorityBasis: any = requireGitAuthority(args);
  const message: any = stringField(args, 'message')?.trim();
  if (!message) throw new Error('git_commit_requires_message');
  const dryRun: any = booleanField(args, 'dry_run') ?? false;
  const work: any = resolveGitWorkContext(args, root);
  const stagedPaths: any = readGitStagedFiles(work.repoRoot);
  if (stagedPaths.length === 0) throw new Error('git_commit_requires_staged_changes');

  let commitSha: any = null;
  if (!dryRun) {
    const result: any = runGitSync(work.repoRoot, ['commit', '-m', message]);
    if (result.status !== 0) throw new Error(`git_commit_failed: ${result.stderrText || result.stdoutText}`);
    commitSha = readGitScalar(work.repoRoot, ['rev-parse', 'HEAD'], 'git_commit_head_unavailable');
  }

  const payload: any = {
    status: 'ok',
    operation: 'git_commit',
    agent_id: agentPolicy.agent_id,
    role: agentPolicy.role,
    dry_run: dryRun,
    working_directory: work.workingDir,
    repo_root: work.repoRoot,
    authority_basis: authorityBasis,
    message,
    staged_paths: stagedPaths,
    commit_sha: commitSha,
    residual_dirty_files: readGitDirtyFiles(work.repoRoot),
  };
  logGitOperation(root, payload, agentPolicy);
  return payload;
}

function gitPushCurrent(args: any, root: any) : any{
  const agentPolicy: any = resolveAgentShellPolicy(root);
  if (!agentPolicy.allowed) {
    throw new Error(agentPolicy.error);
  }
  const authorityBasis: any = requireGitAuthority(args);
  const dryRun: any = booleanField(args, 'dry_run') ?? false;
  const work: any = resolveGitWorkContext(args, root);
  const prePush: any = readGitPushPlan(work.repoRoot);

  const push: any = dryRun
    ? { status: 'planned', confirmed: false, ...prePush, state: { planned: prePush } }
    : runPushAndClassify(work.repoRoot, prePush, { cleanStatus: 'pushed' });
  const payload: any = {
    status: dryRun ? 'ok' : push.operation_status,
    operation: 'git_push_current',
    agent_id: agentPolicy.agent_id,
    role: agentPolicy.role,
    dry_run: dryRun,
    working_directory: work.workingDir,
    repo_root: work.repoRoot,
    authority_basis: authorityBasis,
    ...push,
    push_state: push.state,
    residual_dirty_files: readGitDirtyFiles(work.repoRoot),
  };
  logGitOperation(root, payload, agentPolicy);
  return payload;
}

function gitCommitAndPushIncrement(args: any, root: any) : any{
  const agentPolicy: any = resolveAgentShellPolicy(root);
  if (!agentPolicy.allowed) {
    throw new Error(agentPolicy.error);
  }
  requireGitAuthority(args);
  const dryRun: any = booleanField(args, 'dry_run') ?? false;

  if (dryRun) {
    const stage: any = gitStagePaths({ ...args, dry_run: true }, root);
    const work: any = resolveGitWorkContext(args, root);
    const pushPlan: any = readGitPushPlan(work.repoRoot);
    const intendedSourcePaths: any = classifyIntendedSourcePaths(args, work.repoRoot, root, agentPolicy, stage.staged_paths);
    const payload: any = {
      status: 'ok',
      operation: 'git_commit_and_push_increment',
      agent_id: agentPolicy.agent_id,
      role: agentPolicy.role,
      dry_run: true,
      staged_paths: stage.staged_paths,
      message: stringField(args, 'message')?.trim() ?? '',
      push: pushPlan,
      residual_dirty_files: stage.residual_dirty_files,
      residual_dirty_file_drift: buildResidualDirtyFileDrift(stage.residual_dirty_files, stage.residual_dirty_files),
      intended_source_paths: intendedSourcePaths,
      authority_basis: stage.authority_basis,
      payload_source: args.__payload_source,
    };
    logGitOperation(root, payload, agentPolicy);
    return payload;
  }

  const work: any = resolveGitWorkContext(args, root);
  const residualsBefore: any = readGitDirtyFiles(work.repoRoot);
  let stage: any;
  try {
    stage = gitStagePaths(args, root);
  } catch (error: any) {
    const stagedAfterFailure: any = readGitStagedFiles(work.repoRoot);
    const requestedPaths: any = safeResolveGitStagePaths(args, work.repoRoot, root, agentPolicy);
    const partialStagedPaths: any = requestedPaths.filter((path: any) => stagedAfterFailure.includes(path));
    const payload: any = {
      status: 'stage_failed',
      operation: 'git_commit_and_push_increment',
      schema: 'narada.shell_mcp.git_commit_and_push_increment.stage_failed.v0',
      agent_id: agentPolicy.agent_id,
      role: agentPolicy.role,
      dry_run: false,
      requested_paths: requestedPaths,
      staged_paths_after_failure: stagedAfterFailure,
      partial_staging_performed: partialStagedPaths.length > 0,
      partial_staged_paths: partialStagedPaths,
      stage_error: error instanceof Error ? error.message : String(error),
      recovery_guidance: partialStagedPaths.length > 0
        ? 'Partial staging was detected. Inspect git status, then unstage partial paths or commit them through a coherent audited path before retrying.'
        : 'No requested paths appear staged after the failed staging operation. Correct the path/refusal and retry.',
      residual_dirty_files_before: residualsBefore,
      residual_dirty_files_after: readGitDirtyFiles(work.repoRoot),
      residual_dirty_file_drift: buildResidualDirtyFileDrift(residualsBefore, readGitDirtyFiles(work.repoRoot)),
      intended_source_paths: classifyIntendedSourcePaths(args, work.repoRoot, root, agentPolicy, stagedAfterFailure),
      authority_basis: requireGitAuthority(args),
      payload_source: args.__payload_source,
    };
    logGitOperation(root, payload, agentPolicy);
    return payload;
  }
  const scopedIndex: any = buildScopedStagedIndex({
    stagedPaths: readGitStagedFiles(work.repoRoot),
    allowedPaths: stage.staged_paths,
    args,
  });
  if (!scopedIndex.scoped_commit && !scopedIndex.override_approved) {
    const payload: any = {
      status: 'blocked_staged_index_outside_scope',
      operation: 'git_commit_and_push_increment',
      schema: 'narada.shell_mcp.scoped_commit_guard.v0',
      agent_id: agentPolicy.agent_id,
      role: agentPolicy.role,
      dry_run: false,
      staged_paths: stage.staged_paths,
      staged_index_scope: scopedIndex,
      message: stringField(args, 'message')?.trim() ?? '',
      residual_dirty_files: stage.residual_dirty_files,
      residual_dirty_file_drift: buildResidualDirtyFileDrift(stage.residual_dirty_files, stage.residual_dirty_files),
      intended_source_paths: classifyIntendedSourcePaths(args, work.repoRoot, root, agentPolicy, stage.staged_paths),
      authority_basis: stage.authority_basis,
      payload_source: args.__payload_source,
      recovery_guidance: 'Unstage out_of_scope_staged_paths or retry with allow_staged_outside_scope=true and an authority summary that explicitly owns the integration.',
    };
    logGitOperation(root, payload, agentPolicy);
    return payload;
  }
  const commit: any = gitCommit(args, root);
  const pushPlanBefore: any = readGitPushPlan(work.repoRoot);
  const push: any = runPushAndClassify(work.repoRoot, pushPlanBefore, { cleanStatus: 'pushed' });
  const residualsAfter: any = readGitDirtyFiles(work.repoRoot);
  const payload: any = {
    status: push.operation_status,
    operation: 'git_commit_and_push_increment',
    agent_id: agentPolicy.agent_id,
    role: agentPolicy.role,
    dry_run: false,
    staged_paths: stage.staged_paths,
    message: commit.message,
    commit_sha: commit.commit_sha,
    commit_created: true,
    push_confirmed: push.confirmed,
    push,
    residual_dirty_files: residualsAfter,
    residual_dirty_file_drift: buildResidualDirtyFileDrift(stage.residual_dirty_files, residualsAfter),
    intended_source_paths: classifyIntendedSourcePaths(args, work.repoRoot, root, agentPolicy, stage.staged_paths),
    authority_basis: stage.authority_basis,
    payload_source: args.__payload_source,
  };
  logGitOperation(root, payload, agentPolicy);
  return payload;
}

function gitTaskCloseoutCommitAndPush(args: any, root: any) : any{
  const agentPolicy: any = resolveAgentShellPolicy(root);
  if (!agentPolicy.allowed) {
    throw new Error(agentPolicy.error);
  }
  const authorityBasis: any = requireGitAuthority(args);
  const taskNumber: any = integerField(args, 'task_number');
  if (!taskNumber) throw new Error('git_task_closeout_commit_and_push_requires_task_number');
  const message: any = stringField(args, 'message')?.trim();
  if (!message) throw new Error('git_task_closeout_commit_and_push_requires_message');
  const dryRun: any = booleanField(args, 'dry_run') ?? false;
  const work: any = resolveGitWorkContext(args, root);
  const taskProjectionPath: any = resolveTaskProjectionPath(taskNumber, work.repoRoot);
  const explicitPaths: any = arrayField(args, 'paths');
  const paths: any = resolveGitStagePaths({ ...args, paths: [...explicitPaths, taskProjectionPath] }, work.repoRoot, root, agentPolicy);
  const dirtyFiles: any = readGitDirtyFiles(work.repoRoot);
  const stagedOrDirty: any = paths.filter((path: any) => dirtyFiles.includes(path) || readGitStagedFiles(work.repoRoot).includes(path));
  const residuals: any = dirtyFiles.filter((path: any) => !paths.includes(path));
  const pushPlanBefore: any = readGitPushPlan(work.repoRoot);
  const intendedSourcePaths: any = classifyIntendedSourcePaths(args, work.repoRoot, root, agentPolicy, paths);
  const stagePathClassifications: any = paths.map((path: any) => classifyIntendedSourcePath(path, work.repoRoot, root, agentPolicy, new Set()));
  const ignoredStagePaths: any = stagePathClassifications.filter((item: any) => item.status === 'ignored').map((item: any) => item.path);
  if (ignoredStagePaths.length > 0) {
    const payload: any = {
      status: 'blocked_ignored_paths',
      operation: 'git_task_closeout_commit_and_push',
      schema: 'narada.shell_mcp.git_task_closeout_commit_and_push.ignored_path_preflight.v0',
      agent_id: agentPolicy.agent_id,
      role: agentPolicy.role,
      dry_run: dryRun,
      task_number: taskNumber,
      task_projection_path: taskProjectionPath,
      staged_paths: paths,
      ignored_stage_paths: ignoredStagePaths,
      commit_sha: null,
      push: { status: 'blocked', ...pushPlanBefore },
      residual_dirty_files: residuals,
      residual_dirty_file_drift: buildResidualDirtyFileDrift(residuals, residuals),
      intended_source_paths: intendedSourcePaths.length > 0 ? intendedSourcePaths : stagePathClassifications,
      authority_basis: authorityBasis,
      closeout_sequence: 'finish_first_then_run_this_tool_to_commit_task_projection_and_task_owned_paths',
      payload_source: args.__payload_source,
      recovery_guidance: 'Remove ignored paths from ordinary task closeout paths. For admitted .ai/inbox-envelopes JSON exports, use git_handoff_inbox_envelope_export with the exact envelope path.',
    };
    logGitOperation(root, payload, agentPolicy);
    return payload;
  }

  if (stagedOrDirty.length === 0) {
    const payload: any = {
      status: 'no_changes',
      operation: 'git_task_closeout_commit_and_push',
      schema: 'narada.shell_mcp.git_task_closeout_commit_and_push.v0',
      agent_id: agentPolicy.agent_id,
      role: agentPolicy.role,
      dry_run: dryRun,
      task_number: taskNumber,
      task_projection_path: taskProjectionPath,
      staged_paths: paths,
      commit_sha: null,
      push: { status: 'not_needed', ...pushPlanBefore },
      residual_dirty_files: residuals,
      residual_dirty_file_drift: buildResidualDirtyFileDrift(residuals, residuals),
      intended_source_paths: intendedSourcePaths,
      authority_basis: authorityBasis,
      closeout_sequence: 'finish_first_then_run_this_tool_to_commit_task_projection_and_task_owned_paths',
      payload_source: args.__payload_source,
    };
    logGitOperation(root, payload, agentPolicy);
    return payload;
  }

  if (dryRun) {
    const payload: any = {
      status: 'ok',
      operation: 'git_task_closeout_commit_and_push',
      schema: 'narada.shell_mcp.git_task_closeout_commit_and_push.v0',
      agent_id: agentPolicy.agent_id,
      role: agentPolicy.role,
      dry_run: true,
      task_number: taskNumber,
      task_projection_path: taskProjectionPath,
      staged_paths: paths,
      message,
      commit_sha: null,
      push: { status: 'planned', ...pushPlanBefore },
      residual_dirty_files: residuals,
      residual_dirty_file_drift: buildResidualDirtyFileDrift(residuals, residuals),
      intended_source_paths: intendedSourcePaths,
      authority_basis: authorityBasis,
      closeout_sequence: 'finish_first_then_run_this_tool_to_commit_task_projection_and_task_owned_paths',
      payload_source: args.__payload_source,
    };
    logGitOperation(root, payload, agentPolicy);
    return payload;
  }

  const stageResult: any = runGitSync(work.repoRoot, ['add', '--', ...paths]);
  if (stageResult.status !== 0) throw new Error(`git_task_closeout_commit_and_push_stage_failed: ${stageResult.stderrText || stageResult.stdoutText}`);
  const scopedIndex: any = buildScopedStagedIndex({
    stagedPaths: readGitStagedFiles(work.repoRoot),
    allowedPaths: paths,
    args,
  });
  if (!scopedIndex.scoped_commit && !scopedIndex.override_approved) {
    const payload: any = {
      status: 'blocked_staged_index_outside_scope',
      operation: 'git_task_closeout_commit_and_push',
      schema: 'narada.shell_mcp.scoped_commit_guard.v0',
      agent_id: agentPolicy.agent_id,
      role: agentPolicy.role,
      dry_run: false,
      task_number: taskNumber,
      task_projection_path: taskProjectionPath,
      staged_paths: paths,
      message,
      commit_sha: null,
      push: { status: 'blocked', ...pushPlanBefore },
      residual_dirty_files: residuals,
      residual_dirty_file_drift: buildResidualDirtyFileDrift(residuals, residuals),
      intended_source_paths: classifyIntendedSourcePaths(args, work.repoRoot, root, agentPolicy, paths),
      staged_index_scope: scopedIndex,
      authority_basis: authorityBasis,
      closeout_sequence: 'finish_first_then_run_this_tool_to_commit_task_projection_and_task_owned_paths',
      payload_source: args.__payload_source,
      recovery_guidance: 'Unstage out_of_scope_staged_paths or retry with allow_staged_outside_scope=true and an authority summary that explicitly owns the integration.',
    };
    logGitOperation(root, payload, agentPolicy);
    return payload;
  }
  const commitResult: any = runGitSync(work.repoRoot, ['commit', '-m', message]);
  if (commitResult.status !== 0) throw new Error(`git_task_closeout_commit_and_push_commit_failed: ${commitResult.stderrText || commitResult.stdoutText}`);
  const commitSha: any = readGitScalar(work.repoRoot, ['rev-parse', 'HEAD'], 'git_task_closeout_commit_and_push_head_unavailable');
  const pushPlanAfterCommit: any = readGitPushPlan(work.repoRoot);
  const push: any = runPushAndClassify(work.repoRoot, pushPlanAfterCommit, { cleanStatus: 'pushed' });
  const residualsAfter: any = readGitDirtyFiles(work.repoRoot).filter((path: any) => !paths.includes(path));
  const payload: any = {
    status: push.operation_status,
    operation: 'git_task_closeout_commit_and_push',
    schema: 'narada.shell_mcp.git_task_closeout_commit_and_push.v0',
    agent_id: agentPolicy.agent_id,
    role: agentPolicy.role,
    dry_run: false,
    task_number: taskNumber,
    task_projection_path: taskProjectionPath,
    staged_paths: paths,
    message,
    commit_sha: commitSha,
    commit_created: true,
    push_confirmed: push.confirmed,
    push,
    residual_dirty_files: residualsAfter,
    residual_dirty_file_drift: buildResidualDirtyFileDrift(residuals, residualsAfter),
    intended_source_paths: classifyIntendedSourcePaths(args, work.repoRoot, root, agentPolicy, paths),
    authority_basis: authorityBasis,
    closeout_sequence: 'finish_first_then_run_this_tool_to_commit_task_projection_and_task_owned_paths',
    payload_source: args.__payload_source,
  };
  logGitOperation(root, payload, agentPolicy);
  return payload;
}

function buildScopedStagedIndex({ stagedPaths, allowedPaths, args }: any) : any{
  const allowed: any = new Set(allowedPaths);
  const outOfScope: any = stagedPaths.filter((path: any) => !allowed.has(path));
  const overrideApproved: any = booleanField(args, 'allow_staged_outside_scope') === true;
  return {
    schema: 'narada.shell_mcp.scoped_staged_index.v0',
    scoped_commit: outOfScope.length === 0,
    override_approved: overrideApproved,
    yes_no_scoped_commit_classification: outOfScope.length === 0 ? 'yes' : 'no',
    staged_paths: stagedPaths,
    declared_scope_paths: allowedPaths,
    out_of_scope_staged_paths: outOfScope,
    cached_diff_ownership_summary: {
      declared_scope_count: allowedPaths.length,
      staged_count: stagedPaths.length,
      out_of_scope_count: outOfScope.length,
      rule: 'Commit may proceed only when every staged path is inside the declared mutation scope, unless allow_staged_outside_scope is explicit.',
    },
  };
}

function resolveTaskProjectionPath(taskNumber: any, repoRoot: any) : any{
  const taskDir: any = resolve(repoRoot, '.ai', 'do-not-open', 'tasks');
  if (!existsSync(taskDir)) throw new Error('git_task_closeout_commit_and_push_task_dir_not_found');
  const prefix: any = `${String(taskNumber).padStart(0, '0')}`;
  const match: any = readdirSync(taskDir).find((name: any) => name.includes(`-${taskNumber}-`) && name.endsWith('.md'))
    ?? readdirSync(taskDir).find((name: any) => name.startsWith(`${taskNumber}-`) && name.endsWith('.md'))
    ?? readdirSync(taskDir).find((name: any) => name.includes(prefix) && name.endsWith('.md'));
  if (!match) throw new Error(`git_task_closeout_commit_and_push_task_not_found: ${taskNumber}`);
  return normalizeRelativePath(relative(repoRoot, resolve(taskDir, match)));
}

function gitHandoffInboxEnvelopeExport(args: any, root: any) : any{
  const agentPolicy: any = resolveAgentShellPolicy(root);
  if (!agentPolicy.allowed) {
    throw new Error(agentPolicy.error);
  }
  const authorityBasis: any = requireGitAuthority(args);
  const message: any = stringField(args, 'message')?.trim();
  if (!message) throw new Error('git_handoff_inbox_envelope_export_requires_message');
  const dryRun: any = booleanField(args, 'dry_run') ?? false;
  const work: any = resolveGitWorkContext(args, root);
  const envelope: any = resolveInboxEnvelopeExportPath(args, work.repoRoot, root, agentPolicy);
  const pushPlanBefore: any = readGitPushPlan(work.repoRoot);

  if (!dryRun) {
    const stageResult: any = runGitSync(work.repoRoot, ['add', '-f', '--', envelope.relativePath]);
    if (stageResult.status !== 0) throw new Error(`git_handoff_inbox_envelope_export_stage_failed: ${stageResult.stderrText || stageResult.stdoutText}`);

    const commitResult: any = runGitSync(work.repoRoot, ['commit', '-m', message]);
    if (commitResult.status !== 0) throw new Error(`git_handoff_inbox_envelope_export_commit_failed: ${commitResult.stderrText || commitResult.stdoutText}`);

    const pushResult: any = runGitSync(work.repoRoot, ['push']);
    if (pushResult.status !== 0) throw new Error(`git_handoff_inbox_envelope_export_push_failed: ${pushResult.stderrText || pushResult.stdoutText}`);
  }

  const commitSha: any = dryRun ? null : readGitScalar(work.repoRoot, ['rev-parse', 'HEAD'], 'git_handoff_inbox_envelope_export_head_unavailable');
  const pushAfter: any = dryRun ? null : readGitPushPlan(work.repoRoot);
  const residuals: any = readGitDirtyAndIgnoredFiles(work.repoRoot).filter((path: any) => path !== envelope.relativePath);
  const payload: any = {
    status: 'ok',
    operation: 'git_handoff_inbox_envelope_export',
    schema: 'narada.shell_mcp.git_handoff_inbox_envelope_export.v0',
    agent_id: agentPolicy.agent_id,
    role: agentPolicy.role,
    dry_run: dryRun,
    working_directory: work.workingDir,
    repo_root: work.repoRoot,
    authority_basis: authorityBasis,
    envelope_id: envelope.envelopeId,
    staged_paths: [envelope.relativePath],
    message,
    commit_sha: commitSha,
    push: dryRun
      ? { status: 'planned', ...pushPlanBefore }
      : { status: 'pushed', ...pushAfter },
    residual_dirty_files: residuals,
  };
  logGitOperation(root, payload, agentPolicy);
  return payload;
}

function resolveInboxEnvelopeExportPath(args: any, repoRoot: any, siteRoot: any, agentPolicy: any) : any{
  const inputPath: any = stringField(args, 'path');
  rejectSuspiciousPath(inputPath);
  if (/[*?\[\]{}]/.test(inputPath)) throw new Error(`git_handoff_inbox_envelope_export_rejects_globs: ${inputPath}`);
  const absolutePath: any = resolveUnderRoot(inputPath, repoRoot);
  enforceAgentPathPolicy({
    siteRoot,
    agentId: agentPolicy.agent_id,
    absolutePath,
    operation: 'git_handoff_inbox_envelope_export',
  });
  const relativePath: any = normalizeRelativePath(relative(repoRoot, absolutePath));
  if (!relativePath.startsWith('.ai/inbox-envelopes/') || !relativePath.endsWith('.json')) {
    throw new Error(`git_handoff_inbox_envelope_export_rejects_non_inbox_export: ${relativePath}`);
  }
  if (!existsSync(absolutePath)) throw new Error(`git_handoff_inbox_envelope_export_path_not_found: ${relativePath}`);

  let envelope: any;
  try {
    envelope = JSON.parse(readFileSync(absolutePath, 'utf8'));
  } catch (error: any) {
    throw new Error(`git_handoff_inbox_envelope_export_invalid_json: ${relativePath}: ${error.message}`);
  }
  const envelopeId: any = typeof envelope?.envelope_id === 'string' ? envelope.envelope_id : '';
  if (!/^env_[0-9a-f-]{36}$/.test(envelopeId)) {
    throw new Error(`git_handoff_inbox_envelope_export_unadmitted_envelope: ${relativePath}`);
  }
  if (!relativePath.includes(envelopeId)) {
    throw new Error(`git_handoff_inbox_envelope_export_filename_mismatch: ${relativePath}`);
  }
  if (!envelope.kind || !envelope.source || !envelope.authority || !envelope.payload || envelope.status !== 'received') {
    throw new Error(`git_handoff_inbox_envelope_export_unadmitted_envelope: ${relativePath}`);
  }

  return { relativePath, absolutePath, envelopeId };
}

function gitCloseoutPreflight(args: any, root: any) : any{
  const agentPolicy: any = resolveAgentShellPolicy(root);
  if (!agentPolicy.allowed) {
    throw new Error(agentPolicy.error);
  }
  const authorityBasis: any = requireGitAuthority(args);
  const taskNumber: any = integerField(args, 'task_number');
  if (!taskNumber) throw new Error('git_closeout_preflight_requires_task_number');
  const work: any = resolveGitWorkContext(args, root);
  const paths: any = resolveGitStagePaths(args, work.repoRoot, root, agentPolicy);
  const dirtyFiles: any = readGitDirtyFiles(work.repoRoot);
  const stagedFiles: any = readGitStagedFiles(work.repoRoot);
  const taskOwnedDirtyFiles: any = dirtyFiles.filter((path: any) => paths.includes(path));
  const residualDirtyFiles: any = dirtyFiles.filter((path: any) => !paths.includes(path));
  const allowSharedIntegration: any = booleanField(args, 'allow_shared_integration') === true;
  const claims: any = rawArrayField(args, 'shared_file_claims').map((claim: any) => ({
    path: normalizeRelativePath(String(claim?.path ?? '')),
    task_number: Number(claim?.task_number),
    summary: String(claim?.summary ?? ''),
  })).filter((claim: any) => claim.path && Number.isFinite(claim.task_number));
  const claimsByPath: any = new Map();
  for (const claim of claims) {
    const list: any = claimsByPath.get(claim.path) ?? [];
    list.push(claim);
    claimsByPath.set(claim.path, list);
  }
  const mixedOwnershipFiles: any = [];
  for (const path of taskOwnedDirtyFiles) {
    const pathClaims: any = claimsByPath.get(path) ?? [];
    const otherClaims: any = pathClaims.filter((claim: any) => claim.task_number !== taskNumber);
    if (otherClaims.length > 0) {
      mixedOwnershipFiles.push({
        path,
        task_number: taskNumber,
        claims: pathClaims,
        reason: 'declared_shared_file_claims_include_other_tasks',
      });
    }
  }
  const hasMixedOwnership: any = mixedOwnershipFiles.length > 0;
  const status: any = hasMixedOwnership
    ? (allowSharedIntegration ? 'integration_required' : 'blocked_mixed_ownership')
    : 'ok';
  const recommendations: any = [];
  if (hasMixedOwnership && !allowSharedIntegration) {
    recommendations.push('Do not stage shared files wholesale for this task. Split hunks with an audited partial-stage path, or create an explicit integration task/commit that owns the shared file.');
  }
  if (hasMixedOwnership && allowSharedIntegration) {
    recommendations.push('Use an integration commit/task report that names all task claims for the shared files and attaches observations to the affected tasks.');
  }
  if (residualDirtyFiles.length > 0) {
    recommendations.push('Stage only task-owned paths; keep residual_dirty_files visible in the closeout report.');
  }

  const payload: any = {
    status,
    operation: 'git_closeout_preflight',
    schema: 'narada.shell_mcp.git_closeout_preflight.v0',
    agent_id: agentPolicy.agent_id,
    role: agentPolicy.role,
    working_directory: work.workingDir,
    repo_root: work.repoRoot,
    authority_basis: authorityBasis,
    task_number: taskNumber,
    intended_paths: paths,
    task_owned_dirty_files: taskOwnedDirtyFiles,
    residual_dirty_files: residualDirtyFiles,
    staged_files: stagedFiles,
    shared_file_claims: claims,
    mixed_ownership_files: mixedOwnershipFiles,
    closeout_allowed: status === 'ok',
    integration_allowed: status === 'integration_required',
    recommendations,
  };
  logGitOperation(root, payload, agentPolicy);
  return payload;
}

function requireGitAuthority(args: any) : any{
  const authorityBasis: any = asRecord(args.authority_basis);
  const kind: any = stringField(authorityBasis, 'kind');
  const summary: any = stringField(authorityBasis, 'summary')?.trim();
  const allowedKinds: any = new Set(GIT_AUTHORITY_BASIS_KINDS);
  if (!kind) throw new Error(gitAuthorityError('git_mutation_requires_authority_kind', authorityBasis));
  if (!allowedKinds.has(kind)) throw new Error(gitAuthorityError('git_mutation_requires_valid_authority_basis', authorityBasis));
  if (!summary) throw new Error(gitAuthorityError('git_mutation_requires_authority_summary', authorityBasis));
  return { kind, summary };
}

function gitAuthorityError(code: any, received: any) : any{
  return `${code}: ${JSON.stringify({
    schema: 'narada.shell_mcp.git_authority_basis_error.v0',
    required_shape: {
      kind: GIT_AUTHORITY_BASIS_KINDS,
      summary: 'non-empty string',
    },
    remediation: `Provide authority_basis as { kind: one of ${GIT_AUTHORITY_BASIS_KINDS.join(', ')}, summary: non-empty string }`,
    received,
  })}`;
}

function resolveGitWorkContext(args: any, root: any) : any{
  const workingDir: any = resolveUnderRoot(stringField(args, 'working_directory') ?? '.', root);
  const repoRoot: any = readGitScalar(workingDir, ['rev-parse', '--show-toplevel'], 'git_repository_required');
  const rel: any = relative(root, repoRoot);
  if (rel === '..' || rel.startsWith('..\\') || rel.startsWith('../')) throw new Error(`git_repo_outside_site_root: ${repoRoot}`);
  return { workingDir, repoRoot };
}

function resolveGitStagePaths(args: any, repoRoot: any, siteRoot: any, agentPolicy: any) : any{
  const paths: any = arrayField(args, 'paths');
  if (paths.length === 0) throw new Error('git_stage_paths_requires_paths');
  if (paths.length > 50) throw new Error('git_stage_paths_too_many_paths');
  const resolved: any = [];
  for (const inputPath of paths) {
    rejectSuspiciousPath(inputPath);
    if (/[*?\[\]{}]/.test(inputPath)) throw new Error(`git_stage_paths_rejects_globs: ${inputPath}`);
    const absolutePath: any = resolveUnderRoot(inputPath, repoRoot);
    enforceAgentPathPolicy({
      siteRoot,
      agentId: agentPolicy.agent_id,
      absolutePath,
      operation: 'git_stage_paths',
    });
    const relativePath: any = normalizeRelativePath(relative(repoRoot, absolutePath));
    const exists: any = existsSync(absolutePath);
    const tracked: any = runGitSync(repoRoot, ['ls-files', '--error-unmatch', '--', relativePath]).status === 0;
    if (!exists && !tracked) throw new Error(`git_stage_paths_path_not_found: ${relativePath}`);
    resolved.push(relativePath);
  }
  return [...new Set(resolved)];
}

function safeResolveGitStagePaths(args: any, repoRoot: any, siteRoot: any, agentPolicy: any) : any{
  try {
    return resolveGitStagePaths(args, repoRoot, siteRoot, agentPolicy);
  } catch {
    return arrayField(args, 'paths')
      .map((inputPath: any) => {
        try {
          rejectSuspiciousPath(inputPath);
          const absolutePath: any = resolveUnderRoot(inputPath, repoRoot);
          enforceAgentPathPolicy({
            siteRoot,
            agentId: agentPolicy.agent_id,
            absolutePath,
            operation: 'git_stage_paths',
          });
          return normalizeRelativePath(relative(repoRoot, absolutePath));
        } catch {
          return normalizeRelativePath(String(inputPath ?? '').trim());
        }
      })
      .filter(Boolean);
  }
}

function classifyIntendedSourcePaths(args: any, repoRoot: any, siteRoot: any, agentPolicy: any, stagedPaths: any = []) : any{
  const intendedPaths: any = arrayField(args, 'intended_source_paths');
  if (intendedPaths.length === 0) return [];
  const stagedSet: any = new Set(stagedPaths);
  return intendedPaths.map((inputPath: any) => classifyIntendedSourcePath(inputPath, repoRoot, siteRoot, agentPolicy, stagedSet));
}

function classifyIntendedSourcePath(inputPath: any, repoRoot: any, siteRoot: any, agentPolicy: any, stagedSet: any) : any{
  try {
    rejectSuspiciousPath(inputPath);
    if (/[*?\\[\]{}]/.test(inputPath)) {
      return { path: inputPath, status: 'not_owned', reason: 'glob_or_pattern_rejected' };
    }
    const absolutePath: any = resolveUnderRoot(inputPath, repoRoot);
    try {
      enforceAgentPathPolicy({
        siteRoot,
        agentId: agentPolicy.agent_id,
        absolutePath,
        operation: 'git_intended_source_path_classification',
      });
    } catch (error: any) {
      return {
        path: normalizeRelativePath(relative(repoRoot, absolutePath)),
        status: 'not_owned',
        reason: error instanceof Error ? error.message : String(error),
      };
    }

    const relativePath: any = normalizeRelativePath(relative(repoRoot, absolutePath));
    if (stagedSet.has(relativePath)) return { path: relativePath, status: 'staged' };

    const exists: any = existsSync(absolutePath);
    const tracked: any = runGitSync(repoRoot, ['ls-files', '--error-unmatch', '--', relativePath]).status === 0;
    const ignored: any = runGitSync(repoRoot, ['check-ignore', '--quiet', '--', relativePath]).status === 0;
    if (!exists && !tracked) return { path: relativePath, status: 'absent' };
    if (ignored && !tracked) return { path: relativePath, status: 'ignored' };
    if (exists && !tracked) return { path: relativePath, status: 'untracked' };

    const dirty: any = readGitDirtyFiles(repoRoot).includes(relativePath);
    if (tracked && !dirty) return { path: relativePath, status: 'already_in_head' };
    return { path: relativePath, status: dirty ? 'not_staged' : 'already_in_head' };
  } catch (error: any) {
    return {
      path: String(inputPath ?? ''),
      status: 'not_owned',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildResidualDirtyFileDrift(before: any, after: any) : any{
  const beforeSet: any = new Set(before ?? []);
  const afterSet: any = new Set(after ?? []);
  const added: any = [...afterSet].filter((path: any) => !beforeSet.has(path)).sort();
  const removed: any = [...beforeSet].filter((path: any) => !afterSet.has(path)).sort();
  return {
    status: added.length || removed.length ? 'changed' : 'unchanged',
    before_count: beforeSet.size,
    after_count: afterSet.size,
    added,
    removed,
  };
}

function runPushAndClassify(repoRoot: any, prePush: any, { cleanStatus }: any) : any{
  const pushResult: any = runGitSync(repoRoot, ['push']);
  if (pushResult.status !== 0) {
    return {
      status: 'failed',
      operation_status: 'push_failed',
      confirmed: false,
      branch: prePush.branch,
      upstream: prePush.upstream,
      ahead: prePush.ahead,
      behind: prePush.behind,
      state: { pre_push: prePush, post_push: null },
      error: (pushResult.stderrText || pushResult.stdoutText || '').trim(),
      follow_up_action: 'Inspect the push error, resolve the remote/upstream condition without force-push, then retry git_push_current under explicit authority.',
    };
  }

  let postPush: any;
  try {
    postPush = readGitPushPlanOverrideForTests(prePush) ?? readGitPushPlan(repoRoot, { refuseBehind: false });
  } catch (error: any) {
    return {
      status: 'uncertain',
      operation_status: 'push_uncertain',
      confirmed: false,
      branch: prePush.branch,
      upstream: prePush.upstream,
      ahead: prePush.ahead,
      behind: prePush.behind,
      state: { pre_push: prePush, post_push: null },
      verification_error: error instanceof Error ? error.message : String(error),
      follow_up_action: 'Run a read-only git status/divergence check, then retry git_push_current only if the branch remains ahead and not behind.',
    };
  }

  const clean: any = postPush.ahead === 0 && postPush.behind === 0;
  return {
    status: clean ? cleanStatus : 'uncertain',
    operation_status: clean ? 'ok' : 'push_uncertain',
    confirmed: clean,
    branch: postPush.branch,
    upstream: postPush.upstream,
    ahead: postPush.ahead,
    behind: postPush.behind,
    state: { pre_push: prePush, post_push: postPush },
    ...(clean ? {} : {
      follow_up_action: 'Run a read-only git status/divergence check, then retry git_push_current only if the branch remains ahead and not behind.',
    }),
  };
}

function readGitPushPlanOverrideForTests(prePush: any) : any{
  const raw: any = process.env.NARADA_SHELL_MCP_TEST_POST_PUSH_PLAN;
  if (!raw) return null;
  const parsed: any = JSON.parse(raw);
  return {
    branch: typeof parsed.branch === 'string' ? parsed.branch : prePush.branch,
    upstream: typeof parsed.upstream === 'string' ? parsed.upstream : prePush.upstream,
    ahead: Number.isFinite(Number(parsed.ahead)) ? Number(parsed.ahead) : prePush.ahead,
    behind: Number.isFinite(Number(parsed.behind)) ? Number(parsed.behind) : prePush.behind,
  };
}

function readGitPushPlan(repoRoot: any, options: any = {}) : any{
  const refuseBehind: any = options.refuseBehind !== false;
  const branch: any = readGitScalar(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD'], 'git_push_current_branch_unavailable');
  if (branch === 'HEAD') throw new Error('git_push_current_refuses_detached_head');
  const upstreamResult: any = runGitSync(repoRoot, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  if (upstreamResult.status !== 0) throw new Error('git_push_current_requires_upstream');
  const upstream: any = upstreamResult.stdoutText.trim();
  const counts: any = readGitScalar(repoRoot, ['rev-list', '--left-right', '--count', 'HEAD...@{u}'], 'git_push_current_divergence_unavailable')
    .split(/\s+/)
    .map((value: any) => parseInt(value, 10));
  const ahead: any = Number.isFinite(counts[0]) ? counts[0] : 0;
  const behind: any = Number.isFinite(counts[1]) ? counts[1] : 0;
  if (refuseBehind && behind > 0) throw new Error(`git_push_current_refuses_behind_upstream: behind=${behind} ahead=${ahead}`);
  return { branch, upstream, ahead, behind };
}

function readGitStagedFiles(repoRoot: any) : any{
  return readGitLines(repoRoot, ['diff', '--cached', '--name-only']);
}

function readGitDirtyFiles(repoRoot: any) : any{
  const result: any = runGitSync(repoRoot, ['status', '--porcelain=v1']);
  if (result.status !== 0) return [];
  return result.stdoutText.split(/\r?\n/)
    .filter((line: any) => line.length > 0)
    .map((line: any) => normalizeRelativePath(line.slice(3).trim().replace(/^"|"$/g, '')))
    .filter(Boolean);
}

function readGitDirtyAndIgnoredFiles(repoRoot: any) : any{
  const result: any = runGitSync(repoRoot, ['status', '--porcelain=v1', '--ignored']);
  if (result.status !== 0) return [];
  return result.stdoutText.split(/\r?\n/)
    .filter((line: any) => line.length > 0)
    .map((line: any) => normalizeRelativePath(line.slice(3).trim().replace(/^\"|\"$/g, '')))
    .filter(Boolean);
}

function readGitLines(repoRoot: any, args: any) : any{
  const result: any = runGitSync(repoRoot, args);
  if (result.status !== 0) return [];
  return result.stdoutText.split(/\r?\n/).map((line: any) => line.trim()).filter(Boolean);
}

function readGitScalar(repoRoot: any, args: any, errorCode: any) : any{
  const result: any = runGitSync(repoRoot, args);
  if (result.status !== 0) throw new Error(`${errorCode}: ${result.stderrText || result.stdoutText}`);
  return result.stdoutText.trim();
}

function runGitSync(cwd: any, args: any) : any{
  const result: any = runProcessSync('git', args, cwd);
  return {
    ...result,
    stdoutText: result.stdout.toString('utf8'),
    stderrText: result.stderr.toString('utf8'),
  };
}

function runProcessSync(command: any, args: any, cwd: any) : any{
  return runGovernedCommandSync(command, args, {
    cwd,
    encoding: null,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });
}

function detectLineEndingStyle(bytes: any) : any{
  let crlf: any = 0;
  let lf: any = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== 0x0a) continue;
    lf++;
    if (i > 0 && bytes[i - 1] === 0x0d) crlf++;
  }
  if (lf === 0) return 'none';
  return crlf > (lf - crlf) ? 'crlf' : 'lf';
}

function applyLineEndingStyle(bytes: any, style: any) : any{
  const normalized: any = [];
  for (let i = 0; i < bytes.length; i++) {
    const byte: any = bytes[i];
    if (byte === 0x0d && bytes[i + 1] === 0x0a) {
      normalized.push(0x0a);
      i++;
      continue;
    }
    if (byte === 0x0d) {
      normalized.push(0x0a);
      continue;
    }
    normalized.push(byte);
  }

  if (style === 'lf') return Buffer.from(normalized);
  if (style !== 'crlf') throw new Error(`normalize_line_endings_invalid_style: ${style}`);

  const output: any = [];
  for (const byte of normalized) {
    if (byte === 0x0a) {
      output.push(0x0d, 0x0a);
    } else {
      output.push(byte);
    }
  }
  return Buffer.from(output);
}

function resolveAgentShellPolicy(root: any) : any{
  const agentId: any = process.env.NARADA_AGENT_ID;
  if (!agentId) {
    return {
      allowed: false,
      error: 'shell_mcp_requires_bound_agent: NARADA_AGENT_ID is not set',
    };
  }

  const rosterCheck: any = validateIdentityAgainstRoster(root, agentId);
  if (!rosterCheck.valid) {
    return {
      allowed: false,
      error: `shell_mcp_identity_not_authorized: ${rosterCheck.error}`,
    };
  }

  const policy: any = rosterCheck.capability_policy ?? {};
  const surface: any = policy.script_execution_surface;
  const mcpShellExecution: any = policy.mcp_shell_execution ?? (
    surface === 'mcp_only'
      ? 'allowed'
      : 'forbidden'
  );

  if (mcpShellExecution !== 'allowed') {
    return {
      allowed: false,
      error: `shell_mcp_execution_not_allowed_for_agent: ${agentId}`,
    };
  }

  return {
    allowed: true,
    agent_id: agentId,
    role: rosterCheck.role,
    capability_policy: policy,
  };
}

function runShell(command: any, cwd: any, timeoutMs: any) : any{
  return new Promise((resolve: any) => {
    const isPowerShell: any = /^\s*(powershell|pwsh)/i.test(command);
    let shell: any, shellArgs: any;

    if (isPowerShell) {
      // Extract the actual command after powershell/pwsh flags
      const match: any = command.match(/^\s*(?:powershell|pwsh)(?:\.exe)?\s+(.*)$/is);
      const inner: any = match ? match[1] : '';
      shell = 'pwsh.exe';
      shellArgs = ['-NoProfile', '-Command', inner];
    } else {
      shell = 'pwsh.exe';
      shellArgs = ['-NoProfile', '-Command', command];
    }

    const child: any = runGovernedCommand(shell, shellArgs, {
      cwd,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    });

    let stdout: any = '';
    let stderr: any = '';
    let killed: any = false;

    const timer: any = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000);
    }, timeoutMs);

    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');

    child.stdout.on('data', (data: any) => { stdout += data; });
    child.stderr.on('data', (data: any) => { stderr += data; });

    child.on('close', (code: any) => {
      clearTimeout(timer);
      resolve({
        exitCode: killed ? -1 : (code ?? -1),
        stdout: stdout.slice(0, 100000),
        stderr: stderr.slice(0, 100000),
        timed_out: killed,
      });
    });

    child.on('error', (err: any) => {
      clearTimeout(timer);
      resolve({
        exitCode: -1,
        stdout: '',
        stderr: err.message,
        timed_out: false,
      });
    });
  });
}

function logExecution(root: any, command: any, cwd: any, exitCode: any, durationMs: any, agentPolicy: any, payloadSource: any = null) : any{
  const pcLogDir: any = findPcRuntimeDir(root);
  const dir: any = pcLogDir || resolve(root, '..', '..', 'runtime', 'operator-surface-session-restore');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const entry: any = {
    schema: 'narada.operator_surfaces.shell_mcp_execution.v0',
    observed_at: new Date().toISOString(),
    agent_id: agentPolicy?.agent_id ?? null,
    role: agentPolicy?.role ?? null,
    command: command.slice(0, 1000),
    payload_source: payloadSource,
    payload_ref: payloadSource?.ref ?? null,
    payload_sha256: payloadSource?.sha256 ?? null,
    working_directory: cwd,
    exit_code: exitCode,
    duration_ms: durationMs,
  };
  appendFileSync(
    resolve(dir, 'shell-mcp-executions.jsonl'),
    JSON.stringify(entry) + '\n',
    'utf-8'
  );
}

function logNormalization(root: any, results: any, dryRun: any, agentPolicy: any) : any{
  const pcLogDir: any = findPcRuntimeDir(root);
  const dir: any = pcLogDir || resolve(root, '..', '..', 'runtime', 'operator-surface-session-restore');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const entry: any = {
    schema: 'narada.operator_surfaces.shell_mcp_normalize_line_endings.v0',
    observed_at: new Date().toISOString(),
    agent_id: agentPolicy?.agent_id ?? null,
    role: agentPolicy?.role ?? null,
    dry_run: dryRun,
    paths: results.map((result: any) => result.path),
    changed_paths: results.filter((result: any) => result.changed).map((result: any) => result.path),
  };
  appendFileSync(
    resolve(dir, 'shell-mcp-executions.jsonl'),
    JSON.stringify(entry) + '\n',
    'utf-8'
  );
}

function logGitOperation(root: any, payload: any, agentPolicy: any) : any{
  const pcLogDir: any = findPcRuntimeDir(root);
  const dir: any = pcLogDir || resolve(root, '..', '..', 'runtime', 'operator-surface-session-restore');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const entry: any = {
    schema: 'narada.operator_surfaces.shell_mcp_git_operation.v0',
    observed_at: new Date().toISOString(),
    agent_id: agentPolicy?.agent_id ?? null,
    role: agentPolicy?.role ?? null,
    operation: payload.operation,
    dry_run: payload.dry_run,
    repo_root: payload.repo_root ?? null,
    staged_paths: payload.staged_paths ?? [],
    commit_sha: payload.commit_sha ?? null,
    branch: payload.branch ?? payload.push?.branch ?? null,
    upstream: payload.upstream ?? payload.push?.upstream ?? null,
    authority_basis: payload.authority_basis ?? null,
    residual_dirty_files: payload.residual_dirty_files ?? [],
  };
  appendFileSync(
    resolve(dir, 'shell-mcp-executions.jsonl'),
    JSON.stringify(entry) + '\n',
    'utf-8'
  );
}

function findPcRuntimeDir(root: any) : any{
  try {
    const candidate: any = resolve(root, '..', '..', '..', 'ProgramData', 'Narada', 'sites', 'pc', 'desktop-sunroom-2', 'runtime');
    if (existsSync(candidate)) return candidate;
  } catch {}
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseArgs(argv: any) : any{
  const opts: any = { siteRoot: process.cwd(), timeout: 60 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--site-root' && i + 1 < argv.length) {
      opts.siteRoot = resolve(argv[i + 1]);
      i++;
    } else if (argv[i] === '--auto-approve') {
      opts.autoApprove = true;
    } else if (argv[i] === '--timeout' && i + 1 < argv.length) {
      const n: any = parseInt(argv[i + 1], 10);
      if (Number.isFinite(n)) opts.timeout = n;
      i++;
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      opts.help = true;
    }
  }
  return opts;
}

function asRecord(value: any) : any{
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return {};
}

function arrayField(record: any, key: any) : any{
  const value: any = record[key];
  if (!Array.isArray(value)) return [];
  return value.map((item: any) => String(item));
}

function rawArrayField(record: any, key: any) : any{
  const value: any = record[key];
  return Array.isArray(value) ? value : [];
}

function booleanField(record: any, key: any) : any{
  const value: any = record[key];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return null;
}

function stringField(record: any, key: any) : any{
  const v: any = record[key];
  if (typeof v === 'string') return v;
  if (v === undefined || v === null) return null;
  return String(v);
}

function integerField(record: any, key: any) : any{
  const v: any = record[key];
  if (typeof v === 'number') return Number.isFinite(v) ? Math.floor(v) : null;
  if (typeof v === 'string') {
    const n: any = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function resolveUnderRoot(inputPath: any, root: any) : any{
  const absolutePath: any = resolve(root, inputPath);
  const rel: any = relative(root, absolutePath);
  if (rel === '..' || rel.startsWith('..\\') || rel.startsWith('../')) throw new Error(`path_outside_root: ${inputPath}`);
  return absolutePath;
}

function rejectSuspiciousPath(inputPath: any) : any{
  if (!inputPath || typeof inputPath !== 'string') throw new Error('path_required');
  if (/[;&|`$<>]/.test(inputPath)) throw new Error(`path_rejected_suspicious_input: ${inputPath}`);
  if (/\bwsl(?:\.exe)?\b/i.test(inputPath)) throw new Error('path_rejected_wsl_crossing');
}

function normalizeRelativePath(path: any) : any{
  return path.replace(/\\/g, '/');
}

function toolResult(data: any, toolName: any = null) : any{
  return buildOutputRefToolContent({ siteRoot: resolve(options.siteRoot ?? process.cwd()), toolName: toolName ?? activeOutputToolName, value: data });
}

function hasJsonRpcFrame(buffer: any) : any{
  return /Content-Length:\s*\d+/i.test(buffer);
}

function drainJsonRpcFrames(buffer: any) : any{
  const requests: any = [];
  let remaining: any = buffer;
  while (true) {
    const lenMatch: any = remaining.match(/Content-Length:\s*(\d+)/i);
    if (!lenMatch) break;
    const len: any = parseInt(lenMatch[1], 10);
    const crlfHeaderEnd: any = remaining.indexOf('\r\n\r\n');
    const lfHeaderEnd: any = remaining.indexOf('\n\n');
    const headerEnd: any = crlfHeaderEnd >= 0 ? crlfHeaderEnd : lfHeaderEnd;
    if (headerEnd < 0) break;
    const bodyStart: any = headerEnd + (crlfHeaderEnd >= 0 ? 4 : 2);
    if (remaining.length < bodyStart + len) break;
    const body: any = remaining.substring(bodyStart, bodyStart + len);
    try {
      requests.push(JSON.parse(body));
    } catch {
      // skip malformed
    }
    remaining = remaining.substring(bodyStart + len);
  }
  return { requests, remaining };
}

function parseJsonRpcInput(text: any) : any{
  const requests: any = [];
  try {
    requests.push(JSON.parse(text));
  } catch {
    // skip malformed
  }
  return requests;
}
