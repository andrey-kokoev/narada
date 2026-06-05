import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import {
  buildCheckpointDescriptor,
  buildHydrationRequestDescriptor,
  findDeniedSourceImports,
} from '@narada2/agent-context-memory';
import { cwd as processCwd, env as processEnv, stdin as defaultStdin, stdout as defaultStdout } from 'node:process';
import {
  inboxDoctorCommand,
  inboxListCommand,
  inboxShowCommand,
  inboxSubmitObservationCommand,
  inboxSubmitTypedEnvelopeCommand,
  inboxWorkNextCommand,
} from './commands/inbox.js';
import {
  taskPeekNextCommand,
  taskReadCommand,
  taskWorkNextCommand,
} from './commands/task-next.js';
import { reconcileLocalMcpRolePolicy } from './config-policy-reconciler.js';
import { runNaradaJson, type CommandEnvelope } from './commands/process.js';
import { grantEffectiveStatus, readCapabilityRegistry } from './lib/capability-consent-registry.js';
import { ExitCode } from './lib/exit-codes.js';
import type { CommandSideEffectClass } from './lib/command-execution-intent.js';
import { readRoutingRegistry, resolveRouteSelection, type RouteAddressRecord } from './lib/routing-addressing-registry.js';
import { readMcpOutputRef, readMcpPayloadRef } from './payload-output.js';

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

type DirectiveSourceKind = 'operator' | 'agent' | 'system';
type DirectiveTargetKind = 'agent' | 'carrier' | 'site' | 'role' | 'task' | 'session' | 'workspace';
type DirectiveContentKind = 'instruction' | 'constraint' | 'routing' | 'delivery' | 'context';

interface McpDirective {
  schema: 'narada.directive.v1';
  directive_id: string;
  created_at: string;
  source: { kind: DirectiveSourceKind; id: string; label?: string };
  authority: { locus: string; basis: string };
  target: { kind: DirectiveTargetKind; id: string };
  content: { kind: DirectiveContentKind; text: string };
  ordering: { priority: number; sequence: number; not_before?: string; expires_at?: string };
  admission: { status: 'admitted' | 'refused' | 'delivered' | 'candidate'; decided_at?: string; decided_by?: string; reason?: string };
}

interface McpDirectiveEmissionAuthorization {
  schema: 'narada.directive-emission-authorization.v1';
  authorization_id: string;
  authorized_at: string;
  authorized_by: { kind: DirectiveSourceKind; id: string; label?: string };
  authorized_emitter: { kind: DirectiveSourceKind; id: string; label?: string };
  authority: { locus: string; basis: string };
  directive_template: {
    target: { kind: DirectiveTargetKind; id: string };
    content: { kind: DirectiveContentKind; text: string };
    ordering: { priority: number; sequence: number; not_before?: string; expires_at?: string };
  };
  status: 'authorized';
}

interface McpTarget {
  kind: 'site';
  ref?: string;
  site_root?: string;
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
  agentId?: string;
  agentRole?: string;
  agentStartEventId?: string;
  carrierSessionId?: string;
  agentContextDb?: string;
  doctrineCorpusRoot?: string;
}

export interface McpSiteContext {
  site_id: string;
  site_kind: string;
  site_root: string;
  workspace_root?: string;
  authority_locus: string;
  source: 'config' | 'options' | 'cwd';
  startup_evidence?: { agent_id?: string; role?: string; start_event_id?: string; carrier_session_id?: string; agent_context_db?: string };
}

const PROTOCOL_VERSION = '2024-11-05';
const WSL_WINDOWS_EE_MCP_ADAPTER_ID = 'ee-mcp.windows-powershell-from-wsl';
const WSL_WINDOWS_COMMAND_ID_PATTERN = /^windows-pwsh\.readonly\.[a-z0-9][a-z0-9._-]{0,80}$/;
const CROSS_SITE_INBOX_CAPABILITY_KIND = 'canonical_inbox_cross_site_submission';
const INBOX_SUBMIT_OBSERVATION_TOOLS = new Set(['narada_inbox_submit_observation', 'inbox_submit_observation']);
const INBOX_SUBMIT_TYPED_TOOLS = new Set(['narada_inbox_submit_typed_envelope', 'inbox_submit_typed_envelope']);
const INBOX_STAGE_SUBMISSION_TOOLS = new Set(['narada_inbox_stage_submission_workflow', 'inbox_stage_submission_workflow']);

export const NARADA_MCP_TOOLS: McpTool[] = [
  {
    name: 'narada_site_context',
    description: 'Inspect the Site context that scopes this MCP facade.',
    inputSchema: objectSchema({
      target: targetSchema(),
    }),
  },
  {
    name: 'agent_context_hydrate_current',
    description: 'Hydrate the current agent session from launcher-provided Narada environment evidence without mutating.',
    inputSchema: objectSchema({
      target: targetSchema(),
    }),
  },
  {
    name: 'agent_context_startup_sequence',
    description: 'Run the canonical startup sequence: launcher/site identity hydration plus advisory checkpoint continuity.',
    inputSchema: objectSchema({
      target: targetSchema(),
    }),
  },
  {
    name: 'mcp_output_show',
    description: 'Read a Narada proper mcp_output ref emitted by this MCP server.',
    inputSchema: objectSchema({
      ref: stringSchema('Output ref, e.g. mcp_output:<sha256>.'),
      output_ref: stringSchema('Compatibility alias for ref. Prefer ref.'),
      output_limit: numberSchema('Maximum characters of stored output to inline. Defaults to 10000.'),
    }),
  },
  {
    name: 'narada_directive_create',
    description: 'Create and admit a first-class directive in the target Site directive store. This records durable directive events but does not create a task or execute authority.',
    inputSchema: objectSchema({
      source_kind: { type: 'string', enum: ['operator', 'agent', 'system'], description: 'Directive source kind.' },
      source_id: { type: 'string', description: 'Source principal or subsystem id.' },
      source_label: stringSchema('Optional source label.'),
      authority_locus: { type: 'string', description: 'Authority locus for the directive.' },
      authority_basis: { type: 'string', description: 'Authority basis for the directive.' },
      target_kind: { type: 'string', enum: ['agent', 'carrier', 'site', 'role', 'task', 'session', 'workspace'], description: 'Directive target kind.' },
      target_id: { type: 'string', description: 'Directive target id.' },
      content_kind: { type: 'string', enum: ['instruction', 'constraint', 'routing', 'delivery', 'context'], description: 'Directive content kind.' },
      text: { type: 'string', description: 'Directive text to render or deliver.' },
      priority: numberSchema('Ordering priority; higher sorts first.'),
      sequence: numberSchema('Ordering sequence; lower sorts first after priority.'),
      not_before: stringSchema('Optional ISO not-before time.'),
      expires_at: stringSchema('Optional ISO expiry time.'),
      admitted_by: stringSchema('Admitting principal; defaults to current agent or mcp-client.'),
      reason: stringSchema('Admission reason.'),
      emission_authorized_by_kind: { type: 'string', enum: ['operator', 'agent', 'system'], description: 'Optional authorizing source kind for system-emitted directives.' },
      emission_authorized_by_id: stringSchema('Optional authorizing source id for system-emitted directives.'),
      emission_authorized_by_label: stringSchema('Optional authorizing source label.'),
      emission_authority_basis: stringSchema('Optional basis for emission authorization; defaults to authority_basis.'),
      target: targetSchema(),
    }, ['source_kind', 'source_id', 'authority_locus', 'authority_basis', 'target_kind', 'target_id', 'content_kind', 'text']),
  },
  {
    name: 'narada_directive_record_operator_authorized_system_emission',
    description: 'Record an operator authorization and immediately emit/admit a Site-scoped system directive. This does not execute directive content or deliver it to a carrier.',
    inputSchema: objectSchema({
      operator_id: { type: 'string', description: 'Authorizing operator id.' },
      operator_label: stringSchema('Optional operator label.'),
      system_emitter_id: { type: 'string', description: 'Site-scoped system emitter id, for example narada-proper.system.directive_emitter. Defaults to the target Site directive emitter.' },
      authority_locus: { type: 'string', description: 'Authority locus for the authorization and directive. Defaults to the target Site authority locus.' },
      authorization_basis: { type: 'string', description: 'Basis for operator authorization. Defaults to operator_requested_system_directive.' },
      target_kind: { type: 'string', enum: ['agent', 'carrier', 'site', 'role', 'task', 'session', 'workspace'], description: 'Directive target kind.' },
      target_id: { type: 'string', description: 'Directive target id.' },
      content_kind: { type: 'string', enum: ['instruction', 'constraint', 'routing', 'delivery', 'context'], description: 'Directive content kind.' },
      text: { type: 'string', description: 'Directive text to render or deliver later.' },
      priority: numberSchema('Ordering priority; higher sorts first.'),
      sequence: numberSchema('Ordering sequence; lower sorts first after priority.'),
      not_before: stringSchema('Optional ISO not-before time; controls future activation but not execution.'),
      expires_at: stringSchema('Optional ISO expiry time.'),
      admitted_by: stringSchema('Admitting principal; defaults to current agent or mcp-client.'),
      reason: stringSchema('Admission reason.'),
      target: targetSchema(),
    }, ['target_kind', 'target_id', 'text']),
  },
  {
    name: 'narada_directive_list',
    description: 'List first-class directives from the target Site directive store without mutating.',
    inputSchema: objectSchema({
      target_kind: stringSchema('Optional target kind filter.'),
      target_id: stringSchema('Optional target id filter.'),
      active_only: booleanSchema('When true, return active admitted directives only.'),
      target: targetSchema(),
    }),
  },
  {
    name: 'narada_directive_render_context',
    description: 'Render active admitted directives as substrate-neutral prompt context for a target.',
    inputSchema: objectSchema({
      target_kind: stringSchema('Optional target kind filter.'),
      target_id: stringSchema('Optional target id filter.'),
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
    name: 'site_registry_relation_plan_transition',
    description: 'Plan a Site Registry relation transition without network transport, secret resolution, or hosted mutation.',
    inputSchema: objectSchema({
      cwd: stringSchema('Working directory; defaults to target Site root.'),
      payload_file: { type: 'string', description: 'Relation transition payload JSON file.' },
      registry_url: stringSchema('Hosted registry URL override.'),
      credential_ref: stringSchema('Credential reference override; raw secret values are refused.'),
      target: targetSchema(),
    }, ['payload_file']),
  },
  {
    name: 'agent_context_doctrinal_grounding',
    description: 'Return read-only agent-context doctrine grounding for the current Site/session posture.',
    inputSchema: objectSchema({
      mode: { type: 'string', enum: ['reground'], description: 'Grounding mode; only reground is admitted in v1.' },
      doctrine_ids: arrayStringSchema('Optional doctrine ids to include. When omitted, returns the default grounding catalog.'),
      question: stringSchema('Optional bounded question used only to select supplemental proof-case refs.'),
      require_inquiry_space_data: booleanSchema('Set true only when private Inquiry Space records are required; this returns blocked.'),
      target: targetSchema(),
    }, ['mode']),
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
    description: 'Record one inert local task-admission row through the MCP adapter boundary. This does not materialize a canonical governed task file, assignment, or work-next claimability.',
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
    name: 'site_task_lifecycle.materialize_task',
    description: 'Materialize one previously admitted inert task row into the governed Narada task lifecycle through the local task create surface; optionally claim it for an agent.',
    inputSchema: objectSchema({
      task_id: { type: 'string', description: 'Previously admitted local task id to materialize.' },
      materialized_by: stringSchema('Principal materializing the candidate; defaults to mcp-client.'),
      claim_for: stringSchema('Optional agent id to claim the materialized task after creation.'),
      target: targetSchema(),
    }, ['task_id']),
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
      agent_id: { type: 'string', description: 'Alias for agent; accepted for compatibility with Narada agent identity vocabulary.' },
      claim: booleanSchema('Claim/pull work and return an execution packet. Defaults to false for read-only discovery.'),
      target: targetSchema(),
    }),
  },
  {
    name: 'narada_task_read',
    description: 'Read one governed Narada proper task through the canonical task read command without mutating.',
    inputSchema: objectSchema({
      cwd: stringSchema('Working directory; defaults to current process cwd.'),
      task_number: numberSchema('Task number to read.'),
      target: targetSchema(),
    }, ['task_number']),
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
    name: 'inbox_submit_observation',
    description: 'Alias for narada_inbox_submit_observation. Submit a small/simple observation envelope to the local or capability-admitted target Site inbox.',
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
    name: 'narada_inbox_submit_typed_envelope',
    description: 'Submit a typed Canonical Inbox envelope to the local or capability-admitted target Site inbox.',
    inputSchema: objectSchema({
      cwd: stringSchema('Working directory; defaults to current process cwd.'),
      source_ref: { type: 'string', description: 'Source reference for the envelope.' },
      kind: stringSchema('Envelope kind; defaults to observation.'),
      payload: { type: 'object', additionalProperties: true, description: 'Typed envelope payload object.' },
      payload_file: stringSchema('Existing JSON payload file in the target Site workspace.'),
      payload_ref: stringSchema('Optional immutable mcp_payload ref from this Site.'),
      source_kind: stringSchema('Source kind; defaults to agent_report.'),
      authority_level: stringSchema('Authority level; defaults to agent_reported.'),
      principal: stringSchema('Principal associated with authority.'),
      target_locus: stringSchema('Message routing authority target locus; defaults to local_site.'),
      allow_empty_payload: booleanSchema('Allow empty object payload for kinds that normally require content.'),
      target: targetSchema(),
    }, ['source_ref']),
  },
  {
    name: 'inbox_submit_typed_envelope',
    description: 'Alias for narada_inbox_submit_typed_envelope.',
    inputSchema: objectSchema({
      cwd: stringSchema('Working directory; defaults to current process cwd.'),
      source_ref: { type: 'string', description: 'Source reference for the envelope.' },
      kind: stringSchema('Envelope kind; defaults to observation.'),
      payload: { type: 'object', additionalProperties: true, description: 'Typed envelope payload object.' },
      payload_file: stringSchema('Existing JSON payload file in the target Site workspace.'),
      payload_ref: stringSchema('Optional immutable mcp_payload ref from this Site.'),
      source_kind: stringSchema('Source kind; defaults to agent_report.'),
      authority_level: stringSchema('Authority level; defaults to agent_reported.'),
      principal: stringSchema('Principal associated with authority.'),
      target_locus: stringSchema('Message routing authority target locus; defaults to local_site.'),
      allow_empty_payload: booleanSchema('Allow empty object payload for kinds that normally require content.'),
      target: targetSchema(),
    }, ['source_ref']),
  },
  {
    name: 'inbox_stage_submission_workflow',
    description: 'Narada proper staged cross-Site inbox submission helper. submit=false previews; submit=true delegates to inbox_submit_typed_envelope under the same capability guards.',
    inputSchema: objectSchema({
      cwd: stringSchema('Working directory; defaults to current process cwd.'),
      workflow_ref: stringSchema('Optional workflow/session ref.'),
      source_ref: { type: 'string', description: 'Source reference for the envelope.' },
      kind: stringSchema('Envelope kind; defaults to observation.'),
      payload: { type: 'object', additionalProperties: true, description: 'Typed envelope payload object.' },
      payload_file: stringSchema('Existing JSON payload file in the target Site workspace.'),
      payload_ref: stringSchema('Optional immutable mcp_payload ref from this Site.'),
      source_kind: stringSchema('Source kind; defaults to agent_report.'),
      authority_level: stringSchema('Authority level; defaults to agent_reported.'),
      principal: stringSchema('Principal associated with authority.'),
      target_locus: stringSchema('Message routing authority target locus; defaults to local_site.'),
      submit: booleanSchema('When true, submit through canonical inbox admission. Defaults to false.'),
      target: targetSchema(),
    }, ['source_ref']),
  },
  {
    name: 'narada_inbox_stage_submission_workflow',
    description: 'Alias for inbox_stage_submission_workflow.',
    inputSchema: objectSchema({
      cwd: stringSchema('Working directory; defaults to current process cwd.'),
      workflow_ref: stringSchema('Optional workflow/session ref.'),
      source_ref: { type: 'string', description: 'Source reference for the envelope.' },
      kind: stringSchema('Envelope kind; defaults to observation.'),
      payload: { type: 'object', additionalProperties: true, description: 'Typed envelope payload object.' },
      payload_file: stringSchema('Existing JSON payload file in the target Site workspace.'),
      payload_ref: stringSchema('Optional immutable mcp_payload ref from this Site.'),
      source_kind: stringSchema('Source kind; defaults to agent_report.'),
      authority_level: stringSchema('Authority level; defaults to agent_reported.'),
      principal: stringSchema('Principal associated with authority.'),
      target_locus: stringSchema('Message routing authority target locus; defaults to local_site.'),
      submit: booleanSchema('When true, submit through canonical inbox admission. Defaults to false.'),
      target: targetSchema(),
    }, ['source_ref']),
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
    const result = await dispatchMcpMethod(request.method, request.params, siteContext, options);
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

async function dispatchMcpMethod(method: string, params: unknown, siteContext: McpSiteContext, options: McpServerOptions): Promise<unknown> {
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
        },
      };
    case 'tools/list':
      return { tools: NARADA_MCP_TOOLS, site: siteContext, authority_posture: 'facade_only' };
    case 'tools/call':
      return callTool(params, siteContext, options);
    default:
      throw new Error(`Unsupported MCP method: ${method}`);
  }
}

async function callTool(params: unknown, siteContext: McpSiteContext, options: McpServerOptions): Promise<McpToolResult> {
  const record = asRecord(params);
  const name = stringField(record, 'name');
  const args = normalizeDirectiveToolArguments(name, asRecord(record.arguments));
  if (!name) throw new Error('tools/call requires params.name');
  const mutationAttempted = INBOX_SUBMIT_OBSERVATION_TOOLS.has(name)
    || INBOX_SUBMIT_TYPED_TOOLS.has(name)
    || (INBOX_STAGE_SUBMISSION_TOOLS.has(name) && booleanField(args, 'submit') === true)
    || (name === 'narada_inbox_work_next' && booleanField(args, 'claim') === true)
    || (name === 'narada_task_work_next' && booleanField(args, 'claim') === true)
    || name === 'site_task_lifecycle.admit_task'
    || name === 'site_task_lifecycle.materialize_task'
    || name === 'agent_context_memory.record_checkpoint'
    || name === 'narada_directive_create'
    || name === 'narada_directive_record_operator_authorized_system_emission'
    || name === 'narada_ee_run';
  const traversal = await resolveMcpTraversal({
    sourceSite: siteContext,
    tool: name,
    args,
    mutationAttempted,
  });
  const scopedCwd = stringField(args, 'cwd') ?? traversal.target_site.site_root;

  if (mutationAttempted && traversal.cross_site && !isCapabilityAdmittedCrossSiteInboxMutation(name, traversal)) {
    return jsonToolResult({
      status: 'error',
      error: 'Cross-Site MCP mutation is not admitted for this tool/target.',
      traversal,
      required_next_step: `Use the target Site authority surface directly or add an active ${CROSS_SITE_INBOX_CAPABILITY_KIND} grant for this target Site and action.`,
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
    case 'agent_context_hydrate_current':
      return jsonToolResult(attachTraversal(buildAgentContextHydrateCurrent(traversal.target_site, siteContext), traversal));
    case 'agent_context_startup_sequence':
      return jsonToolResult(attachTraversal(buildAgentContextStartupSequence(traversal.target_site, siteContext), traversal));
    case 'mcp_output_show':
      return jsonToolResult(attachTraversal(showMcpOutputRef(traversal.target_site, args), traversal));
    case 'narada_mcp_fabric_context':
      return jsonToolResult({
        status: 'success',
        fabric_posture: 'governed_traversal_facade',
        rule: 'MCP fabric may route typed requests; target Site authority admits consequence.',
        mcp_policy_reconciliation: buildMcpPolicyReconciliationPosture(traversal.target_site.site_root),
        traversal,
      });
    case 'narada_directive_create':
      return jsonToolResult(attachTraversal(createMcpDirective({
        siteRoot: traversal.target_site.site_root,
        siteId: traversal.target_site.site_id,
        sourceKind: requiredEnum(args, 'source_kind', ['operator', 'agent', 'system']) as DirectiveSourceKind,
        sourceId: requiredString(args, 'source_id'),
        sourceLabel: stringField(args, 'source_label'),
        authorityLocus: requiredString(args, 'authority_locus'),
        authorityBasis: requiredString(args, 'authority_basis'),
        targetKind: requiredEnum(args, 'target_kind', ['agent', 'carrier', 'site', 'role', 'task', 'session', 'workspace']) as DirectiveTargetKind,
        targetId: requiredString(args, 'target_id'),
        contentKind: requiredEnum(args, 'content_kind', ['instruction', 'constraint', 'routing', 'delivery', 'context']) as DirectiveContentKind,
        text: requiredString(args, 'text'),
        priority: numberField(args, 'priority') ?? 0,
        sequence: numberField(args, 'sequence') ?? 0,
        notBefore: stringField(args, 'not_before'),
        expiresAt: stringField(args, 'expires_at'),
        admittedBy: stringField(args, 'admitted_by') ?? siteContext.startup_evidence?.agent_id ?? 'mcp-client',
        reason: stringField(args, 'reason') ?? 'mcp_directive_create',
        emissionAuthorizedByKind: enumField(args, 'emission_authorized_by_kind', ['operator', 'agent', 'system']) as DirectiveSourceKind | undefined,
        emissionAuthorizedById: stringField(args, 'emission_authorized_by_id'),
        emissionAuthorizedByLabel: stringField(args, 'emission_authorized_by_label'),
        emissionAuthorityBasis: stringField(args, 'emission_authority_basis'),
      }), traversal));
    case 'narada_directive_record_operator_authorized_system_emission':
      return jsonToolResult(attachTraversal({
        ...createMcpDirective({
          siteRoot: traversal.target_site.site_root,
          siteId: traversal.target_site.site_id,
          sourceKind: 'system',
          sourceId: requireSiteScopedSystemEmitter(
            traversal.target_site.site_id,
            stringField(args, 'system_emitter_id') ?? `${traversal.target_site.site_id}.system.directive_emitter`,
          ),
          authorityLocus: stringField(args, 'authority_locus') ?? defaultAuthorityLocusForSite(traversal.target_site),
          authorityBasis: stringField(args, 'authorization_basis') ?? 'operator_requested_system_directive',
          targetKind: requiredEnum(args, 'target_kind', ['agent', 'carrier', 'site', 'role', 'task', 'session', 'workspace']) as DirectiveTargetKind,
          targetId: requiredString(args, 'target_id'),
          contentKind: requiredEnum(args, 'content_kind', ['instruction', 'constraint', 'routing', 'delivery', 'context']) as DirectiveContentKind,
          text: requiredString(args, 'text'),
          priority: numberField(args, 'priority') ?? 0,
          sequence: numberField(args, 'sequence') ?? 0,
          notBefore: stringField(args, 'not_before'),
          expiresAt: stringField(args, 'expires_at'),
          admittedBy: stringField(args, 'admitted_by') ?? siteContext.startup_evidence?.agent_id ?? 'mcp-client',
          reason: stringField(args, 'reason') ?? 'operator_authorized_system_directive_emission',
          emissionAuthorizedByKind: 'operator',
          emissionAuthorizedById: stringField(args, 'operator_id') ?? 'operator.interactive',
          emissionAuthorizedByLabel: stringField(args, 'operator_label'),
          emissionAuthorityBasis: stringField(args, 'authorization_basis') ?? 'operator_requested_system_directive',
        }),
        toolSemantics: {
          operatorAuthorizationRecorded: true,
          systemDirectiveEmitted: true,
          emissionTimeSemantics: stringField(args, 'not_before') ? 'not_before' : 'immediate',
          executionAttempted: false,
          deliveryAttempted: false,
        },
      }, traversal));
    case 'narada_directive_list':
      return jsonToolResult(attachTraversal(listMcpDirectives({
        siteRoot: traversal.target_site.site_root,
        targetKind: enumField(args, 'target_kind', ['agent', 'carrier', 'site', 'role', 'task', 'session', 'workspace']) as DirectiveTargetKind | undefined,
        targetId: stringField(args, 'target_id'),
        activeOnly: booleanField(args, 'active_only') === true,
      }), traversal));
    case 'narada_directive_render_context':
      return jsonToolResult(attachTraversal(renderMcpDirectiveContext({
        siteRoot: traversal.target_site.site_root,
        targetKind: enumField(args, 'target_kind', ['agent', 'carrier', 'site', 'role', 'task', 'session', 'workspace']) as DirectiveTargetKind | undefined,
        targetId: stringField(args, 'target_id'),
      }), traversal));
    case 'site_registry_relation_plan_transition': {
      const commandArgs = [
        'site-registry',
        'relation',
        'plan-transition',
        '--payload-file',
        requiredString(args, 'payload_file'),
      ];
      const registryUrl = stringField(args, 'registry_url');
      const credentialRef = stringField(args, 'credential_ref');
      if (registryUrl) commandArgs.push('--registry-url', registryUrl);
      if (credentialRef) commandArgs.push('--credential-ref', credentialRef);
      return commandToolResult(runNaradaJson(commandArgs, scopedCwd), traversal);
    }
    case 'agent_context_doctrinal_grounding':
      return jsonToolResult(attachTraversal(buildAgentContextDoctrinalGrounding({
        mode: requiredString(args, 'mode'),
        doctrineIds: stringArrayField(args, 'doctrine_ids'),
        question: stringField(args, 'question'),
        requireInquirySpaceData: booleanField(args, 'require_inquiry_space_data') === true,
        siteRoot: traversal.target_site.site_root,
        doctrineCorpusRoot: options.doctrineCorpusRoot,
      }), traversal));
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
    case 'site_task_lifecycle.materialize_task':
      return jsonToolResult(attachTraversal(materializeTaskLifecycleTask({
        siteRoot: traversal.target_site.site_root,
        siteId: traversal.target_site.site_id,
        taskId: requiredString(args, 'task_id'),
        materializedBy: stringField(args, 'materialized_by') ?? 'mcp-client',
        claimFor: stringField(args, 'claim_for'),
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
    case 'narada_task_work_next': {
      const taskWorkNextAgent = requiredStringAlias(args, 'agent', 'agent_id');
      if (booleanField(args, 'claim') === true) {
        return commandToolResult(await taskWorkNextCommand({
          cwd: scopedCwd,
          agent: taskWorkNextAgent,
          format: 'json',
        }), traversal);
      }
      return commandToolResult(await taskPeekNextCommand({
        cwd: scopedCwd,
        agent: taskWorkNextAgent,
        format: 'json',
      }), traversal);
    }
    case 'narada_task_read':
      return commandToolResult(await taskReadCommand({
        cwd: scopedCwd,
        taskNumber: requiredNumber(args, 'task_number'),
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
    case 'inbox_submit_observation':
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
    case 'narada_inbox_submit_typed_envelope':
    case 'inbox_submit_typed_envelope':
      return commandToolResult(await inboxSubmitTypedEnvelopeCommand({
        cwd: scopedCwd,
        sourceRef: requiredString(args, 'source_ref'),
        kind: stringField(args, 'kind') ?? 'observation',
        payload: resolvePayloadArgument(args, traversal.source_site.site_root),
        payloadFile: stringField(args, 'payload_file'),
        sourceKind: stringField(args, 'source_kind') ?? 'agent_report',
        authorityLevel: stringField(args, 'authority_level') ?? 'agent_reported',
        principal: stringField(args, 'principal'),
        targetLocus: stringField(args, 'target_locus') ?? 'local_site',
        allowEmptyPayload: booleanField(args, 'allow_empty_payload'),
        format: 'json',
      }), traversal);
    case 'inbox_stage_submission_workflow':
    case 'narada_inbox_stage_submission_workflow': {
      if (booleanField(args, 'submit') !== true) {
        return jsonToolResult(attachTraversal({
          status: 'dry_run',
          schema: 'narada.inbox.stage_submission_workflow_preview.v0',
          workflow_ref: stringField(args, 'workflow_ref') ?? `inbox_workflow:${createHash('sha256').update(JSON.stringify(args)).digest('hex').slice(0, 16)}`,
          canonical_submit_tool: 'inbox_submit_typed_envelope',
          submit_required_for_mutation: true,
          target_site: traversal.target_site,
          source_ref: requiredString(args, 'source_ref'),
          kind: stringField(args, 'kind') ?? 'observation',
          payload_preview: previewPayloadArgument(args, traversal.source_site.site_root),
          cross_site_capability: traversal.cross_site ? {
            required_capability_kind: CROSS_SITE_INBOX_CAPABILITY_KIND,
            capability_status: traversal.capability_status,
            capability_grant_id: traversal.capability_grant_id,
          } : null,
          mutationAttempted: false,
          mutationExecuted: false,
        }, traversal));
      }
      return commandToolResult(await inboxSubmitTypedEnvelopeCommand({
        cwd: scopedCwd,
        sourceRef: requiredString(args, 'source_ref'),
        kind: stringField(args, 'kind') ?? 'observation',
        payload: resolvePayloadArgument(args, traversal.source_site.site_root),
        payloadFile: stringField(args, 'payload_file'),
        sourceKind: stringField(args, 'source_kind') ?? 'agent_report',
        authorityLevel: stringField(args, 'authority_level') ?? 'agent_reported',
        principal: stringField(args, 'principal'),
        targetLocus: stringField(args, 'target_locus') ?? 'local_site',
        allowEmptyPayload: booleanField(args, 'allow_empty_payload'),
        format: 'json',
      }), traversal);
    }
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

function normalizeDirectiveToolArguments(name: string | undefined, args: Record<string, unknown>): Record<string, unknown> {
  if (name !== 'narada_directive_create' && name !== 'narada_directive_record_operator_authorized_system_emission') return args;
  const normalized = { ...args };
  const target = asRecord(normalized.target);
  const targetKind = stringField(target, 'kind');
  const targetId = stringField(target, 'id');
  if (targetKind && targetKind !== 'site' && !stringField(normalized, 'target_kind')) {
    normalized.target_kind = targetKind;
    if (targetId) normalized.target_id = targetId;
    delete normalized.target;
  }
  if (name === 'narada_directive_record_operator_authorized_system_emission') {
    if (!stringField(normalized, 'system_emitter_id') && stringField(normalized, 'system_emitter')) {
      normalized.system_emitter_id = stringField(normalized, 'system_emitter');
    }
    if (!stringField(normalized, 'text') && stringField(normalized, 'directive_text')) {
      normalized.text = stringField(normalized, 'directive_text');
    }
    if (!stringField(normalized, 'text') && stringField(normalized, 'directive')) {
      normalized.text = stringField(normalized, 'directive');
    }
    if (!stringField(normalized, 'target_kind') && stringField(normalized, 'role')) {
      normalized.target_kind = 'role';
      normalized.target_id = stringField(normalized, 'role');
    }
    if (!stringField(normalized, 'content_kind')) {
      normalized.content_kind = 'instruction';
    }
    if (stringField(normalized, 'content_kind') === 'system_directive') {
      normalized.content_kind = 'instruction';
    }
    if (!stringField(normalized, 'operator_id')) {
      normalized.operator_id = 'operator.interactive';
    }
    if (!stringField(normalized, 'authorization_basis')) {
      normalized.authorization_basis = 'operator_requested_system_directive';
    }
  }
  return normalized;
}

function requireSiteScopedSystemEmitter(siteId: string, emitterId: string): string {
  const expected = `${siteId}.system.directive_emitter`;
  if (emitterId !== expected) {
    throw new Error(`Invalid system_emitter_id: ${emitterId}. Expected Site-scoped system emitter: ${expected}`);
  }
  return emitterId;
}

function defaultAuthorityLocusForSite(site: McpSiteContext): string {
  if (site.authority_locus && site.authority_locus !== 'unspecified') return site.authority_locus;
  return site.site_id.replace(/-/g, '_');
}

function buildAgentContextHydrateCurrent(siteContext: McpSiteContext, sourceContext: McpSiteContext): Record<string, unknown> {
  const startup = startupEvidence(sourceContext);
  const agentId = startup.agent_id;
  return {
    status: agentId ? 'success' : 'error',
    schema: 'narada.agent_context.current_hydration_result.v0',
    agent_id: agentId,
    role: startup.role,
    start_event_id: startup.start_event_id,
    carrier_session_id: startup.carrier_session_id,
    site: siteContext,
    agent_context_db: startup.agent_context_db,
    authority_posture: 'facade_only',
    mutation_attempted: false,
    runtime_hydration_attempted: false,
    source: startup.source,
    ...(agentId ? {} : { error: 'missing_NARADA_AGENT_ID' }),
  };
}

function createMcpDirective(args: {
  siteRoot: string;
  siteId: string;
  sourceKind: DirectiveSourceKind;
  sourceId: string;
  sourceLabel?: string;
  authorityLocus: string;
  authorityBasis: string;
  targetKind: DirectiveTargetKind;
  targetId: string;
  contentKind: DirectiveContentKind;
  text: string;
  priority: number;
  sequence: number;
  notBefore?: string;
  expiresAt?: string;
  admittedBy: string;
  reason: string;
  emissionAuthorizedByKind?: DirectiveSourceKind;
  emissionAuthorizedById?: string;
  emissionAuthorizedByLabel?: string;
  emissionAuthorityBasis?: string;
}): Record<string, unknown> {
  const store = new McpDirectiveStore(args.siteRoot);
  const now = new Date().toISOString();
  const emissionAuthorization = createMcpDirectiveEmissionAuthorization(args, now);
  const authorityBasis = emissionAuthorization
    ? `directive_emission_authorization:${emissionAuthorization.authorization_id}`
    : args.authorityBasis;
  const draft = {
    schema: 'narada.directive.v1' as const,
    created_at: now,
    source: { kind: args.sourceKind, id: args.sourceId, label: args.sourceLabel },
    authority: { locus: args.authorityLocus, basis: authorityBasis },
    target: { kind: args.targetKind, id: args.targetId },
    content: { kind: args.contentKind, text: args.text },
    ordering: {
      priority: args.priority,
      sequence: args.sequence,
      not_before: args.notBefore,
      expires_at: args.expiresAt,
    },
  };
  const directive: McpDirective = {
    ...draft,
    directive_id: `dir_${hashStable(draft).slice(0, 32)}`,
    admission: {
      status: 'admitted',
      decided_at: now,
      decided_by: args.admittedBy,
      reason: args.reason,
    },
  };
  store.upsert(directive, [
    ...(emissionAuthorization ? [directiveEmissionAuthorizedEventRecord(directive, emissionAuthorization, args.admittedBy)] : []),
    directiveEventRecord(directive, 'directive.created', now, args.admittedBy, undefined, emissionAuthorization?.authorization_id),
    directiveEventRecord(directive, 'directive.admitted', now, args.admittedBy, args.reason),
  ], emissionAuthorization);

  return {
    status: 'success',
    schema: 'narada.directive.mcp_create_result.v1',
    siteId: args.siteId,
    directive,
    emissionAuthorization,
    directiveStorePath: store.paths.storePath,
    directiveEventLogPath: store.paths.eventLogPath,
    directiveEmissionAuthorizationStorePath: store.paths.authorizationPath,
    mutationAttempted: true,
    mutationExecuted: true,
    taskCreated: false,
    executableAuthorityGranted: false,
  };
}

function createMcpDirectiveEmissionAuthorization(args: {
  sourceKind: DirectiveSourceKind;
  sourceId: string;
  sourceLabel?: string;
  authorityLocus: string;
  authorityBasis: string;
  targetKind: DirectiveTargetKind;
  targetId: string;
  contentKind: DirectiveContentKind;
  text: string;
  priority: number;
  sequence: number;
  notBefore?: string;
  expiresAt?: string;
  emissionAuthorizedByKind?: DirectiveSourceKind;
  emissionAuthorizedById?: string;
  emissionAuthorizedByLabel?: string;
  emissionAuthorityBasis?: string;
}, now: string): McpDirectiveEmissionAuthorization | null {
  if (args.sourceKind !== 'system' || !args.emissionAuthorizedByKind || !args.emissionAuthorizedById) return null;
  const authorization = {
    schema: 'narada.directive-emission-authorization.v1' as const,
    authorized_at: now,
    authorized_by: {
      kind: args.emissionAuthorizedByKind,
      id: args.emissionAuthorizedById,
      label: args.emissionAuthorizedByLabel,
    },
    authorized_emitter: {
      kind: args.sourceKind,
      id: args.sourceId,
      label: args.sourceLabel,
    },
    authority: {
      locus: args.authorityLocus,
      basis: args.emissionAuthorityBasis ?? args.authorityBasis,
    },
    directive_template: {
      target: { kind: args.targetKind, id: args.targetId },
      content: { kind: args.contentKind, text: args.text },
      ordering: {
        priority: args.priority,
        sequence: args.sequence,
        not_before: args.notBefore,
        expires_at: args.expiresAt,
      },
    },
    status: 'authorized' as const,
  };
  return {
    ...authorization,
    authorization_id: `auth_${hashStable(authorization).slice(0, 32)}`,
  };
}

function listMcpDirectives(args: {
  siteRoot: string;
  targetKind?: DirectiveTargetKind;
  targetId?: string;
  activeOnly: boolean;
}): Record<string, unknown> {
  const store = new McpDirectiveStore(args.siteRoot);
  const target = {
    kind: args.targetKind,
    id: args.targetId,
  };
  const directives = args.activeOnly ? store.active(target) : store.list()
    .filter((directive) => !args.targetKind || directive.target.kind === args.targetKind)
    .filter((directive) => !args.targetId || directive.target.id === args.targetId);

  return {
    status: 'success',
    schema: 'narada.directive.mcp_list_result.v1',
    directives,
    directiveStorePath: store.paths.storePath,
    mutationAttempted: false,
    mutationExecuted: false,
  };
}

function renderMcpDirectiveContext(args: {
  siteRoot: string;
  targetKind?: DirectiveTargetKind;
  targetId?: string;
}): Record<string, unknown> {
  const store = new McpDirectiveStore(args.siteRoot);
  const directives = store.active({ kind: args.targetKind, id: args.targetId });
  const rendered = renderMcpDirectives(directives);

  return {
    status: 'success',
    schema: 'narada.directive.mcp_render_context_result.v1',
    rendered,
    directiveCount: directives.length,
    directiveStorePath: store.paths.storePath,
    mutationAttempted: false,
    mutationExecuted: false,
  };
}

function renderMcpDirectives(directives: McpDirective[]): string {
  return directives
    .map((directive) => `[${directive.content.kind}:${directive.directive_id}]\n${directive.content.text}`)
    .join('\n\n');
}

class McpDirectiveStore {
  readonly storePath: string;
  readonly eventLogPath: string;
  readonly authorizationPath: string;

  constructor(siteRoot: string) {
    const root = resolve(siteRoot, '.narada', 'directives');
    this.storePath = resolve(root, 'directives.json');
    this.eventLogPath = resolve(root, 'events.jsonl');
    this.authorizationPath = resolve(root, 'emission-authorizations.json');
  }

  get paths(): { storePath: string; eventLogPath: string; authorizationPath: string } {
    return { storePath: this.storePath, eventLogPath: this.eventLogPath, authorizationPath: this.authorizationPath };
  }

  list(): McpDirective[] {
    const existing = readJsonObject(this.storePath);
    return Array.isArray(existing?.directives) ? existing.directives as McpDirective[] : [];
  }

  active(target: { kind?: DirectiveTargetKind; id?: string } = {}, nowIso = new Date().toISOString()): McpDirective[] {
    return this.list()
      .filter((directive) => directive.admission.status === 'admitted')
      .filter((directive) => !target.kind || directive.target.kind === target.kind)
      .filter((directive) => !target.id || directive.target.id === target.id)
      .filter((directive) => !directive.ordering.not_before || directive.ordering.not_before <= nowIso)
      .filter((directive) => !directive.ordering.expires_at || directive.ordering.expires_at > nowIso)
      .sort(compareMcpDirectives);
  }

  renderPromptContext(target: { kind?: DirectiveTargetKind; id?: string } = {}): string {
    return renderMcpDirectives(this.active(target));
  }

  upsert(directive: McpDirective, events: Record<string, unknown>[], authorization?: McpDirectiveEmissionAuthorization | null): void {
    const directives = this.list();
    const index = directives.findIndex((entry) => entry.directive_id === directive.directive_id);
    if (index >= 0) directives[index] = directive;
    else directives.push(directive);
    mkdirSync(dirname(this.storePath), { recursive: true });
    writeFileSync(this.storePath, `${JSON.stringify({
      schema: 'narada.directive-store.snapshot.v1',
      directives,
    }, null, 2)}\n`, 'utf8');
    if (authorization) this.upsertAuthorization(authorization);
    mkdirSync(dirname(this.eventLogPath), { recursive: true });
    for (const event of events) {
      writeFileSync(this.eventLogPath, `${JSON.stringify(event)}\n`, { encoding: 'utf8', flag: 'a' });
    }
  }

  private upsertAuthorization(authorization: McpDirectiveEmissionAuthorization): void {
    const existing = readJsonObject(this.authorizationPath);
    const authorizations = Array.isArray(existing?.authorizations) ? existing.authorizations as McpDirectiveEmissionAuthorization[] : [];
    const index = authorizations.findIndex((entry) => entry.authorization_id === authorization.authorization_id);
    if (index >= 0) authorizations[index] = authorization;
    else authorizations.push(authorization);
    mkdirSync(dirname(this.authorizationPath), { recursive: true });
    writeFileSync(this.authorizationPath, `${JSON.stringify({
      schema: 'narada.directive-emission-authorization-store.v1',
      authorizations,
    }, null, 2)}\n`, 'utf8');
  }
}

function compareMcpDirectives(left: McpDirective, right: McpDirective): number {
  return (
    right.ordering.priority - left.ordering.priority ||
    left.ordering.sequence - right.ordering.sequence ||
    left.created_at.localeCompare(right.created_at) ||
    left.directive_id.localeCompare(right.directive_id)
  );
}

function directiveEventRecord(directive: McpDirective, kind: string, occurredAt: string, actor: string, reason?: string, authorizationId?: string): Record<string, unknown> {
  const event = {
    schema: 'narada.directive-event.v1',
    directive_id: directive.directive_id,
    kind,
    occurred_at: occurredAt,
    actor,
    reason,
    authorization_id: authorizationId,
  };
  return {
    ...event,
    event_id: `direvt_${hashStable(event).slice(0, 32)}`,
  };
}

function directiveEmissionAuthorizedEventRecord(directive: McpDirective, authorization: McpDirectiveEmissionAuthorization, actor: string): Record<string, unknown> {
  return directiveEventRecord(
    directive,
    'directive.emission_authorized',
    authorization.authorized_at,
    actor,
    authorization.authority.basis,
    authorization.authorization_id,
  );
}

function hashStable(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

function buildAgentContextDoctrinalGrounding(input: {
  mode: string;
  doctrineIds?: string[];
  question?: string;
  requireInquirySpaceData: boolean;
  siteRoot: string;
  doctrineCorpusRoot?: string;
}): Record<string, unknown> {
  if (input.mode !== 'reground') {
    return {
      status: 'error',
      schema: 'narada.agent_context.doctrinal_grounding.v0',
      error: 'unsupported_doctrinal_grounding_mode',
      supported_modes: ['reground'],
      requested_mode: input.mode,
      mutation_attempted: false,
      runtime_authority_imported: false,
      private_inquiry_space_data_imported: false,
    };
  }

  const topic = normalizeDoctrineTopic(undefined, input.question ?? '');
  const requestedIds = input.doctrineIds ?? [];
  const corpus = readThoughtsDoctrineCorpus({
    siteRoot: input.siteRoot,
    doctrineCorpusRoot: input.doctrineCorpusRoot,
  });
  const fullCatalog = buildDoctrineCatalog(topic, corpus.entries);
  const catalog = filterDoctrineCatalog(fullCatalog, requestedIds);
  const base = {
    schema: 'narada.agent_context.doctrinal_grounding.v0',
    mode: 'reground',
    mutation_attempted: false,
    private_inquiry_space_data_imported: false,
    runtime_authority_imported: false,
    raw_private_data_recorded: false,
    advisory_only: true,
    posture_summary: {
      target_locus_required_before_mutation: true,
      tool_preference: [
        'MCP-specific Narada command',
        'MCP shell only when no specific command exists',
        'native shell fallback',
      ],
      direct_sqlite_reads: 'diagnostic_only',
      doctrine_grounding_is_not_authority_mutation: true,
    },
    doctrine_catalog: catalog,
    doctrine_filter: {
      requested_doctrine_ids: requestedIds,
      missing_doctrine_ids: requestedIds.filter((id) => !fullCatalog.some((entry) => entry.doctrine_id === id || entry.ref === id)),
    },
    doctrine_source: {
      primary_corpus: corpus.root ?? null,
      primary_corpus_kind: 'external_thoughts_concepts',
      primary_corpus_available: corpus.available,
      primary_corpus_ref_authority: false,
      local_supplement_refs_are_authority: false,
      unavailable_reason: corpus.available ? null : corpus.unavailableReason,
      missing_index_refs: corpus.missingIndexRefs,
    },
    ccc_coordinates: {
      canonical_mutation_evidence: 'SQLite is local runtime substrate; Git-visible mutation evidence/snapshots carry portable reconciliation posture.',
      canonical_inbox: 'Inbound pressure enters as typed inert envelopes before admission or promotion.',
      canonical_outbox: 'Outbound effects require composed intent before transport.',
    },
    ias_mapping: {
      intelligence: 'Agent analysis, recommendation, and doctrine grounding are advisory.',
      authority: 'Narada proper command surfaces own task/inbox/lifecycle mutation admission.',
      separation_rule: 'Grounding output may inform a decision but does not itself admit, execute, confirm, or publish.',
    },
    review_protocol: {
      review_stance: 'Find bugs, authority collapses, missing evidence, and overclaims first.',
      task_closure: 'Use governed task report/review/evidence/close/confirm surfaces.',
      private_data_rule: 'Do not import private Inquiry Space data through doctrine grounding output.',
    },
    authority_limits: [
      'agent_context_doctrinal_grounding_is_read_only',
      'doctrine_grounding_output_is_advisory',
      'public_doctrine_catalog_does_not_admit_inquiry_branch',
      'private_inquiry_space_data_must_not_be_copied_into_mcp_output',
      'runtime_or_source_site_authority_is_not_imported',
    ],
  };

  if (input.requireInquirySpaceData) {
    return {
      ...base,
      status: 'blocked',
      reason: 'private_inquiry_space_data_unavailable_to_narada_proper_mcp',
      required_next_step: 'Route an inquiry_branch_candidate or doctrine_lift_candidate through Canonical Inbox / Inquiry Space authority; do not copy private Inquiry Space records through MCP.',
    };
  }

  return {
    ...base,
    status: 'success',
    proof_case: topic === 'site_telemetry_ownership'
      ? {
          question: 'Who owns a hosted Site Telemetry surface and its monitoring/rotation posture?',
          answer_posture: 'The owning Site governs surface policy and monitoring assignment; Cloudflare owns deployment coordinates; publisher and receiving Sites keep their own truth/admission authority.',
          refs: [
            'docs/product/site-telemetry-operations-posture.v0.md',
            'docs/product/site-telemetry-readiness.v0.md',
            'docs/concepts/capability-governed-secret-management.md',
          ],
        }
      : null,
    residuals: [
      'Private Inquiry Space replay remains unavailable until task 1415 intake and later replay machinery are admitted.',
    ],
  };
}

function normalizeDoctrineTopic(topic: string | undefined, question: string): string {
  if (topic && topic.trim().length > 0) return topic.trim();
  const text = question.toLowerCase();
  if (text.includes('telemetry') && (text.includes('owner') || text.includes('ownership') || text.includes('rotation') || text.includes('monitor'))) {
    return 'site_telemetry_ownership';
  }
  return 'general_doctrine_grounding';
}

interface DoctrineRef {
  doctrine_id?: string;
  ref: string;
  title: string;
  reason: string;
  source?: string;
}

function doctrineRefsForTopic(topic: string, thoughtsCorpusRefs: DoctrineRef[]): DoctrineRef[] {
  const common = [
    {
      ref: 'AGENTS.md',
      title: 'Narada root agent instructions',
      reason: 'Target locus, authority posture, and duty-loop constraints.',
    },
    {
      ref: 'docs/concepts/governed-crossing.md',
      title: 'Governed Crossing',
      reason: 'Separates arrival, admission, execution, and truth across authority boundaries.',
    },
    {
      ref: 'docs/concepts/canonical-inbox.md',
      title: 'Canonical Inbox',
      reason: 'Fallback intake surface for bounded inquiry or doctrine candidates.',
    },
    {
      ref: 'docs/concepts/capability-governed-secret-management.md',
      title: 'Capability-Governed Secret Management',
      reason: 'Secrets and credential references are authority-bearing capabilities, not ordinary data.',
    },
  ];
  const refs = [
    ...thoughtsCorpusRefs,
    ...common,
  ];
  if (topic === 'site_telemetry_ownership') {
    return [
      {
        ref: 'docs/product/site-telemetry-operations-posture.v0.md',
        title: 'Site Telemetry Operations Posture v0',
        reason: 'Defines monitoring owner, rotation owner, Cloudflare dashboard authority, rollback posture, and handoff boundaries.',
      },
      {
        ref: 'docs/product/site-telemetry-readiness.v0.md',
        title: 'Site Telemetry Readiness v0',
        reason: 'Defines readiness states and separates deployed, receiving, publishing, and monitoring evidence.',
      },
      {
        ref: 'docs/product/site-telemetry-publication-outcome-shapes.md',
        title: 'Site Telemetry Publication Outcome Shapes',
        reason: 'Places inquiry doctrine feedback and readiness/operations in the telemetry publication chapter.',
      },
      ...refs,
    ];
  }
  return refs;
}

interface DoctrineCatalogEntry {
  doctrine_id: string;
  title: string;
  ref: string;
  reason: string;
  source?: string;
}

function buildDoctrineCatalog(topic: string, thoughtsCorpusRefs: DoctrineRef[]): DoctrineCatalogEntry[] {
  const seen = new Set<string>();
  return doctrineRefsForTopic(topic, thoughtsCorpusRefs).flatMap((ref) => {
    const entry = {
      doctrine_id: ref.doctrine_id ?? doctrineIdForRef(ref.ref),
      title: ref.title,
      ref: ref.ref,
      reason: ref.reason,
      ...(ref.source ? { source: ref.source } : {}),
    };
    const key = `${entry.doctrine_id}\n${entry.ref}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [entry];
  });
}

function filterDoctrineCatalog(catalog: DoctrineCatalogEntry[], doctrineIds: string[]): DoctrineCatalogEntry[] {
  if (doctrineIds.length === 0) return catalog;
  const requested = new Set(doctrineIds);
  return catalog.filter((entry) => requested.has(entry.doctrine_id) || requested.has(entry.ref));
}

interface ThoughtsDoctrineCorpus {
  root?: string;
  available: boolean;
  unavailableReason?: string;
  entries: DoctrineRef[];
  missingIndexRefs: string[];
}

function readThoughtsDoctrineCorpus(args: { siteRoot: string; doctrineCorpusRoot?: string }): ThoughtsDoctrineCorpus {
  const root = resolveThoughtsDoctrineCorpusRoot(args);
  if (!root) {
    return {
      available: false,
      unavailableReason: 'thoughts_content_concepts_root_not_found',
      entries: [],
      missingIndexRefs: [],
    };
  }

  const files = listMarkdownFiles(root)
    .filter((path) => relative(root, path).replace(/\\/g, '/') !== 'index.md')
    .sort((a, b) => a.localeCompare(b));
  const availableRefs = new Set(files.map((path) => conceptRouteForPath(root, path)));
  const missingIndexRefs = readThoughtsConceptIndexRefs(root)
    .filter((route) => !availableRefs.has(route))
    .sort((a, b) => a.localeCompare(b));

  return {
    root,
    available: true,
    entries: files.map((path) => {
      const rel = relative(root, path).replace(/\\/g, '/');
      const markdown = readFileSync(path, 'utf8');
      const description = frontmatterField(markdown, 'description');
      return {
        doctrine_id: doctrineIdForThoughtsRelativePath(rel),
        title: frontmatterField(markdown, 'title') ?? firstMarkdownHeading(markdown) ?? titleFromPath(rel),
        ref: path.replace(/\\/g, '/'),
        reason: description ?? 'External thoughts concept corpus doctrine reference.',
        source: 'thoughts:content/concepts',
      };
    }),
    missingIndexRefs,
  };
}

function resolveThoughtsDoctrineCorpusRoot(args: { siteRoot: string; doctrineCorpusRoot?: string }): string | undefined {
  const candidates = [
    args.doctrineCorpusRoot,
    processEnv.NARADA_DOCTRINE_CORPUS_ROOT,
    resolve(dirname(resolve(args.siteRoot)), 'thoughts', 'content', 'concepts'),
    resolve('D:/code/thoughts/content/concepts'),
  ].filter((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0);

  for (const candidate of candidates) {
    const root = resolve(candidate);
    if (existsSync(root) && statSync(root).isDirectory()) return root;
  }
  return undefined;
}

function listMarkdownFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) return listMarkdownFiles(path);
    return entry.isFile() && entry.name.endsWith('.md') ? [path] : [];
  });
}

function readThoughtsConceptIndexRefs(root: string): string[] {
  const indexPath = resolve(root, 'index.md');
  if (!existsSync(indexPath)) return [];
  const markdown = readFileSync(indexPath, 'utf8');
  const refs = new Set<string>();
  for (const match of markdown.matchAll(/\]\(\/concepts\/([^)#]+)(?:#[^)]+)?\)/g)) {
    refs.add(`/concepts/${match[1].replace(/\/$/, '')}`);
  }
  return [...refs];
}

function conceptRouteForPath(root: string, path: string): string {
  const rel = relative(root, path).replace(/\\/g, '/').replace(/\.md$/, '');
  if (rel.endsWith('/index')) return `/concepts/${rel.slice(0, -'/index'.length)}`;
  if (rel.endsWith('/core')) return `/concepts/${rel.slice(0, -'/core'.length)}`;
  return `/concepts/${rel}`;
}

function doctrineIdForThoughtsRelativePath(rel: string): string {
  const normalized = rel
    .replace(/\\/g, '/')
    .replace(/\.md$/, '')
    .replace(/\/(index|core)$/, '');
  return normalized
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function frontmatterField(markdown: string, key: string): string | undefined {
  const match = markdown.match(new RegExp(`^${key}:\\s*["']?([^"'\\r\\n]+)["']?\\s*$`, 'm'));
  return match?.[1]?.trim();
}

function firstMarkdownHeading(markdown: string): string | undefined {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim();
}

function titleFromPath(rel: string): string {
  const base = rel
    .replace(/\\/g, '/')
    .replace(/\.md$/, '')
    .split('/')
    .filter((part) => part !== 'index' && part !== 'core')
    .at(-1) ?? rel;
  return base
    .split(/[-_]+/g)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function doctrineIdForRef(ref: string): string {
  return ref
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function buildAgentContextStartupSequence(siteContext: McpSiteContext, sourceContext: McpSiteContext): Record<string, unknown> {
  const hydrateCurrent = buildAgentContextHydrateCurrent(siteContext, sourceContext);
  const mcpPolicyReconciliation = buildMcpPolicyReconciliationPosture(siteContext.site_root);
  const agentId = typeof hydrateCurrent.agent_id === 'string' ? hydrateCurrent.agent_id : null;
  if (!agentId) {
    return {
      status: 'error',
      schema: 'narada.agent_context.startup_sequence_result.v0',
      error: 'missing_NARADA_AGENT_ID',
      hydrate_current: hydrateCurrent,
      memory_plan: null,
      checkpoint_summary: null,
      mcp_policy_reconciliation: mcpPolicyReconciliation,
      startupSequenceExecuted: false,
      checkpointSummaryLoaded: false,
      advisoryOnly: true,
      mutationAttempted: false,
      mutationExecuted: false,
      runtimeHydrationExecuted: false,
      sourceStateImported: false,
      packageExecutedSqliteMutation: false,
    };
  }

  const memoryPlan = planAgentContextHydration({
    siteRoot: siteContext.site_root,
    siteId: siteContext.site_id,
    namedAgentId: agentId,
    checkpointRefs: [],
    requestedBy: 'startup-sequence',
    sourceImportRefs: [],
  });
  const selectedCheckpoint = asRecord(memoryPlan.selectedCheckpoint);
  const checkpointId = stringField(selectedCheckpoint, 'checkpointId');
  const checkpointSummary = checkpointId
    ? readAgentContextCheckpoint({ siteRoot: siteContext.site_root, checkpointId })
    : null;
  const directiveContext = buildStartupDirectiveContext(siteContext, hydrateCurrent);

  return {
    status: 'success',
    schema: 'narada.agent_context.startup_sequence_result.v0',
    hydrate_current: hydrateCurrent,
    memory_plan: memoryPlan,
    checkpoint_summary: checkpointSummary,
    directive_context: directiveContext,
    mcp_policy_reconciliation: mcpPolicyReconciliation,
    startupSequenceExecuted: true,
    checkpointSummaryLoaded: asRecord(checkpointSummary).status === 'success',
    advisoryOnly: true,
    mutationAttempted: false,
    mutationExecuted: false,
    runtimeHydrationExecuted: false,
    sourceStateImported: false,
    packageExecutedSqliteMutation: false,
  };
}

function showMcpOutputRef(siteContext: McpSiteContext, args: Record<string, unknown>): Record<string, unknown> {
  const ref = stringField(args, 'ref') ?? stringField(args, 'output_ref');
  if (!ref) throw new Error('mcp_output_show_requires_ref');
  const output = readMcpOutputRef({ siteRoot: siteContext.site_root }, ref);
  const outputText = JSON.stringify(output, null, 2);
  const limit = Math.max(0, Math.min(numberField(args, 'output_limit') ?? 10000, 100000));
  const offset = Math.max(0, Math.floor(numberField(args, 'offset') ?? 0));
  const outputTextPage = outputText.slice(offset, offset + limit);
  const nextOffset = offset + limit < outputText.length ? offset + limit : null;
  return {
    schema: 'narada.mcp_output_show.v1',
    status: 'ok',
    ref,
    output_ref: ref,
    offset,
    output_limit: limit,
    next_offset: nextOffset,
    output_truncated: nextOffset !== null,
    full_output_char_length: outputText.length,
    output_text: outputTextPage,
  };
}

function buildStartupDirectiveContext(siteContext: McpSiteContext, hydrateCurrent: Record<string, unknown>): Record<string, unknown> {
  const store = new McpDirectiveStore(siteContext.site_root);
  const targets = startupDirectiveTargets(siteContext, hydrateCurrent);
  const directivesById = new Map<string, McpDirective>();
  for (const target of targets) {
    for (const directive of store.active(target)) {
      directivesById.set(directive.directive_id, directive);
    }
  }
  const directives = [...directivesById.values()].sort(compareMcpDirectives);
  return {
    schema: 'narada.agent_context.directive_context.v1',
    status: 'success',
    targets,
    rendered: renderMcpDirectives(directives),
    directive_count: directives.length,
    directive_ids: directives.map((directive) => directive.directive_id),
    directive_store_path: store.paths.storePath,
    advisory_only: true,
    mutation_attempted: false,
    mutation_executed: false,
  };
}

function startupDirectiveTargets(siteContext: McpSiteContext, hydrateCurrent: Record<string, unknown>): Array<{ kind: DirectiveTargetKind; id: string }> {
  const targets: Array<{ kind: DirectiveTargetKind; id: string }> = [];
  const add = (kind: DirectiveTargetKind, id: unknown): void => {
    if (typeof id !== 'string' || id.trim().length === 0) return;
    const target = { kind, id };
    if (!targets.some((entry) => entry.kind === target.kind && entry.id === target.id)) targets.push(target);
  };
  add('site', siteContext.site_id);
  add('workspace', siteContext.site_root);
  add('agent', hydrateCurrent.agent_id);
  add('role', hydrateCurrent.role);
  add('carrier', hydrateCurrent.carrier_session_id);
  add('session', hydrateCurrent.carrier_session_id);
  return targets;
}

function buildMcpPolicyReconciliationPosture(siteRoot: string): Record<string, unknown> {
  const result = reconcileLocalMcpRolePolicy({ siteRoot });
  const repairArgv = ['narada-proper-mcp', '--site-root', siteRoot, '--reconcile-mcp-policy', '--apply'];
  return {
    schema: 'narada.mcp_policy_reconciliation_startup_posture.v0',
    status: result.status === 'ok' ? 'aligned' : result.status,
    advisory_only: true,
    mutation_attempted: false,
    mutation_performed: false,
    auto_repair_performed: false,
    authority_posture: 'read_only_drift_detection',
    source_result: result,
    additions: result.additions,
    removals: result.removals,
    validation_errors: result.validation_errors,
    error: result.error ?? null,
    repair_command: buildMcpPolicyRepairCommand(repairArgv),
  };
}

function buildMcpPolicyRepairCommand(argv: string[]): Record<string, unknown> {
  return {
    command: argv.join(' '),
    argv,
    posture: 'explicit_reconciler_apply_required',
  };
}

function startupEvidence(siteContext: McpSiteContext): { agent_id: string | null; role: string | null; start_event_id: string | null; carrier_session_id: string | null; agent_context_db: string | null; source: string } {
  const explicit = asRecord((siteContext as unknown as Record<string, unknown>).startup_evidence);
  const agentId = stringField(explicit, 'agent_id') ?? processEnv.NARADA_AGENT_ID ?? null;
  return {
    agent_id: agentId,
    role: stringField(explicit, 'role') ?? processEnv.NARADA_AGENT_ROLE ?? null,
    start_event_id: stringField(explicit, 'start_event_id') ?? processEnv.NARADA_AGENT_START_EVENT_ID ?? null,
    carrier_session_id: stringField(explicit, 'carrier_session_id') ?? processEnv.NARADA_CARRIER_SESSION_ID ?? null,
    agent_context_db: stringField(explicit, 'agent_context_db') ?? processEnv.NARADA_AGENT_CONTEXT_DB ?? null,
    source: Object.keys(explicit).length > 0 ? 'launcher_arguments' : 'launcher_environment',
  };
}

function resolvePayloadArgument(args: Record<string, unknown>, sourceSiteRoot: string): string | undefined {
  const payloadRef = stringField(args, 'payload_ref');
  if (payloadRef) return JSON.stringify(readMcpPayloadRef({ siteRoot: sourceSiteRoot }, payloadRef));
  if (Object.prototype.hasOwnProperty.call(args, 'payload')) {
    return JSON.stringify(args.payload ?? {});
  }
  return undefined;
}

function previewPayloadArgument(args: Record<string, unknown>, sourceSiteRoot: string): Record<string, unknown> {
  const payloadFile = stringField(args, 'payload_file');
  const payloadRef = stringField(args, 'payload_ref');
  if (payloadFile) {
    return {
      source: 'payload_file',
      payload_file: payloadFile,
      inline_payload_available: false,
    };
  }
  if (payloadRef) {
    const payload = readMcpPayloadRef({ siteRoot: sourceSiteRoot }, payloadRef);
    return {
      source: 'payload_ref',
      payload_ref: payloadRef,
      payload_digest: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
    };
  }
  const payload = Object.prototype.hasOwnProperty.call(args, 'payload') ? args.payload : {};
  return {
    source: 'payload',
    payload_digest: createHash('sha256').update(JSON.stringify(payload ?? {})).digest('hex'),
  };
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
    const resolved = resolveRouteSelection(registry.routes, target.kind, target.ref);
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

  const requiredCapabilityKind = requiredCapabilityKindForTraversal(args.tool, args.mutationAttempted, targetSite, args.sourceSite, route);
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
    if ((grant.denied_actions ?? []).includes(args.action)) return false;
    return (grant.allowed_actions ?? []).includes(args.action) || (grant.allowed_actions ?? []).includes('*');
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

export function resolveMcpSiteContext(options: Pick<McpServerOptions, 'cwd' | 'siteRoot' | 'siteId' | 'siteKind' | 'agentId' | 'agentRole' | 'agentStartEventId' | 'carrierSessionId' | 'agentContextDb'> = {}): McpSiteContext {
  const root = resolve(options.siteRoot ?? options.cwd ?? processCwd());
  const configPath = resolve(root, 'config.json');
  const config = readJsonObject(configPath);
  const configRecord = asRecord(config);
  const staticConfig = asRecord(configRecord.static_config);
  const locus = asRecord(configRecord.locus);
  const staticLocus = asRecord(staticConfig.locus);
  const configuredSiteRoot = stringField(configRecord, 'site_root') ?? stringField(staticConfig, 'site_root');
  const siteRoot = resolve(configuredSiteRoot ?? root);
  const siteId = options.siteId ?? stringField(configRecord, 'site_id') ?? stringField(staticConfig, 'site_id') ?? basename(siteRoot) ?? 'unknown-site';
  const siteKind = options.siteKind ?? stringField(configRecord, 'site_kind') ?? stringField(staticConfig, 'site_kind') ?? 'unspecified';
  const authorityLocus = stringField(locus, 'authority_locus') ?? stringField(staticLocus, 'authority_locus') ?? siteKind;
  const workspaceRoot = stringField(configRecord, 'workspace_root') ?? stringField(staticConfig, 'workspace_root');

  const context: McpSiteContext = {
    site_id: siteId,
    site_kind: siteKind,
    site_root: siteRoot,
    ...(workspaceRoot ? { workspace_root: workspaceRoot } : {}),
    authority_locus: authorityLocus,
    source: config ? 'config' : (options.siteId || options.siteKind || options.siteRoot ? 'options' : 'cwd'),
  };
  if (options.agentId || options.agentRole || options.agentStartEventId || options.carrierSessionId || options.agentContextDb) {
    Object.defineProperty(context, 'startup_evidence', {
      enumerable: false,
      value: {
        agent_id: options.agentId,
        role: options.agentRole,
        start_event_id: options.agentStartEventId,
        carrier_session_id: options.carrierSessionId,
        agent_context_db: options.agentContextDb,
      },
    });
  }
  return context;
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
    admissionPosture: 'inert_until_governed_materialization',
    canonicalTaskMaterialized: false,
    workNextClaimable: false,
    materializationRequired: true,
    materializationGuidance: 'Promote or materialize the admitted candidate through the governed task lifecycle surface before expecting task work-next claimability.',
    mutationAttempted: true,
    mutationExecuted: true,
    sourceStateImported: false,
    packageOwnsSqliteDependency: false,
    packageExecutedSqliteMutation: false,
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

function requiredCapabilityKindForTraversal(
  tool: string,
  mutationAttempted: boolean,
  targetSite: McpSiteContext,
  sourceSite: McpSiteContext,
  route: RouteAddressRecord | null,
): string | null {
  if (!mutationAttempted) return null;
  if (route?.capability_kind) return route.capability_kind;
  if (targetSite.site_root !== sourceSite.site_root && isInboxSubmissionTool(tool)) {
    return CROSS_SITE_INBOX_CAPABILITY_KIND;
  }
  return null;
}

function isInboxSubmissionTool(name: string): boolean {
  return INBOX_SUBMIT_OBSERVATION_TOOLS.has(name)
    || INBOX_SUBMIT_TYPED_TOOLS.has(name)
    || INBOX_STAGE_SUBMISSION_TOOLS.has(name);
}

function isCapabilityAdmittedCrossSiteInboxMutation(name: string, traversal: McpTraversalContext): boolean {
  return isInboxSubmissionTool(name)
    && traversal.required_capability_kind === CROSS_SITE_INBOX_CAPABILITY_KIND
    && traversal.capability_status === 'active';
}

function materializeTaskLifecycleTask(args: {
  siteRoot: string;
  siteId: string;
  taskId: string;
  materializedBy: string;
  claimFor?: string;
}): Record<string, unknown> {
  const paths = planSiteTaskLifecyclePathsForMcp(args.siteRoot);
  if (!existsSync(paths.taskDbPath)) {
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

  const taskRows = sqliteJson(paths.taskDbPath, `SELECT task_id, title, source_site, source_ref, status, received_at, summary FROM task_records WHERE task_id = ${sqlLiteral(args.taskId)};`);
  if (taskRows.length === 0) {
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

  const task = asRecord(taskRows[0]);
  if (task.status === 'materialized') {
    return {
      status: 'already_materialized',
      taskId: args.taskId,
      taskDbPath: paths.taskDbPath,
      mutationAttempted: true,
      mutationExecuted: false,
      sourceStateImported: false,
      packageExecutedSqliteMutation: false,
    };
  }

  const evidenceRefs = sqliteJson(paths.taskDbPath, `SELECT evidence_ref FROM task_evidence_refs WHERE task_id = ${sqlLiteral(args.taskId)} ORDER BY evidence_ref;`)
    .map((row) => asRecord(row).evidence_ref)
    .filter((ref): ref is string => typeof ref === 'string' && ref.trim().length > 0);
  const title = typeof task.title === 'string' && task.title.trim().length > 0 ? task.title : args.taskId;
  const summary = typeof task.summary === 'string' ? task.summary : '';
  const sourceSite = typeof task.source_site === 'string' ? task.source_site : args.siteId;
  const sourceRef = typeof task.source_ref === 'string' ? task.source_ref : args.taskId;
  const receivedAt = typeof task.received_at === 'string' ? task.received_at : null;
  const inputRelPath = `.ai/tmp/mcp-materialize-${createHash('sha256').update(args.taskId).digest('hex').slice(0, 16)}.json`;
  const inputPath = resolve(args.siteRoot, inputRelPath);
  mkdirSync(resolve(args.siteRoot, '.ai', 'tmp'), { recursive: true });
  writeFileSync(inputPath, `${JSON.stringify({
    title,
    goal: title,
    chapter: 'MCP Materialized Admissions',
    context: [
      `Materialized from MCP-admitted task candidate ${args.taskId}.`,
      `Source Site: ${sourceSite}`,
      `Source ref: ${sourceRef}`,
      receivedAt ? `Received at: ${receivedAt}` : null,
      summary ? `Summary:\n${summary}` : null,
      evidenceRefs.length > 0 ? `Evidence refs:\n${evidenceRefs.map((ref) => `- ${ref}`).join('\n')}` : null,
    ].filter(Boolean).join('\n\n'),
    required_work: [
      `1. Preserve MCP admission context from candidate ${args.taskId}.`,
      '2. Execute the work described by the materialized title and summary under the governed Narada task lifecycle.',
      '3. Verify the result with focused evidence appropriate to the changed surface.',
      '4. Report residuals explicitly before closure.',
    ].join('\n'),
    acceptance_criteria: [
      `MCP admission ${args.taskId} is represented as a governed Narada task.`,
      'The materialized task is visible through canonical task lifecycle/work-next surfaces.',
    ],
  }, null, 2)}\n`, 'utf8');

  let createEnvelope;
  try {
    createEnvelope = runNaradaJson(['task', 'create', '--input-json', inputRelPath], args.siteRoot);
  } finally {
    try {
      unlinkSync(inputPath);
    } catch {
      // Best-effort cleanup; the governed task create result is the authority-bearing artifact.
    }
  }

  if (createEnvelope.exitCode !== ExitCode.SUCCESS) {
    return {
      status: 'error',
      error: 'task_create_failed',
      taskId: args.taskId,
      taskDbPath: paths.taskDbPath,
      createResult: createEnvelope.result,
      mutationAttempted: true,
      mutationExecuted: false,
      sourceStateImported: false,
      packageExecutedSqliteMutation: false,
    };
  }

  const createResult = asRecord(createEnvelope.result);
  const materializedTaskNumber = typeof createResult.task_number === 'number' ? createResult.task_number : null;
  let claimEnvelope: CommandEnvelope | null = null;
  if (args.claimFor && materializedTaskNumber !== null) {
    claimEnvelope = runNaradaJson(['task', 'claim', String(materializedTaskNumber), '--agent', args.claimFor], args.siteRoot);
  }

  const recordedAt = new Date().toISOString();
  const eventId = `mcp-task-materialized-${createHash('sha256').update(`${args.taskId}\n${recordedAt}\n${args.materializedBy}`).digest('hex').slice(0, 16)}`;
  sqlite(paths.taskDbPath, `UPDATE task_records SET status = 'materialized' WHERE task_id = ${sqlLiteral(args.taskId)};`);
  sqlite(paths.taskDbPath, [
    'INSERT OR IGNORE INTO task_admission_events (event_id, task_id, event_type, recorded_at, payload_json)',
    `VALUES (${sqlLiteral(eventId)}, ${sqlLiteral(args.taskId)}, 'mcp_task_materialized', ${sqlLiteral(recordedAt)}, ${sqlLiteral(JSON.stringify({
      materializedBy: args.materializedBy,
      materializedTaskId: createResult.task_id ?? null,
      materializedTaskNumber,
      claimFor: args.claimFor ?? null,
    }))});`,
  ].join(' '));

  const readback = sqliteJson(paths.taskDbPath, `SELECT task_id, status, source_site, source_ref FROM task_records WHERE task_id = ${sqlLiteral(args.taskId)};`);
  const evidencePath = writeTaskLifecycleMutationEvidence(args.siteRoot, {
    command: 'site_task_lifecycle.materialize_task',
    taskId: args.taskId,
    siteId: args.siteId,
    sourceRef,
    eventId,
    dbPath: paths.taskDbPath,
    recordedAt,
    materializedBy: args.materializedBy,
    materializedTaskId: createResult.task_id ?? null,
    materializedTaskNumber,
    claimFor: args.claimFor ?? null,
    readback,
  });

  return {
    status: claimEnvelope && claimEnvelope.exitCode !== ExitCode.SUCCESS ? 'materialized_claim_failed' : 'success',
    schema: 'narada.site_task_lifecycle.mcp_materialize_task_result.v0',
    taskId: args.taskId,
    taskDbPath: paths.taskDbPath,
    admissionPosture: 'materialized_through_governed_task_create',
    canonicalTaskMaterialized: true,
    workNextVisible: true,
    workNextClaimable: !args.claimFor,
    materializedTaskId: createResult.task_id ?? null,
    materializedTaskNumber,
    materializedTaskFile: createResult.file_path ?? null,
    claimResult: claimEnvelope?.result ?? null,
    mutationAttempted: true,
    mutationExecuted: true,
    sourceStateImported: false,
    packageExecutedSqliteMutation: false,
    readback,
    mutationEvidencePath: evidencePath,
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

  const store = readAgentContextMemoryStore(args.siteRoot, args.siteId);
  const requestedRefs = new Set(args.checkpointRefs);
  const eligibleCheckpoints = store.checkpoints
    .filter((checkpoint) => {
      const namedAgentId = typeof checkpoint.namedAgentId === 'string' ? checkpoint.namedAgentId : checkpoint.named_agent_id;
      if (namedAgentId !== args.namedAgentId) return false;
      if (requestedRefs.size === 0) return true;
      const checkpointId = checkpointIdOf(checkpoint);
      return checkpointId ? requestedRefs.has(checkpointId) : false;
    })
    .map((checkpoint) => checkpointCandidate(checkpoint))
    .filter((candidate) => candidate.checkpointId !== null)
    .sort((a, b) => String(b.capturedAt ?? '').localeCompare(String(a.capturedAt ?? '')));
  const selectedCheckpoint = eligibleCheckpoints[0] ?? null;

  const descriptor = buildHydrationRequestDescriptor({
    hydrationId: args.hydrationId ?? `hydrate-${createHash('sha256').update(`${args.siteId}\n${args.namedAgentId}\n${args.checkpointRefs.join('\n')}`).digest('hex').slice(0, 16)}`,
    namedAgentId: args.namedAgentId,
    checkpointRefs: args.checkpointRefs.length > 0
      ? args.checkpointRefs
      : selectedCheckpoint?.checkpointId ? [selectedCheckpoint.checkpointId] : [],
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
    checkpointHydrationPlanned: true,
    checkpointSummaryLoaded: false,
    selectedCheckpoint,
    eligibleCheckpoints,
    advisoryOnly: true,
    mutationAttempted: false,
    mutationExecuted: false,
    runtimeHydrationExecuted: false,
    sourceStateImported: false,
    packageExecutedSqliteMutation: false,
  };
}

function checkpointIdOf(checkpoint: Record<string, unknown> & { checkpointId?: string; checkpoint_id?: string }): string | null {
  if (typeof checkpoint.checkpointId === 'string') return checkpoint.checkpointId;
  if (typeof checkpoint.checkpoint_id === 'string') return checkpoint.checkpoint_id;
  return null;
}

function checkpointCandidate(checkpoint: Record<string, unknown> & { checkpointId?: string; checkpoint_id?: string }): Record<string, unknown> & { checkpointId: string | null; capturedAt: unknown } {
  return {
    checkpointId: checkpointIdOf(checkpoint),
    sessionId: typeof checkpoint.sessionId === 'string' ? checkpoint.sessionId : checkpoint.session_id ?? null,
    namedAgentId: typeof checkpoint.namedAgentId === 'string' ? checkpoint.namedAgentId : checkpoint.named_agent_id ?? null,
    capturedAt: typeof checkpoint.capturedAt === 'string' ? checkpoint.capturedAt : checkpoint.captured_at ?? null,
    evidenceRefs: Array.isArray(checkpoint.evidenceRefs) ? checkpoint.evidenceRefs : checkpoint.evidence_refs ?? [],
    summaryAvailable: typeof checkpoint.summary === 'string' && checkpoint.summary.length > 0,
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

function requiredStringAlias(record: Record<string, unknown>, canonicalKey: string, aliasKey: string): string {
  const canonicalValue = stringField(record, canonicalKey);
  const aliasValue = stringField(record, aliasKey);
  const value = canonicalValue ?? aliasValue;
  if (!value) throw new Error(`Missing required tool argument: ${canonicalKey}`);
  return value;
}

function enumField(record: Record<string, unknown>, key: string, values: readonly string[]): string | undefined {
  const value = stringField(record, key);
  if (!value) return undefined;
  if (!values.includes(value)) throw new Error(`Invalid tool argument ${key}: ${value}`);
  return value;
}

function requiredEnum(record: Record<string, unknown>, key: string, values: readonly string[]): string {
  const value = enumField(record, key, values);
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

function requiredNumber(record: Record<string, unknown>, key: string): number {
  const value = numberField(record, key);
  if (value === undefined) throw new Error(`Missing required tool argument: ${key}`);
  return value;
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
