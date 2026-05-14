import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import {
  buildCheckpointDescriptor,
  buildHydrationRequestDescriptor,
  findDeniedSourceImports,
} from '@narada2/agent-context-memory';
import { cwd as processCwd, env as processEnv, stdin as defaultStdin, stdout as defaultStdout } from 'node:process';
import {
  inboxDoctorCommand,
  inboxListCommand,
  inboxPromoteCommand,
  inboxShowCommand,
  inboxSubmitObservationCommand,
  inboxWorkNextCommand,
} from './commands/inbox.js';
import {
  taskPeekNextCommand,
  taskWorkNextCommand,
} from './commands/task-next.js';
import { grantEffectiveStatus, readCapabilityRegistry } from './lib/capability-consent-registry.js';
import { ExitCode } from './lib/exit-codes.js';
import type { CommandSideEffectClass } from './lib/command-execution-intent.js';
import { readRoutingRegistry, resolveRoute, type RouteAddressRecord } from './lib/routing-addressing-registry.js';
import { allocateTaskNumber, serializeFrontMatter } from './lib/task-governance.js';
import { openTaskLifecycleStore } from './lib/task-lifecycle-store.js';

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

interface McpTarget {
  kind: 'site';
  ref?: string;
  site_root?: string;
}

interface McpToolPolicy {
  schema?: string;
  policy_source?: string;
  agent_id?: string;
  role?: string;
  default_server?: string;
  servers?: Record<string, { allowed_tools?: string[] | '*' }>;
}

interface McpTraversalContext {
  source_site: McpSiteContext;
  target_site: McpSiteContext;
  target: McpTarget | null;
  route: RouteAddressRecord | null;
  alternatives_count: number;
  authority_posture: 'facade_only';
  resolution: 'source_site' | 'explicit_site_root' | 'routing_registry';
  cross_site: boolean;
  mutation_attempted: boolean;
  required_capability_kind: string | null;
  capability_grant_id: string | null;
  capability_status: 'not_required' | 'active' | 'missing';
  tool: string;
}

export interface McpServerOptions {
  stdin?: NodeJS.ReadableStream;
  stdout?: NodeJS.WritableStream;
  cwd?: string;
  siteRoot?: string;
  siteId?: string;
  siteKind?: string;
  mcpToolPolicy?: McpToolPolicy;
}

export interface McpSiteContext {
  site_id: string;
  site_kind: string;
  site_root: string;
  workspace_root?: string;
  authority_locus: string;
  source: 'config' | 'options' | 'cwd';
}

const PROTOCOL_VERSION = '2024-11-05';
const WSL_WINDOWS_EE_MCP_ADAPTER_ID = 'ee-mcp.windows-powershell-from-wsl';
const WSL_WINDOWS_COMMAND_ID_PATTERN = /^windows-pwsh\.readonly\.[a-z0-9][a-z0-9._-]{0,80}$/;

export const NARADA_MCP_TOOLS: McpTool[] = [
  {
    name: 'narada_site_context',
    description: 'Inspect the Site context that scopes this MCP facade.',
    inputSchema: objectSchema({
      target: targetSchema(),
    }),
  },
  {
    name: 'narada_mcp_fabric_context',
    description: 'Inspect the governed MCP fabric posture and optional target Site resolution without mutating.',
    inputSchema: objectSchema({
      target: targetSchema(),
    }),
  },
  {
    name: 'site_task_lifecycle.plan_init',
    description: 'Plan local Site task-lifecycle paths without mutating files or databases.',
    inputSchema: objectSchema({
      site_root: stringSchema('Site root to plan for; defaults to the MCP target Site root.'),
      target: targetSchema(),
    }),
  },
  {
    name: 'site_task_lifecycle.admit_task',
    description: 'Admit one local task candidate into the Site task-lifecycle DB through the MCP adapter boundary.',
    inputSchema: objectSchema({
      task_id: { type: 'string', description: 'Local task id to admit.' },
      title: { type: 'string', description: 'Task title.' },
      source_ref: { type: 'string', description: 'Admitted evidence reference for the task.' },
      summary: stringSchema('Task summary.'),
      source_site: stringSchema('Source Site label; defaults to the target Site id.'),
      received_at: stringSchema('ISO timestamp; defaults to now.'),
      admitted_by: stringSchema('Principal admitting the task; defaults to mcp-client.'),
      evidence_refs: arrayStringSchema('Additional evidence refs.'),
      target: targetSchema(),
    }, ['task_id', 'title', 'source_ref']),
  },
  {
    name: 'site_task_lifecycle.open_admitted_task',
    description: 'Promote one admitted local task candidate into opened claimable work and route its source inbox envelope to the task.',
    inputSchema: objectSchema({
      task_id: { type: 'string', description: 'Admitted local task candidate id.' },
      source_envelope_id: { type: 'string', description: 'Source inbox envelope id to mark as routed to the opened task.' },
      opened_by: stringSchema('Principal opening the admitted candidate; defaults to mcp-client.'),
      required_work: stringSchema('Optional concrete required work markdown for the opened task.'),
      acceptance_criteria: arrayStringSchema('Optional acceptance criteria for the opened task.'),
      target: targetSchema(),
    }, ['task_id', 'source_envelope_id']),
  },
  {
    name: 'site_task_lifecycle.read_task',
    description: 'Read one local task lifecycle row with evidence refs and admission events without mutating.',
    inputSchema: objectSchema({
      task_id: { type: 'string', description: 'Local task id to read.' },
      target: targetSchema(),
    }, ['task_id']),
  },
  {
    name: 'agent_context_memory.plan_hydration',
    description: 'Plan local agent-context hydration from checkpoint refs without executing runtime hydration.',
    inputSchema: objectSchema({
      hydration_id: stringSchema('Hydration descriptor id; defaults to a deterministic local id.'),
      named_agent_id: { type: 'string', description: 'Named agent identity to hydrate.' },
      checkpoint_refs: arrayStringSchema('Local checkpoint ids or evidence refs to hydrate from.'),
      requested_by: stringSchema('Requesting principal; defaults to mcp-client.'),
      source_import_refs: arrayStringSchema('Optional source refs to check for denied runtime-state imports.'),
      target: targetSchema(),
    }, ['named_agent_id']),
  },
  {
    name: 'agent_context_memory.record_checkpoint',
    description: 'Record one local checkpoint summary in the target Site agent-context memory store.',
    inputSchema: objectSchema({
      checkpoint_id: { type: 'string', description: 'Local checkpoint id.' },
      session_id: { type: 'string', description: 'Local session id.' },
      named_agent_id: { type: 'string', description: 'Named agent identity for this checkpoint.' },
      summary: { type: 'string', description: 'Compact checkpoint summary. Do not include secrets.' },
      evidence_refs: arrayStringSchema('Local evidence refs supporting the checkpoint.'),
      captured_at: stringSchema('ISO timestamp; defaults to now.'),
      source_import_refs: arrayStringSchema('Optional source refs to check for denied runtime-state imports.'),
      target: targetSchema(),
    }, ['checkpoint_id', 'session_id', 'named_agent_id', 'summary']),
  },
  {
    name: 'agent_context_memory.read_checkpoint_summary',
    description: 'Read one local checkpoint summary without mutating runtime memory.',
    inputSchema: objectSchema({
      checkpoint_id: { type: 'string', description: 'Local checkpoint id.' },
      target: targetSchema(),
    }, ['checkpoint_id']),
  },
  {
    name: 'narada_inbox_doctor',
    description: 'Inspect Canonical Inbox delivery coordinates and local runtime readiness.',
    inputSchema: objectSchema({
      cwd: stringSchema('Working directory; defaults to current process cwd.'),
      target: targetSchema(),
    }),
  },
  {
    name: 'narada_inbox_work_next',
    description: 'Show next Canonical Inbox work and admissible actions without mutating unless claim=true.',
    inputSchema: objectSchema({
      cwd: stringSchema('Working directory; defaults to current process cwd.'),
      status: stringSchema('Inbox status filter; defaults to received.'),
      kind: stringSchema('Optional envelope kind filter.'),
      limit: numberSchema('Maximum envelopes including alternatives.'),
      claim: booleanSchema('Claim the selected envelope before returning it.'),
      by: stringSchema('Principal for claim=true.'),
      target: targetSchema(),
    }),
  },
  {
    name: 'narada_task_work_next',
    description: 'Discover the next governed task for an agent without mutating unless claim=true.',
    inputSchema: objectSchema({
      cwd: stringSchema('Working directory; defaults to current process cwd.'),
      agent: { type: 'string', description: 'Roster agent id.' },
      claim: booleanSchema('Claim/pull work and return an execution packet. Defaults to false for read-only discovery.'),
      target: targetSchema(),
    }, ['agent']),
  },
  {
    name: 'narada_inbox_list',
    description: 'List Canonical Inbox envelopes.',
    inputSchema: objectSchema({
      cwd: stringSchema('Working directory; defaults to current process cwd.'),
      status: stringSchema('Optional inbox status filter.'),
      kind: stringSchema('Optional envelope kind filter.'),
      limit: numberSchema('Maximum envelopes to return.'),
      target: targetSchema(),
    }),
  },
  {
    name: 'narada_inbox_show',
    description: 'Show one Canonical Inbox envelope by id.',
    inputSchema: objectSchema({
      cwd: stringSchema('Working directory; defaults to current process cwd.'),
      envelope_id: { type: 'string', description: 'Envelope id to inspect.' },
      target: targetSchema(),
    }, ['envelope_id']),
  },
  {
    name: 'narada_inbox_submit_observation',
    description: 'Submit a shell-safe Canonical Inbox observation with read-back confirmation and mutation evidence.',
    inputSchema: objectSchema({
      cwd: stringSchema('Working directory; defaults to current process cwd.'),
      source_ref: { type: 'string', description: 'Source reference for the observation.' },
      title: { type: 'string', description: 'Observation title.' },
      summary: stringSchema('Observation summary.'),
      source_kind: stringSchema('Source kind; defaults to user_chat.'),
      authority_level: stringSchema('Authority level; defaults to agent_reported.'),
      principal: stringSchema('Principal associated with authority.'),
      target_locus: stringSchema('Message routing authority target locus; defaults to local_site.'),
      evidence: arrayStringSchema('Evidence lines.'),
      proposal: arrayStringSchema('Proposal lines.'),
      recommendation: stringSchema('Recommended handling.'),
      target: targetSchema(),
    }, ['source_ref', 'title']),
  },
  {
    name: 'narada_ee_mcp_doctor',
    description: 'Inspect superseded WSL-to-Windows EE-MCP posture without executing Windows commands.',
    inputSchema: objectSchema({
      cwd: stringSchema('Working directory; defaults to current process cwd.'),
      adapter_id: stringSchema(`Adapter id; defaults to ${WSL_WINDOWS_EE_MCP_ADAPTER_ID}.`),
      target: targetSchema(),
    }),
  },
];

export async function handleMcpRequest(
  request: JsonRpcRequest,
  options: McpServerOptions = {},
): Promise<Record<string, unknown> | null> {
  if (!request.id && request.method.startsWith('notifications/')) return null;
  try {
    const siteContext = resolveMcpSiteContext(options);
    const toolPolicy = resolveMcpToolPolicy(options);
    const result = await dispatchMcpMethod(request.method, request.params, siteContext, toolPolicy);
    return { jsonrpc: '2.0', id: request.id ?? null, result };
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id: request.id ?? null,
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export async function runMcpServer(options: McpServerOptions = {}): Promise<void> {
  const input = options.stdin ?? defaultStdin;
  const output = options.stdout ?? defaultStdout;
  let buffer = '';
  for await (const chunk of input) {
    buffer += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    const parsed = drainJsonRpcFrames(buffer);
    buffer = parsed.remaining;
    for (const request of parsed.requests) {
      const response = await handleMcpRequest(request, options);
      if (response) output.write(`${JSON.stringify(response)}\n`);
    }
  }
  const trailing = buffer.trim();
  if (trailing.length > 0) {
    for (const request of parseJsonRpcInput(trailing)) {
      const response = await handleMcpRequest(request, options);
      if (response) output.write(`${JSON.stringify(response)}\n`);
    }
  }
}

async function dispatchMcpMethod(method: string, params: unknown, siteContext: McpSiteContext, toolPolicy?: McpToolPolicy): Promise<unknown> {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: {
          name: `narada-mcp:${siteContext.site_id}`,
          version: '0.1.0',
          site: siteContext,
          authority_posture: 'facade_only',
          mcp_tool_policy: summarizeToolPolicy(toolPolicy),
        },
      };
    case 'tools/list':
      return { tools: filterToolsByPolicy(NARADA_MCP_TOOLS, toolPolicy), site: siteContext, authority_posture: 'facade_only', mcp_tool_policy: summarizeToolPolicy(toolPolicy) };
    case 'tools/call':
      return callTool(params, siteContext, toolPolicy);
    default:
      throw new Error(`Unsupported MCP method: ${method}`);
  }
}

async function callTool(params: unknown, siteContext: McpSiteContext, toolPolicy?: McpToolPolicy): Promise<McpToolResult> {
  const record = asRecord(params);
  const name = stringField(record, 'name');
  const args = asRecord(record.arguments);
  if (!name) throw new Error('tools/call requires params.name');
  if (!isToolAllowed(name, toolPolicy)) {
    return jsonToolResult({
      status: 'error',
      error: 'tool_not_allowed',
      agent_id: toolPolicy?.agent_id ?? null,
      role: toolPolicy?.role ?? null,
      server: toolPolicy?.default_server ?? 'narada-proper',
      tool: name,
      policy_source: toolPolicy?.policy_source ?? 'unspecified',
      reason: 'tool_not_allowed',
    }, true);
  }
  const mutationAttempted = name === 'narada_inbox_submit_observation'
    || (name === 'narada_inbox_work_next' && booleanField(args, 'claim') === true)
    || (name === 'narada_task_work_next' && booleanField(args, 'claim') === true)
    || name === 'site_task_lifecycle.admit_task'
    || name === 'site_task_lifecycle.open_admitted_task'
    || name === 'agent_context_memory.record_checkpoint'
    || name === 'narada_ee_run';
  const traversal = await resolveMcpTraversal({
    sourceSite: siteContext,
    tool: name,
    args,
    mutationAttempted,
  });
  const scopedCwd = stringField(args, 'cwd') ?? traversal.target_site.site_root;

  if (mutationAttempted && traversal.cross_site) {
    return jsonToolResult({
      status: 'error',
      error: 'Cross-Site MCP mutation is not admitted in v1 fabric proof.',
      traversal,
      required_next_step: 'Use the target Site authority surface directly or add a capability-governed cross-Site mutation path.',
    }, true);
  }

  switch (name) {
    case 'narada_site_context':
      return jsonToolResult({
        status: 'success',
        site: traversal.target_site,
        source_site: traversal.source_site,
        authority_posture: 'facade_only',
        traversal,
      });
    case 'narada_mcp_fabric_context':
      return jsonToolResult({
        status: 'success',
        fabric_posture: 'governed_traversal_facade',
        rule: 'MCP fabric may route typed requests; target Site authority admits consequence.',
        traversal,
      });
    case 'site_task_lifecycle.plan_init':
      return jsonToolResult(attachTraversal({
        status: 'success',
        schema: 'narada.site_task_lifecycle.mcp_plan_init_result.v0',
        packageName: '@narada2/site-task-lifecycle',
        siteId: traversal.target_site.site_id,
        paths: planSiteTaskLifecyclePathsForMcp(stringField(args, 'site_root') ?? traversal.target_site.site_root),
        mutationAttempted: false,
        sourceStateImported: false,
        packageExecutedSqliteMutation: false,
      }, traversal));
    case 'site_task_lifecycle.admit_task':
      return jsonToolResult(attachTraversal(admitTaskLifecycleTask({
        siteRoot: traversal.target_site.site_root,
        siteId: traversal.target_site.site_id,
        taskId: requiredString(args, 'task_id'),
        title: requiredString(args, 'title'),
        sourceRef: requiredString(args, 'source_ref'),
        sourceSite: stringField(args, 'source_site') ?? traversal.target_site.site_id,
        summary: stringField(args, 'summary') ?? '',
        receivedAt: stringField(args, 'received_at') ?? new Date().toISOString(),
        admittedBy: stringField(args, 'admitted_by') ?? 'mcp-client',
        evidenceRefs: stringArrayField(args, 'evidence_refs') ?? [],
      }), traversal));
    case 'site_task_lifecycle.open_admitted_task':
      return jsonToolResult(attachTraversal(await openAdmittedTaskLifecycleTask({
        siteRoot: traversal.target_site.site_root,
        siteId: traversal.target_site.site_id,
        taskId: requiredString(args, 'task_id'),
        sourceEnvelopeId: requiredString(args, 'source_envelope_id'),
        openedBy: stringField(args, 'opened_by') ?? 'mcp-client',
        requiredWork: stringField(args, 'required_work'),
        acceptanceCriteria: stringArrayField(args, 'acceptance_criteria') ?? [],
      }), traversal));
    case 'site_task_lifecycle.read_task':
      return jsonToolResult(attachTraversal(readTaskLifecycleTask({
        siteRoot: traversal.target_site.site_root,
        taskId: requiredString(args, 'task_id'),
      }), traversal));
    case 'agent_context_memory.plan_hydration':
      return jsonToolResult(attachTraversal(planAgentContextHydration({
        siteRoot: traversal.target_site.site_root,
        siteId: traversal.target_site.site_id,
        hydrationId: stringField(args, 'hydration_id'),
        namedAgentId: requiredString(args, 'named_agent_id'),
        checkpointRefs: stringArrayField(args, 'checkpoint_refs') ?? [],
        requestedBy: stringField(args, 'requested_by') ?? 'mcp-client',
        sourceImportRefs: stringArrayField(args, 'source_import_refs') ?? [],
      }), traversal));
    case 'agent_context_memory.record_checkpoint':
      return jsonToolResult(attachTraversal(recordAgentContextCheckpoint({
        siteRoot: traversal.target_site.site_root,
        siteId: traversal.target_site.site_id,
        checkpointId: requiredString(args, 'checkpoint_id'),
        sessionId: requiredString(args, 'session_id'),
        namedAgentId: requiredString(args, 'named_agent_id'),
        summary: requiredString(args, 'summary'),
        evidenceRefs: stringArrayField(args, 'evidence_refs') ?? [],
        capturedAt: stringField(args, 'captured_at') ?? new Date().toISOString(),
        sourceImportRefs: stringArrayField(args, 'source_import_refs') ?? [],
      }), traversal));
    case 'agent_context_memory.read_checkpoint_summary':
      return jsonToolResult(attachTraversal(readAgentContextCheckpoint({
        siteRoot: traversal.target_site.site_root,
        checkpointId: requiredString(args, 'checkpoint_id'),
      }), traversal));
    case 'narada_inbox_doctor':
      return commandToolResult(await inboxDoctorCommand({
        cwd: scopedCwd,
        format: 'json',
      }), traversal);
    case 'narada_inbox_work_next':
      return commandToolResult(await inboxWorkNextCommand({
        cwd: scopedCwd,
        status: stringField(args, 'status'),
        kind: stringField(args, 'kind'),
        limit: numberField(args, 'limit'),
        claim: booleanField(args, 'claim'),
        by: stringField(args, 'by'),
        format: 'json',
      }), traversal);
    case 'narada_task_work_next':
      if (booleanField(args, 'claim') === true) {
        return commandToolResult(await taskWorkNextCommand({
          cwd: scopedCwd,
          agent: requiredString(args, 'agent'),
          format: 'json',
        }), traversal);
      }
      return commandToolResult(await taskPeekNextCommand({
        cwd: scopedCwd,
        agent: requiredString(args, 'agent'),
        format: 'json',
      }), traversal);
    case 'narada_inbox_list':
      return commandToolResult(await inboxListCommand({
        cwd: scopedCwd,
        status: stringField(args, 'status'),
        kind: stringField(args, 'kind'),
        limit: numberField(args, 'limit'),
        format: 'json',
      }), traversal);
    case 'narada_inbox_show':
      return commandToolResult(await inboxShowCommand({
        cwd: scopedCwd,
        envelopeId: requiredString(args, 'envelope_id'),
        format: 'json',
      }), traversal);
    case 'narada_inbox_submit_observation':
      return commandToolResult(await inboxSubmitObservationCommand({
        cwd: scopedCwd,
        sourceRef: requiredString(args, 'source_ref'),
        title: requiredString(args, 'title'),
        summary: stringField(args, 'summary'),
        sourceKind: stringField(args, 'source_kind'),
        authorityLevel: stringField(args, 'authority_level'),
        principal: stringField(args, 'principal'),
        targetLocus: stringField(args, 'target_locus'),
        evidence: stringArrayField(args, 'evidence'),
        proposal: stringArrayField(args, 'proposal'),
        recommendation: stringField(args, 'recommendation'),
        format: 'json',
      }), traversal);
    case 'narada_ee_mcp_doctor':
      return jsonToolResult(attachTraversal(inspectWslWindowsEeMcp({
        cwd: scopedCwd,
        adapterId: stringField(args, 'adapter_id'),
      }), traversal));
    case 'narada_ee_run': {
      const result = await runWslWindowsEeMcpCommand({
        cwd: scopedCwd,
        adapterId: stringField(args, 'adapter_id'),
        commandId: requiredString(args, 'command_id'),
        requester: stringField(args, 'requester') ?? 'mcp-client',
      });
      return jsonToolResult(attachTraversal(result, traversal), result.status === 'error');
    }
    default:
      throw new Error(`Unknown Narada MCP tool: ${name}`);
  }
}

interface WslWindowsEeMcpConfig {
  adapter_id?: string;
  status?: 'admitted' | 'planned_missing_capability' | 'superseded_by_windows_native';
  runtime_locus?: string;
  commands?: Record<string, {
    argv?: string[];
    side_effect_class?: CommandSideEffectClass;
    timeout_seconds?: number;
  }>;
}

function inspectWslWindowsEeMcp(args: { cwd: string; adapterId?: string }): Record<string, unknown> {
  const adapterId = args.adapterId ?? WSL_WINDOWS_EE_MCP_ADAPTER_ID;
  const configPath = resolve(args.cwd, '.ai', 'ee-mcp', 'windows-powershell-from-wsl.json');
  const config = readJsonObject(configPath) as WslWindowsEeMcpConfig | undefined;
  const configured = Boolean(config);
  const status = 'superseded_by_windows_native';

  return {
    status,
    adapter_id: adapterId,
    direction: 'wsl_to_windows',
    current_posture: 'not_current_narada_proper_path',
    superseded_by: 'windows_native_narada_proper_authority',
    embodiment_id: 'windows-pwsh',
    runtime_locus: config?.runtime_locus ?? 'execution_machine_site',
    config_path: configPath,
    configured,
    command_id_grammar: {
      allowed_prefix: 'windows-pwsh.readonly.',
      pattern: String(WSL_WINDOWS_COMMAND_ID_PATTERN),
      side_effect_class: 'read_only',
    },
    refusal_posture: {
      refusal_code: 'superseded_by_windows_native',
      raw_windows_shell_forbidden: true,
      forbidden_shortcuts: ['powershell.exe', 'pwsh.exe', 'cmd.exe'],
      reason: 'Narada proper is now Windows-native; WSL-to-Windows EE-MCP is retained only as a superseded diagnostic posture.',
    },
    doctor: {
      readiness: status,
      repair_command: null,
      next_admissible_step: 'Open a new WSL runtime-locus admission task before reintroducing WSL-to-Windows EE-MCP execution.',
    },
  };
}

async function runWslWindowsEeMcpCommand(args: {
  cwd: string;
  adapterId?: string;
  commandId: string;
  requester: string;
}): Promise<Record<string, unknown>> {
  const adapterId = args.adapterId ?? WSL_WINDOWS_EE_MCP_ADAPTER_ID;
  if (!WSL_WINDOWS_COMMAND_ID_PATTERN.test(args.commandId)) {
    return {
      status: 'error',
      error: 'invalid_command_id',
      adapter_id: adapterId,
      command_id: args.commandId,
      expected_pattern: String(WSL_WINDOWS_COMMAND_ID_PATTERN),
      execution_attempted: false,
    };
  }

  const doctor = inspectWslWindowsEeMcp({ cwd: args.cwd, adapterId });
  return {
    status: 'error',
    error: 'superseded_by_windows_native',
    adapter_id: adapterId,
    command_id: args.commandId,
    execution_attempted: false,
    doctor,
  };
}

async function resolveMcpTraversal(args: {
  sourceSite: McpSiteContext;
  tool: string;
  args: Record<string, unknown>;
  mutationAttempted: boolean;
}): Promise<McpTraversalContext> {
  const target = parseTarget(args.args);
  let targetSite = args.sourceSite;
  let route: RouteAddressRecord | null = null;
  let alternativesCount = 0;
  let resolution: McpTraversalContext['resolution'] = 'source_site';

  if (target?.site_root) {
    targetSite = resolveMcpSiteContext({ siteRoot: target.site_root });
    resolution = 'explicit_site_root';
  } else if (target?.ref) {
    const registry = await readRoutingRegistry(args.sourceSite.site_root);
    const resolved = resolveRoute(registry.routes, target.kind, target.ref);
    route = resolved.selected;
    alternativesCount = resolved.alternatives.length;
    if (!route) throw new Error(`No active MCP fabric route for target ${target.kind}:${target.ref}`);
    if (!['site_root', 'narada_site_root'].includes(route.address_kind)) {
      throw new Error(`MCP fabric route ${route.route_id} uses unsupported address_kind ${route.address_kind}; expected site_root`);
    }
    if (route.transport !== 'filesystem') {
      throw new Error(`MCP fabric route ${route.route_id} uses unsupported transport ${route.transport}; expected filesystem`);
    }
    targetSite = resolveMcpSiteContext({ siteRoot: route.address_ref });
    resolution = 'routing_registry';
  }

  const requiredCapabilityKind = args.mutationAttempted && route?.capability_kind ? route.capability_kind : null;
  const grant = requiredCapabilityKind
    ? await findActiveCapabilityGrant(args.sourceSite.site_root, {
      siteId: targetSite.site_id,
      capabilityKind: requiredCapabilityKind,
      action: args.tool,
    })
    : null;

  return {
    source_site: args.sourceSite,
    target_site: targetSite,
    target,
    route,
    alternatives_count: alternativesCount,
    authority_posture: 'facade_only',
    resolution,
    cross_site: targetSite.site_root !== args.sourceSite.site_root,
    mutation_attempted: args.mutationAttempted,
    required_capability_kind: requiredCapabilityKind,
    capability_grant_id: grant?.grant_id ?? null,
    capability_status: requiredCapabilityKind ? (grant ? 'active' : 'missing') : 'not_required',
    tool: args.tool,
  };
}

async function findActiveCapabilityGrant(cwd: string, args: {
  siteId: string;
  capabilityKind: string;
  action: string;
}): Promise<{ grant_id: string } | null> {
  const registry = await readCapabilityRegistry(cwd);
  return registry.grants.find((grant) => {
    if (grant.site_id !== args.siteId) return false;
    if (grant.capability_kind !== args.capabilityKind) return false;
    if (grantEffectiveStatus(grant) !== 'active') return false;
    if (grant.denied_actions.includes(args.action)) return false;
    return grant.allowed_actions.includes(args.action) || grant.allowed_actions.includes('*');
  }) ?? null;
}

function parseTarget(args: Record<string, unknown>): McpTarget | null {
  const target = asRecord(args.target);
  if (Object.keys(target).length === 0) return null;
  const kind = stringField(target, 'kind');
  if (kind && kind !== 'site') throw new Error(`Unsupported MCP target kind: ${kind}`);
  const ref = stringField(target, 'ref');
  const siteRoot = stringField(target, 'site_root');
  if (!ref && !siteRoot) throw new Error('MCP target requires ref or site_root');
  return { kind: 'site', ...(ref ? { ref } : {}), ...(siteRoot ? { site_root: siteRoot } : {}) };
}

export function resolveMcpSiteContext(options: Pick<McpServerOptions, 'cwd' | 'siteRoot' | 'siteId' | 'siteKind'> = {}): McpSiteContext {
  const root = resolve(options.siteRoot ?? options.cwd ?? processCwd());
  const configPath = resolve(root, 'config.json');
  const config = readJsonObject(configPath);
  const locus = asRecord(config?.locus);
  const configuredSiteRoot = stringField(config ?? {}, 'site_root');
  const siteRoot = resolve(configuredSiteRoot ?? root);
  const siteId = options.siteId ?? stringField(config ?? {}, 'site_id') ?? basename(siteRoot) ?? 'unknown-site';
  const siteKind = options.siteKind ?? stringField(config ?? {}, 'site_kind') ?? 'unspecified';
  const authorityLocus = stringField(locus, 'authority_locus') ?? siteKind;
  const workspaceRoot = stringField(config ?? {}, 'workspace_root');

  return {
    site_id: siteId,
    site_kind: siteKind,
    site_root: siteRoot,
    ...(workspaceRoot ? { workspace_root: workspaceRoot } : {}),
    authority_locus: authorityLocus,
    source: config ? 'config' : (options.siteId || options.siteKind || options.siteRoot ? 'options' : 'cwd'),
  };
}

function resolveMcpToolPolicy(options: Pick<McpServerOptions, 'mcpToolPolicy'> = {}): McpToolPolicy | undefined {
  if (options.mcpToolPolicy) return options.mcpToolPolicy;
  const raw = processEnv.NARADA_MCP_TOOL_POLICY;
  if (!raw) return undefined;
  try {
    return asRecord(JSON.parse(raw)) as McpToolPolicy;
  } catch {
    throw new Error('invalid_narada_mcp_tool_policy');
  }
}

function allowedToolsForPolicy(policy?: McpToolPolicy): string[] | '*' | undefined {
  if (!policy) return undefined;
  const serverName = policy.default_server ?? 'narada-proper';
  const serverPolicy = policy.servers?.[serverName];
  return serverPolicy?.allowed_tools;
}

function isToolAllowed(toolName: string, policy?: McpToolPolicy): boolean {
  const allowedTools = allowedToolsForPolicy(policy);
  if (!allowedTools) return true;
  if (allowedTools === '*') return true;
  return allowedTools.includes(toolName);
}

function filterToolsByPolicy(tools: McpTool[], policy?: McpToolPolicy): McpTool[] {
  return tools.filter((tool) => isToolAllowed(tool.name, policy));
}

function summarizeToolPolicy(policy?: McpToolPolicy): Record<string, unknown> | null {
  if (!policy) return null;
  return {
    schema: policy.schema ?? 'narada.mcp.tool_policy.v0',
    policy_source: policy.policy_source ?? 'unspecified',
    agent_id: policy.agent_id ?? null,
    role: policy.role ?? null,
    default_server: policy.default_server ?? 'narada-proper',
    servers: policy.servers ?? {},
  };
}
function jsonToolResult(value: unknown, isError = false): McpToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], ...(isError ? { isError: true } : {}) };
}

function commandToolResult(envelope: { exitCode: ExitCode; result: unknown }, traversal?: McpTraversalContext): McpToolResult {
  const result = traversal ? attachTraversal(envelope.result, traversal) : envelope.result;
  const text = JSON.stringify(result, null, 2);
  return {
    content: [{ type: 'text', text }],
    ...(envelope.exitCode === ExitCode.SUCCESS ? {} : { isError: true }),
  };
}

function attachTraversal(result: unknown, traversal: McpTraversalContext): unknown {
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    return { ...(result as Record<string, unknown>), traversal };
  }
  return { result, traversal };
}

function readJsonObject(path: string): Record<string, unknown> | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return asRecord(parsed);
  } catch {
    return undefined;
  }
}

function parseJsonRpcInput(input: string): JsonRpcRequest[] {
  const trimmed = input.trim();
  if (!trimmed) return [];
  if (/^Content-Length:/im.test(trimmed)) return parseContentLengthMessages(input);
  return trimmed
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as JsonRpcRequest);
}

function drainJsonRpcFrames(input: string): { requests: JsonRpcRequest[]; remaining: string } {
  if (/^Content-Length:/im.test(input)) return drainContentLengthFrames(input);
  const lines = input.split(/\r?\n/);
  const remaining = lines.pop() ?? '';
  return {
    requests: lines.filter((line) => line.trim().length > 0).map((line) => JSON.parse(line) as JsonRpcRequest),
    remaining,
  };
}

function drainContentLengthFrames(input: string): { requests: JsonRpcRequest[]; remaining: string } {
  const requests: JsonRpcRequest[] = [];
  let cursor = 0;
  while (cursor < input.length) {
    const headerEnd = input.indexOf('\r\n\r\n', cursor);
    if (headerEnd < 0) break;
    const header = input.slice(cursor, headerEnd);
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) throw new Error('MCP stdio frame missing Content-Length');
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (input.length < bodyEnd) break;
    requests.push(JSON.parse(input.slice(bodyStart, bodyEnd)) as JsonRpcRequest);
    cursor = bodyEnd;
    while (input[cursor] === '\r' || input[cursor] === '\n') cursor += 1;
  }
  return { requests, remaining: input.slice(cursor) };
}

function parseContentLengthMessages(input: string): JsonRpcRequest[] {
  const messages: JsonRpcRequest[] = [];
  let cursor = 0;
  while (cursor < input.length) {
    const headerEnd = input.indexOf('\r\n\r\n', cursor);
    if (headerEnd < 0) break;
    const header = input.slice(cursor, headerEnd);
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) throw new Error('MCP stdio frame missing Content-Length');
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const body = input.slice(bodyStart, bodyStart + length);
    messages.push(JSON.parse(body) as JsonRpcRequest);
    cursor = bodyStart + length;
    while (input[cursor] === '\r' || input[cursor] === '\n') cursor += 1;
  }
  return messages;
}

function objectSchema(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return {
    type: 'object',
    properties,
    additionalProperties: false,
    ...(required.length > 0 ? { required } : {}),
  };
}

function stringSchema(description: string): Record<string, unknown> {
  return { type: 'string', description };
}

function numberSchema(description: string): Record<string, unknown> {
  return { type: 'number', description };
}

function booleanSchema(description: string): Record<string, unknown> {
  return { type: 'boolean', description };
}

function arrayStringSchema(description: string): Record<string, unknown> {
  return { type: 'array', items: { type: 'string' }, description };
}

function targetSchema(): Record<string, unknown> {
  return objectSchema({
    kind: { type: 'string', enum: ['site'], description: 'Target kind; only site is supported in v1.' },
    ref: stringSchema('Target Site reference resolved through the source Site routing registry.'),
    site_root: stringSchema('Explicit target Site root; path fallback for local proof and tests.'),
  });
}

function planSiteTaskLifecyclePathsForMcp(siteRoot: string): Record<string, string> {
  const root = resolve(siteRoot);
  return {
    siteRoot: root,
    taskDbPath: resolve(root, '.ai', 'task-lifecycle.db'),
    taskSpecDir: resolve(root, '.ai', 'do-not-open', 'tasks'),
    manifestPath: resolve(root, '.ai', 'site-task-lifecycle-admission.json'),
  };
}

function admitTaskLifecycleTask(args: {
  siteRoot: string;
  siteId: string;
  taskId: string;
  title: string;
  sourceRef: string;
  sourceSite: string;
  summary: string;
  receivedAt: string;
  admittedBy: string;
  evidenceRefs: string[];
}): Record<string, unknown> {
  const refs = [args.sourceRef, ...args.evidenceRefs];
  const denied = refs.flatMap(findDeniedSourceRefsForMcp);
  if (denied.length > 0) {
    return {
      status: 'error',
      error: 'denied_source_import_ref',
      deniedSourceImportFindings: denied,
      mutationAttempted: true,
      mutationExecuted: false,
      sourceStateImported: false,
      packageExecutedSqliteMutation: false,
    };
  }

  const paths = planSiteTaskLifecyclePathsForMcp(args.siteRoot);
  mkdirSync(resolve(args.siteRoot, '.ai'), { recursive: true });
  for (const statement of SITE_TASK_LIFECYCLE_SCHEMA) {
    sqlite(paths.taskDbPath, statement);
  }

  const createdAt = new Date().toISOString();
  sqlite(paths.taskDbPath, [
    'INSERT OR IGNORE INTO task_records (task_id, title, source_site, source_ref, status, received_at, summary, created_at)',
    `VALUES (${sqlLiteral(args.taskId)}, ${sqlLiteral(args.title)}, ${sqlLiteral(args.sourceSite)}, ${sqlLiteral(args.sourceRef)}, 'admitted', ${sqlLiteral(args.receivedAt)}, ${sqlLiteral(args.summary)}, ${sqlLiteral(createdAt)});`,
  ].join(' '));
  for (const ref of refs) {
    sqlite(paths.taskDbPath, [
      'INSERT OR IGNORE INTO task_evidence_refs (task_id, evidence_ref, evidence_kind)',
      `VALUES (${sqlLiteral(args.taskId)}, ${sqlLiteral(ref)}, ${sqlLiteral(ref.startsWith('OSM:') ? 'operator_surface_message' : 'external_reference')});`,
    ].join(' '));
  }

  const eventId = `mcp-task-admission-${createHash('sha256').update(`${args.taskId}\n${createdAt}\n${args.admittedBy}`).digest('hex').slice(0, 16)}`;
  sqlite(paths.taskDbPath, [
    'INSERT OR IGNORE INTO task_admission_events (event_id, task_id, event_type, recorded_at, payload_json)',
    `VALUES (${sqlLiteral(eventId)}, ${sqlLiteral(args.taskId)}, 'mcp_task_admitted', ${sqlLiteral(createdAt)}, ${sqlLiteral(JSON.stringify({ admittedBy: args.admittedBy, sourceRef: args.sourceRef }))});`,
  ].join(' '));

  const readback = sqliteJson(paths.taskDbPath, `SELECT task_id, status, source_site, source_ref FROM task_records WHERE task_id = ${sqlLiteral(args.taskId)};`);
  const evidencePath = writeTaskLifecycleMutationEvidence(args.siteRoot, {
    taskId: args.taskId,
    siteId: args.siteId,
    sourceRef: args.sourceRef,
    eventId,
    dbPath: paths.taskDbPath,
    recordedAt: createdAt,
    admittedBy: args.admittedBy,
    readback,
  });

  return {
    status: 'success',
    schema: 'narada.site_task_lifecycle.mcp_admit_task_result.v0',
    taskId: args.taskId,
    adapterId: 'narada-proper.adapter.task-0005.mcp-sqlite3-cli.v0',
    taskDbPath: paths.taskDbPath,
    mutationAttempted: true,
    mutationExecuted: true,
    sourceStateImported: false,
    packageOwnsSqliteDependency: false,
    packageExecutedSqliteMutation: false,
    readback,
    mutationEvidencePath: evidencePath,
  };
}

async function openAdmittedTaskLifecycleTask(args: {
  siteRoot: string;
  siteId: string;
  taskId: string;
  sourceEnvelopeId: string;
  openedBy: string;
  requiredWork?: string;
  acceptanceCriteria: string[];
}): Promise<Record<string, unknown>> {
  const paths = planSiteTaskLifecyclePathsForMcp(args.siteRoot);
  if (!existsSync(paths.taskDbPath)) {
    return {
      status: 'not_found',
      error: 'task_lifecycle_db_not_found',
      taskId: args.taskId,
      taskDbPath: paths.taskDbPath,
      mutationAttempted: true,
      mutationExecuted: false,
      sourceStateImported: false,
      packageExecutedSqliteMutation: false,
    };
  }

  const rows = sqliteJson(paths.taskDbPath, [
    'SELECT task_id, title, source_site, source_ref, status, received_at, summary, created_at',
    'FROM task_records',
    `WHERE task_id = ${sqlLiteral(args.taskId)};`,
  ].join(' ')) as Array<{
    task_id: string;
    title: string;
    source_site: string;
    source_ref: string;
    status: string;
    received_at: string;
    summary: string;
    created_at: string;
  }>;
  if (rows.length === 0) {
    return {
      status: 'not_found',
      taskId: args.taskId,
      taskDbPath: paths.taskDbPath,
      mutationAttempted: true,
      mutationExecuted: false,
      sourceStateImported: false,
      packageExecutedSqliteMutation: false,
    };
  }
  const admitted = rows[0];
  if (admitted.status !== 'admitted') {
    return {
      status: 'error',
      error: 'task_candidate_not_admitted',
      taskId: args.taskId,
      currentStatus: admitted.status,
      mutationAttempted: true,
      mutationExecuted: false,
      sourceStateImported: false,
      packageExecutedSqliteMutation: false,
    };
  }

  const openedAt = new Date().toISOString();
  const taskNumber = await allocateTaskNumber(args.siteRoot);
  const openedTaskId = `${openedAt.slice(0, 10).replace(/-/g, '')}-${taskNumber}-${slugifyTaskTitle(admitted.title)}`;
  const openedTaskFileName = `${openedTaskId}.md`;
  const openedTaskPath = resolve(paths.taskSpecDir, openedTaskFileName);
  const acceptanceCriteria = args.acceptanceCriteria.length > 0
    ? args.acceptanceCriteria
    : [
      `Admitted task candidate ${args.taskId} is handled through this opened Narada proper task.`,
      `Source inbox envelope ${args.sourceEnvelopeId} is routed to this task with mutation evidence.`,
      'Residual authority, lifecycle, or implementation blockers are reported explicitly.',
    ];
  const requiredWork = args.requiredWork ?? [
    `Review admitted task candidate ${args.taskId} and source inbox envelope ${args.sourceEnvelopeId}.`,
    'Execute the smallest Narada proper change or decision needed for the admitted candidate.',
    'Preserve Narada proper/User Site/PC Site locus separation.',
    'Verify the result with focused evidence before closure.',
  ].map((line, index) => `${index + 1}. ${line}`).join('\n');

  const body = [
    `# ${admitted.title}`,
    '',
    '## Goal',
    '',
    admitted.title,
    '',
    '## Context',
    '',
    `Opened from admitted task candidate: ${args.taskId}`,
    `Source ref: ${admitted.source_ref}`,
    `Source inbox envelope: ${args.sourceEnvelopeId}`,
    admitted.summary ? `Summary: ${admitted.summary}` : null,
    '',
    '## Required Work',
    '',
    requiredWork,
    '',
    '## Non-Goals',
    '',
    '- Do not auto-claim this task as part of opening it.',
    '- Do not route this work through a connected-Site task lifecycle surface.',
    '- Do not treat task admission as execution or closure evidence.',
    '',
    '## Acceptance Criteria',
    '',
    ...acceptanceCriteria.map((criterion) => `- [ ] ${criterion}`),
  ].filter((line): line is string => line !== null).join('\n');

  mkdirSync(paths.taskSpecDir, { recursive: true });
  writeFileSync(openedTaskPath, serializeFrontMatter({
    task_id: openedTaskId,
    status: 'opened',
  }, body), 'utf8');

  const store = openTaskLifecycleStore(args.siteRoot);
  try {
    store.upsertLifecycle({
      task_id: openedTaskId,
      task_number: taskNumber,
      status: 'opened',
      governed_by: null,
      closed_at: null,
      closed_by: null,
      reopened_at: null,
      reopened_by: null,
      continuation_packet_json: null,
      updated_at: openedAt,
    });
    store.upsertTaskSpec({
      task_id: openedTaskId,
      task_number: taskNumber,
      title: admitted.title,
      chapter_markdown: 'Narada Proper Inbox Admissions',
      goal_markdown: admitted.title,
      context_markdown: [
        `Opened from admitted task candidate: ${args.taskId}`,
        `Source ref: ${admitted.source_ref}`,
        `Source inbox envelope: ${args.sourceEnvelopeId}`,
        admitted.summary,
      ].filter(Boolean).join('\n\n'),
      required_work_markdown: requiredWork,
      non_goals_markdown: [
        '- Do not auto-claim this task as part of opening it.',
        '- Do not route this work through a connected-Site task lifecycle surface.',
        '- Do not treat task admission as execution or closure evidence.',
      ].join('\n'),
      acceptance_criteria_json: JSON.stringify(acceptanceCriteria),
      dependencies_json: JSON.stringify([]),
      updated_at: openedAt,
    });
  } finally {
    store.db.close();
  }

  sqlite(paths.taskDbPath, [
    'UPDATE task_records',
    `SET status = 'opened'`,
    `WHERE task_id = ${sqlLiteral(args.taskId)};`,
  ].join(' '));
  const eventId = `mcp-task-opened-${createHash('sha256').update(`${args.taskId}\n${openedTaskId}\n${openedAt}\n${args.openedBy}`).digest('hex').slice(0, 16)}`;
  sqlite(paths.taskDbPath, [
    'INSERT OR IGNORE INTO task_admission_events (event_id, task_id, event_type, recorded_at, payload_json)',
    `VALUES (${sqlLiteral(eventId)}, ${sqlLiteral(args.taskId)}, 'mcp_task_opened', ${sqlLiteral(openedAt)}, ${sqlLiteral(JSON.stringify({
      openedBy: args.openedBy,
      openedTaskId,
      taskNumber,
      sourceEnvelopeId: args.sourceEnvelopeId,
    }))});`,
  ].join(' '));

  const inboxDisposition = await inboxPromoteCommand({
    cwd: args.siteRoot,
    envelopeId: args.sourceEnvelopeId,
    targetKind: 'task',
    targetRef: `task:${taskNumber}`,
    by: args.openedBy,
    format: 'json',
  });
  if (inboxDisposition.exitCode !== ExitCode.SUCCESS) {
    return {
      status: 'partial',
      error: 'inbox_disposition_failed',
      taskId: args.taskId,
      openedTaskId,
      taskNumber,
      openedTaskPath,
      inboxDisposition: inboxDisposition.result,
      mutationAttempted: true,
      mutationExecuted: true,
      sourceStateImported: false,
      packageExecutedSqliteMutation: false,
    };
  }

  const readback = {
    admittedTask: sqliteJson(paths.taskDbPath, `SELECT task_id, status, source_site, source_ref FROM task_records WHERE task_id = ${sqlLiteral(args.taskId)};`),
    openedTask: sqliteJson(paths.taskDbPath, `SELECT task_id, task_number, status FROM task_lifecycle WHERE task_id = ${sqlLiteral(openedTaskId)};`),
  };
  const evidencePath = writeTaskLifecycleMutationEvidence(args.siteRoot, {
    command: 'site_task_lifecycle.open_admitted_task',
    taskId: args.taskId,
    openedTaskId,
    taskNumber,
    siteId: args.siteId,
    sourceEnvelopeId: args.sourceEnvelopeId,
    eventId,
    dbPath: paths.taskDbPath,
    openedTaskPath,
    recordedAt: openedAt,
    openedBy: args.openedBy,
    inboxDisposition: inboxDisposition.result,
    readback,
  });

  return {
    status: 'success',
    schema: 'narada.site_task_lifecycle.mcp_open_admitted_task_result.v0',
    taskId: args.taskId,
    openedTaskId,
    taskNumber,
    openedTaskPath,
    adapterId: 'narada-proper.adapter.task-0006.mcp-open-admitted-task.v0',
    taskDbPath: paths.taskDbPath,
    mutationAttempted: true,
    mutationExecuted: true,
    sourceStateImported: false,
    packageOwnsSqliteDependency: false,
    packageExecutedSqliteMutation: false,
    inboxDisposition: inboxDisposition.result,
    readback,
    mutationEvidencePath: evidencePath,
  };
}

function readTaskLifecycleTask(args: { siteRoot: string; taskId: string }): Record<string, unknown> {
  const paths = planSiteTaskLifecyclePathsForMcp(args.siteRoot);
  if (!existsSync(paths.taskDbPath)) {
    return {
      status: 'not_found',
      taskId: args.taskId,
      taskDbPath: paths.taskDbPath,
      mutationAttempted: false,
      mutationExecuted: false,
      sourceStateImported: false,
      packageExecutedSqliteMutation: false,
    };
  }

  const taskRows = sqliteJson(paths.taskDbPath, `SELECT task_id, title, source_site, source_ref, status, received_at, summary, created_at FROM task_records WHERE task_id = ${sqlLiteral(args.taskId)};`);
  if (taskRows.length === 0) {
    return {
      status: 'not_found',
      taskId: args.taskId,
      taskDbPath: paths.taskDbPath,
      mutationAttempted: false,
      mutationExecuted: false,
      sourceStateImported: false,
      packageExecutedSqliteMutation: false,
    };
  }

  return {
    status: 'success',
    schema: 'narada.site_task_lifecycle.mcp_read_task_result.v0',
    taskId: args.taskId,
    taskDbPath: paths.taskDbPath,
    task: taskRows[0],
    evidenceRefs: sqliteJson(paths.taskDbPath, `SELECT evidence_ref, evidence_kind FROM task_evidence_refs WHERE task_id = ${sqlLiteral(args.taskId)} ORDER BY evidence_ref;`),
    admissionEvents: sqliteJson(paths.taskDbPath, `SELECT event_id, event_type, recorded_at FROM task_admission_events WHERE task_id = ${sqlLiteral(args.taskId)} ORDER BY event_id;`),
    mutationAttempted: false,
    mutationExecuted: false,
    sourceStateImported: false,
    packageExecutedSqliteMutation: false,
  };
}

interface AgentContextMemoryStore {
  schema: 'narada.agent_context_memory.local_store.v0';
  site_id: string;
  target_site_root: string;
  carrier_id: 'agent_context_memory_local_storage';
  package_name: '@narada2/agent-context-memory';
  package_owns_sqlite_dependency: false;
  source_state_imported: false;
  named_agents: unknown[];
  sessions: unknown[];
  checkpoints: Array<Record<string, unknown> & { checkpointId?: string; checkpoint_id?: string }>;
  hydration_events: Array<Record<string, unknown>>;
}

function planAgentContextHydration(args: {
  siteRoot: string;
  siteId: string;
  hydrationId?: string;
  namedAgentId: string;
  checkpointRefs: string[];
  requestedBy: string;
  sourceImportRefs: string[];
}): Record<string, unknown> {
  const denied = findDeniedSourceImports(args.sourceImportRefs);
  if (denied.length > 0) {
    return {
      status: 'error',
      error: 'denied_source_import_ref',
      deniedSourceImportFindings: denied,
      mutationAttempted: false,
      mutationExecuted: false,
      runtimeHydrationExecuted: false,
      sourceStateImported: false,
      packageExecutedSqliteMutation: false,
    };
  }

  const descriptor = buildHydrationRequestDescriptor({
    hydrationId: args.hydrationId ?? `hydrate-${createHash('sha256').update(`${args.siteId}\n${args.namedAgentId}\n${args.checkpointRefs.join('\n')}`).digest('hex').slice(0, 16)}`,
    namedAgentId: args.namedAgentId,
    checkpointRefs: args.checkpointRefs,
    requestedBy: args.requestedBy,
    sourceImportRefs: args.sourceImportRefs,
  });

  return {
    status: 'success',
    schema: 'narada.agent_context_memory.mcp_plan_hydration_result.v0',
    packageName: '@narada2/agent-context-memory',
    siteId: args.siteId,
    storePath: agentContextMemoryStorePath(args.siteRoot),
    descriptor,
    mutationAttempted: false,
    mutationExecuted: false,
    runtimeHydrationExecuted: false,
    sourceStateImported: false,
    packageExecutedSqliteMutation: false,
  };
}

function recordAgentContextCheckpoint(args: {
  siteRoot: string;
  siteId: string;
  checkpointId: string;
  sessionId: string;
  namedAgentId: string;
  summary: string;
  evidenceRefs: string[];
  capturedAt: string;
  sourceImportRefs: string[];
}): Record<string, unknown> {
  const denied = findDeniedSourceImports(args.sourceImportRefs);
  if (denied.length > 0) {
    return {
      status: 'error',
      error: 'denied_source_import_ref',
      deniedSourceImportFindings: denied,
      mutationAttempted: true,
      mutationExecuted: false,
      runtimeHydrationExecuted: false,
      sourceStateImported: false,
      packageExecutedSqliteMutation: false,
    };
  }

  const descriptor = buildCheckpointDescriptor({
    checkpointId: args.checkpointId,
    sessionId: args.sessionId,
    namedAgentId: args.namedAgentId,
    summary: args.summary,
    evidenceRefs: args.evidenceRefs,
    capturedAt: args.capturedAt,
    sourceImportRefs: args.sourceImportRefs,
  });
  const store = readAgentContextMemoryStore(args.siteRoot, args.siteId);
  const existingIndex = store.checkpoints.findIndex((checkpoint) => {
    const id = typeof checkpoint.checkpointId === 'string' ? checkpoint.checkpointId : checkpoint.checkpoint_id;
    return id === args.checkpointId;
  });
  if (existingIndex >= 0) {
    store.checkpoints[existingIndex] = descriptor as unknown as AgentContextMemoryStore['checkpoints'][number];
  } else {
    store.checkpoints.push(descriptor as unknown as AgentContextMemoryStore['checkpoints'][number]);
  }
  writeAgentContextMemoryStore(args.siteRoot, store);

  const evidencePath = writeAgentContextMutationEvidence(args.siteRoot, {
    siteId: args.siteId,
    checkpointId: args.checkpointId,
    sessionId: args.sessionId,
    namedAgentId: args.namedAgentId,
    recordedAt: new Date().toISOString(),
    storePath: agentContextMemoryStorePath(args.siteRoot),
  });

  return {
    status: 'success',
    schema: 'narada.agent_context_memory.mcp_record_checkpoint_result.v0',
    packageName: '@narada2/agent-context-memory',
    checkpointId: args.checkpointId,
    storePath: agentContextMemoryStorePath(args.siteRoot),
    checkpoint: descriptor,
    mutationAttempted: true,
    mutationExecuted: true,
    runtimeHydrationExecuted: false,
    sourceStateImported: false,
    packageOwnsSqliteDependency: false,
    packageExecutedSqliteMutation: false,
    mutationEvidencePath: evidencePath,
  };
}

function readAgentContextCheckpoint(args: { siteRoot: string; checkpointId: string }): Record<string, unknown> {
  const storePath = agentContextMemoryStorePath(args.siteRoot);
  if (!existsSync(storePath)) {
    return {
      status: 'not_found',
      checkpointId: args.checkpointId,
      storePath,
      mutationAttempted: false,
      mutationExecuted: false,
      runtimeHydrationExecuted: false,
      sourceStateImported: false,
      packageExecutedSqliteMutation: false,
    };
  }

  const store = readAgentContextMemoryStore(args.siteRoot, 'unknown-site');
  const checkpoint = store.checkpoints.find((entry) => {
    const id = typeof entry.checkpointId === 'string' ? entry.checkpointId : entry.checkpoint_id;
    return id === args.checkpointId;
  });
  if (!checkpoint) {
    return {
      status: 'not_found',
      checkpointId: args.checkpointId,
      storePath,
      mutationAttempted: false,
      mutationExecuted: false,
      runtimeHydrationExecuted: false,
      sourceStateImported: false,
      packageExecutedSqliteMutation: false,
    };
  }

  return {
    status: 'success',
    schema: 'narada.agent_context_memory.mcp_read_checkpoint_summary_result.v0',
    checkpointId: args.checkpointId,
    storePath,
    checkpoint,
    mutationAttempted: false,
    mutationExecuted: false,
    runtimeHydrationExecuted: false,
    sourceStateImported: false,
    packageExecutedSqliteMutation: false,
  };
}

function agentContextMemoryStorePath(siteRoot: string): string {
  return resolve(siteRoot, '.narada', 'agent-context-memory', 'memory-store.json');
}

function readAgentContextMemoryStore(siteRoot: string, siteId: string): AgentContextMemoryStore {
  const storePath = agentContextMemoryStorePath(siteRoot);
  const existing = readJsonObject(storePath);
  return {
    schema: 'narada.agent_context_memory.local_store.v0',
    site_id: stringField(existing ?? {}, 'site_id') ?? siteId,
    target_site_root: stringField(existing ?? {}, 'target_site_root') ?? resolve(siteRoot),
    carrier_id: 'agent_context_memory_local_storage',
    package_name: '@narada2/agent-context-memory',
    package_owns_sqlite_dependency: false,
    source_state_imported: false,
    named_agents: Array.isArray(existing?.named_agents) ? existing.named_agents : [],
    sessions: Array.isArray(existing?.sessions) ? existing.sessions : [],
    checkpoints: Array.isArray(existing?.checkpoints) ? existing.checkpoints as AgentContextMemoryStore['checkpoints'] : [],
    hydration_events: Array.isArray(existing?.hydration_events) ? existing.hydration_events as AgentContextMemoryStore['hydration_events'] : [],
  };
}

function writeAgentContextMemoryStore(siteRoot: string, store: AgentContextMemoryStore): void {
  const storePath = agentContextMemoryStorePath(siteRoot);
  mkdirSync(resolve(siteRoot, '.narada', 'agent-context-memory'), { recursive: true });
  writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function writeAgentContextMutationEvidence(siteRoot: string, evidence: Record<string, unknown>): string {
  const digest = createHash('sha256').update(JSON.stringify(evidence)).digest('hex').slice(0, 16);
  const evidenceDir = resolve(siteRoot, '.ai', 'mutation-evidence', 'agent_context_memory');
  const evidencePath = resolve(evidenceDir, `mcp_${digest}.json`);
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify({
    schema: 'narada.agent_context_memory.mcp_mutation_evidence.v0',
    command: 'agent_context_memory.record_checkpoint',
    authority_class: 'mcp_local_json_store_checkpoint_mutation',
    runtimeHydrationExecuted: false,
    packageExecutedSqliteMutation: false,
    sourceStateImported: false,
    ...evidence,
  }, null, 2)}\n`, 'utf8');
  return evidencePath;
}

const SITE_TASK_LIFECYCLE_SCHEMA = [
  [
    'CREATE TABLE IF NOT EXISTS task_records (',
    'task_id TEXT PRIMARY KEY,',
    'title TEXT NOT NULL,',
    'source_site TEXT NOT NULL,',
    'source_ref TEXT NOT NULL,',
    'status TEXT NOT NULL,',
    'received_at TEXT NOT NULL,',
    'summary TEXT NOT NULL,',
    'created_at TEXT NOT NULL',
    ');',
  ].join('\n'),
  [
    'CREATE TABLE IF NOT EXISTS task_evidence_refs (',
    'task_id TEXT NOT NULL,',
    'evidence_ref TEXT NOT NULL,',
    'evidence_kind TEXT NOT NULL,',
    'PRIMARY KEY (task_id, evidence_ref),',
    'FOREIGN KEY (task_id) REFERENCES task_records(task_id)',
    ');',
  ].join('\n'),
  [
    'CREATE TABLE IF NOT EXISTS task_admission_events (',
    'event_id TEXT PRIMARY KEY,',
    'task_id TEXT NOT NULL,',
    'event_type TEXT NOT NULL,',
    'recorded_at TEXT NOT NULL,',
    'payload_json TEXT NOT NULL,',
    'FOREIGN KEY (task_id) REFERENCES task_records(task_id)',
    ');',
  ].join('\n'),
];

function sqlite(dbPath: string, sql: string): void {
  execFileSync('sqlite3.exe', ['-cmd', '.timeout 5000', dbPath, sql], { stdio: 'pipe' });
}

function sqliteJson(dbPath: string, sql: string): unknown[] {
  const output = execFileSync('sqlite3.exe', ['-cmd', '.timeout 5000', '-json', dbPath, sql], { encoding: 'utf8' });
  return output.trim().length > 0 ? JSON.parse(output) as unknown[] : [];
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function slugifyTaskTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return slug || 'admitted-task';
}

function writeTaskLifecycleMutationEvidence(siteRoot: string, evidence: Record<string, unknown>): string {
  const digest = createHash('sha256').update(JSON.stringify(evidence)).digest('hex').slice(0, 16);
  const evidenceDir = resolve(siteRoot, '.ai', 'mutation-evidence', 'task_lifecycle');
  const evidencePath = resolve(evidenceDir, `mcp_${digest}.json`);
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify({
    schema: 'narada.site_task_lifecycle.mcp_mutation_evidence.v0',
    command: 'site_task_lifecycle.admit_task',
    authority_class: 'mcp_adapter_bound_task_lifecycle_mutation',
    packageExecutedSqliteMutation: false,
    sourceStateImported: false,
    ...evidence,
  }, null, 2)}\n`, 'utf8');
  return evidencePath;
}

function findDeniedSourceRefsForMcp(path: string): Array<{ path: string; reason: string }> {
  const comparable = path.replaceAll('/', '\\').replace(/\\+/g, '\\');
  const patterns: Array<{ pattern: RegExp; reason: string }> = [
    { pattern: /(^|\\)\.ai\\task-lifecycle\.db(-shm|-wal)?$/i, reason: 'source task lifecycle database' },
    { pattern: /(^|\\)\.ai\\do-not-open\\tasks(\\|$)/i, reason: 'source task history' },
    { pattern: /(^|\\)\.ai\\inbox\.db$/i, reason: 'source inbox database' },
    { pattern: /(^|\\)\.ai\\inbox-envelopes(\\|$)/i, reason: 'source inbox envelope history' },
    { pattern: /(^|\\)\.ai\\agents\\roster\.json$/i, reason: 'source roster authority' },
    { pattern: /(^|\\)operator-surfaces(\\|$)/i, reason: 'operator-surface binding or projection state' },
    { pattern: /^c:\\programdata\\narada\\sites\\pc\\/i, reason: 'PC-locus runtime state' },
    { pattern: /(^|\\)(secrets?|tokens?|credentials?)(\\|\.|$)/i, reason: 'secret or credential material' },
  ];
  const denied = patterns.find(({ pattern }) => pattern.test(comparable));
  return denied ? [{ path, reason: denied.reason }] : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = stringField(record, key);
  if (!value) throw new Error(`Missing required tool argument: ${key}`);
  return value;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function booleanField(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === 'boolean' ? value : undefined;
}

function stringArrayField(record: Record<string, unknown>, key: string): string[] | undefined {
  const value = record[key];
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return strings.length > 0 ? strings.map((item) => item.trim()) : undefined;
}
