import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { cwd as processCwd, stdin as defaultStdin, stdout as defaultStdout } from 'node:process';
import {
  inboxDoctorCommand,
  inboxListCommand,
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
import { readRoutingRegistry, resolveRoute, type RouteAddressRecord } from './lib/routing-addressing-registry.js';

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
];

export async function handleMcpRequest(
  request: JsonRpcRequest,
  options: McpServerOptions = {},
): Promise<Record<string, unknown> | null> {
  if (!request.id && request.method.startsWith('notifications/')) return null;
  try {
    const siteContext = resolveMcpSiteContext(options);
    const result = await dispatchMcpMethod(request.method, request.params, siteContext);
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

async function dispatchMcpMethod(method: string, params: unknown, siteContext: McpSiteContext): Promise<unknown> {
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
      return callTool(params, siteContext);
    default:
      throw new Error(`Unsupported MCP method: ${method}`);
  }
}

async function callTool(params: unknown, siteContext: McpSiteContext): Promise<McpToolResult> {
  const record = asRecord(params);
  const name = stringField(record, 'name');
  const args = asRecord(record.arguments);
  if (!name) throw new Error('tools/call requires params.name');
  const mutationAttempted = name === 'narada_inbox_submit_observation'
    || (name === 'narada_inbox_work_next' && booleanField(args, 'claim') === true)
    || (name === 'narada_task_work_next' && booleanField(args, 'claim') === true);
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
    default:
      throw new Error(`Unknown Narada MCP tool: ${name}`);
  }
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
