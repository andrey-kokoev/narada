#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { buildOutputRefToolContent } from '../mcp-payload-file.js';

const PROTOCOL_VERSION: any = '2024-11-05';
const SERVER_NAME: any = 'narada-andrey-capability-lifecycle-mcp';
const SERVER_VERSION: any = '0.0.1';
const REGISTRY_RELATIVE_PATH: any = 'docs/concepts/capability-lifecycle-registry.json';

const args: any = process.argv.slice(2);
let siteRoot: any = process.cwd();
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--site-root' && args[i + 1]) {
    siteRoot = resolve(args[i + 1]);
    i += 1;
  }
}

const TOOLS: any = [
  {
    name: 'capability_lifecycle_doctor',
    description: 'Read-only readiness check for the Capability Lifecycle registry projection. Does not admit, mutate, or grant capabilities.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'capability_lifecycle_list',
    description: 'List known capability lifecycle records from the read-only registry projection.',
    inputSchema: {
      type: 'object',
      properties: {
        state: { type: 'string', description: 'Optional lifecycle state filter.' },
        exposure_class: { type: 'string', description: 'Optional exposure class filter.' },
        mcp_exposed: { type: 'boolean', description: 'Optional MCP exposure filter.' },
      },
    },
  },
  {
    name: 'capability_lifecycle_show',
    description: 'Show one capability lifecycle record by capability_id or exact case-insensitive name. Missing records return not_found.',
    inputSchema: {
      type: 'object',
      properties: {
        capability_id: { type: 'string', description: 'Capability id, e.g. capability_exchange.' },
        name: { type: 'string', description: 'Exact case-insensitive capability name.' },
      },
    },
  },
  {
    name: 'capability_lifecycle_state',
    description: 'Show compact machine-readable lifecycle state for one capability. Does not admit, mutate, or grant capabilities.',
    inputSchema: {
      type: 'object',
      properties: {
        capability_id: { type: 'string', description: 'Capability id, e.g. capability_exchange.' },
        name: { type: 'string', description: 'Exact case-insensitive capability name.' },
      },
    },
  },
  {
    name: 'capability_lifecycle_next_unblocker',
    description: 'Return the smallest next unblocker for one capability lifecycle record. Does not perform the action.',
    inputSchema: {
      type: 'object',
      properties: {
        capability_id: { type: 'string', description: 'Capability id, e.g. capability_exchange.' },
        name: { type: 'string', description: 'Exact case-insensitive capability name.' },
      },
    },
  },
];

function registryPath() : any{
  return join(siteRoot, REGISTRY_RELATIVE_PATH);
}

function loadRegistry() : any{
  const path: any = registryPath();
  if (!existsSync(path)) {
    return {
      schema: 'narada.capability_lifecycle.registry.v0',
      status: 'missing_registry',
      authority_posture: 'advisory_projection_only_no_admission_no_mutation_no_grants',
      source_path: REGISTRY_RELATIVE_PATH,
      records: [],
    };
  }
  const parsed: any = JSON.parse(readFileSync(path, 'utf8'));
  return {
    ...parsed,
    source_path: REGISTRY_RELATIVE_PATH,
    records: Array.isArray(parsed.records) ? parsed.records : [],
  };
}

function publicRecord(record: any) : any{
  return {
    capability_id: record.capability_id,
    name: record.name,
    state: record.state,
    exposure_class: record.exposure_class,
    mcp_exposed: Boolean(record.mcp_exposed),
    admitted_scope: record.admitted_scope ?? null,
    next_unblocker: record.next_unblocker ?? null,
    trial_state: record.trial_state ?? 'not_started',
    in_use: Boolean(record.in_use),
    runtime_freshness_dependency: record.runtime_freshness_dependency ?? 'unspecified',
    artifact_refs: Array.isArray(record.artifact_refs) ? record.artifact_refs : [],
    blockers: Array.isArray(record.blockers) ? record.blockers : [],
    evidence_refs: Array.isArray(record.evidence_refs) ? record.evidence_refs : [],
  };
}

function findRecord(registry: any, args: any = {}) : any{
  const requestedId: any = typeof args.capability_id === 'string' ? args.capability_id.trim().toLowerCase() : '';
  const requestedName: any = typeof args.name === 'string' ? args.name.trim().toLowerCase() : '';
  if (!requestedId && !requestedName) return { kind: 'missing_request' };

  const record: any = registry.records.find((candidate: any) => {
    const id: any = String(candidate.capability_id ?? '').toLowerCase();
    const name: any = String(candidate.name ?? '').toLowerCase();
    return (requestedId && id === requestedId) || (requestedName && name === requestedName);
  });

  return record ? { kind: 'found', record } : { kind: 'not_found', requested: args.capability_id ?? args.name };
}

function doctor() : any{
  const registry: any = loadRegistry();
  return {
    schema: 'narada.capability_lifecycle.doctor.v0',
    status: registry.status === 'missing_registry' ? 'degraded' : 'ok',
    server_name: SERVER_NAME,
    server_version: SERVER_VERSION,
    read_only: true,
    authority_posture: registry.authority_posture,
    no_admission: true,
    no_mutation: true,
    no_capability_grants: true,
    registry_path: registry.source_path,
    record_count: registry.records.length,
    tools: TOOLS.map((tool: any) => tool.name),
  };
}

function list(args: any = {}) : any{
  const registry: any = loadRegistry();
  let records: any = registry.records.map(publicRecord);
  if (args.state) records = records.filter((record: any) => record.state === args.state);
  if (args.exposure_class) records = records.filter((record: any) => record.exposure_class === args.exposure_class);
  if (typeof args.mcp_exposed === 'boolean') records = records.filter((record: any) => record.mcp_exposed === args.mcp_exposed);
  return {
    schema: 'narada.capability_lifecycle.list.v0',
    status: 'ok',
    read_only: true,
    authority_posture: registry.authority_posture,
    count: records.length,
    records,
  };
}

function show(args: any = {}) : any{
  const registry: any = loadRegistry();
  const lookup: any = findRecord(registry, args);
  if (lookup.kind === 'missing_request') {
    return {
      schema: 'narada.capability_lifecycle.show.v0',
      status: 'error',
      message: 'capability_id or name is required',
    };
  }

  if (lookup.kind === 'not_found') {
    return {
      schema: 'narada.capability_lifecycle.show.v0',
      status: 'not_found',
      requested: lookup.requested,
      read_only: true,
      authority_posture: registry.authority_posture,
    };
  }

  return {
    schema: 'narada.capability_lifecycle.show.v0',
    status: 'ok',
    read_only: true,
    authority_posture: registry.authority_posture,
    record: publicRecord(lookup.record),
  };
}

function state(args: any = {}) : any{
  const registry: any = loadRegistry();
  const lookup: any = findRecord(registry, args);
  if (lookup.kind === 'missing_request') {
    return {
      schema: 'narada.capability_lifecycle.state.v0',
      status: 'error',
      message: 'capability_id or name is required',
    };
  }
  if (lookup.kind === 'not_found') {
    return {
      schema: 'narada.capability_lifecycle.state.v0',
      status: 'not_found',
      requested: lookup.requested,
      read_only: true,
      authority_posture: registry.authority_posture,
    };
  }
  const record: any = publicRecord(lookup.record);
  return {
    schema: 'narada.capability_lifecycle.state.v0',
    status: 'ok',
    read_only: true,
    no_capability_grants: true,
    capability_id: record.capability_id,
    state: record.state,
    exposure_class: record.exposure_class,
    mcp_exposed: record.mcp_exposed,
    admitted_scope: record.admitted_scope,
    next_unblocker: record.next_unblocker,
    trial_state: record.trial_state,
    in_use: record.in_use,
    runtime_freshness_dependency: record.runtime_freshness_dependency,
  };
}

function nextUnblocker(args: any = {}) : any{
  const registry: any = loadRegistry();
  const lookup: any = findRecord(registry, args);
  if (lookup.kind === 'missing_request') {
    return {
      schema: 'narada.capability_lifecycle.next_unblocker.v0',
      status: 'error',
      message: 'capability_id or name is required',
    };
  }
  if (lookup.kind === 'not_found') {
    return {
      schema: 'narada.capability_lifecycle.next_unblocker.v0',
      status: 'not_found',
      requested: lookup.requested,
      read_only: true,
      authority_posture: registry.authority_posture,
    };
  }
  const record: any = publicRecord(lookup.record);
  return {
    schema: 'narada.capability_lifecycle.next_unblocker.v0',
    status: 'ok',
    read_only: true,
    no_capability_grants: true,
    capability_id: record.capability_id,
    next_unblocker: record.next_unblocker,
    blockers: record.blockers,
  };
}

function writeMcpFrame(value: any) : any{
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function sendResponse(request: any, result: any) : any{
  writeMcpFrame({
    jsonrpc: '2.0',
    id: request.id,
    result,
  });
}

function sendError(request: any, code: any, message: any) : any{
  writeMcpFrame({
    jsonrpc: '2.0',
    id: request.id,
    error: { code, message },
  });
}

function handleRequest(request: any) : any{
  if (request.method === 'initialize') {
    sendResponse(request, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    });
    return;
  }
  if (request.method === 'tools/list') {
    sendResponse(request, { tools: TOOLS });
    return;
  }
  if (request.method === 'notifications/initialized') return;
  if (request.method !== 'tools/call') {
    sendError(request, -32601, `Method not found: ${request.method}`);
    return;
  }

  const { name, arguments: toolArgs = {} }: any = request.params ?? {};
  let result: any;
  try {
    if (name === 'capability_lifecycle_doctor') result = doctor();
    else if (name === 'capability_lifecycle_list') result = list(toolArgs);
    else if (name === 'capability_lifecycle_show') result = show(toolArgs);
    else if (name === 'capability_lifecycle_state') result = state(toolArgs);
    else if (name === 'capability_lifecycle_next_unblocker') result = nextUnblocker(toolArgs);
    else {
      sendError(request, -32602, `Unknown tool: ${name}`);
      return;
    }
    sendResponse(request, buildOutputRefToolContent({ siteRoot, toolName: name, value: result }));
  } catch (error: any) {
    sendResponse(request, buildOutputRefToolContent({ siteRoot, toolName: name, value: { status: 'error', message: error.message }, isError: true }));
  }
}

let buffer: any = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: any) => {
  buffer += chunk;
  while (true) {
    const newlineIndex: any = buffer.indexOf('\n');
    if (newlineIndex < 0) break;
    const line: any = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);
    if (!line) continue;
    try {
      handleRequest(JSON.parse(line));
    } catch (error: any) {
      writeMcpFrame({ jsonrpc: '2.0', id: null, error: { code: -32700, message: error.message } });
    }
  }
});
