#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { admitEnvelope } from '../inbox/admission-log.mjs';
import { assertKnownInboxEnvelopeKind } from '../inbox/envelope-kinds.mjs';
import {
  attachPayloadSource,
  buildOutputRefToolContent,
  enforceInlinePayloadLimit,
  listOutputTools,
  listPayloadTools,
  outputShow,
  payloadCreate,
  payloadDerive,
  payloadShow,
  payloadValidate,
  resolveToolPayloadArgs,
} from '../mcp-payload-file.mjs';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'narada-site-mail-mcp';
const SERVER_VERSION = '0.1.0';
const MAIL_SCHEMA = 'narada.site_mail.message.v0';
const OUTBOX_DIR = '.ai/state/site-mail/outbox';
const RECEIPT_DIR = '.ai/state/site-mail/receipts';
const INCOMING_DIR = '.ai/state/site-mail/incoming';
const STATUS_STAGED = 'staged';
const STATUS_DELIVERY_ATTEMPTED = 'delivery_attempted';
const STATUS_DEPOSITED = 'deposited';
const STATUS_ADMITTED = 'admitted';
const STATUS_DELIVERY_FAILED = 'delivery_failed';
let activeOutputToolName = null;

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write('Usage: node tools/site-mail/site-mail-mcp-server.mjs --site-root <path>\n');
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
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const request of lines.filter((line) => line.trim().length > 0).map((line) => JSON.parse(line))) {
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
      error: { code: -32000, message: error instanceof Error ? error.message : String(error) },
    };
  }
}

function dispatchMethod(method, params, serverOptions) {
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

function tools() {
  return [
    {
      name: 'site_mail_doctor',
      description: 'Inspect local inter-Site mail transport readiness.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'site_mail_stage',
      description: 'Create a durable source-side outbox item for later deliver-only postal transport.',
      inputSchema: {
        type: 'object',
        properties: {
          target_site_id: { type: 'string' },
          target_site_root: { type: 'string' },
          authority_basis: { type: 'object' },
          source_ref: { type: 'string' },
          source_kind: { type: 'string' },
          kind: { type: 'string' },
          authority_level: { type: 'string' },
          principal: { type: 'string' },
          payload: { type: 'object' },
          payload_ref: { type: 'string' },
          payload_file: { type: 'string' },
          mail_id: { type: 'string' },
        },
        required: ['source_ref', 'kind', 'principal'],
        additionalProperties: false,
      },
    },
    {
      name: 'site_mail_deliver',
      description: 'Deliver a staged outbox item as an inert target postal deposit without target inbox admission.',
      inputSchema: {
        type: 'object',
        properties: {
          mail_id: { type: 'string' },
          force: { type: 'boolean' },
        },
        required: ['mail_id'],
        additionalProperties: false,
      },
    },
    {
      name: 'site_mail_receive',
      description: 'Target-rooted receive/import command that admits deposited mail into this Site canonical inbox.',
      inputSchema: {
        type: 'object',
        properties: {
          mail_id: { type: 'string' },
          limit: { type: 'integer' },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'site_mail_retry',
      description: 'Retry delivery for a failed staged outbox item.',
      inputSchema: {
        type: 'object',
        properties: { mail_id: { type: 'string' } },
        required: ['mail_id'],
        additionalProperties: false,
      },
    },
    {
      name: 'site_mail_status',
      description: 'Read one source-side mail record and any receipt.',
      inputSchema: {
        type: 'object',
        properties: { mail_id: { type: 'string' } },
        required: ['mail_id'],
        additionalProperties: false,
      },
    },
    {
      name: 'site_mail_list',
      description: 'List source-side inter-Site mail records.',
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          target_site_id: { type: 'string' },
          limit: { type: 'integer' },
        },
        additionalProperties: false,
      },
    },
    ...listPayloadTools(),
    ...listOutputTools(),
  ];
}

function callTool(params, serverOptions) {
  const record = asRecord(params);
  const name = stringField(record, 'name');
  const args = asRecord(record.arguments);
  if (!name) throw new Error('tools_call_requires_name');
  activeOutputToolName = name;
  enforceInlinePayloadLimit({ toolName: name, args, allowPayloadCreation: true });

  const siteRoot = resolve(serverOptions.siteRoot ?? process.cwd());
  switch (name) {
    case 'site_mail_doctor':
      return jsonToolResult(siteMailDoctor(siteRoot));
    case 'site_mail_stage': {
      const resolved = resolveStagePayload(siteRoot, args);
      return jsonToolResult(attachPayloadSource(siteMailStage(siteRoot, resolved.args), resolved.payloadSource));
    }
    case 'site_mail_deliver':
      return jsonToolResult(siteMailDeliver(siteRoot, args));
    case 'site_mail_receive':
      return jsonToolResult(siteMailReceive(siteRoot, args));
    case 'site_mail_retry':
      return jsonToolResult(siteMailDeliver(siteRoot, { ...args, force: true, retry_only: true }));
    case 'site_mail_status':
      return jsonToolResult(siteMailStatus(siteRoot, requiredString(args, 'mail_id')));
    case 'site_mail_list':
      return jsonToolResult(siteMailList(siteRoot, args));
    case 'mcp_payload_create':
      return jsonToolResult(payloadCreate({ siteRoot, args }));
    case 'mcp_payload_show':
      return jsonToolResult(payloadShow({ siteRoot, args }));
    case 'mcp_payload_derive':
      return jsonToolResult(payloadDerive({ siteRoot, args }));
    case 'mcp_payload_validate':
      return jsonToolResult(payloadValidate({ siteRoot, args }));
    case 'mcp_output_show':
      return jsonToolResult(outputShow({ siteRoot, args }));
    default:
      throw new Error(`site_mail_refused_unknown_tool: ${name}`);
  }
}

function resolveStagePayload(siteRoot, args) {
  const input = asRecord(args);
  if (input.payload_ref) {
    return resolveToolPayloadArgs({
      siteRoot,
      toolName: 'site_mail_stage',
      args: input,
      allowedTools: ['site_mail_stage'],
      payloadRefMode: 'payload_field',
    });
  }
  if (input.payload_file) {
    const path = resolve(siteRoot, String(input.payload_file));
    if (!existsSync(path)) throw new Error(`payload_file_not_found: ${input.payload_file}`);
    return {
      args: { ...input, payload: parseJson(readFileSync(path, 'utf8'), `payload_file_invalid_json: ${input.payload_file}`) },
      payloadSource: { kind: 'file', path: input.payload_file, transient_not_authority: true },
    };
  }
  return { args: input, payloadSource: null };
}

function siteMailDoctor(siteRoot) {
  const awareness = siteAwareness(siteRoot);
  return {
    schema: 'narada.site_mail.doctor.v0',
    status: 'ok',
    surface: 'site-mail-mcp.local',
    transport: 'local_filesystem',
    authority: 'deliver_only',
    mutates_foreign_mcp: false,
    source_site_id: resolveSourceSiteId(siteRoot),
    registered_site_count: Object.keys(awareness.known_sites ?? {}).length,
    outbox_path: OUTBOX_DIR,
    incoming_path: INCOMING_DIR,
    receipt_path: RECEIPT_DIR,
    rule: 'Mail creates source-side outbox evidence and deposits inert postal artifacts; target-rooted receive/import owns inbox admission.',
  };
}

function siteMailStage(siteRoot, args) {
  const principal = requiredString(args, 'principal');
  const identity = verifyPrincipal(principal, 'site_mail_stage');
  const sourceSiteId = resolveSourceSiteId(siteRoot);
  const target = resolveTargetSite(siteRoot, args);
  const kind = assertKnownInboxEnvelopeKind(requiredString(args, 'kind'));
  const payload = asRecord(args.payload);
  if (Object.keys(payload).length === 0) throw new Error('site_mail_stage_requires_payload_or_payload_ref');
  const mailId = validateMailId(stringField(args, 'mail_id') ?? `mail_${randomUUID().replace(/-/g, '')}`);
  const createdAt = new Date().toISOString();
  const record = {
    schema: MAIL_SCHEMA,
    mail_id: mailId,
    status: STATUS_STAGED,
    transport: 'local_filesystem',
    authority: 'deliver_only',
    created_at: createdAt,
    updated_at: createdAt,
    source: {
      site_id: sourceSiteId,
      principal,
      source_kind: stringField(args, 'source_kind') ?? 'agent_report',
      source_ref: requiredString(args, 'source_ref'),
      verification_state: identity.verification_state,
      verification_source: identity.verification_source,
    },
    target: {
      site_id: target.site_id,
      site_root: target.site_root,
      resolution_basis: target.resolution_basis,
    },
    envelope: {
      kind,
      authority_level: stringField(args, 'authority_level') ?? 'agent_reported',
      payload_hash: sha256(stableJson(payload)),
      payload,
    },
    delivery: {
      status: STATUS_STAGED,
      attempts: [],
      target_envelope_id: null,
      receipt_ref: null,
    },
  };
  writeMailRecord(siteRoot, record);
  return {
    schema: 'narada.site_mail.stage.v0',
    status: STATUS_STAGED,
    mail_id: mailId,
    outbox_path: relativeMailRecordPath(record),
    source_site_id: sourceSiteId,
    target_site_id: target.site_id,
    target_site_root: target.site_root,
    payload_hash: record.envelope.payload_hash,
    identity_verification: identity,
  };
}

function siteMailDeliver(siteRoot, args) {
  const mailId = requiredString(args, 'mail_id');
  const force = booleanField(args, 'force') === true;
  const retryOnly = booleanField(args, 'retry_only') === true;
  const record = readMailRecord(siteRoot, mailId);
  if (retryOnly && record.status !== STATUS_DELIVERY_FAILED) {
    throw new Error(`site_mail_retry_requires_failed_status: ${record.status}`);
  }
  if (record.status === STATUS_DEPOSITED && !force) {
    return siteMailStatus(siteRoot, mailId);
  }
  const attemptedAt = new Date().toISOString();
  const attemptedRecord = {
    ...record,
    status: STATUS_DELIVERY_ATTEMPTED,
    updated_at: attemptedAt,
    delivery: {
      ...record.delivery,
      status: STATUS_DELIVERY_ATTEMPTED,
      attempts: [...(record.delivery?.attempts ?? []), { attempted_at: attemptedAt, status: STATUS_DELIVERY_ATTEMPTED }],
    },
  };
  writeMailRecord(siteRoot, attemptedRecord);

  try {
    const targetRoot = resolve(record.target.site_root);
    if (!existsSync(targetRoot)) throw new Error(`target_site_root_not_found: ${targetRoot}`);
    const depositedAt = new Date().toISOString();
    const deposit = {
      schema: 'narada.site_mail.deposit.v0',
      mail_id: record.mail_id,
      status: STATUS_DEPOSITED,
      deposited_at: depositedAt,
      source_site_id: record.source.site_id,
      target_site_id: record.target.site_id,
      payload_hash: record.envelope.payload_hash,
      envelope: buildDepositedEnvelope(record, depositedAt),
    };
    const depositRef = writeIncomingDeposit(targetRoot, deposit);
    const receiptRef = writeReceipt(siteRoot, {
      schema: 'narada.site_mail.receipt.v0',
      mail_id: record.mail_id,
      status: STATUS_DEPOSITED,
      deposited_at: depositedAt,
      target_site_id: record.target.site_id,
      target_site_root: targetRoot,
      target_deposit_path: depositRef,
      target_envelope_id: null,
      target_admission_event_id: null,
      payload_hash: record.envelope.payload_hash,
    });
    const depositedRecord = {
      ...record,
      status: STATUS_DEPOSITED,
      updated_at: depositedAt,
      delivery: {
        status: STATUS_DEPOSITED,
        attempts: [
          ...(record.delivery?.attempts ?? []),
          { attempted_at: attemptedAt, status: STATUS_DEPOSITED, target_deposit_path: depositRef },
        ],
        target_deposit_path: depositRef,
        target_envelope_id: null,
        receipt_ref: receiptRef,
      },
    };
    writeMailRecord(siteRoot, depositedRecord);
    return {
      schema: 'narada.site_mail.delivery.v0',
      status: STATUS_DEPOSITED,
      mail_id: record.mail_id,
      target_site_id: record.target.site_id,
      target_deposit_path: depositRef,
      receipt_ref: receiptRef,
      target_envelope_id: null,
      target_admission_event_id: null,
    };
  } catch (error) {
    const failedAt = new Date().toISOString();
    const failedRecord = {
      ...record,
      status: STATUS_DELIVERY_FAILED,
      updated_at: failedAt,
      delivery: {
        ...record.delivery,
        status: STATUS_DELIVERY_FAILED,
        attempts: [
          ...(record.delivery?.attempts ?? []),
          {
            attempted_at: attemptedAt,
            status: STATUS_DELIVERY_FAILED,
            error: error instanceof Error ? error.message : String(error),
          },
        ],
      },
    };
    writeMailRecord(siteRoot, failedRecord);
    return {
      schema: 'narada.site_mail.delivery.v0',
      status: STATUS_DELIVERY_FAILED,
      mail_id: record.mail_id,
      retryable: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function siteMailReceive(siteRoot, args) {
  const mailId = stringField(args, 'mail_id');
  const limit = Math.max(1, Math.min(numberField(args, 'limit') ?? 50, 200));
  const deposits = listIncomingDeposits(siteRoot, mailId).slice(0, limit);
  const results = deposits.map((deposit) => receiveOneDeposit(siteRoot, deposit.record));
  return {
    schema: 'narada.site_mail.receive.v0',
    status: results.some((result) => result.status === STATUS_ADMITTED) ? STATUS_ADMITTED : 'no_deposits',
    count: results.length,
    results,
  };
}

function receiveOneDeposit(siteRoot, deposit) {
  if (deposit.status === STATUS_ADMITTED) {
    return {
      mail_id: deposit.mail_id,
      status: STATUS_ADMITTED,
      target_envelope_id: deposit.target_envelope_id ?? null,
      target_admission_event_id: deposit.target_admission_event_id ?? null,
    };
  }
  try {
    const admittedAt = new Date().toISOString();
    const admitted = admitEnvelope(siteRoot, deposit.envelope);
    const admittedRecord = {
      ...deposit,
      status: STATUS_ADMITTED,
      admitted_at: admittedAt,
      target_envelope_id: admitted.event.envelope_id,
      target_envelope_path: admitted.envelopePath,
      target_admission_event_id: admitted.event.event_id,
    };
    writeIncomingDepositRecord(siteRoot, admittedRecord);
    writeReceipt(siteRoot, {
      schema: 'narada.site_mail.receipt.v0',
      mail_id: admittedRecord.mail_id,
      status: STATUS_ADMITTED,
      admitted_at: admittedAt,
      target_site_id: admittedRecord.target_site_id,
      target_envelope_id: admitted.event.envelope_id,
      target_envelope_path: admitted.envelopePath,
      target_admission_event_id: admitted.event.event_id,
      payload_hash: admittedRecord.payload_hash,
    });
    return {
      mail_id: admittedRecord.mail_id,
      status: STATUS_ADMITTED,
      target_envelope_id: admitted.event.envelope_id,
      target_admission_event_id: admitted.event.event_id,
      target_envelope_path: admitted.envelopePath,
    };
  } catch (error) {
    const failedRecord = {
      ...deposit,
      status: STATUS_DELIVERY_FAILED,
      receive_error: error instanceof Error ? error.message : String(error),
    };
    writeIncomingDepositRecord(siteRoot, failedRecord);
    return {
      mail_id: deposit.mail_id,
      status: STATUS_DELIVERY_FAILED,
      error: failedRecord.receive_error,
    };
  }
}

function siteMailStatus(siteRoot, mailId) {
  const record = readMailRecord(siteRoot, mailId);
  const receipt = record.delivery?.receipt_ref ? readReceipt(siteRoot, record.delivery.receipt_ref) : null;
  return {
    schema: 'narada.site_mail.status.v0',
    status: record.status,
    mail_id: record.mail_id,
    source_site_id: record.source.site_id,
    target_site_id: record.target.site_id,
    delivery: record.delivery,
    receipt,
  };
}

function siteMailList(siteRoot, args) {
  const outbox = outboxPath(siteRoot);
  const status = stringField(args, 'status');
  const targetSiteId = stringField(args, 'target_site_id');
  const limit = Math.max(1, Math.min(numberField(args, 'limit') ?? 50, 200));
  const records = existsSync(outbox)
    ? readdirSync(outbox)
      .filter((file) => file.endsWith('.json'))
      .map((file) => parseJson(readFileSync(join(outbox, file), 'utf8'), `mail_record_invalid_json: ${file}`))
      .filter((record) => record?.schema === MAIL_SCHEMA)
    : [];
  const filtered = records
    .filter((record) => !status || record.status === status)
    .filter((record) => !targetSiteId || record.target?.site_id === targetSiteId)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, limit)
    .map((record) => ({
      mail_id: record.mail_id,
      status: record.status,
      created_at: record.created_at,
      updated_at: record.updated_at,
      target_site_id: record.target?.site_id,
      kind: record.envelope?.kind,
      target_envelope_id: record.delivery?.target_envelope_id ?? null,
    }));
  return { schema: 'narada.site_mail.list.v0', status: 'ok', count: filtered.length, mail: filtered };
}

function buildDepositedEnvelope(record, depositedAt) {
  return {
    schema: 'narada.inbox.envelope.v0',
    kind: record.envelope.kind,
    status: 'received',
    received_at: depositedAt,
    target_locus: 'local_site',
    source: {
      kind: record.source.source_kind,
      ref: record.source.source_ref,
      principal: record.source.principal,
      site_id: record.source.site_id,
      mail_id: record.mail_id,
    },
    authority: {
      level: record.envelope.authority_level,
      principal: record.source.principal,
      verification_state: record.source.verification_state,
      source_site_id: record.source.site_id,
    },
    payload: record.envelope.payload,
    postal: {
      schema: 'narada.site_mail.delivery.v0',
      mail_id: record.mail_id,
      transport: record.transport,
      authority: record.authority,
      source_site_id: record.source.site_id,
      target_site_id: record.target.site_id,
      deposited_at: depositedAt,
      admission_boundary: 'target_rooted_site_mail_receive',
    },
  };
}

function resolveTargetSite(siteRoot, args) {
  const explicitRoot = stringField(args, 'target_site_root');
  const requestedSiteId = stringField(args, 'target_site_id');
  const awareness = siteAwareness(siteRoot);
  const knownSites = awareness.known_sites ?? {};
  if (requestedSiteId && knownSites[requestedSiteId]) {
    const root = rootFromSiteEntry(knownSites[requestedSiteId]);
    if (!root) throw new Error(`known_site_missing_root: ${requestedSiteId}`);
    if (explicitRoot && resolve(explicitRoot) !== resolve(root)) {
      throw new Error(`target_site_root_conflicts_with_known_site: ${requestedSiteId}`);
    }
    return { site_id: requestedSiteId, site_root: resolve(root), resolution_basis: 'registered_known_site' };
  }
  if (explicitRoot) {
    const matched = Object.entries(knownSites).find(([, entry]) => {
      const root = rootFromSiteEntry(entry);
      return root && resolve(root) === resolve(explicitRoot);
    });
    if (matched) return { site_id: matched[0], site_root: resolve(explicitRoot), resolution_basis: 'registered_known_site_root' };
    const authorityBasis = asRecord(args.authority_basis);
    if (authorityBasis.kind !== 'operator_direct_instruction' || !nonEmptyString(authorityBasis.summary)) {
      throw new Error('unregistered_target_site_requires_operator_authority_basis');
    }
    return { site_id: requestedSiteId ?? 'unregistered-target', site_root: resolve(explicitRoot), resolution_basis: 'operator_authorized_unregistered_root' };
  }
  throw new Error('target_site_id_or_target_site_root_required');
}

function siteAwareness(siteRoot) {
  const config = readJsonIfExists(join(siteRoot, 'config.json')) ?? {};
  return config.structural_config?.site_awareness ?? config.governance?.site_awareness ?? { known_sites: {} };
}

function rootFromSiteEntry(entry) {
  return entry?.roots?.site_root_windows ?? entry?.roots?.site_root ?? entry?.site_root ?? entry?.root ?? null;
}

function resolveSourceSiteId(siteRoot) {
  const config = readJsonIfExists(join(siteRoot, 'config.json')) ?? {};
  return config.static_config?.site_id ?? config.site_id ?? config.structural_config?.site_id ?? basename(siteRoot);
}

function verifyPrincipal(principal, action) {
  const bound = process.env.NARADA_AGENT_ID;
  if (bound && bound !== principal) {
    throw new Error(`principal_mismatch: declared=${principal} verified=${bound}`);
  }
  return {
    schema: 'narada.site_mail.identity_verification.v0',
    action,
    declared_principal: principal,
    verified_principal: bound ?? principal,
    verification_state: bound ? 'verified' : 'legacy_unbound',
    verification_source: bound ? 'NARADA_AGENT_ID' : 'none',
  };
}

function outboxPath(siteRoot) {
  return join(siteRoot, OUTBOX_DIR);
}

function receiptPath(siteRoot) {
  return join(siteRoot, RECEIPT_DIR);
}

function incomingPath(siteRoot) {
  return join(siteRoot, INCOMING_DIR);
}

function incomingDepositPath(siteRoot, mailId) {
  return join(incomingPath(siteRoot), `${validateMailId(mailId)}.json`);
}

function mailRecordPath(siteRoot, mailId) {
  return join(outboxPath(siteRoot), `${validateMailId(mailId)}.json`);
}

function relativeMailRecordPath(record) {
  return `${OUTBOX_DIR}/${record.mail_id}.json`;
}

function writeMailRecord(siteRoot, record) {
  mkdirSync(outboxPath(siteRoot), { recursive: true });
  writeFileSync(mailRecordPath(siteRoot, record.mail_id), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

function readMailRecord(siteRoot, mailId) {
  const path = mailRecordPath(siteRoot, mailId);
  if (!existsSync(path)) throw new Error(`site_mail_record_not_found: ${mailId}`);
  return parseJson(readFileSync(path, 'utf8'), `site_mail_record_invalid_json: ${mailId}`);
}

function writeIncomingDeposit(siteRoot, deposit) {
  mkdirSync(incomingPath(siteRoot), { recursive: true });
  writeIncomingDepositRecord(siteRoot, deposit);
  return `${INCOMING_DIR}/${deposit.mail_id}.json`;
}

function writeIncomingDepositRecord(siteRoot, deposit) {
  mkdirSync(incomingPath(siteRoot), { recursive: true });
  writeFileSync(incomingDepositPath(siteRoot, deposit.mail_id), `${JSON.stringify(deposit, null, 2)}\n`, 'utf8');
}

function listIncomingDeposits(siteRoot, mailId) {
  const incoming = incomingPath(siteRoot);
  if (!existsSync(incoming)) return [];
  const files = mailId ? [`${validateMailId(mailId)}.json`] : readdirSync(incoming).filter((file) => file.endsWith('.json'));
  return files
    .map((file) => ({ file, path: join(incoming, file) }))
    .filter((entry) => existsSync(entry.path))
    .map((entry) => ({
      path: entry.path,
      record: parseJson(readFileSync(entry.path, 'utf8'), `site_mail_deposit_invalid_json: ${entry.file}`),
    }))
    .filter((entry) => entry.record?.schema === 'narada.site_mail.deposit.v0')
    .sort((a, b) => String(a.record.deposited_at).localeCompare(String(b.record.deposited_at)));
}

function writeReceipt(siteRoot, receipt) {
  mkdirSync(receiptPath(siteRoot), { recursive: true });
  const rel = `${RECEIPT_DIR}/${receipt.mail_id}.receipt.json`;
  writeFileSync(join(siteRoot, rel), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return rel;
}

function readReceipt(siteRoot, ref) {
  const path = resolve(siteRoot, ref);
  if (!existsSync(path)) return null;
  return parseJson(readFileSync(path, 'utf8'), `site_mail_receipt_invalid_json: ${ref}`);
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  return parseJson(readFileSync(path, 'utf8'), `invalid_json: ${path}`);
}

function parseJson(text, errorPrefix) {
  try {
    return JSON.parse(String(text).replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`${errorPrefix}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function jsonToolResult(value, isError = false) {
  return buildOutputRefToolContent({
    siteRoot: options.siteRoot ?? process.cwd(),
    toolName: activeOutputToolName,
    value,
    isError,
    limit: 10000,
  });
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stringField(record, field) {
  const value = asRecord(record)[field];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function requiredString(record, field) {
  const value = stringField(record, field);
  if (!value) throw new Error(`${field}_required`);
  return value;
}

function booleanField(record, field) {
  return asRecord(record)[field] === true;
}

function numberField(record, field) {
  const value = asRecord(record)[field];
  return Number.isInteger(value) ? value : null;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateMailId(value) {
  if (!/^mail_[A-Za-z0-9_-]{8,80}$/.test(value)) throw new Error(`invalid_mail_id: ${value}`);
  return value;
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function stableJson(value) {
  return JSON.stringify(sortJson(value));
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]));
}

function parseJsonRpcInput(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) return JSON.parse(trimmed);
  return [JSON.parse(trimmed)];
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--site-root') parsed.siteRoot = argv[++i];
    else if (arg === '--help' || arg === '-h') parsed.help = true;
  }
  return parsed;
}
