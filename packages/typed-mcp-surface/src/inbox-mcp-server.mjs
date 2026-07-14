#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { appendAdmissionEvent, emitEnvelopeAdmitted, acknowledgeEnvelope, dismissEnvelope, exportDispositionLedger, readAdmissionLog, recordPromotion, resolveEnvelopeStatus } from '../inbox/admission-log.mjs';
import { validateRecoveryTruthfulnessPacket } from '../task-lifecycle/recovery-truthfulness-guard.mjs';
import { INBOX_ENVELOPE_KINDS, assertKnownInboxEnvelopeKind } from '../inbox/envelope-kinds.mjs';
import { isValidEnvelopeId } from '../inbox/inbox-index.mjs';
import { runGovernedCommandSync } from '@narada2/process-launch-posture';
import {
  attachPayloadSource,
  buildOutputRefToolContent,
  commandCreate,
  commandShow,
  commandSubmit,
  commandValidate,
  enforceInlinePayloadLimit,
  listCommandTools,
  listOutputTools,
  listPayloadTools,
  outputShow,
  payloadCreate,
  payloadDerive,
  payloadShow,
  payloadValidate,
  payloadRefFromEntry,
  payloadRefMetadataFromEntry,
  resultShow,
  resolveToolPayloadArgs,
} from '../../site-common-tools/compat/mcp-payload-file.legacy-site.mjs';

const PROTOCOL_VERSION = '2024-11-05';
let activeOutputToolName = null;
const DEFAULT_DISPOSITION_LEDGER_PATH = 'kb/operations/inbox-disposition-ledger.json';
const CAPA_PROMOTION_PAYLOAD_SCHEMA = 'narada.payload.inbox.promote_capa.v1';

const TOOL_ALIASES = {
  inbox_mcp_doctor: 'inbox_doctor',
  inbox_mcp_submit_observation: 'inbox_submit_observation',
  inbox_mcp_submit_typed_envelope: 'inbox_submit_typed_envelope',
  inbox_mcp_list: 'inbox_list',
  inbox_mcp_next: 'inbox_next',
  inbox_mcp_show: 'inbox_show',
  inbox_mcp_acknowledge: 'inbox_acknowledge',
  inbox_mcp_dismiss: 'inbox_dismiss',
  inbox_mcp_create_capa: 'inbox_create_capa',
  inbox_mcp_amend_capa: 'inbox_amend_capa',
  inbox_mcp_clarify_capa: 'inbox_amend_capa',
  inbox_mcp_promote_capa: 'inbox_promote_capa',
  inbox_mcp_export_disposition_ledger: 'inbox_export_disposition_ledger',
  inbox_mcp_capability_next: 'capability_next',
  inbox_mcp_capability_review_complete: 'capability_review_complete',
  inbox_mcp_capa_queue: 'capa_queue',
  inbox_mcp_capa_related: 'capa_related',
};

const MUTATION_REQUIRES_TARGET_LOCUS_PREFLIGHT = new Set([
  'inbox_submit_observation',
  'inbox_submit_typed_envelope',
  'inbox_stage_submission_workflow',
  'inbox_acknowledge',
  'inbox_dismiss',
  'inbox_create_capa',
  'inbox_amend_capa',
  'inbox_promote_capa',
  'inbox_export_disposition_ledger',
  'capability_review_complete',
]);

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  process.stdout.write(`Usage: node tools/typed-mcp/inbox-mcp-server.mjs --site-root <path> --narada-cli <path>\n`);
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
    const site = resolveSiteContext(serverOptions);
    const result = dispatchMethod(request.method, request.params ?? {}, site, serverOptions);
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

function dispatchMethod(method, params, site, serverOptions) {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: params.protocolVersion ?? PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: {
          name: 'narada-inbox-mcp',
          version: '0.1.0',
        },
      };
    case 'tools/list':
      return {
        tools: tools()
      };
    case 'tools/call':
      return callTool(params, site, serverOptions);
    default:
      throw new Error(`unsupported_mcp_method: ${method}`);
  }
}

function callTool(params, site, serverOptions) {
  const record = asRecord(params);
  const name = stringField(record, 'name');
  const args = asRecord(record.arguments);
  if (!name) throw new Error('tools_call_requires_name');

  const canonicalName = TOOL_ALIASES[name] ?? name;
  activeOutputToolName = canonicalName;
  enforceInlinePayloadLimit({ toolName: canonicalName, args, allowPayloadCreation: true });
  const payloadFieldTools = new Set(['inbox_submit_typed_envelope', 'inbox_create_capa', 'inbox_amend_capa']);
  const preflightArgs = payloadFieldTools.has(canonicalName) && args.payload_ref
    ? resolveToolPayloadArgs({
      siteRoot: serverOptions.siteRoot ?? process.cwd(),
      toolName: canonicalName,
      args,
      allowedTools: [canonicalName],
      payloadRefMode: 'payload_field',
    }).args
    : args;
  if (MUTATION_REQUIRES_TARGET_LOCUS_PREFLIGHT.has(canonicalName)) {
    const guard = guardMutationTargetLocus(preflightArgs, site, serverOptions, canonicalName);
    if (guard.status === 'refused') return jsonToolResult(guard, true);
  }

  switch (canonicalName) {
    case 'inbox_doctor':
      return jsonToolResult({
        status: 'ok',
        surface_type: 'Inbox MCP',
        authority_posture: 'facade_only',
        site,
        narada_cli_configured: Boolean(resolveNaradaCli(serverOptions, false)),
        narada_cli_exists: cliExists(resolveNaradaCli(serverOptions, false)),
        target_site_exists: existsSync(resolve(stringField(args, 'target_site_root') ?? serverOptions.siteRoot ?? process.cwd())),
        target_locus_guard: buildTargetLocusGuardStatus(args, site, serverOptions),
        canonical_tools: tools().map((tool) => tool.name),
        deprecated_aliases: TOOL_ALIASES,
        allowed_tools: tools().map((tool) => tool.name),
        conceptual_role: {
          execution_context_relation: 'available MCP submission surface',
          intelligence_context_relation: 'materializes admission boundary and submission affordance',
          authority_state_relation: 'delegates consequence to canonical inbox admission',
        },
      });
    case 'inbox_submit_observation':
      return commandToolResult(submitObservation(args, site, serverOptions));
    case 'inbox_submit_typed_envelope': {
      const resolved = resolveToolPayloadArgs({
        siteRoot: serverOptions.siteRoot ?? process.cwd(),
        toolName: canonicalName,
        args,
        allowedTools: ['inbox_submit_typed_envelope'],
        payloadRefMode: 'payload_field',
      });
      return commandToolResult(attachPayloadSource(submitTypedEnvelope(resolved.args, site, serverOptions), resolved.payloadSource));
    }
    case 'inbox_stage_submission_workflow':
      return commandToolResult(stageSubmissionWorkflow(args, site, serverOptions));
    case 'inbox_list':
      return jsonToolResult(inboxList(args, site));
    case 'inbox_next':
      return jsonToolResult(inboxNext(args, site));
    case 'inbox_show':
      return jsonToolResult(inboxShow(args, site));
    case 'inbox_acknowledge':
      return jsonToolResult(inboxAcknowledge(args, site));
    case 'inbox_dismiss':
      return jsonToolResult(inboxDismiss(args, site));
    case 'inbox_create_capa': {
      const resolved = resolveToolPayloadArgs({
        siteRoot: serverOptions.siteRoot ?? process.cwd(),
        toolName: canonicalName,
        args,
        allowedTools: ['inbox_create_capa'],
        payloadRefMode: 'payload_field',
      });
      return jsonToolResult(attachPayloadSource(inboxCreateCapa(resolved.args, site, serverOptions), resolved.payloadSource));
    }
    case 'inbox_amend_capa': {
      const resolved = resolveToolPayloadArgs({
        siteRoot: serverOptions.siteRoot ?? process.cwd(),
        toolName: canonicalName,
        args,
        allowedTools: ['inbox_amend_capa'],
        payloadRefMode: 'payload_field',
      });
      return jsonToolResult(attachPayloadSource(inboxAmendCapa(resolved.args, site), resolved.payloadSource));
    }
    case 'inbox_promote_capa':
      return jsonToolResult(inboxPromoteCapa(args, site));
    case 'mcp_command_create':
      return jsonToolResult(commandCreate({ siteRoot: serverOptions.siteRoot ?? process.cwd(), args }));
    case 'mcp_command_show':
      return jsonToolResult(commandShow({ siteRoot: serverOptions.siteRoot ?? process.cwd(), args }));
    case 'mcp_command_validate':
      return jsonToolResult(commandValidate({ siteRoot: serverOptions.siteRoot ?? process.cwd(), args }));
    case 'mcp_command_submit':
      return jsonToolResult(commandSubmit({
        siteRoot: serverOptions.siteRoot ?? process.cwd(),
        args,
        admitters: {
          'narada.command.inbox.submit.v1': (command) => admitInboxSubmitCommand(command, site, serverOptions),
          'narada.command.inbox.submit_typed_envelope.v1': (command) => admitInboxSubmitTypedEnvelopeCommand(command, site, serverOptions),
          'narada.command.inbox.acknowledge.v1': (command) => admitInboxAcknowledgeCommand(command, site, serverOptions),
          'narada.command.inbox.dismiss.v1': (command) => admitInboxDismissCommand(command, site, serverOptions),
          'narada.command.inbox.promote_capa.v1': (command) => admitInboxPromoteCapaCommand(command, site, serverOptions),
          'narada.command.inbox.capa_related.v1': (command) => admitInboxCapaRelatedCommand(command, site, serverOptions),
          'narada.command.inbox.capability_review_complete.v1': (command) => admitCapabilityReviewCompleteCommand(command, site, serverOptions),
          'narada.command.inbox.export_disposition_ledger.v1': (command) => admitInboxExportDispositionLedgerCommand(command, site, serverOptions),
        },
      }));
    case 'mcp_result_show':
      return jsonToolResult(resultShow({ siteRoot: serverOptions.siteRoot ?? process.cwd(), args }));
    case 'inbox_export_disposition_ledger':
      return jsonToolResult(inboxExportDispositionLedger(args, site));
    case 'capability_next':
      return jsonToolResult(capabilityNext(args, site));
    case 'capability_review_complete':
      return jsonToolResult(capabilityReviewComplete(args, site));
    case 'capa_queue':
      return jsonToolResult(capaQueue(args, site));
    case 'capa_related':
      return jsonToolResult(capaRelated(args, site));
    case 'mcp_payload_create':
      return jsonToolResult(payloadCreate({ siteRoot: serverOptions.siteRoot ?? process.cwd(), args }));
    case 'mcp_payload_show':
      return jsonToolResult(payloadShow({ siteRoot: serverOptions.siteRoot ?? process.cwd(), args }));
    case 'mcp_output_show':
      return jsonToolResult(outputShow({ siteRoot: serverOptions.siteRoot ?? process.cwd(), args }));
    case 'mcp_payload_derive':
      return jsonToolResult(payloadDerive({ siteRoot: serverOptions.siteRoot ?? process.cwd(), args }));
    case 'mcp_payload_validate':
      return jsonToolResult(payloadValidate({ siteRoot: serverOptions.siteRoot ?? process.cwd(), args }));
    default:
      throw new Error(`inbox_mcp_refused_non_inbox_operation: ${name}`);
  }
}

function stageSubmissionWorkflow(args, site, serverOptions) {
  const siteRoot = serverOptions.siteRoot ?? process.cwd();
  const targetSiteRoot = resolveTargetSiteRoot(args, site, serverOptions);
  const sourceKind = stringField(args, 'source_kind') ?? 'agent_report';
  const identity = verifyInboxPrincipal(args, { sourceKind, action: 'stage_submission_workflow' });
  const principal = identity.declared_principal;
  const workflowRef = stringField(args, 'workflow_ref') ?? `inbox_workflow:${randomUUID()}`;
  const submit = booleanField(args, 'submit') === true;
  const payloadFile = stringField(args, 'payload_file');
  let payloadRef = stringField(args, 'payload_ref');
  let stagedPayload = null;

  if (payloadRef && payloadFile) throw new Error('workflow_payload_transport_must_choose_payload_ref_or_payload_file');

  if (!payloadRef && !payloadFile) {
    const payload = asRecord(args.payload);
    if (Object.keys(payload).length === 0) throw new Error('workflow_requires_payload_payload_ref_or_payload_file');
    const created = payloadCreate({
      siteRoot,
      args: {
        payload_id: stringField(args, 'payload_id'),
        payload,
        created_by: principal,
      },
    });
    payloadRef = created.ref;
    stagedPayload = { action: 'created_payload_ref', ...created };
  }

  if (payloadRef && !stagedPayload) {
    const validated = payloadValidate({ siteRoot, args: { ref: payloadRef } });
    stagedPayload = { action: 'reused_payload_ref', ...validated };
  }

  const preview = payloadRef
    ? payloadShow({ siteRoot, args: { ref: payloadRef } })
    : { status: 'ok', payload: parseJsonOrNull(readFileSync(payloadFile, 'utf8')), transient_not_authority: true };

  const submitArgs = {
    target_site_root: targetSiteRoot,
    source_ref: requiredString(args, 'source_ref'),
    kind: stringField(args, 'kind') ?? 'observation',
    source_kind: sourceKind,
    authority_level: stringField(args, 'authority_level') ?? 'agent_reported',
    principal,
    target_locus: stringField(args, 'target_locus') ?? 'local_site',
    dry_run: !submit,
    ...(payloadRef ? { payload_ref: payloadRef } : { payload_file: payloadFile }),
  };

  const resolved = payloadRef
    ? resolveToolPayloadArgs({
      siteRoot,
      toolName: 'inbox_submit_typed_envelope',
      args: submitArgs,
      allowedTools: ['inbox_submit_typed_envelope'],
      payloadRefMode: 'payload_field',
    })
    : { args: submitArgs, payloadSource: null };
  const submission = attachPayloadSource(submitTypedEnvelope(resolved.args, site, serverOptions), resolved.payloadSource);
  const projectedPayloadFile = payloadFileFromCommand(submission.command);

  return {
    schema: 'narada.inbox.staged_submission_workflow.v0',
    status: submission.status,
    workflow_ref: workflowRef,
    surface_type: 'Inbox MCP',
    authority_posture: 'facade_only',
    rule: 'Workflow stages immutable transport and preview state, then delegates consequence to canonical Narada inbox admission.',
    staged_payload: stagedPayload,
    payload_ref: payloadRef ?? null,
    preview: {
      status: preview.status,
      payload: preview.payload,
      transient_not_authority: true,
    },
    steps: [
      { step: 'stage', status: stagedPayload?.status ?? 'file_backed', ref: payloadRef ?? null },
      { step: 'validate_or_read', status: preview.status },
      { step: 'preview', status: 'available' },
      { step: submit ? 'submit' : 'dry_run_submit_preview', status: submission.status, envelope_id: submission.envelope_id ?? null },
    ],
    byte_accounting: {
      staged_payload_bytes: stagedPayload?.byte_size ?? null,
      projected_payload_file: projectedPayloadFile,
      projected_payload_file_bytes: byteSizeOfFile(projectedPayloadFile),
      envelope_bytes: submission.canonical_result?.envelope
        ? Buffer.byteLength(JSON.stringify(submission.canonical_result.envelope), 'utf8')
        : null,
      note: 'Staged payload bytes measure the immutable MCP revision payload. Projected payload-file bytes measure the temporary JSON file passed to canonical inbox admission. Envelope bytes are only available after canonical submission returns an envelope.',
    },
    dirty_state_guidance: {
      intended_artifacts: submit
        ? ['admitted inbox envelope export', 'inbox admission-log event', 'transient MCP payload revision']
        : ['transient MCP payload revision', 'temporary projected payload file'],
      unrelated_dirtiness_rule: 'Do not stage unrelated dirty files with the inbox handoff. If cross-embodiment handoff needs the envelope export, stage only the specific .ai/inbox-envelopes JSON export through the narrow handoff path.',
      same_machine_handoff: 'Same-machine follow-up can cite workflow_ref, payload_ref, and envelope_id without committing transient payload workspace files.',
      cross_embodiment_handoff: 'Cross-machine or cross-embodiment handoff needs a committed/tracked authority artifact or explicit envelope-export handoff; transient .ai/tmp payload refs are not portable authority.',
    },
    identity_verification: identity,
    submission,
    envelope_id: submission.envelope_id ?? null,
  };
}

function submitObservation(args, site, serverOptions) {
  const targetSiteRoot = resolveTargetSiteRoot(args, site, serverOptions);
  const naradaCli = resolveNaradaCli(serverOptions, true);
  const dryRun = booleanField(args, 'dry_run') === true;
  const sourceKind = stringField(args, 'source_kind') ?? 'agent_report';
  const identity = verifyInboxPrincipal(args, { sourceKind, action: 'submit_observation' });
  const commandArgs = [
    naradaCli,
    'inbox',
    'submit-observation',
    '--source-kind',
    sourceKind,
    '--source-ref',
    requiredString(args, 'source_ref'),
    '--title',
    requiredString(args, 'title'),
    '--authority-level',
    stringField(args, 'authority_level') ?? 'agent_reported',
    '--principal',
    identity.declared_principal,
    '--target-locus',
    stringField(args, 'target_locus') ?? 'local_site',
    '--cwd',
    targetSiteRoot,
    '--format',
    'json',
  ];
  const summary = stringField(args, 'summary');
  if (summary) commandArgs.push('--summary', summary);
  for (const line of stringArrayField(args, 'evidence')) commandArgs.push('--evidence', line);
  for (const line of stringArrayField(args, 'proposal')) commandArgs.push('--proposal', line);
  const recommendation = stringField(args, 'recommendation');
  if (recommendation) commandArgs.push('--recommendation', recommendation);

  return runCanonicalInboxCommand({
    site,
    targetSiteRoot,
    naradaCli,
    commandArgs,
    dryRun,
    operation: 'submit_observation',
    identityVerification: identity,
  });
}

function submitTypedEnvelope(args, site, serverOptions) {
  const targetSiteRoot = resolveTargetSiteRoot(args, site, serverOptions);
  const naradaCli = resolveNaradaCli(serverOptions, true);
  const dryRun = booleanField(args, 'dry_run') === true;
  const sourceKind = stringField(args, 'source_kind') ?? 'agent_report';
  const identity = verifyInboxPrincipal(args, { sourceKind, action: 'submit_typed_envelope' });
  let payloadFile = stringField(args, 'payload_file');
  if (!payloadFile) {
    const payload = asRecord(args.payload);
    if (Object.keys(payload).length === 0) throw new Error('payload_or_payload_file_required');
    payloadFile = writePayloadFixture(targetSiteRoot, payload);
  }
  if (!existsSync(payloadFile)) throw new Error(`payload_file_not_found: ${payloadFile}`);

  const kind = assertKnownInboxEnvelopeKind(stringField(args, 'kind') ?? 'observation');
  const commandArgs = [
    naradaCli,
    'inbox',
    'submit',
    '--source-kind',
    sourceKind,
    '--source-ref',
    requiredString(args, 'source_ref'),
    '--kind',
    kind,
    '--authority-level',
    stringField(args, 'authority_level') ?? 'agent_reported',
    '--principal',
    identity.declared_principal,
    '--payload-file',
    payloadFile,
    '--target-locus',
    stringField(args, 'target_locus') ?? 'local_site',
    '--cwd',
    targetSiteRoot,
    '--format',
    'json',
  ];

  return runCanonicalInboxCommand({
    site,
    targetSiteRoot,
    naradaCli,
    commandArgs,
    dryRun,
    operation: 'submit_typed_envelope',
    identityVerification: identity,
  });
}

function runCanonicalInboxCommand({ site, targetSiteRoot, naradaCli, commandArgs, dryRun, operation, identityVerification = null }) {
  const plannedCommand = ['node', ...commandArgs];
  const base = {
    status: dryRun ? 'dry_run' : 'planned',
    operation,
    surface_type: 'Inbox MCP',
    authority_posture: 'facade_only',
    site,
    target_site_root: targetSiteRoot,
    narada_cli: naradaCli,
    command: plannedCommand,
    rule: 'Inbox MCP delegates to canonical Narada inbox CLI admission and admits no consequence itself.',
    identity_verification: identityVerification,
  };
  if (dryRun) return base;

  const result = runGovernedCommandSync('node', commandArgs, {
    cwd: targetSiteRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const parsed = parseJsonOrNull(stdout);
  const envelopeId = parsed?.envelope_id ?? parsed?.envelope?.envelope_id ?? null;

  // Emit admission log event on successful submission
  if (result.status === 0 && envelopeId && parsed?.canonical_result?.envelope) {
    try {
      const envelopePath = resolveEnvelopePath(targetSiteRoot, envelopeId);
      const payloadUri = envelopePath
        ? `.ai/inbox-envelopes/${basename(envelopePath)}`
        : undefined;
      emitEnvelopeAdmitted(targetSiteRoot, parsed.canonical_result.envelope, {
        principal: parsed.canonical_result.routing?.principal,
        authority_level: parsed.canonical_result.routing?.authority_level,
        target_locus: parsed.canonical_result.routing?.target_locus,
        admission_gate: operation,
        transport: 'mcp_cli',
        payload_uri: payloadUri,
      });
    } catch (logErr) {
      // Admission log failure must not break submission; record in stderr
      stderr += `\n[admission_log_warning: ${logErr.message}]`;
    }
  }

  return {
    ...base,
    status: result.status === 0 ? 'submitted' : 'refused',
    exit_code: result.status,
    stdout,
    stderr,
    canonical_result: parsed,
    envelope_id: envelopeId,
    read_back_confirmed: Boolean(parsed?.confirmation?.read_back_envelope_id ?? envelopeId),
  };
}

function deriveSeverity(envelope) {
  const kind = envelope.kind ?? 'observation';
  const authority = envelope.authority?.level ?? 'agent_reported';
  if (kind === 'incident') return 'critical';
  if (envelope.payload?.capa_request) return 'high';
  if (authority === 'operator_directed') return 'high';
  if (kind === 'observation') return 'medium';
  if (kind === 'proposal') return 'low';
  return 'medium';
}

function resolveAgentRole(siteRoot, agentId) {
  try {
    const rosterPath = join(siteRoot, '.ai', 'agents', 'roster.json');
    if (!existsSync(rosterPath)) return null;
    const doc = parseJsonOrNull(readFileSync(rosterPath, 'utf8'));
    const agent = doc?.agents?.find((a) => a.agent_id === agentId);
    return agent?.role ?? null;
  } catch {
    return null;
  }
}

function kindsForRole(role) {
  if (role === 'architect') return ['observation', 'proposal', 'incident', 'task_candidate'];
  if (role === 'builder') return ['proposal', 'observation', 'command_request'];
  if (role === 'resident') return ['observation'];
  if (role === 'operator') return ['incident', 'observation'];
  return [];
}

function readValidEnvelopeFiles(envelopeDir) {
  return readdirSync(envelopeDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        const envelope = parseJsonOrNull(readFileSync(join(envelopeDir, f), 'utf8'));
        return isValidEnvelopeId(envelope?.envelope_id) ? envelope : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function effectiveEnvelopeStatus(envelope, latestLogEvents) {
  const logEvent = latestLogEvents.get(envelope.envelope_id);
  const logStatus = logEvent ? resolveEnvelopeStatus([logEvent]) : null;
  return logStatus && ['acknowledged', 'dismissed', 'promoted'].includes(logStatus)
    ? logStatus
    : (envelope.status ?? 'received');
}

function postalProjection(envelope) {
  const postal = asRecord(envelope.postal);
  if (Object.keys(postal).length === 0) return null;
  return {
    transport: stringField(postal, 'transport'),
    source_site_id: stringField(postal, 'source_site_id'),
    mail_id: stringField(postal, 'mail_id'),
    target_site_id: stringField(postal, 'target_site_id'),
    admitted_at: stringField(postal, 'admitted_at') ?? stringField(postal, 'delivered_at') ?? stringField(postal, 'deposited_at'),
    admission_boundary: stringField(postal, 'admission_boundary'),
  };
}

function isPostalEnvelope(envelope) {
  return Boolean(postalProjection(envelope));
}

function readDispositionLedgerEvents(siteRoot) {
  const ledgerPath = join(siteRoot, DEFAULT_DISPOSITION_LEDGER_PATH);
  if (!existsSync(ledgerPath)) return [];
  const doc = parseJsonOrNull(readFileSync(ledgerPath, 'utf8'));
  const events = Array.isArray(doc?.events) ? doc.events : [];
  return events
    .filter((event) => event?.envelope_id && event?.event_kind)
    .map((event) => ({
      schema: event.source_event?.schema ?? 'narada.inbox.admission_log.entry.v0',
      event_id: event.event_id,
      event_sequence: event.event_sequence,
      timestamp: event.timestamp,
      envelope_id: event.envelope_id,
      event_kind: event.event_kind,
      principal: event.principal,
      authority_level: event.authority_level,
      payload_hash: event.payload_hash,
      payload_uri: event.payload_uri,
      event_payload: event.source_event?.event_payload ?? { reason: event.reason ?? null },
      source_authority: DEFAULT_DISPOSITION_LEDGER_PATH,
    }));
}

function readDurableDispositionEvents(siteRoot) {
  const eventsById = new Map();
  for (const event of readDispositionLedgerEvents(siteRoot)) {
    if (event.event_id) eventsById.set(event.event_id, event);
  }
  for (const event of readAdmissionLog(siteRoot)) {
    if (event.event_id) {
      eventsById.set(event.event_id, event);
    } else {
      eventsById.set(`${event.envelope_id}:${event.event_kind}:${event.event_sequence}`, event);
    }
  }
  return [...eventsById.values()].sort((a, b) => (a.event_sequence ?? 0) - (b.event_sequence ?? 0));
}

function getLatestDurableEventsByEnvelope(siteRoot) {
  const map = new Map();
  for (const event of readDurableDispositionEvents(siteRoot)) {
    if (!event.envelope_id) continue;
    const existing = map.get(event.envelope_id);
    if (!existing || (event.event_sequence ?? 0) > (existing.event_sequence ?? 0)) {
      map.set(event.envelope_id, event);
    }
  }
  return map;
}

function exportDispositionLedgerSnapshot(siteRoot) {
  return exportDispositionLedger(siteRoot, { output_path: DEFAULT_DISPOSITION_LEDGER_PATH });
}

function inboxList(args, site) {
  const siteRoot = resolveTargetSiteRoot(args, site, {});
  const envelopeDir = join(siteRoot, '.ai', 'inbox-envelopes');
  if (!existsSync(envelopeDir)) {
    return { count: 0, envelopes: [], schema: 'narada.inbox.list.v0' };
  }

  const statusFilter = stringField(args, 'status') ?? 'received';
  const kindFilter = stringField(args, 'kind');
  const severityFilter = stringField(args, 'severity');
  const principalFilter = stringField(args, 'principal');
  const postalFilter = stringField(args, 'postal');
  const sourceSiteIdFilter = stringField(args, 'source_site_id');
  const mailIdFilter = stringField(args, 'mail_id');
  const targetSiteIdFilter = stringField(args, 'target_site_id');
  const since = stringField(args, 'since');
  const until = stringField(args, 'until');
  const limit = numberField(args, 'limit') ?? 50;
  const offset = numberField(args, 'offset') ?? 0;

  const files = readValidEnvelopeFiles(envelopeDir);

  // Cross-check admission log for terminal states
  const latestLogEvents = getLatestDurableEventsByEnvelope(siteRoot);

  let envelopes = files.map((e) => ({
    ...e,
    _effective_status: effectiveEnvelopeStatus(e, latestLogEvents),
  }));

  if (statusFilter !== 'all') {
    envelopes = envelopes.filter((e) => e._effective_status === statusFilter);
  }
  if (kindFilter) {
    envelopes = envelopes.filter((e) => e.kind === kindFilter);
  }
  if (severityFilter) {
    envelopes = envelopes.filter((e) => deriveSeverity(e) === severityFilter);
  }
  if (principalFilter) {
    const p = principalFilter.toLowerCase();
    envelopes = envelopes.filter((e) => (e.authority?.principal ?? '').toLowerCase().includes(p));
  }
  if (postalFilter) {
    const wantsPostal = ['true', '1', 'yes', 'postal'].includes(postalFilter.toLowerCase());
    envelopes = envelopes.filter((e) => isPostalEnvelope(e) === wantsPostal);
  }
  if (sourceSiteIdFilter) {
    envelopes = envelopes.filter((e) => postalProjection(e)?.source_site_id === sourceSiteIdFilter);
  }
  if (mailIdFilter) {
    envelopes = envelopes.filter((e) => postalProjection(e)?.mail_id === mailIdFilter);
  }
  if (targetSiteIdFilter) {
    envelopes = envelopes.filter((e) => postalProjection(e)?.target_site_id === targetSiteIdFilter);
  }
  if (since) {
    const sinceDate = new Date(since).getTime();
    envelopes = envelopes.filter((e) => new Date(e.received_at ?? 0).getTime() >= sinceDate);
  }
  if (until) {
    const untilDate = new Date(until).getTime();
    envelopes = envelopes.filter((e) => new Date(e.received_at ?? 0).getTime() <= untilDate);
  }

  envelopes.sort((a, b) => new Date(b.received_at ?? 0).getTime() - new Date(a.received_at ?? 0).getTime());

  const total = envelopes.length;
  const page = envelopes.slice(offset, offset + limit);

  return {
    schema: 'narada.inbox.list.v0',
    count: total,
    limit,
    offset,
    envelopes: page.map((e) => ({
      envelope_id: e.envelope_id,
      received_at: e.received_at,
      kind: e.kind,
      title: e.payload?.title ?? '',
      source_ref: e.source?.ref ?? '',
      authority_level: e.authority?.level ?? '',
      principal: e.authority?.principal ?? '',
      severity: deriveSeverity(e),
      status: e._effective_status,
      postal: postalProjection(e),
      classification: postalProjection(e) ? 'site_mail' : 'ordinary',
    })),
  };
}

function inboxNext(args, site) {
  const siteRoot = resolveTargetSiteRoot(args, site, {});
  const agentId = stringField(args, 'agent_id');
  const agentRole = agentId ? resolveAgentRole(siteRoot, agentId) : null;
  const envelopeDir = join(siteRoot, '.ai', 'inbox-envelopes');
  if (!existsSync(envelopeDir)) {
    return { has_work: false, envelope: null, priority_score: 0, schema: 'narada.inbox.next.v0', agent_role: agentRole ?? undefined };
  }

  const files = readValidEnvelopeFiles(envelopeDir);

  // Durable disposition state is authoritative for active work discovery.
  const latestLogEvents = getLatestDurableEventsByEnvelope(siteRoot);
  const unprocessed = files
    .map((e) => ({
      ...e,
      _effective_status: effectiveEnvelopeStatus(e, latestLogEvents),
    }))
    .filter((e) => e._effective_status === 'received');
  if (unprocessed.length === 0) {
    return { has_work: false, envelope: null, priority_score: 0, schema: 'narada.inbox.next.v0', agent_role: agentRole ?? undefined };
  }

  const authorityScores = { operator_directed: 100, system_detected: 70, agent_reported: 40 };
  const kindScores = { incident: 100, observation: 60, proposal: 40, command_request: 50, task_candidate: 45 };

  const preferredKinds = stringArrayField(args, 'preferred_kinds');
  const preferredKindSet = new Set(preferredKinds);

  // Role-based kind preferences
  const rolePreferredKinds = agentRole ? kindsForRole(agentRole) : [];
  const roleKindSet = new Set(rolePreferredKinds);

  const scored = unprocessed.map((e) => {
    const authority = e.authority?.level ?? 'agent_reported';
    const kind = e.kind ?? 'observation';
    const authScore = authorityScores[authority] ?? 30;
    const capaRequestBoost = e.payload?.capa_request ? 30 : 0;
    const kindScore = (kindScores[kind] ?? 30) + capaRequestBoost;
    const preferredBoost = preferredKindSet.size > 0 && preferredKindSet.has(kind) ? 20 : 0;
    const roleBoost = roleKindSet.size > 0 && roleKindSet.has(kind) ? 15 : 0;
    const recencyScore = Math.min(20, Math.floor((new Date(e.received_at ?? 0).getTime() / 1000 / 60 / 60) % 24));
    return {
      envelope: e,
      priority_score: authScore + kindScore + preferredBoost + roleBoost + recencyScore,
      role_relevance: roleKindSet.has(kind),
    };
  });

  // When agent_id is provided, filter to role-relevant envelopes unless none match
  const roleFiltered = scored.filter((s) => s.role_relevance);
  const candidates = roleKindSet.size > 0 && roleFiltered.length > 0 ? roleFiltered : scored;

  candidates.sort((a, b) => b.priority_score - a.priority_score);
  const winner = candidates[0];

  return {
    schema: 'narada.inbox.next.v0',
    has_work: true,
    envelope: {
      envelope_id: winner.envelope.envelope_id,
      received_at: winner.envelope.received_at,
      kind: winner.envelope.kind,
      title: winner.envelope.payload?.title ?? '',
      source_ref: winner.envelope.source?.ref ?? '',
      authority_level: winner.envelope.authority?.level ?? '',
      severity: deriveSeverity(winner.envelope),
      postal: postalProjection(winner.envelope),
      classification: postalProjection(winner.envelope) ? 'site_mail' : 'ordinary',
    },
    priority_score: winner.priority_score,
    agent_role: agentRole ?? undefined,
    role_filtered: roleKindSet.size > 0 && roleFiltered.length > 0,
  };
}

function inboxShow(args, site) {
  const envelopeId = requiredString(args, 'envelope_id');
  const siteRoot = resolveTargetSiteRoot(args, site, {});
  const envelopeDir = join(siteRoot, '.ai', 'inbox-envelopes');
  const path = join(envelopeDir, `${envelopeId}.json`);
  const altPath = join(envelopeDir, envelopeId.endsWith('.json') ? envelopeId : `${envelopeId}.json`);

  let envelope = null;
  if (existsSync(path)) {
    envelope = parseJsonOrNull(readFileSync(path, 'utf8'));
  } else if (existsSync(altPath)) {
    envelope = parseJsonOrNull(readFileSync(altPath, 'utf8'));
  }

  if (!envelope) {
    // Files are named with a timestamp prefix; search by suffix or by envelope_id field
    const files = readdirSync(envelopeDir).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      if (f.endsWith(`${envelopeId}.json`)) {
        envelope = parseJsonOrNull(readFileSync(join(envelopeDir, f), 'utf8'));
        if (envelope) break;
      }
    }
  }

  if (!envelope) {
    // Fallback: scan all files and match by envelope_id field
    const files = readdirSync(envelopeDir).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      const candidate = parseJsonOrNull(readFileSync(join(envelopeDir, f), 'utf8'));
      if (candidate && candidate.envelope_id === envelopeId) {
        envelope = candidate;
        break;
      }
    }
  }

  if (!envelope || !isValidEnvelopeId(envelope.envelope_id)) {
    throw new Error(`envelope_not_found: ${envelopeId}`);
  }
  const effectiveStatus = effectiveEnvelopeStatus(envelope, getLatestDurableEventsByEnvelope(siteRoot));

  return {
    schema: 'narada.inbox.show.v0',
    envelope_id: envelope.envelope_id,
    envelope_payload: envelope.payload,
    admission_status: {
      status: effectiveStatus,
      file_status: envelope.status ?? 'received',
      authority: 'durable_disposition_events',
      authority_level: envelope.authority?.level ?? '',
      principal: envelope.authority?.principal ?? '',
    },
    routing_information: {
      source_kind: envelope.source?.kind ?? '',
      source_ref: envelope.source?.ref ?? '',
      target_locus: envelope.target_locus ?? '',
    },
    postal: postalProjection(envelope),
    classification: postalProjection(envelope) ? 'site_mail' : 'ordinary',
    envelope,
  };
}

function resolveEnvelopePath(siteRoot, envelopeId) {
  const envelopeDir = join(siteRoot, '.ai', 'inbox-envelopes');
  if (!existsSync(envelopeDir)) return null;

  const directPath = join(envelopeDir, `${envelopeId}.json`);
  if (existsSync(directPath)) return directPath;

  const files = readdirSync(envelopeDir).filter((f) => f.endsWith('.json'));
  for (const f of files) {
    if (f.endsWith(`${envelopeId}.json`)) {
      return join(envelopeDir, f);
    }
  }

  for (const f of files) {
    const candidate = parseJsonOrNull(readFileSync(join(envelopeDir, f), 'utf8'));
    if (candidate && candidate.envelope_id === envelopeId) {
      return join(envelopeDir, f);
    }
  }

  return null;
}

function readEnvelope(siteRoot, envelopeId) {
  const path = resolveEnvelopePath(siteRoot, envelopeId);
  if (!path) return null;
  try {
    return parseJsonOrNull(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function updateEnvelopeStatus(siteRoot, envelopeId, status, resolution) {
  const path = resolveEnvelopePath(siteRoot, envelopeId);
  if (!path) return false;
  try {
    const envelope = parseJsonOrNull(readFileSync(path, 'utf8'));
    if (!envelope) return false;
    envelope.status = status;
    envelope.resolution = resolution;
    writeFileSync(path, JSON.stringify(envelope, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

function inboxAcknowledge(args, site) {
  const siteRoot = resolveTargetSiteRoot(args, site, {});
  const envelopeId = requiredString(args, 'envelope_id');
  const identity = verifyInboxPrincipal(args, { action: 'acknowledge' });
  const principal = identity.declared_principal;
  const reason = stringField(args, 'reason');

  const envelope = readEnvelope(siteRoot, envelopeId);
  if (!envelope) {
    throw new Error(`envelope_not_found: ${envelopeId}`);
  }

  const terminalStatuses = new Set(['promoted', 'acknowledged', 'dismissed']);
  const currentStatus = effectiveEnvelopeStatus(envelope, getLatestDurableEventsByEnvelope(siteRoot));
  if (terminalStatuses.has(currentStatus)) {
    return {
      schema: 'narada.inbox.acknowledge.v0',
      status: 'already_resolved',
      envelope_id: envelopeId,
      current_status: currentStatus,
      message: `Envelope is already in terminal state: ${currentStatus}`,
    };
  }

  const event = acknowledgeEnvelope(siteRoot, envelopeId, principal, reason);
  const disposition_ledger_export = exportDispositionLedgerSnapshot(siteRoot);
  const updated = updateEnvelopeStatus(siteRoot, envelopeId, 'acknowledged', {
    action: 'acknowledged',
    resolved_at: event.timestamp,
    resolved_by: principal,
    reason: reason ?? null,
  });

  return {
    schema: 'narada.inbox.acknowledge.v0',
    status: 'acknowledged',
    envelope_id: envelopeId,
    event_id: event.event_id,
    timestamp: event.timestamp,
    principal,
    identity_verification: identity,
    reason: reason ?? null,
    filesystem_updated: updated,
    disposition_ledger_export,
  };
}

function inboxDismiss(args, site) {
  const siteRoot = resolveTargetSiteRoot(args, site, {});
  const envelopeId = requiredString(args, 'envelope_id');
  const identity = verifyInboxPrincipal(args, { action: 'dismiss' });
  const principal = identity.declared_principal;
  const reason = requiredString(args, 'reason');

  const envelope = readEnvelope(siteRoot, envelopeId);
  if (!envelope) {
    throw new Error(`envelope_not_found: ${envelopeId}`);
  }

  const terminalStatuses = new Set(['promoted', 'acknowledged', 'dismissed']);
  const currentStatus = effectiveEnvelopeStatus(envelope, getLatestDurableEventsByEnvelope(siteRoot));
  if (terminalStatuses.has(currentStatus)) {
    return {
      schema: 'narada.inbox.dismiss.v0',
      status: 'already_resolved',
      envelope_id: envelopeId,
      current_status: currentStatus,
      message: `Envelope is already in terminal state: ${currentStatus}`,
    };
  }

  const event = dismissEnvelope(siteRoot, envelopeId, principal, reason);
  const disposition_ledger_export = exportDispositionLedgerSnapshot(siteRoot);
  const updated = updateEnvelopeStatus(siteRoot, envelopeId, 'dismissed', {
    action: 'dismissed',
    resolved_at: event.timestamp,
    resolved_by: principal,
    reason,
  });

  return {
    schema: 'narada.inbox.dismiss.v0',
    status: 'dismissed',
    envelope_id: envelopeId,
    event_id: event.event_id,
    timestamp: event.timestamp,
    principal,
    identity_verification: identity,
    reason,
    filesystem_updated: updated,
    disposition_ledger_export,
  };
}

function findEnvelopeById(siteRoot, envelopeId) {
  const envelopeDir = join(siteRoot, '.ai', 'inbox-envelopes');
  if (!existsSync(envelopeDir)) return null;
  return readValidEnvelopeFiles(envelopeDir).find((e) => e.envelope_id === envelopeId) ?? null;
}

function inboxCreateCapa(args, site, serverOptions) {
  const siteRoot = resolveTargetSiteRoot(args, site, serverOptions);
  const identity = verifyInboxPrincipal(args, { sourceKind: stringField(args, 'source_kind') ?? 'agent_report', action: 'create_capa', allowOperatorOverride: true });
  const principal = identity.declared_principal;
  const role = principal === 'operator' ? 'operator' : resolveAgentRole(siteRoot, principal);
  if (!['architect', 'operator'].includes(role)) {
    throw new Error(`capa_creation_not_authorized: ${principal}`);
  }

  const conceptName = requiredString(args, 'concept_name');
  const recurrenceEvidence = stringArrayField(args, 'recurrence_evidence');
  const payload = {
    title: conceptName,
    summary: stringField(args, 'summary') ?? conceptName,
    evidence: recurrenceEvidence,
    capa_request: {
      concept_name: conceptName,
      corrective_action: requiredString(args, 'corrective_action'),
      preventive_action: requiredString(args, 'preventive_action'),
      severity: numberField(args, 'severity') ?? 60,
      reason: stringField(args, 'reason') ?? '',
    },
  };
  const submission = submitTypedEnvelope({
    target_site_root: siteRoot,
    source_ref: stringField(args, 'source_ref') ?? `capa:create:${randomUUID()}`,
    source_kind: stringField(args, 'source_kind') ?? 'agent_report',
    kind: stringField(args, 'kind') ?? 'observation',
    authority_level: stringField(args, 'authority_level') ?? 'agent_reported',
    principal,
    target_locus: stringField(args, 'target_locus') ?? 'local_site',
    payload,
  }, site, serverOptions);
  if (submission.status !== 'submitted' || !submission.envelope_id) {
    return {
      schema: 'narada.inbox.capa_create.v0',
      status: 'submission_failed',
      submission,
      identity_verification: identity,
    };
  }

  const promotion = inboxPromoteCapa({
    target_site_root: siteRoot,
    envelope_id: submission.envelope_id,
    principal,
    identity_override_reason: stringField(args, 'identity_override_reason'),
    severity: numberField(args, 'severity') ?? 60,
    concept_name: conceptName,
    recurrence_evidence: recurrenceEvidence,
    corrective_action: requiredString(args, 'corrective_action'),
    preventive_action: requiredString(args, 'preventive_action'),
    reason: stringField(args, 'reason') ?? '',
  }, site);
  return {
    schema: 'narada.inbox.capa_create.v0',
    status: promotion.status === 'promoted' ? 'created' : promotion.status,
    capa_id: submission.envelope_id,
    envelope_id: submission.envelope_id,
    promotion_event_id: promotion.event?.event_id ?? null,
    task_materialization_status: 'not_materialized',
    submission_event_id: submission.canonical_result?.event?.event_id ?? null,
    submission,
    promotion,
    identity_verification: identity,
  };
}

function inboxAmendCapa(args, site) {
  const siteRoot = resolveTargetSiteRoot(args, site, {});
  const capaId = requiredString(args, 'capa_id');
  const identity = verifyInboxPrincipal(args, { action: 'amend_capa', allowOperatorOverride: true });
  const principal = identity.declared_principal;
  const role = principal === 'operator' ? 'operator' : resolveAgentRole(siteRoot, principal);
  if (!['architect', 'operator'].includes(role)) {
    throw new Error(`capa_amendment_not_authorized: ${principal}`);
  }

  const queue = capaQueue({ target_site_root: siteRoot }, site);
  const activeCapa = queue.capas.find((capa) => capa.capa_id === capaId);
  if (!activeCapa) throw new Error(`capa_not_active_or_not_found: ${capaId}`);

  const amendment = {
    schema: 'narada.inbox.capa_amendment.v0',
    amended_by: principal,
    capa_id: capaId,
    amendment_kind: stringField(args, 'amendment_kind') ?? 'clarification',
    clarification: requiredString(args, 'clarification'),
    recurrence_evidence: stringArrayField(args, 'recurrence_evidence'),
    corrective_action_delta: stringField(args, 'corrective_action_delta') ?? '',
    preventive_action_delta: stringField(args, 'preventive_action_delta') ?? '',
    reason: stringField(args, 'reason') ?? '',
  };
  const event = appendAdmissionEvent(siteRoot, {
    envelope_id: capaId,
    event_kind: 'capa_amended',
    principal,
    authority_level: 'agent_reported',
    payload_hash: null,
    payload_uri: null,
    event_payload: { amendment },
  });
  const disposition_ledger_export = exportDispositionLedgerSnapshot(siteRoot);
  return {
    schema: 'narada.inbox.capa_amend.v0',
    status: 'amended',
    capa_id: capaId,
    event_id: event.event_id,
    amendment,
    disposition_ledger_export,
    identity_verification: identity,
    sibling_capa_created: false,
  };
}

function inboxPromoteCapa(args, site) {
  const siteRoot = resolveTargetSiteRoot(args, site, {});
  const envelopeId = requiredString(args, 'envelope_id');
  const identity = verifyInboxPrincipal(args, { action: 'promote_capa', allowOperatorOverride: true });
  const principal = identity.declared_principal;
  const role = principal === 'operator' ? 'operator' : resolveAgentRole(siteRoot, principal);
  if (!['architect', 'operator'].includes(role)) {
    throw new Error(`capa_promotion_not_authorized: ${principal}`);
  }

  const envelope = findEnvelopeById(siteRoot, envelopeId);
  if (!envelope) throw new Error(`envelope_not_found: ${envelopeId}`);

  const latestLogEvents = getLatestDurableEventsByEnvelope(siteRoot);
  const effectiveStatus = effectiveEnvelopeStatus(envelope, latestLogEvents);
  if (['acknowledged', 'dismissed'].includes(effectiveStatus)) {
    throw new Error(`capa_promotion_terminal_envelope: ${envelopeId}: ${effectiveStatus}`);
  }

  const promotion = {
    schema: 'narada.inbox.capa_promotion.v0',
    promoted_by: principal,
    source_envelope_id: envelopeId,
    severity: numberField(args, 'severity') ?? (deriveSeverity(envelope) === 'high' ? 80 : 60),
    concept_name: stringField(args, 'concept_name') ?? envelope.payload?.title ?? envelope.title ?? '',
    recurrence_evidence: stringArrayField(args, 'recurrence_evidence'),
    corrective_action: stringField(args, 'corrective_action') ?? envelope.payload?.capa_request?.corrective_action ?? envelope.payload?.corrective_action ?? '',
    preventive_action: stringField(args, 'preventive_action') ?? envelope.payload?.capa_request?.preventive_action ?? envelope.payload?.preventive_action ?? '',
    reason: stringField(args, 'reason') ?? '',
  };
  const relatedCandidates = capaRelated({
    target_site_root: siteRoot,
    concept_name: promotion.concept_name,
    evidence_terms: promotion.recurrence_evidence,
    exclude_capa_id: envelopeId,
    limit: 5,
  }, site);
  const event = recordPromotion(siteRoot, envelopeId, promotion);
  const disposition_ledger_export = exportDispositionLedgerSnapshot(siteRoot);
  return {
    status: 'promoted',
    schema: 'narada.inbox.capa_promote.v0',
    envelope_id: envelopeId,
    event,
    promotion,
    related_capa_candidates: relatedCandidates,
    disposition_ledger_export,
    identity_verification: identity,
    command_admission_compatibility: {
      command_admission_available: true,
      equivalent_command_schema: 'narada.command.inbox.promote_capa.v1',
      equivalent_command_ref: null,
      result_ref: null,
      null_ref_reason: 'inbox_promote_capa facade was invoked directly; create and submit an MCP command packet to receive command_ref and result_ref evidence.',
      preferred_transport_sequence: [
        'mcp_payload_create',
        'mcp_command_create',
        'mcp_command_submit',
        'mcp_result_show',
      ],
    },
  };
}

function inboxExportDispositionLedger(args, site) {
  const siteRoot = resolveTargetSiteRoot(args, site, {});
  const outputPath = stringField(args, 'output_path') ?? 'kb/operations/inbox-disposition-ledger.json';
  const siteId = stringField(args, 'site_id') ?? 'Narada';
  const result = exportDispositionLedger(siteRoot, {
    output_path: outputPath,
    site_id: siteId,
  });
  return {
    ...result,
    operation: 'inbox_export_disposition_ledger',
    authority: '.ai/state/inbox-admission.log',
    portable_artifact: outputPath,
    ignored_envelope_projection_required: false,
  };
}

function capabilityNext(args, site) {
  const siteRoot = resolveTargetSiteRoot(args, site, {});
  const capPath = join(siteRoot, 'operator-surfaces', 'capability-announcements.json');
  if (!existsSync(capPath)) {
    return { has_work: false, capability: null, severity: 0, schema: 'narada.capability.next.v0' };
  }

  const doc = parseJsonOrNull(readFileSync(capPath, 'utf8'));
  const capabilities = Array.isArray(doc?.capabilities) ? doc.capabilities : [];
  const now = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;

  const scored = capabilities
    .map((cap) => {
      const reviewDue = cap.review_due ? new Date(cap.review_due).getTime() : 0;
      const daysUntilDue = reviewDue ? Math.floor((reviewDue - now) / msPerDay) : Infinity;
      const status = cap.review_status ?? 'pending';

      let severity = 0;
      if (status === 'completed') {
        severity = 0;
      } else if (daysUntilDue < 0) {
        severity = 85;
      } else if (daysUntilDue <= 14) {
        severity = 60;
      } else if (daysUntilDue <= 30 && status === 'pending') {
        severity = 40;
      }

      return {
        capability: cap,
        severity,
        days_until_due: daysUntilDue,
      };
    })
    .filter((s) => s.severity > 0);

  if (scored.length === 0) {
    return { has_work: false, capability: null, severity: 0, schema: 'narada.capability.next.v0' };
  }

  scored.sort((a, b) => b.severity - a.severity || a.days_until_due - b.days_until_due);
  const winner = scored[0];

  return {
    schema: 'narada.capability.next.v0',
    has_work: true,
    capability: {
      capability_id: winner.capability.capability_id,
      concept_name: winner.capability.concept_name ?? '',
      status: winner.capability.status ?? '',
      admitted_at: winner.capability.admitted_at ?? '',
      review_due: winner.capability.review_due ?? '',
      responsible_agent_id: winner.capability.responsible_agent_id ?? '',
      review_status: winner.capability.review_status ?? 'pending',
      days_until_due: winner.days_until_due,
    },
    severity: winner.severity,
  };
}

function capabilityReviewComplete(args, site) {
  const siteRoot = resolveTargetSiteRoot(args, site, {});
  const capPath = join(siteRoot, 'operator-surfaces', 'capability-announcements.json');
  if (!existsSync(capPath)) throw new Error(`capability_announcements_not_found: ${capPath}`);

  const doc = parseJsonOrNull(readFileSync(capPath, 'utf8'));
  const capabilities = Array.isArray(doc?.capabilities) ? doc.capabilities : null;
  if (!capabilities) throw new Error('capability_announcements_invalid: capabilities array required');

  const capabilityId = requiredString(args, 'capability_id');
  const reviewerAgentId = requiredString(args, 'reviewer_agent_id');
  const verdict = stringField(args, 'verdict') ?? 'completed';
  const allowedVerdicts = new Set(['completed', 'accepted', 'accepted_with_notes', 'rejected', 'needs_work']);
  if (!allowedVerdicts.has(verdict)) throw new Error(`invalid_capability_review_verdict: ${verdict}`);
  const reviewStatus = stringField(args, 'review_status') ?? (verdict === 'needs_work' ? 'pending' : 'completed');
  const allowedStatuses = new Set(['pending', 'completed', 'overdue']);
  if (!allowedStatuses.has(reviewStatus)) throw new Error(`invalid_capability_review_status: ${reviewStatus}`);
  const reviewedAt = stringField(args, 'reviewed_at') ?? new Date().toISOString();
  if (Number.isNaN(new Date(reviewedAt).getTime())) throw new Error(`invalid_reviewed_at: ${reviewedAt}`);
  const notes = stringField(args, 'notes') ?? '';
  const evidenceRef = stringField(args, 'evidence_ref') ?? '';

  const index = capabilities.findIndex((cap) => cap?.capability_id === capabilityId);
  if (index < 0) throw new Error(`capability_not_found: ${capabilityId}`);

  const prior = capabilities[index];
  const recoveryTruthfulness = asRecord(args.recovery_truthfulness);
  const recoveryTruthfulnessPacket = {
    ...recoveryTruthfulness,
    summary: notes,
    operator_summary: notes,
    context: [prior.concept_name, prior.status, prior.responsible_agent_id, evidenceRef].filter(Boolean).join(' '),
    capa: {
      severity: prior.severity ?? (prior.review_status === 'overdue' ? 'high' : undefined),
      recurrence_count: prior.recurrence_count,
    },
  };
  const recoveryTruthfulnessValidation = validateRecoveryTruthfulnessPacket(recoveryTruthfulnessPacket);
  if (!recoveryTruthfulnessValidation.ok && reviewStatus === 'completed') {
    return {
      schema: 'narada.capability.review_complete.recovery_truthfulness_gate.v0',
      status: 'blocked',
      error: 'recovery_truthfulness_guard_failed',
      close_blocked: true,
      capability_id: capabilityId,
      review_status: reviewStatus,
      verdict,
      trigger_evaluation: recoveryTruthfulnessValidation.evaluation,
      close_blockers: recoveryTruthfulnessValidation.errors,
      remediation: 'For serious-failure CAPA/capability closeout, provide recovery_truthfulness with known_facts, inferences, uncertainty, changed, not_changed, remaining_work, evidence_limits, capa_open_status, and state. Do not report task/artifact/future-work creation as correction unless remaining corrective work is named.',
      coordination: {
        parent_task: 634,
        semantics_tasks: [649, 650],
        task_report_guard: 655,
      },
    };
  }

  const reviewEntry = {
    review_id: `caprev_${randomUUID()}`,
    capability_id: capabilityId,
    reviewer_agent_id: reviewerAgentId,
    reviewed_at: reviewedAt,
    verdict,
    review_status: reviewStatus,
    notes,
    evidence_ref: evidenceRef,
    recovery_truthfulness: Object.keys(recoveryTruthfulness).length > 0 ? recoveryTruthfulness : null,
    recovery_truthfulness_evaluation: recoveryTruthfulnessValidation.evaluation,
  };

  capabilities[index] = {
    ...prior,
    review_status: reviewStatus,
    reviewed_at: reviewedAt,
    reviewed_by: reviewerAgentId,
    review_verdict: verdict,
    review_notes: notes,
    review_evidence_ref: evidenceRef,
    recovery_truthfulness: Object.keys(recoveryTruthfulness).length > 0 ? recoveryTruthfulness : prior.recovery_truthfulness,
    recovery_truthfulness_evaluation: recoveryTruthfulnessValidation.evaluation,
    review_log: [...(Array.isArray(prior.review_log) ? prior.review_log : []), reviewEntry],
  };

  const updatedDoc = {
    ...doc,
    capability_review_authority: {
      store: 'operator-surfaces/capability-announcements.json',
      posture: 'local_user_site_authority',
      projection_boundary: 'This file is the local capability announcement review authority; compatibility projections must be regenerated or read from this authority rather than hand-edited as review state.',
      updated_at: reviewedAt,
    },
    capabilities,
  };

  writeFileSync(capPath, `${JSON.stringify(updatedDoc, null, 2)}\n`, 'utf8');

  return {
    schema: 'narada.capability.review_complete.v0',
    status: 'completed',
    authority: 'capability_announcements_json',
    authority_path: capPath,
    capability_id: capabilityId,
    reviewer_agent_id: reviewerAgentId,
    reviewed_at: reviewedAt,
    verdict,
    review_status: reviewStatus,
    evidence_ref: evidenceRef,
    review_id: reviewEntry.review_id,
    recovery_truthfulness_evaluation: recoveryTruthfulnessValidation.evaluation,
  };
}

function capaQueue(args, site) {
  const siteRoot = resolveTargetSiteRoot(args, site, {});

  // 1. Read capability announcements for static CAPA context
  const capPath = join(siteRoot, 'operator-surfaces', 'capability-announcements.json');
  let capaItems = [];
  if (existsSync(capPath)) {
    const doc = parseJsonOrNull(readFileSync(capPath, 'utf8'));
    const capabilities = Array.isArray(doc?.capabilities) ? doc.capabilities : [];
    const now = Date.now();
    const msPerDay = 24 * 60 * 60 * 1000;

    capaItems = capabilities
      .filter((cap) => (cap.review_status ?? 'pending') !== 'completed')
      .map((cap) => {
        const reviewDue = cap.review_due ? new Date(cap.review_due).getTime() : 0;
        const daysUntilDue = reviewDue ? Math.floor((reviewDue - now) / msPerDay) : Infinity;
        const status = cap.review_status ?? 'pending';

        let severity = 0;
        if (daysUntilDue < 0) {
          severity = 85;
        } else if (daysUntilDue <= 14) {
          severity = 60;
        } else if (daysUntilDue <= 30 && status === 'pending') {
          severity = 40;
        }

        return {
          capa_id: cap.capability_id,
          capa_type: 'capability_announcement',
          concept_name: cap.concept_name ?? '',
          evidence_text: [cap.concept_name, cap.status, cap.responsible_agent_id].filter(Boolean).join(' '),
          status: cap.status ?? '',
          review_status: status,
          review_due: cap.review_due ?? '',
          days_until_due: daysUntilDue,
          severity,
          responsible_agent_id: cap.responsible_agent_id ?? '',
          admitted_at: cap.admitted_at ?? '',
          source_path: capPath,
        };
      })
      .filter((c) => c.severity > 0);
  }

  // 2. Read active CAPA promotions for dynamic admission-log CAPAs.
  // Terminal admission-log status wins over stale file projections.
  const envelopeDir = join(siteRoot, '.ai', 'inbox-envelopes');
  let inboxCapas = [];
  if (existsSync(envelopeDir)) {
    const files = readValidEnvelopeFiles(envelopeDir);
    const latestLogEvents = getLatestDurableEventsByEnvelope(siteRoot);
    const terminalStates = new Set(['acknowledged', 'dismissed']);
    const envelopeById = new Map(files.map((e) => [e.envelope_id, e]));
    const events = readDurableDispositionEvents(siteRoot);
    const promotionsByEnvelope = new Map();
    for (const event of events) {
      if (event.event_kind !== 'envelope_promoted' || !event.envelope_id) continue;
      const existing = promotionsByEnvelope.get(event.envelope_id);
      if (!existing || (event.event_sequence ?? 0) > (existing.event_sequence ?? 0)) {
        promotionsByEnvelope.set(event.envelope_id, event);
      }
    }

    inboxCapas = [...promotionsByEnvelope.entries()]
      .map(([envelopeId, event]) => {
        const envelope = envelopeById.get(envelopeId);
        const promotion = event.event_payload?.promotion ?? {};
        const effectiveStatus = envelope
          ? effectiveEnvelopeStatus(envelope, latestLogEvents)
          : resolveEnvelopeStatus(events.filter((e) => e.envelope_id === envelopeId));
        return { envelope, envelopeId, event, promotion, effectiveStatus };
      })
      .filter((item) => !terminalStates.has(item.effectiveStatus))
      .map((item) => ({
        capa_id: item.envelopeId,
        capa_type: 'inbox_capa',
        concept_name: item.promotion.concept_name ?? item.envelope?.payload?.title ?? '',
        evidence_text: [
          item.promotion.concept_name,
          ...(Array.isArray(item.promotion.recurrence_evidence) ? item.promotion.recurrence_evidence : []),
          item.promotion.corrective_action,
          item.promotion.preventive_action,
          item.promotion.reason,
          item.envelope?.payload?.title,
          item.envelope?.payload?.summary,
        ].filter(Boolean).join(' '),
        status: item.effectiveStatus,
        review_status: item.effectiveStatus,
        review_due: '',
        days_until_due: Infinity,
        severity: item.promotion.severity ?? 60,
        responsible_agent_id: item.promotion.promoted_by ?? item.envelope?.authority?.principal ?? '',
        admitted_at: item.event.timestamp ?? item.envelope?.received_at ?? '',
        source_path: item.envelope ? join(envelopeDir, `${item.envelope.envelope_id}.json`) : '',
      }));
  }

  // 3. Merge and compute recurrence evidence
  const allCapas = [...capaItems, ...inboxCapas];

  // Recurrence: count inbox envelopes with matching concept/title or source kind
  const recurrenceEvidence = new Map();
  if (existsSync(envelopeDir)) {
    const files = readValidEnvelopeFiles(envelopeDir);

    for (const capa of allCapas) {
      const conceptName = (capa.concept_name ?? '').toLowerCase();
      const related = files.filter((e) => {
        if (e.envelope_id === capa.capa_id) return false; // Don't count self
        const title = (e.payload?.title ?? '').toLowerCase();
        const summary = (e.payload?.summary ?? '').toLowerCase();
        return title.includes(conceptName) || summary.includes(conceptName) || conceptName.includes(title);
      });
      recurrenceEvidence.set(capa.capa_id, related.length);
    }
  }

  allCapas.sort((a, b) => b.severity - a.severity);

  return {
    schema: 'narada.inbox.capa_queue.v0',
    count: allCapas.length,
    capas: allCapas.map((c) => ({
      ...c,
      recurrence_count: recurrenceEvidence.get(c.capa_id) ?? 0,
    })),
  };
}

function capaRelated(args, site) {
  const siteRoot = resolveTargetSiteRoot(args, site, {});
  const envelopeId = stringField(args, 'envelope_id');
  const excludeCapaId = stringField(args, 'exclude_capa_id');
  const limit = Math.max(1, Math.min(numberField(args, 'limit') ?? 8, 25));
  let envelope = null;
  if (envelopeId) {
    envelope = findEnvelopeById(siteRoot, envelopeId);
    if (!envelope) throw new Error(`envelope_not_found: ${envelopeId}`);
  }

  const conceptName = stringField(args, 'concept_name') ?? stringField(args, 'title') ?? envelope?.payload?.title ?? envelope?.title ?? '';
  const evidenceTerms = [
    ...stringArrayField(args, 'evidence_terms'),
    ...stringArrayField(args, 'recurrence_evidence'),
  ];
  const queryText = [
    conceptName,
    stringField(args, 'summary') ?? envelope?.payload?.summary,
    envelope?.payload?.capa_request?.corrective_action,
    envelope?.payload?.capa_request?.preventive_action,
    ...evidenceTerms,
  ].filter(Boolean).join(' ');
  const queryTokens = tokenizeRelatedText(queryText);
  if (queryTokens.length === 0) {
    return {
      schema: 'narada.inbox.capa_related.v0',
      status: 'empty_query',
      query: { envelope_id: envelopeId ?? '', concept_name: conceptName, evidence_terms: evidenceTerms },
      count: 0,
      candidates: [],
    };
  }

  const queue = capaQueue({ target_site_root: siteRoot }, site);
  const candidates = queue.capas
    .filter((capa) => capa.capa_id !== excludeCapaId)
    .map((capa) => scoreRelatedCapa(capa, queryTokens, conceptName))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || b.shared_terms.length - a.shared_terms.length || b.severity - a.severity)
    .slice(0, limit);

  return {
    schema: 'narada.inbox.capa_related.v0',
    status: 'ok',
    query: {
      envelope_id: envelopeId ?? '',
      concept_name: conceptName,
      evidence_terms: evidenceTerms,
      token_count: queryTokens.length,
    },
    count: candidates.length,
    candidates,
  };
}

function scoreRelatedCapa(capa, queryTokens, conceptName) {
  const candidateText = [capa.concept_name, capa.capa_id, capa.evidence_text].filter(Boolean).join(' ');
  const candidateTokens = tokenizeRelatedText(candidateText);
  const querySet = new Set(queryTokens);
  const candidateSet = new Set(candidateTokens);
  const sharedTerms = [...querySet].filter((token) => candidateSet.has(token)).sort();
  const queryCoverage = sharedTerms.length / Math.max(querySet.size, 1);
  const candidateCoverage = sharedTerms.length / Math.max(candidateSet.size, 1);
  const score = Number(((queryCoverage * 0.7) + (candidateCoverage * 0.3)).toFixed(3));
  const normalizedConcept = normalizeRelatedPhrase(conceptName);
  const normalizedCandidate = normalizeRelatedPhrase(capa.concept_name ?? '');
  let relation = 'related';
  if (normalizedConcept && normalizedConcept === normalizedCandidate) {
    relation = 'duplicate';
  } else if (score >= 0.72) {
    relation = 'duplicate';
  } else if (score >= 0.25 || sharedTerms.length >= 2) {
    relation = 'sibling';
  }
  return {
    capa_id: capa.capa_id,
    capa_type: capa.capa_type,
    concept_name: capa.concept_name,
    relation,
    score,
    shared_terms: sharedTerms.slice(0, 8),
    severity: capa.severity,
    recurrence_count: capa.recurrence_count ?? 0,
    status: capa.status,
    source_path: capa.source_path,
  };
}

function tokenizeRelatedText(value) {
  const stopWords = new Set(['about', 'after', 'again', 'before', 'into', 'from', 'that', 'this', 'with', 'without', 'when', 'where', 'while', 'and', 'the', 'for']);
  return [...new Set(String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_\-\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.replace(/^[-_]+|[-_]+$/g, ''))
    .filter((token) => token.length >= 3 && !stopWords.has(token)))];
}

function normalizeRelatedPhrase(value) {
  return tokenizeRelatedText(value).join(' ');
}

function writePayloadFixture(targetSiteRoot, payload) {
  const dir = join(targetSiteRoot, '.ai', 'runtime', 'typed-mcp', 'inbox-mcp', 'payloads');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `payload_${Date.now()}_${randomUUID().slice(0, 8)}.json`);
  writeFileSync(path, JSON.stringify(payload, null, 2), 'utf8');
  return path;
}

function resolveNaradaCli(serverOptions, required) {
  const value = serverOptions.naradaCli ?? process.env.NARADA_CLI;
  if (!value || String(value).trim().length === 0) {
    if (required) throw new Error('narada_cli_required: pass --narada-cli or set NARADA_CLI for this MCP server embodiment.');
    return null;
  }
  return resolve(String(value));
}

function cliExists(value) {
  return Boolean(value && existsSync(value));
}

function resolveTargetSiteRoot(args, site, serverOptions) {
  const root = stringField(args, 'target_site_root') ?? serverOptions.siteRoot ?? site.site_root;
  if (!root) throw new Error('target_site_root_required');
  const resolved = resolve(root);
  if (!existsSync(resolved)) throw new Error(`target_site_root_not_found: ${resolved}`);
  return resolved;
}

function buildTargetLocusGuardStatus(args, site, serverOptions) {
  const explicitTargetRoot = stringField(args, 'target_site_root');
  const serverDefaultRoot = resolve(serverOptions.siteRoot ?? site.site_root ?? process.cwd());
  const cwdRoot = resolve(process.cwd());
  const operatorStatedRoot = resolveOperatorStatedRoot();
  const mismatches = collectTargetLocusMismatches({
    serverDefaultRoot,
    cwdRoot,
    operatorStatedRoot,
    explicitTargetRoot: explicitTargetRoot ? resolve(explicitTargetRoot) : null,
  });
  const operatorMismatch = mismatches.some((item) => item.kind === 'operator_stated_locus_default_site_root_mismatch'
    || item.kind === 'operator_stated_locus_explicit_target_mismatch');
  const blockingMismatch = operatorMismatch || (!explicitTargetRoot && mismatches.length > 0);
  return {
    schema: 'narada.inbox.target_locus_guard.v0',
    default_target_site_root: serverDefaultRoot,
    cwd_root: cwdRoot,
    operator_stated_locus_root: operatorStatedRoot,
    explicit_target_site_root: explicitTargetRoot ? resolve(explicitTargetRoot) : null,
    explicit_target_required_for_mutation: mismatches.length > 0,
    status: blockingMismatch ? 'explicit_target_site_root_required' : 'clear',
    mismatches,
    rule: 'Startup/control-surface root is not requested-work authority. Mutation-capable tools must not silently default when cwd or operator-stated locus disagrees with the MCP default target root.',
  };
}

function guardMutationTargetLocus(args, site, serverOptions, toolName) {
  const status = buildTargetLocusGuardStatus(args, site, serverOptions);
  if (status.status === 'clear') return status;
  return {
    ...status,
    status: 'refused',
    refusal_code: 'target_locus_preflight_required',
    tool_name: toolName,
    remediation: 'Pass explicit target_site_root for the intended Site, or relaunch the MCP server from the intended work locus before mutation.',
  };
}

function collectTargetLocusMismatches({ serverDefaultRoot, cwdRoot, operatorStatedRoot, explicitTargetRoot = null }) {
  const mismatches = [];
  if (!sameResolvedPath(serverDefaultRoot, cwdRoot)) {
    mismatches.push({
      kind: 'cwd_default_site_root_mismatch',
      observed_root: cwdRoot,
      default_target_site_root: serverDefaultRoot,
    });
  }
  if (operatorStatedRoot && !sameResolvedPath(serverDefaultRoot, operatorStatedRoot)) {
    mismatches.push({
      kind: 'operator_stated_locus_default_site_root_mismatch',
      observed_root: operatorStatedRoot,
      default_target_site_root: serverDefaultRoot,
    });
  }
  if (operatorStatedRoot && explicitTargetRoot && !sameResolvedPath(explicitTargetRoot, operatorStatedRoot)) {
    mismatches.push({
      kind: 'operator_stated_locus_explicit_target_mismatch',
      observed_root: operatorStatedRoot,
      explicit_target_site_root: explicitTargetRoot,
    });
  }
  return mismatches;
}

function resolveOperatorStatedRoot() {
  const raw = process.env.NARADA_OPERATOR_STATED_SITE_ROOT
    || process.env.NARADA_REQUESTED_WORK_ROOT
    || process.env.NARADA_TARGET_SITE_ROOT
    || null;
  return raw && String(raw).trim().length > 0 ? resolve(String(raw)) : null;
}

function sameResolvedPath(left, right) {
  if (!left || !right) return false;
  return resolve(String(left)).toLowerCase() === resolve(String(right)).toLowerCase();
}

function resolveSiteContext(serverOptions) {
  const siteRoot = resolve(serverOptions.siteRoot ?? process.cwd());
  const configPath = join(siteRoot, 'config.json');
  const config = existsSync(configPath) ? asRecord(parseJsonOrNull(readFileSync(configPath, 'utf8'))) : {};
  const locus = asRecord(config.locus);
  return {
    site_id: serverOptions.siteId ?? stringField(config, 'site_id') ?? basename(siteRoot),
    site_kind: serverOptions.siteKind ?? stringField(config, 'site_kind') ?? 'unspecified',
    site_root: siteRoot,
    workspace_root: stringField(config, 'workspace_root') ?? null,
    authority_locus: stringField(locus, 'authority_locus') ?? stringField(config, 'site_kind') ?? 'unspecified',
    source: existsSync(configPath) ? 'config' : 'options',
  };
}

function jsonToolResult(value, isError = false, toolName = null) {
  return buildOutputRefToolContent({ siteRoot: resolve(options.siteRoot ?? process.cwd()), toolName: toolName ?? activeOutputToolName, value, isError });
}

function commandToolResult(value) {
  return jsonToolResult(value, value.status === 'refused');
}

function admitInboxSubmitCommand(command, site, serverOptions) {
  return admitInboxSubmitTypedEnvelopeCommand(command, site, serverOptions, 'narada.command.inbox.submit.result.v1');
}

function admitInboxSubmitTypedEnvelopeCommand(command, site, serverOptions, resultSchema = 'narada.command.inbox.submit_typed_envelope.result.v1') {
  const domainArgs = asRecord(command.domain_args);
  const payloadRefs = Array.isArray(command.payload_refs) ? command.payload_refs : [];
  const payloadRefEntry = findCommandPayloadRefEntry(payloadRefs, 'domain_payload');
  const payloadRef = payloadRefFromEntry(payloadRefEntry);
  if (!payloadRef) throw new Error('inbox_submit_command_requires_payload_ref');
  const resolved = resolveToolPayloadArgs({
    siteRoot: serverOptions.siteRoot ?? process.cwd(),
    toolName: 'inbox_submit_typed_envelope',
    args: {
      ...domainArgs,
      payload_ref: payloadRef,
      target_locus: domainArgs.target_locus ?? command.target_locus,
      target_site_root: domainArgs.target_site_root ?? command.target_site_root,
    },
    allowedTools: ['inbox_submit_typed_envelope'],
    payloadRefMode: 'payload_field',
  });
  const submitResult = attachPayloadSource(submitTypedEnvelope({
    ...resolved.args,
    ...domainArgs,
    target_locus: domainArgs.target_locus ?? command.target_locus,
    target_site_root: domainArgs.target_site_root ?? command.target_site_root,
  }, site, serverOptions), enrichPayloadSourceFromEntry(resolved.payloadSource, payloadRefEntry));
  return {
    ...submitResult,
    schema: resultSchema,
    command_admission_schema: command.command_schema,
  };
}

function admitInboxAcknowledgeCommand(command, site, serverOptions) {
  return admitInboxDispositionCommand(command, site, serverOptions, {
    action: 'acknowledge',
    toolName: 'inbox_acknowledge',
    resultSchema: 'narada.command.inbox.acknowledge.result.v1',
    run: inboxAcknowledge,
  });
}

function admitInboxDismissCommand(command, site, serverOptions) {
  return admitInboxDispositionCommand(command, site, serverOptions, {
    action: 'dismiss',
    toolName: 'inbox_dismiss',
    resultSchema: 'narada.command.inbox.dismiss.result.v1',
    run: inboxDismiss,
  });
}

function admitInboxDispositionCommand(command, site, serverOptions, { action, toolName, resultSchema, run }) {
  const domainArgs = asRecord(command.domain_args);
  const merged = {
    ...domainArgs,
    target_locus: domainArgs.target_locus ?? command.target_locus,
    target_site_root: domainArgs.target_site_root ?? command.target_site_root,
  };
  const expected = asRecord(command.expected_consequence);
  if (stringField(expected, 'envelope_id') && stringField(merged, 'envelope_id') && stringField(expected, 'envelope_id') !== stringField(merged, 'envelope_id')) {
    throw new Error(`expected_consequence_envelope_mismatch: expected=${stringField(expected, 'envelope_id')} actual=${stringField(merged, 'envelope_id')}`);
  }
  if (stringField(expected, 'status')) {
    const expectedStatus = stringField(expected, 'status');
    const actionStatus = action === 'acknowledge' ? 'acknowledged' : 'dismissed';
    if (expectedStatus !== actionStatus) {
      throw new Error(`expected_consequence_status_mismatch: expected=${expectedStatus} actual=${actionStatus}`);
    }
  }
  const guard = guardMutationTargetLocus(merged, site, serverOptions, toolName);
  if (guard.status === 'refused') throw new Error(`target_locus_preflight_refused: ${JSON.stringify(guard)}`);
  const domainResult = run(merged, site);
  if (domainResult.status === 'already_resolved') {
    throw new Error(`invalid_envelope_state: ${stringField(merged, 'envelope_id')}: ${domainResult.current_status}`);
  }
  return {
    ...domainResult,
    schema: resultSchema,
    command_admission_schema: command.command_schema,
  };
}

function admitInboxPromoteCapaCommand(command, site, serverOptions) {
  const domainArgs = asRecord(command.domain_args);
  const payloadRefs = Array.isArray(command.payload_refs) ? command.payload_refs : [];
  const payloadRefEntry = findCommandPayloadRefEntry(payloadRefs, 'domain_payload');
  const payloadRef = payloadRefFromEntry(payloadRefEntry);
  let payloadArgs = {};
  let payloadSource = null;
  let payloadSchemaValidation = null;
  if (payloadRef) {
    const resolved = resolveToolPayloadArgs({
      siteRoot: serverOptions.siteRoot ?? process.cwd(),
      toolName: 'inbox_promote_capa',
      args: { payload_ref: payloadRef },
      allowedTools: ['inbox_promote_capa'],
    });
    payloadArgs = asRecord(resolved.args);
    payloadSource = enrichPayloadSourceFromEntry(resolved.payloadSource, payloadRefEntry);
    payloadSchemaValidation = validateCapaPromotionPayloadForCommand(payloadArgs, payloadRefEntry);
  }
  const merged = {
    ...payloadArgs,
    ...domainArgs,
    target_locus: domainArgs.target_locus ?? command.target_locus,
    target_site_root: domainArgs.target_site_root ?? command.target_site_root,
  };
  const expected = asRecord(command.expected_consequence);
  if (stringField(expected, 'envelope_id') && stringField(merged, 'envelope_id') && stringField(expected, 'envelope_id') !== stringField(merged, 'envelope_id')) {
    throw new Error(`expected_consequence_envelope_mismatch: expected=${stringField(expected, 'envelope_id')} actual=${stringField(merged, 'envelope_id')}`);
  }
  const guard = guardMutationTargetLocus(merged, site, serverOptions, 'inbox_promote_capa');
  if (guard.status === 'refused') throw new Error(`target_locus_preflight_refused: ${JSON.stringify(guard)}`);
  return attachPayloadSource({
    ...inboxPromoteCapa(merged, site),
    facade_schema: 'narada.inbox.capa_promote.v0',
    schema: 'narada.command.inbox.promote_capa.result.v1',
    command_admission_schema: command.command_schema,
    payload_schema_validation: payloadSchemaValidation,
  }, payloadSource);
}

function findCommandPayloadRefEntry(payloadRefs, preferredRole) {
  const roleMatch = payloadRefs.find((entry) => payloadRefMetadataFromEntry(entry).role === preferredRole);
  return roleMatch ?? payloadRefs[0];
}

function enrichPayloadSourceFromEntry(payloadSource, entry) {
  if (!payloadSource) return payloadSource;
  const metadata = payloadRefMetadataFromEntry(entry);
  return Object.keys(metadata).length > 0 ? { ...payloadSource, ...metadata } : payloadSource;
}

function validateCapaPromotionPayloadForCommand(payload, payloadRefEntry = null) {
  const entrySchema = payloadRefMetadataFromEntry(payloadRefEntry).payload_schema;
  const payloadSchema = stringField(payload, 'schema');
  if (!payloadSchema) {
    return {
      payload_schema_state: 'legacy_untyped_accepted',
      payload_schema_expected: CAPA_PROMOTION_PAYLOAD_SCHEMA,
      payload_schema_advertised: entrySchema ?? null,
    };
  }
  if (payloadSchema !== CAPA_PROMOTION_PAYLOAD_SCHEMA) {
    throw new Error(`payload_schema_mismatch: expected=${CAPA_PROMOTION_PAYLOAD_SCHEMA} actual=${payloadSchema}`);
  }

  const requiredStringFields = ['concept_name', 'corrective_action', 'preventive_action'];
  for (const field of requiredStringFields) {
    if (!stringField(payload, field)) {
      throw new Error(`payload_schema_required_field_missing: schema=${CAPA_PROMOTION_PAYLOAD_SCHEMA} field=${field}`);
    }
  }
  const recurrenceEvidence = payload.recurrence_evidence;
  if (recurrenceEvidence !== undefined && (!Array.isArray(recurrenceEvidence) || recurrenceEvidence.some((item) => typeof item !== 'string' || item.trim().length === 0))) {
    throw new Error(`payload_schema_field_type_invalid: schema=${CAPA_PROMOTION_PAYLOAD_SCHEMA} field=recurrence_evidence expected=non_empty_string_array`);
  }
  if (!stringField(payload, 'evidence_summary') && (!Array.isArray(recurrenceEvidence) || recurrenceEvidence.length === 0)) {
    throw new Error(`payload_schema_required_field_missing: schema=${CAPA_PROMOTION_PAYLOAD_SCHEMA} field=recurrence_evidence_or_evidence_summary`);
  }
  return {
    payload_schema_state: 'typed_validated',
    payload_schema: CAPA_PROMOTION_PAYLOAD_SCHEMA,
  };
}

function admitInboxCapaRelatedCommand(command, site, serverOptions) {
  const domainArgs = asRecord(command.domain_args);
  const merged = {
    ...domainArgs,
    target_locus: domainArgs.target_locus ?? command.target_locus,
    target_site_root: domainArgs.target_site_root ?? command.target_site_root,
  };
  const guard = guardMutationTargetLocus(merged, site, serverOptions, 'capa_related');
  if (guard.status === 'refused') throw new Error(`target_locus_preflight_refused: ${JSON.stringify(guard)}`);
  const related = capaRelated(merged, site);
  return {
    ...related,
    schema: 'narada.command.inbox.capa_related.result.v1',
    command_admission_schema: command.command_schema,
    durable_state_changed: false,
  };
}

function admitCapabilityReviewCompleteCommand(command, site, serverOptions) {
  const domainArgs = {
    ...asRecord(command.domain_args),
    target_locus: asRecord(command.domain_args).target_locus ?? command.target_locus,
    target_site_root: asRecord(command.domain_args).target_site_root ?? command.target_site_root,
  };
  const expected = asRecord(command.expected_consequence);
  if (stringField(expected, 'capability_id') && stringField(domainArgs, 'capability_id') && stringField(expected, 'capability_id') !== stringField(domainArgs, 'capability_id')) {
    throw new Error(`expected_consequence_capability_mismatch: expected=${stringField(expected, 'capability_id')} actual=${stringField(domainArgs, 'capability_id')}`);
  }
  const guard = guardMutationTargetLocus(domainArgs, site, serverOptions, 'capability_review_complete');
  if (guard.status === 'refused') throw new Error(`target_locus_preflight_refused: ${JSON.stringify(guard)}`);
  const result = capabilityReviewComplete(domainArgs, site);
  return {
    ...result,
    schema: 'narada.command.inbox.capability_review_complete.result.v1',
    command_admission_schema: command.command_schema,
  };
}

function admitInboxExportDispositionLedgerCommand(command, site, serverOptions) {
  const domainArgs = {
    ...asRecord(command.domain_args),
    target_locus: asRecord(command.domain_args).target_locus ?? command.target_locus,
    target_site_root: asRecord(command.domain_args).target_site_root ?? command.target_site_root,
  };
  const expected = asRecord(command.expected_consequence);
  if (stringField(expected, 'output_path') && stringField(domainArgs, 'output_path') && stringField(expected, 'output_path') !== stringField(domainArgs, 'output_path')) {
    throw new Error(`expected_consequence_output_path_mismatch: expected=${stringField(expected, 'output_path')} actual=${stringField(domainArgs, 'output_path')}`);
  }
  const guard = guardMutationTargetLocus(domainArgs, site, serverOptions, 'inbox_export_disposition_ledger');
  if (guard.status === 'refused') throw new Error(`target_locus_preflight_refused: ${JSON.stringify(guard)}`);
  const result = inboxExportDispositionLedger(domainArgs, site);
  return {
    ...result,
    schema: 'narada.command.inbox.export_disposition_ledger.result.v1',
    command_admission_schema: command.command_schema,
  };
}

function tools() {
  return [
    {
      name: 'inbox_doctor',
      description: 'Inspect Inbox MCP readiness without mutating.',
      inputSchema: objectSchema({
        target_site_root: stringSchema('Explicit target Site root. Defaults to server site root.'),
      }),
    },
    {
      name: 'inbox_stage_submission_workflow',
      description: 'Guide a staged inbox submission from immutable payload ref creation or reuse through validation, preview, canonical submit/dry-run, envelope id, byte accounting, and handoff guidance. Use this as the default path for long prose, arrays, cross-Site submissions, or likely resubmission; small simple observations may still use inbox_submit_observation.',
      inputSchema: objectSchema({
        target_site_root: stringSchema('Explicit target Site root. Defaults to server site root.'),
        workflow_ref: stringSchema('Optional workflow/session ref. Defaults to a generated inbox_workflow:<uuid> ref.'),
        payload_id: stringSchema('Optional stable payload id used when creating a new immutable MCP payload revision.'),
        source_ref: { type: 'string' },
        kind: stringSchema(`Envelope kind; defaults to observation. Known kinds: ${INBOX_ENVELOPE_KINDS.join(', ')}.`),
        payload: { type: 'object', additionalProperties: true, description: 'Envelope payload object to stage as an immutable MCP payload revision.' },
        payload_ref: stringSchema('Existing immutable transient payload ref such as mcp_payload:<id>@v1.'),
        payload_file: stringSchema('Existing JSON payload file. Prefer payload_ref for nontrivial authored submissions so immutable provenance is preserved.'),
        source_kind: stringSchema('Source kind; defaults to agent_report.'),
        authority_level: stringSchema('Authority level; defaults to agent_reported.'),
        principal: stringSchema('Declared principal. Required for local agent-authored submissions and verified against NARADA_AGENT_ID.'),
        target_locus: stringSchema('Target locus; defaults to local_site.'),
        submit: { type: 'boolean', description: 'When true, submit through canonical inbox admission. Defaults to false, returning a dry-run submission preview.' },
      }, ['source_ref']),
    },
    {
      name: 'inbox_submit_observation',
      description: 'Submit a small/simple observation envelope through canonical Narada inbox admission. For long prose, arrays, cross-Site submissions, or likely resubmission, use inbox_stage_submission_workflow or mcp_payload_create plus inbox_submit_typed_envelope with payload_ref.',
      inputSchema: objectSchema({
        target_site_root: stringSchema('Explicit target Site root. Defaults to server site root.'),
        source_ref: { type: 'string' },
        title: { type: 'string' },
        summary: stringSchema('Observation summary.'),
        source_kind: stringSchema('Source kind; defaults to agent_report.'),
        authority_level: stringSchema('Authority level; defaults to agent_reported.'),
        principal: stringSchema('Declared principal. Required for local agent-authored submissions and verified against NARADA_AGENT_ID.'),
        target_locus: stringSchema('Target locus; defaults to local_site.'),
        evidence: arrayStringSchema('Evidence lines.'),
        proposal: arrayStringSchema('Proposal lines.'),
        recommendation: stringSchema('Recommendation.'),
        dry_run: { type: 'boolean' },
      }, ['source_ref', 'title']),
    },
    {
      name: 'inbox_submit_typed_envelope',
      description: 'Submit a typed envelope payload through canonical Narada inbox admission.',
      inputSchema: objectSchema({
        target_site_root: stringSchema('Explicit target Site root. Defaults to server site root.'),
        source_ref: { type: 'string' },
        kind: stringSchema('Envelope kind; defaults to observation.'),
        payload: { type: 'object', additionalProperties: true },
        payload_file: stringSchema('Existing JSON payload file.'),
        payload_ref: stringSchema('Optional immutable transient payload ref such as mcp_payload:<id>@v1. Loaded payload is validated like inline arguments.'),
        source_kind: stringSchema('Source kind; defaults to agent_report.'),
        authority_level: stringSchema('Authority level; defaults to agent_reported.'),
        principal: stringSchema('Declared principal. Required for local agent-authored submissions and verified against NARADA_AGENT_ID.'),
        target_locus: stringSchema('Target locus; defaults to local_site.'),
        dry_run: { type: 'boolean' },
      }, ['source_ref']),
    },
    ...listPayloadTools(),
    ...listCommandTools(),
    ...listOutputTools(),
    {
      name: 'inbox_list',
      description:
        'List inbox envelopes. Supports filtering by status, kind, date range, and pagination. Status defaults to "received". Use status "all" to disable filtering.',
      inputSchema: objectSchema({
        target_site_root: stringSchema('Explicit target Site root. Defaults to server site root.'),
        status: stringSchema('Filter by status (e.g. received, processed, promoted, deferred, rejected, all). Defaults to received.'),
        kind: stringSchema(`Filter by envelope kind (${INBOX_ENVELOPE_KINDS.join(', ')}).`),
        postal: stringSchema('Filter postal classification. Use true/postal for Site Mail envelopes, false for ordinary envelopes.'),
        source_site_id: stringSchema('Filter by postal source_site_id.'),
        mail_id: stringSchema('Filter by postal mail_id.'),
        target_site_id: stringSchema('Filter by postal target_site_id.'),
        since: stringSchema('ISO 8601 start date.'),
        until: stringSchema('ISO 8601 end date.'),
        limit: { type: 'integer', description: 'Max results. Defaults to 50.' },
        offset: { type: 'integer', description: 'Result offset. Defaults to 0.' },
      }),
    },
    {
      name: 'inbox_next',
      description:
        'Return the highest-priority unprocessed inbox envelope using authority > kind > recency scoring. CAPA requests are ordinary envelopes until promoted by architect/operator authority. Returns has_work=false when inbox is empty. preferred_kinds can be used to boost priority. agent_id enables role-based filtering.',
      inputSchema: objectSchema({
        target_site_root: stringSchema('Explicit target Site root. Defaults to server site root.'),
        preferred_kinds: arrayStringSchema('Boost priority for these kinds.'),
        agent_id: stringSchema('Agent identity (e.g. andrey-user.Bob). When provided, role-based kind filtering is applied.'),
      }),
    },
    {
      name: 'inbox_show',
      description: 'Retrieve full envelope by envelope_id. Supports prefix matching.',
      inputSchema: objectSchema({
        target_site_root: stringSchema('Explicit target Site root. Defaults to server site root.'),
        envelope_id: { type: 'string', description: 'Envelope ID or prefix.' },
      }, ['envelope_id']),
    },
    {
      name: 'inbox_acknowledge',
      description:
        'Acknowledge an inbox envelope: mark it as reviewed with no action required. Appends envelope_acknowledged to the admission log and updates filesystem status.',
      inputSchema: objectSchema({
        target_site_root: stringSchema('Explicit target Site root. Defaults to server site root.'),
        envelope_id: { type: 'string', description: 'Envelope ID to acknowledge.' },
        principal: stringSchema('Principal performing the acknowledgment. Defaults to current agent identity.'),
        reason: stringSchema('Optional reason for acknowledgment.'),
      }, ['envelope_id']),
    },
    {
      name: 'inbox_dismiss',
      description:
        'Dismiss an inbox envelope: mark it as rejected or superseded. Appends envelope_dismissed to the admission log and updates filesystem status. Requires a reason.',
      inputSchema: objectSchema({
        target_site_root: stringSchema('Explicit target Site root. Defaults to server site root.'),
        envelope_id: { type: 'string', description: 'Envelope ID to dismiss.' },
        principal: stringSchema('Principal performing the dismissal. Defaults to current agent identity.'),
        reason: { type: 'string', description: 'Required reason for dismissal.' },
      }, ['envelope_id', 'reason']),
    },
    {
      name: 'inbox_create_capa',
      description:
        'Create a governed CAPA from authored material in one operation: submit a typed inbox envelope, promote it, and return concise stable IDs. Accepts payload_ref for long CAPA prose.',
      inputSchema: objectSchema({
        target_site_root: stringSchema('Explicit target Site root. Defaults to server site root.'),
        principal: stringSchema('Architect/operator principal creating the CAPA.'),
        identity_override_reason: stringSchema('Required when using principal=operator override.'),
        source_ref: stringSchema('Source ref for the generated inbox envelope. Defaults to capa:create:<uuid>.'),
        source_kind: stringSchema('Source kind for the generated envelope. Defaults to agent_report.'),
        authority_level: stringSchema('Authority level for the generated envelope. Defaults to agent_reported.'),
        target_locus: stringSchema('Target locus for the generated envelope. Defaults to local_site.'),
        kind: stringSchema('Envelope kind to submit. Defaults to observation.'),
        payload_ref: stringSchema('Immutable MCP payload ref carrying these arguments for long CAPA prose.'),
        concept_name: stringSchema('CAPA concept/title.'),
        summary: stringSchema('Optional CAPA summary. Defaults to concept_name.'),
        recurrence_evidence: arrayStringSchema('Evidence refs or summaries justifying the CAPA.'),
        severity: { type: 'integer', description: 'CAPA severity. Defaults to 60.' },
        corrective_action: stringSchema('Corrective action summary.'),
        preventive_action: stringSchema('Preventive action summary.'),
        reason: stringSchema('Creation/promotion rationale.'),
      }, ['principal', 'concept_name', 'corrective_action', 'preventive_action']),
    },
    {
      name: 'inbox_amend_capa',
      description:
        'Append a governed clarification/amendment to an existing active CAPA without creating a sibling CAPA. Accepts payload_ref for long clarification prose.',
      inputSchema: objectSchema({
        target_site_root: stringSchema('Explicit target Site root. Defaults to server site root.'),
        capa_id: { type: 'string', description: 'Existing active CAPA/envelope ID to amend.' },
        principal: stringSchema('Architect/operator principal amending the CAPA.'),
        identity_override_reason: stringSchema('Required when using principal=operator override.'),
        payload_ref: stringSchema('Immutable MCP payload ref carrying these arguments for long amendment prose.'),
        amendment_kind: stringSchema('Amendment kind. Defaults to clarification.'),
        clarification: stringSchema('Clarification or amendment text.'),
        recurrence_evidence: arrayStringSchema('Additional evidence refs or summaries.'),
        corrective_action_delta: stringSchema('Optional corrective-action delta.'),
        preventive_action_delta: stringSchema('Optional preventive-action delta.'),
        reason: stringSchema('Amendment rationale.'),
      }, ['capa_id', 'principal', 'clarification']),
    },
    {
      name: 'inbox_promote_capa',
      description:
        'Promote an admitted ordinary inbox envelope into the governed CAPA queue. Restricted to architect/operator principals; appends an admission-log promotion event without rewriting envelope JSON.',
      inputSchema: objectSchema({
        target_site_root: stringSchema('Explicit target Site root. Defaults to server site root.'),
        envelope_id: { type: 'string', description: 'Envelope ID to promote.' },
        principal: stringSchema('Architect/operator principal performing the promotion.'),
        identity_override_reason: stringSchema('Required when using principal=operator override.'),
        severity: { type: 'integer', description: 'CAPA severity. Defaults from source envelope severity.' },
        concept_name: stringSchema('CAPA concept/title. Defaults from envelope title.'),
        recurrence_evidence: arrayStringSchema('Evidence refs or summaries justifying promotion.'),
        corrective_action: stringSchema('Corrective action summary.'),
        preventive_action: stringSchema('Preventive action summary.'),
        reason: stringSchema('Promotion rationale.'),
      }, ['envelope_id', 'principal']),
    },
    {
      name: 'inbox_export_disposition_ledger',
      description:
        'Export terminal inbox disposition events from the admission log to a tracked portable ledger. Does not require committing ignored envelope JSON projections.',
      inputSchema: objectSchema({
        target_site_root: stringSchema('Explicit target Site root. Defaults to server site root.'),
        output_path: stringSchema('Tracked repo-relative output path. Defaults to kb/operations/inbox-disposition-ledger.json.'),
        site_id: stringSchema('Site id to record in the export. Defaults to Narada.'),
      }),
    },
    {
      name: 'capability_next',
      description:
        'Return the highest-priority capability review obligation from operator-surfaces/capability-announcements.json. Scores overdue (85), within 14 days (60), and pending within 30 days (40). Returns has_work=false when no reviews are due.',
      inputSchema: objectSchema({
        target_site_root: stringSchema('Explicit target Site root. Defaults to server site root.'),
      }),
    },
    {
      name: 'capability_review_complete',
      description:
        'Record completion of a local capability announcement review in operator-surfaces/capability-announcements.json, the local User Site authority for capability review state.',
      inputSchema: objectSchema({
        target_site_root: stringSchema('Explicit target Site root. Defaults to server site root.'),
        capability_id: { type: 'string', description: 'Capability announcement ID to mark reviewed.' },
        reviewer_agent_id: { type: 'string', description: 'Agent identity that performed the review.' },
        verdict: stringSchema('Review verdict. One of completed, accepted, accepted_with_notes, rejected, or needs_work. Defaults to completed.'),
        review_status: stringSchema('Resulting review status. One of pending, completed, or overdue. Defaults to completed except needs_work -> pending.'),
        notes: stringSchema('Optional review notes.'),
        evidence_ref: stringSchema('Optional evidence reference such as a task number, report ID, or artifact path.'),
        reviewed_at: stringSchema('Optional ISO timestamp. Defaults to current time.'),
        recovery_truthfulness: {
          type: 'object',
          description: 'Required when serious-failure CAPA closeout is triggered. Fields: known_facts, inferences, uncertainty, changed, not_changed, remaining_work, evidence_limits, capa_open_status, state.',
          additionalProperties: true,
        },
      }, ['capability_id', 'reviewer_agent_id']),
    },
    {
      name: 'capa_queue',
      description:
        'Return all active CAPAs (Corrective And Preventive Actions) sorted by severity. Combines capability-announcements pending review with inbox envelopes promoted by admission-log CAPA promotion events. Includes recurrence evidence counts.',
      inputSchema: objectSchema({
        target_site_root: stringSchema('Explicit target Site root. Defaults to server site root.'),
      }),
    },
    {
      name: 'capa_related',
      description:
        'Return compact duplicate/sibling/related CAPA candidates for a proposed CAPA concept, evidence terms, or inbox envelope before deciding whether to submit or promote new CAPA material.',
      inputSchema: objectSchema({
        target_site_root: stringSchema('Explicit target Site root. Defaults to server site root.'),
        envelope_id: stringSchema('Optional source inbox envelope ID to use as query material.'),
        concept_name: stringSchema('Proposed CAPA concept/title.'),
        title: stringSchema('Alias for concept_name.'),
        summary: stringSchema('Optional summary text to include in the relatedness query.'),
        evidence_terms: arrayStringSchema('Evidence terms, source refs, or incident phrases to match against active CAPAs.'),
        recurrence_evidence: arrayStringSchema('Alias for evidence_terms, matching inbox_promote_capa vocabulary.'),
        exclude_capa_id: stringSchema('Optional CAPA/envelope ID to exclude from results.'),
        limit: { type: 'integer', description: 'Maximum candidates to return. Defaults to 8, max 25.' },
      }),
    },
  ];
}

function verifyInboxPrincipal(args, { sourceKind = 'agent_report', action, allowOperatorOverride = false } = {}) {
  const declaredPrincipal = stringField(args, 'principal');
  const verifiedPrincipal = process.env.NARADA_AGENT_ID?.trim() || null;
  const startEventId = process.env.NARADA_AGENT_START_EVENT_ID?.trim() || null;
  const overrideReason = stringField(args, 'identity_override_reason');
  const isAgentAuthored = sourceKind === 'agent_report';

  if (!declaredPrincipal) {
    throw new Error(`inbox_identity_principal_required: ${action}`);
  }

  if (allowOperatorOverride && declaredPrincipal === 'operator') {
    if (!overrideReason) throw new Error(`inbox_identity_override_reason_required: ${action}`);
    return {
      schema: 'narada.inbox.identity_verification.v0',
      verdict: 'accepted_operator_override',
      verification_state: 'override_recorded',
      action,
      declared_principal: declaredPrincipal,
      verified_principal: verifiedPrincipal,
      verification_source: verifiedPrincipal ? 'NARADA_AGENT_ID' : 'operator_override',
      agent_start_event_id: startEventId,
      override_reason: overrideReason,
    };
  }

  if (!verifiedPrincipal) {
    throw new Error(`inbox_identity_unbound: ${action}`);
  }

  if (declaredPrincipal !== verifiedPrincipal) {
    throw new Error(`inbox_identity_mismatch: declared_principal=${declaredPrincipal}; verified_principal=${verifiedPrincipal}; action=${action}`);
  }

  return {
    schema: 'narada.inbox.identity_verification.v0',
    verdict: isAgentAuthored ? 'accepted_verified' : 'accepted_verified_non_agent_source',
    verification_state: 'verified',
    action,
    declared_principal: declaredPrincipal,
    verified_principal: verifiedPrincipal,
    verification_source: 'NARADA_AGENT_ID',
    agent_start_event_id: startEventId,
  };
}

function payloadFileFromCommand(command) {
  if (!Array.isArray(command)) return null;
  const index = command.indexOf('--payload-file');
  return index >= 0 ? command[index + 1] ?? null : null;
}

function byteSizeOfFile(path) {
  if (!path || !existsSync(path)) return null;
  return Buffer.byteLength(readFileSync(path), 'utf8');
}

function parseArgs(args) {
  const parsed = { help: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === '--site-root' && next) {
      parsed.siteRoot = next;
      i += 1;
    } else if (arg === '--site-id' && next) {
      parsed.siteId = next;
      i += 1;
    } else if (arg === '--site-kind' && next) {
      parsed.siteKind = next;
      i += 1;
    } else if (arg === '--narada-cli' && next) {
      parsed.naradaCli = next;
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    }
  }
  return parsed;
}

function parseJsonInput(input) {
  const trimmed = input.trim();
  if (!trimmed) return [];
  if (/^Content-Length:/im.test(trimmed)) return parseContentLengthMessages(input);
  return trimmed
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

function drainJsonRpcFrames(input) {
  if (/^Content-Length:/im.test(input)) return drainContentLengthFrames(input);
  const lines = input.split(/\r?\n/);
  const remaining = lines.pop() ?? '';
  return {
    requests: lines.filter((line) => line.trim().length > 0).map((line) => JSON.parse(line)),
    remaining,
  };
}

function parseJsonRpcInput(input) {
  return parseJsonInput(input);
}

function drainContentLengthFrames(input) {
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
    requests.push(JSON.parse(input.slice(bodyStart, bodyEnd)));
    cursor = bodyEnd;
    while (input[cursor] === '\r' || input[cursor] === '\n') cursor += 1;
  }
  return { requests, remaining: input.slice(cursor) };
}

function parseContentLengthMessages(input) {
  const parsed = drainContentLengthFrames(input);
  if (parsed.remaining.trim().length > 0) throw new Error('mcp_stdio_trailing_frame_bytes');
  return parsed.requests;
}

function objectSchema(properties, required = []) {
  return {
    type: 'object',
    properties,
    additionalProperties: false,
    ...(required.length > 0 ? { required } : {}),
  };
}

function stringSchema(description) {
  return { type: 'string', description };
}

function arrayStringSchema(description) {
  return { type: 'array', items: { type: 'string' }, description };
}

function parseJsonOrNull(value) {
  try {
    return JSON.parse(String(value).replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stringField(record, key) {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function requiredString(record, key) {
  const value = stringField(record, key);
  if (!value) throw new Error(`missing_required_tool_argument: ${key}`);
  return value;
}

function booleanField(record, key) {
  return typeof record[key] === 'boolean' ? record[key] : undefined;
}

function stringArrayField(record, key) {
  const value = record[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim());
}

function numberSchema(description) {
  return { type: 'number', description };
}

function numberField(record, key) {
  const value = record[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return undefined;
}
