#!/usr/bin/env node
import { materializeSiteIdentity } from './materialize-site-identity.js';
import { resolve } from 'node:path';
import { signSiteDeclaration, verifySiteDeclaration } from './signed-declaration.js';
import { buildOutputRefToolContent } from '../mcp-payload-file.js';

const PROTOCOL_VERSION: any = '2024-11-05';
const SERVER_NAME: any = 'narada-site-identity-mcp';
const SERVER_VERSION: any = '0.1.0';
let activeOutputToolName: any = null;

const options: any = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write('Usage: node tools/site-identity/site-identity-mcp-server.ts --site-root <path>\n');
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
    const lines: any = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    const requests: any = lines.filter((line: any) => line.trim().length > 0).map((line: any) => JSON.parse(line));
    for (const request of requests) {
      const response: any = handleRequest(request, serverOptions);
      if (response) writeMcpFrame(response);
    }
  }
  const trailing: any = buffer.trim();
  if (trailing.length > 0) {
    for (const request of parseJsonRpcInput(trailing)) {
      const response: any = handleRequest(request, serverOptions);
      if (response) writeMcpFrame(response);
    }
  }
}

function writeMcpFrame(response: any) : any{
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

function handleRequest(request: any, serverOptions: any) : any{
  if (!request?.id && typeof request?.method === 'string' && request.method.startsWith('notifications/')) return null;
  try {
    return { jsonrpc: '2.0', id: request.id ?? null, result: dispatchMethod(request.method, request.params ?? {}, serverOptions) };
  } catch (error: any) {
    return {
      jsonrpc: '2.0',
      id: request?.id ?? null,
      error: { code: -32000, message: error instanceof Error ? error.message : String(error) },
    };
  }
}

function dispatchMethod(method: any, params: any, serverOptions: any) : any{
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: params.protocolVersion ?? PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      };
    case 'tools/list':
      return { tools: tools() };
    case 'tools/call':
      return callTool(params, serverOptions);
    default:
      throw new Error(`unsupported_mcp_method: ${method}`);
  }
}

function tools() : any{
  return [
    {
      name: 'site_identity_doctor',
      description: 'Inspect Site identity materialization readiness.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'site_identity_materialize',
      description: 'Create or refresh the target Site public identity document while storing private Ed25519 key material outside the Site.',
      inputSchema: {
        type: 'object',
        properties: {
          site_id: { type: 'string' },
          locus_type: { type: 'string' },
          key_id: { type: 'string' },
          secret_root: { type: 'string' },
          created_at: { type: 'string' },
          force: { type: 'boolean' },
          authority_basis: { type: 'object' },
        },
        required: ['site_id', 'authority_basis'],
        additionalProperties: false,
      },
    },
    {
      name: 'site_identity_sign_declaration',
      description: 'Create a narada.site.signed_declaration.v0 envelope using the local Site Ed25519 private key stored outside the Site root.',
      inputSchema: {
        type: 'object',
        properties: {
          site_id: { type: 'string' },
          key_id: { type: 'string' },
          secret_root: { type: 'string' },
          signed_at: { type: 'string' },
          payload_schema: { type: 'string' },
          payload: { type: 'object' },
          evidence_refs: { type: 'array', items: { type: 'string' } },
          authority_basis: { type: 'object' },
        },
        required: ['payload', 'authority_basis'],
        additionalProperties: false,
      },
    },
    {
      name: 'site_identity_verify_declaration',
      description: 'Verify a narada.site.signed_declaration.v0 envelope against Site identity and local identity_trust records.',
      inputSchema: {
        type: 'object',
        properties: {
          declaration: { type: 'object' },
          identity_document: { type: 'object' },
          identity_path: { type: 'string' },
          identity_trust: { type: 'array', items: { type: 'object' } },
        },
        required: ['declaration'],
        additionalProperties: false,
      },
    },
  ];
}

function callTool(params: any, serverOptions: any) : any{
  const record: any = asRecord(params);
  const name: any = stringField(record, 'name');
  const args: any = asRecord(record.arguments);
  if (!name) throw new Error('tools_call_requires_name');
  activeOutputToolName = name;
  switch (name) {
    case 'site_identity_doctor':
      return jsonToolResult(doctor(serverOptions));
    case 'site_identity_materialize':
      return jsonToolResult(materialize(serverOptions, args));
    case 'site_identity_sign_declaration':
      return jsonToolResult(signDeclaration(serverOptions, args));
    case 'site_identity_verify_declaration':
      return jsonToolResult(verifyDeclaration(serverOptions, args));
    default:
      throw new Error(`site_identity_refused_unknown_tool: ${name}`);
  }
}

function doctor(serverOptions: any) : any{
  return {
    schema: 'narada.site_identity.doctor.v0',
    status: 'ok',
    surface: 'site-identity-mcp.local',
    site_root: serverOptions.siteRoot ?? process.cwd(),
    default_secret_root: process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Narada\\site-identities` : null,
    private_key_policy: 'Private Ed25519 JWK material is written outside the Site root and must not be committed, copied into .narada, or embedded in inbox/probe/task artifacts.',
  };
}

function materialize(serverOptions: any, args: any) : any{
  const authority: any = asRecord(args.authority_basis);
  if (stringField(authority, 'kind') !== 'operator_direct_instruction' && stringField(authority, 'kind') !== 'task_execution') {
    throw new Error('site_identity_materialize_requires_operator_or_task_authority');
  }
  if (!stringField(authority, 'summary')) throw new Error('site_identity_materialize_requires_authority_summary');
  return materializeSiteIdentity({
    siteRoot: serverOptions.siteRoot ?? process.cwd(),
    siteId: stringField(args, 'site_id'),
    locusType: stringField(args, 'locus_type') ?? 'user',
    keyId: stringField(args, 'key_id') ?? undefined,
    secretRoot: stringField(args, 'secret_root') ?? undefined,
    createdAt: stringField(args, 'created_at') ?? undefined,
    force: args.force === true,
  });
}

function signDeclaration(serverOptions: any, args: any) : any{
  const authority: any = asRecord(args.authority_basis);
  if (stringField(authority, 'kind') !== 'operator_direct_instruction' && stringField(authority, 'kind') !== 'task_execution') {
    throw new Error('site_identity_sign_requires_operator_or_task_authority');
  }
  if (!stringField(authority, 'summary')) throw new Error('site_identity_sign_requires_authority_summary');
  return signSiteDeclaration({
    siteRoot: serverOptions.siteRoot ?? process.cwd(),
    siteId: stringField(args, 'site_id') ?? undefined,
    keyId: stringField(args, 'key_id') ?? undefined,
    secretRoot: stringField(args, 'secret_root') ?? undefined,
    signedAt: stringField(args, 'signed_at') ?? undefined,
    payloadSchema: stringField(args, 'payload_schema') ?? undefined,
    payload: asRecord(args.payload),
    evidenceRefs: Array.isArray(args.evidence_refs) ? args.evidence_refs : [],
  });
}

function verifyDeclaration(serverOptions: any, args: any) : any{
  return verifySiteDeclaration({
    siteRoot: serverOptions.siteRoot ?? process.cwd(),
    declaration: asRecord(args.declaration),
    identityDocument: Object.keys(asRecord(args.identity_document)).length > 0 ? asRecord(args.identity_document) : undefined,
    identityPath: stringField(args, 'identity_path') ?? undefined,
    identityTrust: Array.isArray(args.identity_trust) ? args.identity_trust : undefined,
  });
}

function parseArgs(argv: any) : any{
  const options: any = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg: any = argv[i];
    if (arg === '--site-root') { options.siteRoot = argv[++i]; continue; }
    if (arg === '--help') { options.help = true; continue; }
    throw new Error(`unknown_arg: ${arg}`);
  }
  return options;
}

function parseJsonRpcInput(input: any) : any{
  try {
    const parsed: any = JSON.parse(input);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return input.split(/\r?\n/).filter(Boolean).map((line: any) => JSON.parse(line));
  }
}

function jsonToolResult(payload: any) : any{
  return buildOutputRefToolContent({ siteRoot: resolve(options.siteRoot ?? process.cwd()), toolName: activeOutputToolName, value: payload });
}

function asRecord(value: any) : any{
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stringField(record: any, field: any) : any{
  const value: any = record?.[field];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}
