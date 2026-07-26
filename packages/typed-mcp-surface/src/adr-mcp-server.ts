#!/usr/bin/env node
/**
 * ADR MCP Server
 *
 * Exposes adr_list and adr_show for querying the architecture decision registry.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { buildOutputRefToolContent, listOutputTools, outputShow } from '@narada2/site-common-tools/compat/mcp-payload-file.legacy-site';

type AnyRecord = Record<string, any>;

const PROTOCOL_VERSION = '2024-11-05';
let activeOutputToolName: string | null = null;

const TOOL_ALIASES: AnyRecord = {
  adr_mcp_doctor: 'adr_doctor',
  adr_mcp_list: 'adr_list',
  adr_mcp_show: 'adr_show',
};

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  process.stdout.write('Usage: node tools/typed-mcp/adr-mcp-server.js --site-root <path>\n');
  process.exit(0);
}

const siteRoot = resolve(options.siteRoot ?? process.cwd());
const adrsJsonPath = resolve(siteRoot, 'docs', 'architecture', 'adrs.json');
const adrsDirPath = resolve(siteRoot, 'docs', 'architecture', 'adrs');

runStdioServer().catch((error: any) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

async function runStdioServer(): Promise<any> {
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
        .filter((line: any) => line.trim().length > 0)
        .map((line: any) => {
          try {
            return JSON.parse(line);
          } catch {
            return { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error', data: { line: line.slice(0, 200) } } };
          }
        });
    }

    for (const request of requests) {
      const response = handleRequest(request);
      if (response) writeMcpFrame(response);
    }
  }
  const trailing = buffer.trim();
  if (trailing.length > 0) {
    for (const request of parseJsonRpcInput(trailing)) {
      const response = handleRequest(request);
      if (response) writeMcpFrame(response);
    }
  }
}

function writeMcpFrame(response: any): any {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

function handleRequest(request: any): any {
  if (!request?.id && typeof request?.method === 'string' && request.method.startsWith('notifications/')) return null;
  if (request?.error) {
    return { jsonrpc: '2.0', id: request.id ?? null, error: request.error };
  }
  try {
    const result = dispatchMethod(request.method, request.params ?? {});
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

function dispatchMethod(method: any, params: any): any {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: params.protocolVersion ?? PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: {
          name: 'narada-adr-mcp',
          version: '0.1.0',
        },
      };
    case 'tools/list':
      return { tools: tools() };
    case 'tools/call':
      return callTool(params);
    default:
      throw new Error(`unsupported_mcp_method: ${method}`);
  }
}

function callTool(params: any): any {
  const record = asRecord(params);
  const name = stringField(record, 'name');
  const args = asRecord(record.arguments);
  if (!name) throw new Error('tools_call_requires_name');

  const canonicalName = TOOL_ALIASES[name] ?? name;
  activeOutputToolName = canonicalName;

  switch (canonicalName) {
    case 'adr_doctor':
      return jsonToolResult({
        status: 'ok',
        surface_type: 'ADR MCP',
        site_root: siteRoot,
        adrs_json_exists: existsSync(adrsJsonPath),
        adrs_dir_exists: existsSync(adrsDirPath),
        canonical_tools: tools().map((t: any) => t.name),
        deprecated_aliases: TOOL_ALIASES,
        allowed_tools: tools().map((t: any) => t.name),
        conceptual_role: {
          execution_context_relation: 'read-only query surface for architecture decisions',
          intelligence_context_relation: 'materializes ADR registry for agent context',
          authority_state_relation: 'local file system read-only; no admission authority',
        },
      });
    case 'adr_list':
      return jsonToolResult(adrList(args));
    case 'adr_show':
      return jsonToolResult(adrShow(args));
    case 'mcp_output_show':
      return jsonToolResult(outputShow({ siteRoot, args }));
    default:
      throw new Error(`adr_mcp_refused_non_adr_operation: ${name}`);
  }
}

function adrList(args: any): any {
  if (!existsSync(adrsJsonPath)) {
    return { schema: 'narada.adr.list.v0', count: 0, adrs: [] };
  }

  let doc;
  try {
    doc = JSON.parse(readFileSync(adrsJsonPath, 'utf8'));
  } catch {
    return { schema: 'narada.adr.list.v0', count: 0, adrs: [], error: 'failed_to_parse_adrs_json' };
  }

  const adrs = Array.isArray(doc?.adrs) ? doc.adrs : [];

  const statusFilter = stringField(args, 'status');
  const tagFilter = stringField(args, 'tag');
  const componentFilter = stringField(args, 'affected_component');
  const proposedByFilter = stringField(args, 'proposed_by');
  const limit = numberField(args, 'limit') ?? 50;

  let filtered = adrs;

  if (statusFilter) {
    filtered = filtered.filter((a: any) => a.status === statusFilter);
  }
  if (tagFilter) {
    filtered = filtered.filter((a: any) => Array.isArray(a.tags) && a.tags.includes(tagFilter));
  }
  if (componentFilter) {
    filtered = filtered.filter((a: any) => Array.isArray(a.affected_components) && a.affected_components.includes(componentFilter));
  }
  if (proposedByFilter) {
    filtered = filtered.filter((a: any) => a.proposed_by === proposedByFilter);
  }

  const page = filtered.slice(0, limit);

  return {
    schema: 'narada.adr.list.v0',
    count: page.length,
    total: filtered.length,
    limit,
    adrs: page.map((a: any) => ({
      adr_id: a.adr_id,
      status: a.status,
      title: a.title,
      date: a.date,
      proposed_by: a.proposed_by,
    })),
  };
}

function adrShow(args: any): any {
  const adrId = stringField(args, 'adr_id');
  if (!adrId) {
    return { schema: 'narada.adr.show.v0', status: 'error', error: 'adr_id_required' };
  }

  if (!existsSync(adrsJsonPath)) {
    return { schema: 'narada.adr.show.v0', status: 'error', error: 'adrs_json_not_found' };
  }

  let doc;
  try {
    doc = JSON.parse(readFileSync(adrsJsonPath, 'utf8'));
  } catch {
    return { schema: 'narada.adr.show.v0', status: 'error', error: 'failed_to_parse_adrs_json' };
  }

  const adrs = Array.isArray(doc?.adrs) ? doc.adrs : [];
  const meta = adrs.find((a: any) => a.adr_id === adrId);
  if (!meta) {
    return { schema: 'narada.adr.show.v0', status: 'error', error: 'adr_not_found', adr_id: adrId };
  }

  const filePath = join(adrsDirPath, `${adrId}.md`);
  if (!existsSync(filePath)) {
    return {
      schema: 'narada.adr.show.v0',
      status: 'partial',
      adr_id: adrId,
      meta,
      error: 'adr_file_not_found',
      file_path: filePath,
    };
  }

  const content = readFileSync(filePath, 'utf8');

  return {
    schema: 'narada.adr.show.v0',
    status: 'ok',
    adr_id: adrId,
    meta,
    content,
  };
}

function tools(): any {
  return [
    {
      name: 'adr_doctor',
      description: 'Inspect ADR MCP readiness without mutating.',
      inputSchema: objectSchema({}),
    },
    {
      name: 'adr_list',
      description: 'List ADRs with optional filters.',
      inputSchema: objectSchema({
        status: stringSchema('Filter by status: proposed, under_review, admitted, rejected, deferred, deprecated, superseded.'),
        tag: stringSchema('Filter by tag.'),
        affected_component: stringSchema('Filter by affected component.'),
        proposed_by: stringSchema('Filter by proposer agent_id.'),
        limit: numberSchema('Maximum results; defaults to 50.'),
      }),
    },
    ...listOutputTools(),
    {
      name: 'adr_show',
      description: 'Show full ADR content by adr_id.',
      inputSchema: objectSchema({
        adr_id: stringSchema('ADR identifier, e.g. ADR-2026-001.'),
      }, ['adr_id']),
    },
  ];
}

function drainJsonRpcFrames(input: any): any {
  const requests = [];
  let cursor = 0;
  while (cursor < input.length) {
    const headerEnd = input.indexOf('\r\n\r\n', cursor);
    if (headerEnd < 0) break;
    const header = input.slice(cursor, headerEnd);
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) throw new Error('mcp_stdio_frame_missing_content_length');
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (input.length < bodyEnd) break;
    const body = input.slice(bodyStart, bodyEnd);
    try {
      requests.push(JSON.parse(body));
    } catch {
      requests.push({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error', data: { frame_body: body.slice(0, 200) } } });
    }
    cursor = bodyEnd;
    while (input[cursor] === '\r' || input[cursor] === '\n') cursor += 1;
  }
  return { requests, remaining: input.slice(cursor) };
}

function parseJsonRpcInput(input: any): any {
  const trimmed = input.trim();
  if (!trimmed) return [];
  if (/^Content-Length:/im.test(trimmed)) {
    const parsed = drainJsonRpcFrames(input);
    if (parsed.remaining.trim().length > 0) throw new Error('mcp_stdio_trailing_frame_bytes');
    return parsed.requests;
  }
  return trimmed.split(/\r?\n/).filter((line: any) => line.trim().length > 0).map((line: any) => {
    try {
      return JSON.parse(line);
    } catch {
      return { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error', data: { line: line.slice(0, 200) } } };
    }
  });
}

function objectSchema(properties: any, required: any = []): any {
  return { type: 'object', properties, additionalProperties: false, ...(required.length > 0 ? { required } : {}) };
}

function stringSchema(description: any): any {
  return { type: 'string', description };
}

function numberSchema(description: any): any {
  return { type: 'number', description };
}

function jsonToolResult(value: any, isError: any = false, toolName: any = null): any {
  return buildOutputRefToolContent({ siteRoot, toolName: toolName ?? activeOutputToolName, value, isError });
}

function asRecord(value: any): any {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stringField(record: any, key: any): any {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function numberField(record: any, key: any): any {
  const value = record[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return undefined;
}

function parseArgs(argv: any): any {
  const parsed: AnyRecord = { help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--site-root' && next) {
      parsed.siteRoot = next;
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    }
  }
  return parsed;
}
