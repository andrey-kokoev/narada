#!/usr/bin/env node
/**
 * agent-context-mcp-server.mjs
 *
 * MCP facade over agent-context materializations.
 *
 * Tools:
 *   agent_context_doctor          — readiness check + conceptual_role
 *   agent_context_show_event      — full event materialization by event_id
 *   agent_context_show_bootstrap  — bootstrap packet by event_id
 *   agent_context_checkpoint      — write durable agent state checkpoint
 *   agent_context_rehydrate       — retrieve latest checkpoint for agent
 *   agent_context_start_session   — validate and materialize an agent session start
 *   agent_context_list_sessions   — query agent_start_events for operational visibility
 *   agent_context_hydrate_current — single-command startup hydration for bound sessions
 *   agent_context_startup_sequence — canonical operator-facing startup hydration command
 *   startup_sequence              — legacy operator-facing startup hydration alias
 *   agent_context_lifecycle_history — read recent lifecycle transition ledger rows

 *   agent_context_lifecycle_show  — read one lifecycle transition ledger row
 *   agent_context_restart         — request/status for external stdio MCP restart
 *
 * Guardrails:
 *   - Mutations are limited to session start materialization and checkpoints
 *   - No "latest by identity" query for events; checkpoints are per-agent latest
 *   - MCP is facade only; does not own authority
 *
 * Usage:
 *   node tools/agent-context/agent-context-mcp-server.mjs --site-root <path>
 */

import Database from './sqlite-database.mjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  agentIdentityDisplay,
  buildAgentIdentityRefV2,
  resolveAgentIdentityRef,
} from '@narada2/agent-identity';
import { runHiddenPostureCommandSync } from '@narada2/process-launch-posture';
import { buildReground, formatMarkdown } from './doctrinal-reground.mjs';
import * as hydrationService from './agent-context-hydration-service.mjs';
import * as inquirySpaceService from './inquiry-space-service.mjs';
import * as conceptLifecycleService from './concept-protocol-lifecycle-service.mjs';
import {
  EXPECTED_TOOL_GROUPS,
  EXPECTED_TOOL_NAMES,
  PERMISSIVE_OBJECT_OUTPUT_SCHEMA,
  STARTUP_TOOL_INLINE_LIMIT,
  STARTUP_TOOL_NAMES,
  TOOLS,
  startupSequenceInputSchema,
} from './agent-context-tool-catalog.mjs';
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
  resultShow,
  resolveToolPayloadArgs,
} from '../../site-common-tools/compat/mcp-payload-file.legacy-site.mjs';
import {
  acknowledgeMcpRestartRequest,
  buildMcpFreshnessStatus,
  readJsonFile as readMcpFreshnessJsonFile,
  reconcileNoRequestMcpFreshnessMarker,
  writeMcpRestartRequest,
  writeMcpRuntimeInstanceObservation,
} from '../../site-common-tools/src/mcp-freshness-service.mjs';
import { discoverCodexSessionEvidence, extractCodexSessionEvidencePacket, verifyCodexExactResume } from './codex-session-evidence.mjs';
import {
  buildRoleBindingProjection,
  completeCodexSessionAdmission,
  defaultCapabilityPolicy,
  ensureAgentStartEventCompatibility,
  listAgentStartSessions,
  materializeAgentSessionStart,
  openAgentContextDb,
  validateIdentityAgainstRoster,
} from './session-start.mjs';
import {
  ORIENTATION_DDL,
  buildIdentityUnverifiedOrientationHint,
  createSiteEvolutionOrientationSnapshot,
  historySiteEvolutionOrientation,
  latestSiteEvolutionOrientation,
  loadRehydrationOnboardingCard,
  showSiteEvolutionOrientation,
} from './site-evolution-orientation.mjs';
import { buildMcpRuntimeRegistryStatus } from '../../site-common-tools/src/operator-surface/mcp-runtime-instance-registry.mjs';
import {
  NARADA_PC_SITE_LOCUS,
  NARADA_USER_SITE_LOCUS,
} from '../../site-common-tools/src/site-locus-shim.mjs';
import { taskLifecycleTools } from '../../task-lifecycle-tools/src/task-mcp-tool-registry.mjs';
import { resolveTaskLifecycleMcpServer as resolveTaskLifecycleMcpServerForSite } from '../../site-common-tools/src/task-lifecycle-mcp-resolution.mjs';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'narada-andrey-agent-context-mcp';
const SERVER_VERSION = '0.0.2';
const SERVER_BOOTED_AT = new Date().toISOString();

function buildToolResult({ siteRoot, toolName, value, payloadSource, isError = false }) {
  const isStartupTool = STARTUP_TOOL_NAMES.has(toolName);
  const contentResult = buildOutputRefToolContent({
    siteRoot,
    toolName,
    value: attachPayloadSource(value, payloadSource),
    limit: isStartupTool ? STARTUP_TOOL_INLINE_LIMIT : undefined,
    isError,
  });
  if (!isStartupTool || isError) return contentResult;
  return {
    ...contentResult,
    structuredContent: attachPayloadSource(value, payloadSource),
  };
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        result[key] = argv[i + 1];
        i++;
      } else {
        result[key] = true;
      }
    }
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));
const siteRoot = resolve(args['site-root'] ?? process.cwd());
const dbPath = resolve(process.env.NARADA_AGENT_CONTEXT_DB || join(siteRoot, '.ai', 'state', 'agent-context.sqlite'));
recordAgentContextRuntimeObservation();

let db = null;

try {
  if (existsSync(dbPath)) {
    db = new Database(dbPath);
    ensureAgentStartEventCompatibility(db);
    db.exec(CHECKPOINT_DDL);
    migrateCheckpointsToHistory(db);
  }
} catch {
  db = null;
}

function recordAgentContextRuntimeObservation() {
  try {
    writeMcpRuntimeInstanceObservation({
      siteRoot,
      surfaceId: 'agent-context-mcp.local',
      serverName: SERVER_NAME,
      serverEntryPoint: 'tools/agent-context/agent-context-mcp-server.mjs',
      serverBootedAt: SERVER_BOOTED_AT,
      watchedPaths: ['tools/agent-context', 'tools/mcp-freshness-service.mjs'],
      restartRequestPath: join(siteRoot, '.ai', 'tmp', 'agent-context-restart-request.json'),
      baselinePath: join(siteRoot, '.ai', 'tmp', 'agent-context-mcp-baseline.json'),
      freshnessEvidencePath: '.ai/runtime/agent-context-mcp',
      transport: { type: 'stdio', runtime_kind: 'node-stdio' },
    });
  } catch (error) {
    process.stderr.write(`Failed to record agent-context MCP runtime observation: ${error.message}\n`);
  }
}

function migrateCheckpointsToHistory(database) {
  // One-time migration: if agent_checkpoint_history is newly created and
  // agent_checkpoints has multiple rows per agent, archive older ones.
  try {
    const historyExists = database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'agent_checkpoint_history'").get();
    if (!historyExists) return;

    const count = database.prepare("SELECT COUNT(*) AS cnt FROM agent_checkpoint_history").get();
    if (count.cnt > 0) return; // Already migrated

    const rows = database.prepare(`
      SELECT c.* FROM agent_checkpoints c
      WHERE c.checkpoint_id NOT IN (
        SELECT checkpoint_id FROM agent_checkpoints
        GROUP BY agent_id
        HAVING MAX(checkpoint_at)
      )
    `).all();

    const insert = database.prepare(`
      INSERT INTO agent_checkpoint_history (
        history_id, checkpoint_id, agent_id, session_id, checkpoint_at,
        active_task_json, files_touched_json, key_decisions_json,
        open_questions_json, git_head, payload_json, archived_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    for (const row of rows) {
      insert.run(
        `hist_${randomUUID().replace(/-/g, '')}`,
        row.checkpoint_id,
        row.agent_id,
        row.session_id,
        row.checkpoint_at,
        row.active_task_json,
        row.files_touched_json,
        row.key_decisions_json,
        row.open_questions_json,
        row.git_head,
        row.payload_json,
        now
      );
    }

    // Delete archived rows from agent_checkpoints
    if (rows.length > 0) {
      const ids = rows.map((r) => r.checkpoint_id);
      const placeholders = ids.map(() => '?').join(',');
      database.prepare(`DELETE FROM agent_checkpoints WHERE checkpoint_id IN (${placeholders})`).run(...ids);
    }
  } catch {
    // Ignore migration errors; best-effort only
  }
}

let mcpOutputMode = 'line';

function writeMcpFrame(response) {
  const body = JSON.stringify(response);
  if (mcpOutputMode === 'framed') {
    process.stdout.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
    return;
  }
  process.stdout.write(body + '\n');
}

function sendResponse(request, result) {
  const response = {
    jsonrpc: '2.0',
    id: request.id,
    result,
  };
  writeMcpFrame(response);
}

function sendError(request, code, message) {
  const response = {
    jsonrpc: '2.0',
    id: request.id,
    error: { code, message },
  };
  writeMcpFrame(response);
}

async function handleRequest(request) {
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

  if (request.method === 'notifications/initialized') {
    return;
  }

  if (request.method !== 'tools/call') {
    sendError(request, -32601, `Method not found: ${request.method}`);
    return;
  }

  const { name, arguments: rawToolArgs } = request.params;

  try {
    enforceInlinePayloadLimit({ toolName: name, args: rawToolArgs, allowPayloadCreation: true });
    const payloadResolution = resolveToolPayloadArgs({
      siteRoot,
      toolName: name,
      args: rawToolArgs,
      allowedTools: ['agent_context_checkpoint'],
    });
    const toolArgs = payloadResolution.args;
    let result;
    switch (name) {
      case 'agent_context_doctor':
        result = agentContextDoctor();
        break;
      case 'agent_context_pause':
        result = await agentContextPause(toolArgs);
        break;
      case 'agent_context_show_event':
        result = agentContextShowEvent(toolArgs);
        break;
      case 'agent_context_show_bootstrap':
        result = agentContextShowBootstrap(toolArgs);
        break;
      case 'agent_context_checkpoint':
        result = agentContextCheckpoint(toolArgs);
        break;
      case 'mcp_payload_create':
        result = payloadCreate({ siteRoot, args: toolArgs });
        break;
      case 'mcp_payload_show':
        result = payloadShow({ siteRoot, args: toolArgs });
        break;
      case 'mcp_output_show':
        result = outputShow({ siteRoot, args: toolArgs });
        break;
      case 'mcp_payload_derive':
        result = payloadDerive({ siteRoot, args: toolArgs });
        break;
      case 'mcp_payload_validate':
        result = payloadValidate({ siteRoot, args: toolArgs });
        break;
      case 'mcp_command_create':
        result = commandCreate({ siteRoot, args: toolArgs });
        break;
      case 'mcp_command_show':
        result = commandShow({ siteRoot, args: toolArgs });
        break;
      case 'mcp_command_validate':
        result = commandValidate({ siteRoot, args: toolArgs });
        break;
      case 'mcp_command_submit':
        result = commandSubmit({ siteRoot, args: toolArgs });
        break;
      case 'mcp_result_show':
        result = resultShow({ siteRoot, args: toolArgs });
        break;
      case 'agent_context_rehydrate':
        result = agentContextRehydrate(toolArgs);
        break;
      case 'agent_context_doctrinal_grounding':
        result = agentContextDoctrinalGrounding(toolArgs);
        break;
      case 'agent_context_whoami':
        result = agentContextWhoami(toolArgs);
        break;
      case 'agent_context_start_session':
        result = agentContextStartSession(toolArgs);
        break;
      case 'agent_context_list_sessions':
        result = agentContextListSessions(toolArgs);
        break;
      case 'agent_context_complete_codex_admission':
        result = agentContextCompleteCodexAdmission(toolArgs);
        break;
      case 'agent_context_discover_codex_session_evidence':
        result = agentContextDiscoverCodexSessionEvidence(toolArgs);
        break;
      case 'agent_context_extract_codex_session_evidence_packet':
        result = agentContextExtractCodexSessionEvidencePacket(toolArgs);
        break;
      case 'agent_context_verify_codex_exact_resume':
        result = agentContextVerifyCodexExactResume(toolArgs);
        break;
      case 'agent_context_hydrate_current':
      case 'agent_context_startup_sequence':
        result = agentContextHydrateCurrent(toolArgs);
        break;
      case 'agent_context_lifecycle_history':
        result = agentContextLifecycleHistory(toolArgs);
        break;
      case 'agent_context_lifecycle_show':
        result = agentContextLifecycleShow(toolArgs);
        break;
      case 'agent_context_isn_create':
        result = agentContextIsnCreate(toolArgs);
        break;
      case 'agent_context_isn_list':
        result = agentContextIsnList(toolArgs);
        break;
      case 'agent_context_isn_show':
        result = agentContextIsnShow(toolArgs);
        break;
      case 'agent_context_isn_transition':
        result = agentContextIsnTransition(toolArgs);
        break;
      case 'agent_context_is_movement_trace_record':
        result = agentContextIsMovementTraceRecord(toolArgs);
        break;
      case 'agent_context_is_movement_trace_list':
        result = agentContextIsMovementTraceList(toolArgs);
        break;
      case 'agent_context_is_movement_trace_show':
        result = agentContextIsMovementTraceShow(toolArgs);
        break;
      case 'agent_context_tool_surface_readiness':
        result = agentContextToolSurfaceReadiness();
        break;
      case 'agent_context_restart':
        result = agentContextRestart(toolArgs);
        break;
      case 'agent_context_grounding_latest':
        result = agentContextGroundingLatest(toolArgs);
        break;
      case 'agent_context_grounding_history':
        result = agentContextGroundingHistory(toolArgs);
        break;
      case 'agent_context_grounding_show':
        result = agentContextGroundingShow(toolArgs);
        break;
      case 'agent_context_site_evolution_orientation_create':
        result = agentContextSiteEvolutionOrientationCreate(toolArgs);
        break;
      case 'agent_context_site_evolution_orientation_latest':
        result = latestSiteEvolutionOrientation({ db });
        break;
      case 'agent_context_site_evolution_orientation_history':
        result = historySiteEvolutionOrientation({ db, limit: toolArgs?.limit });
        break;
      case 'agent_context_site_evolution_orientation_show':
        result = showSiteEvolutionOrientation({ db, snapshotId: toolArgs?.snapshot_id });
        break;
      case 'agent_context_concept_lifecycle_record':
        result = agentContextConceptLifecycleRecord(toolArgs);
        break;
      case 'agent_context_concept_lifecycle_history':
        result = agentContextConceptLifecycleHistory(toolArgs);
        break;
      case 'agent_context_concept_lifecycle_current':
        result = agentContextConceptLifecycleCurrent(toolArgs);
        break;
      case 'agent_context_rehydration_onboarding_card':
        result = {
          status: 'ok',
          not_action_authority: true,
          card: loadRehydrationOnboardingCard({ siteRoot, db }),
        };
        break;
      default:
        sendError(request, -32602, `Unknown tool: ${name}`);
        return;
    }
    sendResponse(request, buildToolResult({
      siteRoot,
      toolName: name,
      value: result,
      payloadSource: payloadResolution.payloadSource,
    }));
  } catch (error) {
    sendResponse(request, buildToolResult({
      siteRoot,
      toolName: name,
      value: { status: 'error', message: error.message },
      payloadSource: null,
      isError: true,
    }));
  }
}

async function agentContextPause(args = {}) {
  const requestedSeconds = Number(args.seconds);
  const reason = typeof args.reason === 'string' ? args.reason.trim() : '';
  const maxSeconds = 30;

  if (!Number.isFinite(requestedSeconds) || requestedSeconds <= 0) {
    throw new Error('seconds must be a finite number greater than 0');
  }
  if (requestedSeconds > maxSeconds) {
    throw new Error(`seconds must be <= ${maxSeconds}`);
  }
  if (!reason) {
    throw new Error('reason is required');
  }

  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const requestedMs = Math.round(requestedSeconds * 1000);
  await sleep(requestedMs);
  const endedAtMs = Date.now();

  return {
    schema: 'narada.agent_context.pause_result.v0',
    status: 'paused',
    authority_posture: 'low_authority_session_wait_only',
    reason,
    requested_seconds: requestedSeconds,
    max_seconds: maxSeconds,
    started_at: startedAt,
    ended_at: new Date(endedAtMs).toISOString(),
    actual_ms: endedAtMs - startedAtMs,
    actual_seconds: (endedAtMs - startedAtMs) / 1000,
  };
}

function agentContextDoctor() {
  const dbExists = existsSync(dbPath);
  let tablesPresent = false;
  let tableList = [];

  if (db) {
    try {
      const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
      tableList = rows.map((r) => r.name);
      tablesPresent = [
        'agent_start_events',
        'execution_context_materializations',
        'intelligence_context_materializations',
        'proposal_records',
        'residual_records',
        'agent_events',
        'agent_lifecycle_transitions',
        'agent_checkpoints',
        'agent_checkpoint_history',
        'agent_grounding_events',
        'inquiry_space_nodes',
        'inquiry_space_node_events',
        'inquiry_space_movement_sequences',
        'inquiry_space_movement_traces',
        'concept_protocol_lifecycle_events',
        'concept_protocol_lifecycle_current_state',
        'site_evolution_orientation_snapshots',
      ].every((t) => tableList.includes(t));
    } catch {
      tablesPresent = false;
    }
  }

  return {
    status: 'ok',
    authority_posture: 'facade_with_checkpoint',
    db_path: dbPath,
    db_exists: dbExists,
    tables_present: tablesPresent,
    tables_found: tableList,
    conceptual_role: {
      execution_context_relation: 'reads execution-context materializations; writes agent checkpoints',
      intelligence_context_relation: 'reads event-scoped intelligence-context materializations',
      authority_state_relation: 'does not own authority; reads agent-start traces and writes durability checkpoints',
    },
    tool_surface_readiness: agentContextToolSurfaceReadiness(),
  };
}

function agentContextStartSession(toolArgs) {
  const identity = toolArgs?.identity;
  if (!identity) {
    throw new Error('identity is required');
  }

  const dryRun = toolArgs?.dry_run === true || toolArgs?.dry_run === 'true';
  const result = materializeAgentSessionStart({
    siteRoot,
    identity,
    runtime: toolArgs?.runtime ?? 'kimi',
    cwd: toolArgs?.cwd ?? siteRoot,
    dbPath,
    dryRun,
  });

  if (!dryRun && !db) {
    db = openAgentContextDb(siteRoot, dbPath);
    db.exec(CHECKPOINT_DDL);
    migrateCheckpointsToHistory(db);
  }

  return result;
}

function agentContextCompleteCodexAdmission(toolArgs) {
  const admissionId = stringField(toolArgs ?? {}, 'admission_id');
  const identity = stringField(toolArgs ?? {}, 'identity');
  const codexSessionId = stringField(toolArgs ?? {}, 'codex_session_id');
  const codexSessionFile = stringField(toolArgs ?? {}, 'codex_session_file');
  const operatorOverrideRef = stringField(toolArgs ?? {}, 'operator_override_ref');
  if (!admissionId) throw new Error('admission_id is required');
  if (!identity) throw new Error('identity is required');
  if (!codexSessionId) throw new Error('codex_session_id is required');

  const envAgentId = process.env.NARADA_AGENT_ID || null;
  const envAdmissionId = process.env.NARADA_CODEX_ADMISSION_ID || null;
  const envIssues = [];
  if (envAgentId !== identity) {
    envIssues.push({
      code: 'narada_agent_id_mismatch',
      expected: identity,
      actual: envAgentId,
    });
  }
  if (envAdmissionId !== admissionId) {
    envIssues.push({
      code: 'narada_codex_admission_id_mismatch',
      expected: admissionId,
      actual: envAdmissionId,
    });
  }
  if (envIssues.length > 0 && !operatorOverrideRef) {
    throw new Error(`codex_admission_completion_env_mismatch: ${JSON.stringify(envIssues)}`);
  }

  const result = completeCodexSessionAdmission({
    siteRoot,
    admissionId,
    identity,
    codexSessionId,
    codexSessionFile: codexSessionFile ?? null,
    cwd: stringField(toolArgs ?? {}, 'cwd') ?? siteRoot,
    dbPath,
    evidence: {
      ...(objectField(toolArgs ?? {}, 'evidence') ?? {}),
      completion_env_guard: {
        status: envIssues.length === 0 ? 'passed' : 'operator_override',
        issues: envIssues,
        operator_override_ref: operatorOverrideRef ?? null,
      },
    },
  });

  if (!db) {
    db = openAgentContextDb(siteRoot, dbPath);
    db.exec(CHECKPOINT_DDL);
    migrateCheckpointsToHistory(db);
  }

  return result;
}

function agentContextDiscoverCodexSessionEvidence(toolArgs) {
  return discoverCodexSessionEvidence({
    siteRoot,
    admissionId: stringField(toolArgs ?? {}, 'admission_id'),
    identity: stringField(toolArgs ?? {}, 'identity'),
    codexHome: stringField(toolArgs ?? {}, 'codex_home') ?? undefined,
    limit: integerField(toolArgs ?? {}, 'limit') ?? 200,
  });
}

function agentContextExtractCodexSessionEvidencePacket(toolArgs) {
  return extractCodexSessionEvidencePacket({
    siteRoot,
    admissionId: stringField(toolArgs ?? {}, 'admission_id'),
    identity: stringField(toolArgs ?? {}, 'identity'),
    codexHome: stringField(toolArgs ?? {}, 'codex_home') ?? undefined,
    searchText: stringField(toolArgs ?? {}, 'search_text'),
    outputPath: stringField(toolArgs ?? {}, 'output_path') ?? undefined,
    limit: integerField(toolArgs ?? {}, 'limit') ?? 200,
  });
}

function agentContextVerifyCodexExactResume(toolArgs) {
  return verifyCodexExactResume({
    codexSessionId: stringField(toolArgs ?? {}, 'codex_session_id'),
    codexSessionFile: stringField(toolArgs ?? {}, 'codex_session_file'),
    admissionId: stringField(toolArgs ?? {}, 'admission_id'),
  });
}

function agentContextHydrateCurrent(toolArgs) {
  const hydratedAt = new Date().toISOString();
  const outputMode = normalizeHydrateOutputMode(stringField(toolArgs ?? {}, 'output') ?? 'summary');
  const includeRawEvidence = outputMode === 'debug' || toolArgs?.include_raw_evidence === true || toolArgs?.include_raw_evidence === 'true';
  const checkpointStartup = toolArgs?.checkpoint_startup === true || toolArgs?.checkpoint_startup === 'true';
  const whoami = agentContextWhoami({});
  if (whoami.status !== 'ok' || whoami.source !== 'NARADA_AGENT_ID' || whoami.confidence !== 'high' || !whoami.identity) {
    const actionSafety = buildHydrateActionSafety({
      agentId: whoami.identity,
      hydratedAt,
      whoami,
      checkpoint: null,
      bootstrap: null,
      taskLifecycleNext: null,
      recommendedNextAction: null,
      workboardFreshnessInput: { last_workboard_check_at: null, source: 'none' },
      operatorOverrideRef: stringField(toolArgs ?? {}, 'operator_override_ref'),
      mcpPressure: null,
    });
    const unverified = {
      status: 'identity_unverified',
      schema: 'narada.agent_context.hydrate_current.v0',
      hydrated_at: hydratedAt,
      whoami,
      action_safety: actionSafety,
      message: 'Current-session hydration requires mechanical identity binding through NARADA_AGENT_ID. Start the agent through agent-start and retry.',
      required_next_action: 'agent_session_binding_unavailable',
      identity_unverified_orientation_hint: buildIdentityUnverifiedOrientationHint(),
    };
    const readiness = buildStartupReadinessVerdict({
      hydratedAt,
      agentId: whoami.identity,
      role: whoami.role,
      whoami,
      verifiedBadge: null,
      checkpoint: null,
      groundingStatus: 'unavailable',
      groundingEventId: null,
      onboardingCard: null,
      taskLifecycleNext: null,
      recommendedNextAction: null,
      operatorOverrideRef: stringField(toolArgs ?? {}, 'operator_override_ref'),
    });
    const readinessWithActionSafety = { ...readiness, action_safety: actionSafety };
    return outputMode === 'readiness'
      ? readinessWithActionSafety
      : { ...unverified, startup_readiness: readinessWithActionSafety };
  }

  const agentId = whoami.identity;
  const agentIdentityRef = whoami.agent_identity_ref ?? resolveAgentIdentityRef(agentId, {
    site_id: process.env.NARADA_SITE_ID || null,
    role: whoami.role,
  }).value ?? buildAgentIdentityRefV2({
    identity_scope: process.env.NARADA_SITE_ID
      ? { kind: 'narada_site', site_id: process.env.NARADA_SITE_ID }
      : { kind: 'unscoped' },
    local_agent_id: agentId,
    role: whoami.role,
    legacy_agent_id: agentId,
  });
  const eventId = process.env.NARADA_AGENT_START_EVENT_ID || null;
  const rehydrate = safeCall(() => agentContextRehydrate({ agent_id: agentId }));
  const checkpoint = rehydrate.ok ? rehydrate.value : { status: 'error', message: rehydrate.error };
  const bootstrap = safeCall(() => agentContextShowBootstrap(eventId ? { event_id: eventId } : { identity: agentId }));
  const capabilityPolicy = bootstrap.ok
    ? bootstrap.value.execution_context_summary?.capability_policy ?? null
    : null;
  const suppliedLastWorkboardCheckAt = stringField(toolArgs ?? {}, 'last_workboard_check_at');
  const checkpointLastWorkboardCheckAt = checkpoint?.status === 'ok'
    ? checkpoint.last_workboard_check_at ?? null
    : null;
  const effectiveLastWorkboardCheckAt = suppliedLastWorkboardCheckAt ?? checkpointLastWorkboardCheckAt;
  const workboardFreshnessSource = suppliedLastWorkboardCheckAt
    ? 'tool_argument'
    : checkpointLastWorkboardCheckAt
      ? 'checkpoint'
      : 'none';
  const taskLifecycleNext = callTaskLifecycleNextMcp({
    agentId,
    limit: integerField(toolArgs ?? {}, 'limit') ?? 8,
    lastWorkboardCheckAt: effectiveLastWorkboardCheckAt,
  });
  const doctrineDetailSource = stringField(toolArgs ?? {}, 'doctrine_detail') ? 'tool_argument' : 'default';
  const doctrineDetail = normalizeDoctrineDetail(stringField(toolArgs ?? {}, 'doctrine_detail') ?? 'reground');
  const groundingTrigger = normalizeGroundingTrigger(stringField(toolArgs ?? {}, 'trigger') ?? 'startup');
  const operatorOverrideRef = stringField(toolArgs ?? {}, 'operator_override_ref');
  const grounding = hydrationService.buildHydrationGrounding({
    detail: doctrineDetail,
    whoami,
    capabilityPolicy,
    checkpoint,
    taskLifecycleNext,
    regroundResult: safeCall(() => buildReground(siteRoot)),
  });
  const groundingEvent = safeCall(() => emitGroundingEvent({
    agentId,
    sessionId: eventId,
    trigger: groundingTrigger,
    doctrineDetail,
    grounding,
    operatorOverrideRef,
  }));
  const onboardingCard = loadRehydrationOnboardingCard({ siteRoot, db });
  const siteLiftOrientation = buildSiteLiftOrientation({
    role: whoami.role,
    bootstrap: bootstrap.ok ? bootstrap.value : null,
  });
  const locusOrientation = buildHydrationLocusOrientation({
    bootstrap: bootstrap.ok ? bootstrap.value : null,
    sessionSiteRoot: siteRoot,
  });

  const recommendedNextAction = taskLifecycleNext?.recommendation ?? null;
  let hostRuntimeRegistry = buildHydrateHostRuntimeRegistryStatus();
  let mcpRestartReadiness = buildHydrateMcpRestartReadiness({ taskLifecycleNext, hostRuntimeRegistry });
  const mcpRestartAutoAcknowledgement = autoAcknowledgeHydrateMcpRefreshes({
    mcpRestartReadiness,
    taskLifecycleNext,
  });
  if (mcpRestartAutoAcknowledgement.acknowledged.length > 0) {
    hostRuntimeRegistry = buildHydrateHostRuntimeRegistryStatus();
    mcpRestartReadiness = buildHydrateMcpRestartReadiness({ taskLifecycleNext, hostRuntimeRegistry });
  }
  const mcpPressure = buildMcpStaleSurfacePressure(mcpRestartReadiness, hostRuntimeRegistry);
  const mcpSiteReadiness = buildSiteOwnedMcpReadiness(mcpPressure, mcpRestartReadiness, hostRuntimeRegistry);
  const actionSafety = buildHydrateActionSafety({
    agentId,
    hydratedAt,
    whoami,
    checkpoint,
    bootstrap: bootstrap.ok ? bootstrap.value : null,
    taskLifecycleNext,
    recommendedNextAction,
    workboardFreshnessInput: {
      last_workboard_check_at: effectiveLastWorkboardCheckAt,
      source: workboardFreshnessSource,
    },
    operatorOverrideRef,
    mcpPressure,
  });
  const provenance = {
    checkpoint: checkpoint?.status === 'ok'
      ? 'rehydrated'
      : checkpoint?.status === 'no_checkpoint'
        ? 'none'
        : 'unavailable',
    bootstrap: bootstrap.ok
      ? eventId
        ? 'current_start_event'
        : 'latest_for_identity'
      : 'unavailable',
    task_lifecycle_next: taskLifecycleNext?.status === 'ok' ? 'live_mcp_call' : 'unavailable',
    workboard_freshness_input_source: workboardFreshnessSource,
    doctrinal_grounding: grounding.provenance,
    doctrine_detail_source: doctrineDetailSource,
    grounding_event: groundingEvent.ok ? 'emitted' : 'unavailable',
    rehydration_onboarding_card: onboardingCard.status,
  };

  const fullPayload = {
    status: 'ok',
    schema: 'narada.agent_context.hydrate_current.v0',
    hydrated_at: hydratedAt,
    identity: agentId,
    agent_identity_ref: agentIdentityRef,
    role: whoami.role,
    role_binding: whoami.role_binding ?? null,
    confidence: whoami.confidence,
    source: whoami.source,
    agent_start_event: eventId,
    whoami,
    verified_badge: {
      agent_id: agentId,
      agent_identity_ref: agentIdentityRef,
      role: whoami.role,
      role_binding: whoami.role_binding ?? null,
      identity_source: whoami.source,
      confidence: whoami.confidence,
      agent_start_event: eventId,
      capability_policy_summary: buildCapabilityPolicySummary(capabilityPolicy),
    },
    checkpoint,
    bootstrap: bootstrap.ok ? bootstrap.value : { status: 'error', message: bootstrap.error },
    capability_policy: capabilityPolicy,
    capability_envelope: buildCapabilityEnvelopeProjection(capabilityPolicy),
    capability_policy_summary: buildCapabilityPolicySummary(capabilityPolicy),
    required_posture: buildRequiredPosture(capabilityPolicy),
    doctrine_detail: doctrineDetail,
    grounding_required: true,
    grounding_status: grounding.status,
    grounding_layers: grounding.layers,
    grounding_event_id: groundingEvent.ok ? groundingEvent.value.event_id : null,
    grounding_event_error: groundingEvent.ok ? null : groundingEvent.error,
    doctrinal_grounding: grounding.payload,
    rehydration_onboarding_card: onboardingCard,
    site_lift_orientation: siteLiftOrientation,
    locus_orientation: locusOrientation,
    site_loci: locusOrientation.site_loci,
    session_control_surface: locusOrientation.session_control_surface,
    requested_work_substrate: locusOrientation.requested_work_substrate,
    task_lifecycle_next: taskLifecycleNext,
    recommended_next_action: recommendedNextAction,
    mcp_pressure: mcpPressure,
    mcp_site_readiness: mcpSiteReadiness,
    mcp_restart_auto_acknowledgement: mcpRestartAutoAcknowledgement,
    action_safety: actionSafety,
    workboard_freshness_input: {
      last_workboard_check_at: effectiveLastWorkboardCheckAt,
      source: workboardFreshnessSource,
    },
    provenance,
    resume_brief: hydrationService.buildResumeBrief({
      agentId,
      role: whoami.role,
      checkpoint,
      taskLifecycleNext,
      recommendedNextAction,
      hydratedAt,
      workboardFreshnessInput: {
        last_workboard_check_at: effectiveLastWorkboardCheckAt,
        source: workboardFreshnessSource,
      },
      provenance,
      groundingEvent: groundingEvent.ok ? groundingEvent.value : null,
    }),
    startup_instruction: 'Obey capability_policy. Treat session_control_surface as orientation/control evidence only; it is not requested-work substrate authority. For short duty-loop nudges such as go on, next, continue, or proceed, preserve the last explicit operator locus correction and require explicit target_site_root before mutation when cwd/operator-stated locus disagrees with an MCP default target. If task_lifecycle_next is live and has agent_actionable_recommendation, it is the normal workloop authority: use workloop_summary/recommended_next_action and act through MCP lifecycle surfaces instead of running inbox/CAPA/capability fallback checks or diagnostic churn. If the task_lifecycle_next payload is large, read only enough to obtain workloop_summary or recommended_next_action, then inspect/claim the recommended task. If the operator asks where we can go, where to go next, what options exist, previous, or downstream, apply the IS Navigation Choice Protocol before reducing the answer to recommended_next_action. Use recommended_next_action as an execution-order signal, not the full inquiry topology. If recommended_next_action is null, do not declare standby from the task workboard alone; check inbox_next, capa_queue, and capability_next first. If a needed capability is missing from MCP, stop and report the missing MCP capability instead of using native substrate fallback.',
  };

  const startupReadiness = buildStartupReadinessVerdict({
    hydratedAt,
    agentId,
    role: whoami.role,
    whoami,
    verifiedBadge: fullPayload.verified_badge,
    checkpoint,
    groundingStatus: grounding.status,
    groundingEventId: groundingEvent.ok ? groundingEvent.value.event_id : null,
    groundingEventError: groundingEvent.ok ? null : groundingEvent.error,
    onboardingCard,
    siteLiftOrientation,
    taskLifecycleNext,
    recommendedNextAction,
    operatorOverrideRef,
    actionSafety,
    hostRuntimeRegistry,
    mcpRestartReadiness,
    mcpPressure,
    mcpSiteReadiness,
  });
  fullPayload.startup_readiness = maybeCheckpointStartup({
    checkpointStartup,
    readiness: startupReadiness,
    agentId,
    hydratedAt,
    checkpoint,
    groundingEventId: groundingEvent.ok ? groundingEvent.value.event_id : null,
    onboardingCard,
    taskLifecycleNext,
    recommendedNextAction,
  });
  fullPayload.startup_readiness.action_safety = actionSafety;
  fullPayload.resume_brief = {
    ...fullPayload.resume_brief,
    continuation_blockers: fullPayload.startup_readiness.blockers?.active ?? [],
    checkpoint_continuation_blockers_historical: checkpoint?.status === 'ok'
      ? checkpoint.continuation_blockers ?? []
      : [],
    state_reconciliation: {
      schema: 'narada.agent_context.state_reconciliation.v0',
      posture: 'remembered_state_is_not_current_authority',
      checkpoint_blockers_status: fullPayload.startup_readiness.blockers?.active?.length > 0
        ? 'critical_unreconciled'
        : 'reconciled_or_absent',
      mcp_restart_status: fullPayload.startup_readiness.mcp_pressure?.severity === 'critical'
        ? 'critical_nonconformance'
        : 'clear_or_noncritical',
    },
  };

  emitLifecycleTransitionEvent({
    agentId,
    sessionId: eventId,
    transition: 'hydrate',
    sourceZone: 'identity',
    targetZone: 'orientation',
    authorityBasis: actionSafety.authority_basis,
    guardResults: actionSafety.guard_results,
    evidenceRefs: actionSafety.evidence_refs,
    recommendedAction: recommendedNextAction,
    authorizedAction: actionSafety.authorized_action,
    actionSafety,
    createdAt: hydratedAt,
  });
  emitLifecycleTransitionEvent({
    agentId,
    sessionId: eventId,
    transition: 'orient',
    sourceZone: 'orientation',
    targetZone: 'task_authority',
    authorityBasis: actionSafety.authority_basis,
    guardResults: [
      { guard: 'live_workboard_loaded', status: taskLifecycleNext?.status === 'ok' ? 'pass' : 'warn', evidence_ref: 'task_lifecycle_next' },
      { guard: 'recommendation_authority_separated', status: actionSafety.authorized_action ? 'pass' : 'residual', evidence_ref: 'action_safety' },
    ],
    evidenceRefs: [
      ...actionSafety.evidence_refs,
      taskLifecycleNext?.generated_at ? `workboard_generated_at:${taskLifecycleNext.generated_at}` : 'workboard_generated_at:unknown',
    ],
    recommendedAction: recommendedNextAction,
    authorizedAction: actionSafety.authorized_action,
    actionSafety,
    createdAt: hydratedAt,
  });

  if (outputMode === 'readiness') {
    return includeRawEvidence
      ? fullPayload.startup_readiness
      : compactStartupReadiness(fullPayload.startup_readiness, buildHydrationRawEvidenceRefs({
        mcpPressure,
        mcpSiteReadiness,
        mcpRestartReadiness,
        hostRuntimeRegistry,
        doctrinalGrounding: grounding.payload,
        siteLiftOrientation,
        rehydrationOnboardingCard: onboardingCard,
      }));
  }
  if (includeRawEvidence) return fullPayload;
  return compactHydratePayload(fullPayload, buildHydrationRawEvidenceRefs({
    mcpPressure,
    mcpSiteReadiness,
    mcpRestartReadiness,
    hostRuntimeRegistry,
    doctrinalGrounding: grounding.payload,
    siteLiftOrientation,
    rehydrationOnboardingCard: onboardingCard,
  }), { outputMode });
}

function compactHydratePayload(fullPayload, rawEvidenceRefs, { outputMode }) {
  const startupReadiness = compactStartupReadiness(fullPayload.startup_readiness, rawEvidenceRefs);
  const compact = {
    status: fullPayload.status,
    schema: fullPayload.schema,
    output_mode: outputMode,
    raw_evidence_policy: 'large_runtime_evidence_is_ref_backed_unless_output_debug_or_include_raw_evidence',
    hydrated_at: fullPayload.hydrated_at,
    identity: fullPayload.identity,
    agent_identity_ref: fullPayload.agent_identity_ref,
    role: fullPayload.role,
    role_binding: fullPayload.role_binding,
    confidence: fullPayload.confidence,
    source: fullPayload.source,
    agent_start_event: fullPayload.agent_start_event,
    whoami: fullPayload.whoami,
    verified_badge: fullPayload.verified_badge,
    checkpoint: compactCheckpoint(fullPayload.checkpoint),
    bootstrap: compactBootstrap(fullPayload.bootstrap),
    capability_policy: fullPayload.capability_policy,
    capability_envelope: fullPayload.capability_envelope,
    capability_policy_summary: fullPayload.capability_policy_summary,
    required_posture: fullPayload.required_posture,
    doctrine_detail: fullPayload.doctrine_detail,
    grounding_required: fullPayload.grounding_required,
    grounding_status: fullPayload.grounding_status,
    grounding_layers: fullPayload.grounding_layers,
    grounding_event_id: fullPayload.grounding_event_id,
    grounding_event_error: fullPayload.grounding_event_error,
    doctrinal_grounding: compactDoctrinalGrounding(fullPayload.doctrinal_grounding, rawEvidenceRefs.doctrinal_grounding),
    rehydration_onboarding_card: compactRehydrationOnboardingCard(fullPayload.rehydration_onboarding_card, rawEvidenceRefs.rehydration_onboarding_card),
    site_lift_orientation: compactSiteLiftOrientation(fullPayload.site_lift_orientation, rawEvidenceRefs.site_lift_orientation, {
      includeTopArtifacts: outputMode === 'summary',
    }),
    locus_orientation: fullPayload.locus_orientation,
    site_loci: fullPayload.site_loci,
    session_control_surface: fullPayload.session_control_surface,
    requested_work_substrate: fullPayload.requested_work_substrate,
    task_lifecycle_next: compactTaskLifecycleNext(fullPayload.task_lifecycle_next),
    recommended_next_action: fullPayload.recommended_next_action,
    mcp_pressure: compactMcpPressure(fullPayload.mcp_pressure, rawEvidenceRefs.mcp_pressure),
    mcp_site_readiness: compactSiteOwnedMcpReadiness(fullPayload.mcp_site_readiness, rawEvidenceRefs.mcp_site_readiness),
    mcp_restart_auto_acknowledgement: fullPayload.mcp_restart_auto_acknowledgement,
    action_safety: compactActionSafety(fullPayload.action_safety),
    workboard_freshness_input: fullPayload.workboard_freshness_input,
    provenance: fullPayload.provenance,
    resume_brief: fullPayload.resume_brief,
    startup_instruction: fullPayload.startup_instruction,
    startup_readiness: startupReadiness,
    evidence_refs: {
      ...rawEvidenceRefs,
      mcp_restart_readiness: rawEvidenceRefs.mcp_restart_readiness,
      host_runtime_registry: rawEvidenceRefs.host_runtime_registry,
      doctrinal_grounding: rawEvidenceRefs.doctrinal_grounding,
      site_lift_orientation: rawEvidenceRefs.site_lift_orientation,
      rehydration_onboarding_card: rawEvidenceRefs.rehydration_onboarding_card,
    },
  };
  if (outputMode === 'summary') {
    return {
      status: compact.status,
      schema: compact.schema,
      output_mode: compact.output_mode,
      raw_evidence_policy: compact.raw_evidence_policy,
      hydrated_at: compact.hydrated_at,
      identity: compact.identity,
      agent_identity_ref: compact.agent_identity_ref,
      role: compact.role,
      verified_badge: compact.verified_badge,
      checkpoint: compact.checkpoint,
      capability_policy_summary: compact.capability_policy_summary,
      doctrine_detail: compact.doctrine_detail,
      grounding_status: compact.grounding_status,
      grounding_event_id: compact.grounding_event_id,
      site_lift_orientation: compact.site_lift_orientation,
      locus_orientation: compact.locus_orientation,
      task_lifecycle_next: compact.task_lifecycle_next,
      recommended_next_action: compact.recommended_next_action,
      mcp_pressure: compact.mcp_pressure,
      mcp_site_readiness: compact.mcp_site_readiness,
      mcp_restart_auto_acknowledgement: compact.mcp_restart_auto_acknowledgement,
      action_safety: compact.action_safety,
      resume_brief: compact.resume_brief,
      startup_instruction: compact.startup_instruction,
      startup_readiness: compact.startup_readiness,
      evidence_refs: compact.evidence_refs,
    };
  }
  return compact;
}

function compactStartupReadiness(readiness, rawEvidenceRefs = {}) {
  if (!readiness || typeof readiness !== 'object') return readiness;
  const compact = {
    ...readiness,
    pc_runtime_registry: compactHostRuntimeRegistry(readiness.pc_runtime_registry),
    mcp_restart_readiness: compactMcpRestartReadinessList(readiness.mcp_restart_readiness, rawEvidenceRefs.mcp_restart_readiness),
    mcp_pressure_ref: rawEvidenceRefs.mcp_pressure ?? null,
    mcp_site_readiness_ref: rawEvidenceRefs.mcp_site_readiness ?? null,
  };
  delete compact.action_safety;
  delete compact.mcp_pressure;
  delete compact.mcp_site_readiness;
  return compact;
}

function buildHydrationRawEvidenceRefs({
  mcpPressure,
  mcpSiteReadiness,
  mcpRestartReadiness,
  hostRuntimeRegistry,
  doctrinalGrounding,
  siteLiftOrientation,
  rehydrationOnboardingCard,
}) {
  return {
    mcp_pressure: materializeHydrationEvidenceRef('agent_context_hydrate_current.mcp_pressure.raw', mcpPressure),
    mcp_site_readiness: materializeHydrationEvidenceRef('agent_context_hydrate_current.mcp_site_readiness.raw', mcpSiteReadiness),
    mcp_restart_readiness: materializeHydrationEvidenceRef('agent_context_hydrate_current.mcp_restart_readiness.raw', mcpRestartReadiness),
    host_runtime_registry: materializeHydrationEvidenceRef('agent_context_hydrate_current.host_runtime_registry.raw', hostRuntimeRegistry),
    doctrinal_grounding: materializeHydrationEvidenceRef('agent_context_hydrate_current.doctrinal_grounding.raw', doctrinalGrounding),
    site_lift_orientation: materializeHydrationEvidenceRef('agent_context_hydrate_current.site_lift_orientation.raw', siteLiftOrientation),
    rehydration_onboarding_card: materializeHydrationEvidenceRef('agent_context_hydrate_current.rehydration_onboarding_card.raw', rehydrationOnboardingCard),
  };
}

function materializeHydrationEvidenceRef(toolName, value) {
  const result = buildOutputRefToolContent({
    siteRoot,
    toolName,
    value,
    limit: 200,
  });
  const text = result?.content?.[0]?.text;
  try {
    const parsed = JSON.parse(text);
    if (parsed?.output_ref) {
      return {
        ref: parsed.output_ref,
        full_output_char_length: parsed.full_output_char_length ?? JSON.stringify(value, null, 2).length,
        inline_limit: parsed.inline_limit ?? 1,
      };
    }
  } catch {
    // Fall through to the local size-only record.
  }
  return {
    ref: null,
    full_output_char_length: JSON.stringify(value, null, 2).length,
    inline_limit: 1,
  };
}

function compactMcpPressure(mcpPressure, rawEvidenceRef = null) {
  if (!mcpPressure || typeof mcpPressure !== 'object') return mcpPressure;
  return {
    schema: 'narada.mcp.stale_surface_pressure.summary.v0',
    raw_schema: mcpPressure.schema ?? null,
    status: mcpPressure.status ?? null,
    site_loci: mcpPressure.site_loci ?? null,
    pressure_kind: mcpPressure.pressure_kind ?? null,
    severity: mcpPressure.severity ?? null,
    summary: mcpPressure.summary ?? null,
    counts: mcpPressure.counts ?? mcpPressure.readiness_accounting?.counts ?? {},
    affected_surfaces: (mcpPressure.surfaces ?? []).map(compactMcpReadinessSurface),
    critical_dispositions: (mcpPressure.surfaces ?? [])
      .map((surface) => ({ surface, disposition: surface.disposition ?? buildMcpRestartDisposition(surface) }))
      .filter(({ disposition }) => disposition?.terminal_blocker === true)
      .map(({ surface, disposition }) => ({
        surface_id: surface.surface_id ?? null,
        server_name: surface.server_name ?? null,
        disposition_status: disposition.status ?? null,
        required_external_action: disposition.required_external_action ?? null,
      })),
    pc_runtime_registry_status: mcpPressure.pc_runtime_registry_status ?? null,
    pc_runtime_registry_ref: mcpPressure.pc_runtime_registry_ref ?? null,
    next_actions: mcpPressure.next_actions ?? [],
    is_navigation_pressure: mcpPressure.is_navigation_pressure === true,
    raw_evidence_ref: rawEvidenceRef,
  };
}

function compactSiteOwnedMcpReadiness(mcpSiteReadiness, rawEvidenceRef = null) {
  if (!mcpSiteReadiness || typeof mcpSiteReadiness !== 'object') return mcpSiteReadiness;
  return {
    schema: 'narada.mcp.site_owned_readiness.summary.v0',
    raw_schema: mcpSiteReadiness.schema ?? null,
    status: mcpSiteReadiness.status ?? null,
    site_loci: mcpSiteReadiness.site_loci ?? null,
    authority_site_locus: mcpSiteReadiness.authority_site_locus ?? null,
    pc_runtime_locus: mcpSiteReadiness.pc_runtime_locus ?? null,
    scope: mcpSiteReadiness.scope ?? null,
    registry_status: mcpSiteReadiness.registry_status ?? null,
    counts: mcpSiteReadiness.counts ?? {},
    local_blockers: (mcpSiteReadiness.local_blockers ?? []).map(compactMcpReadinessSurface),
    local_advisory_debt: (mcpSiteReadiness.local_advisory_debt ?? []).map(compactMcpReadinessSurface),
    foreign_substrate_advisory: (mcpSiteReadiness.foreign_substrate_advisory ?? []).map(compactMcpReadinessSurface),
    operator_summary: mcpSiteReadiness.operator_summary ?? null,
    next_actions: mcpSiteReadiness.next_actions ?? [],
    raw_evidence_ref: rawEvidenceRef,
  };
}

function compactMcpRestartReadinessList(readiness, rawEvidenceRef = null) {
  const surfaces = Array.isArray(readiness) ? readiness : [];
  const compactSurfaces = surfaces.map(compactMcpReadinessSurface);
  const nonClearSurfaces = compactSurfaces.filter((surface) => (
    surface.pending_restart === true
    || surface.stale_live_surface_possible === true
    || surface.disposition_status !== 'clear'
    || surface.restart_request_state !== 'no_restart_request'
  ));
  return {
    schema: 'narada.mcp.restart_readiness.summary.v0',
    counts: {
      total: compactSurfaces.length,
      clear: compactSurfaces.length - nonClearSurfaces.length,
      non_clear: nonClearSurfaces.length,
      pending_restart: compactSurfaces.filter((surface) => surface.pending_restart === true).length,
      stale_live_surface_possible: compactSurfaces.filter((surface) => surface.stale_live_surface_possible === true).length,
    },
    non_clear_surfaces: nonClearSurfaces,
    raw_evidence_ref: rawEvidenceRef,
  };
}

function compactDoctrinalGrounding(grounding, rawEvidenceRef = null) {
  if (!grounding || typeof grounding !== 'object') return grounding;
  return {
    schema: grounding.schema ?? null,
    status: grounding.status ?? null,
    mode: grounding.mode ?? null,
    grounding_status: grounding.grounding_status ?? grounding.status ?? null,
    generated_at: grounding.generated_at ?? null,
    grounding_layers: grounding.grounding_layers ?? null,
    corpus_status: grounding.corpus_status ?? null,
    posture_summary: grounding.posture_summary ?? null,
    doctrine_catalog_count: Array.isArray(grounding.doctrine_catalog) ? grounding.doctrine_catalog.length : null,
    ccc_coordinate_count: Array.isArray(grounding.ccc_coordinates) ? grounding.ccc_coordinates.length : null,
    has_ias_mapping: Boolean(grounding.ias_mapping),
    has_review_protocol: Boolean(grounding.review_protocol),
    has_source_excerpts: Boolean(grounding.source_excerpts),
    raw_evidence_ref: rawEvidenceRef,
  };
}

function compactRehydrationOnboardingCard(onboardingCard, rawEvidenceRef = null) {
  if (!onboardingCard || typeof onboardingCard !== 'object') return onboardingCard;
  return {
    schema: onboardingCard.schema ?? null,
    status: onboardingCard.status ?? null,
    snapshot_id: onboardingCard.snapshot_id ?? null,
    generated_at: onboardingCard.generated_at ?? null,
    badge_guidance: onboardingCard.badge_guidance ?? null,
    authority_note: onboardingCard.authority_note ?? null,
    pause_trigger_count: Array.isArray(onboardingCard.pause_triggers) ? onboardingCard.pause_triggers.length : null,
    raw_evidence_ref: rawEvidenceRef,
  };
}

function compactActionSafety(actionSafety) {
  if (!actionSafety || typeof actionSafety !== 'object') return actionSafety;
  return {
    schema: actionSafety.schema ?? null,
    status: actionSafety.status ?? 'ok',
    transition: actionSafety.transition ?? null,
    agent_id: actionSafety.agent_id ?? null,
    identity_verified: actionSafety.identity_verified === true,
    authority_basis: actionSafety.authority_basis ?? null,
    authorized_action: actionSafety.authorized_action ?? null,
    recommended_action: actionSafety.recommended_action ?? null,
    missing_authority_reason: actionSafety.missing_authority_reason ?? null,
    activation_authority: actionSafety.activation_authority ?? null,
    guard_results: actionSafety.guard_results ?? [],
    evidence_refs: actionSafety.evidence_refs ?? [],
    reporting_guidance: actionSafety.reporting_guidance ?? null,
    standby_verification: compactStandbyVerification(actionSafety.standby_verification),
    touch_risks: actionSafety.touch_risks ?? [],
  };
}

function compactStandbyVerification(standbyVerification) {
  if (!standbyVerification || typeof standbyVerification !== 'object') return standbyVerification;
  return {
    schema: standbyVerification.schema ?? null,
    standby_verified: standbyVerification.standby_verified === true,
    no_task_workboard_action: standbyVerification.no_task_workboard_action === true,
    mcp_restart_pressure_active: standbyVerification.mcp_restart_pressure_active === true,
    corrective_debt_pressure_active: standbyVerification.corrective_debt_pressure_active === true,
    guidance: standbyVerification.guidance ?? null,
    required_before_declaring_standby: standbyVerification.required_before_declaring_standby ?? [],
    pressure_surfaces: standbyVerification.pressure_surfaces ?? [],
  };
}

function compactCheckpoint(checkpoint) {
  if (!checkpoint || typeof checkpoint !== 'object') return checkpoint;
  return {
    status: checkpoint.status ?? null,
    checkpoint_id: checkpoint.checkpoint_id ?? null,
    checkpoint_at: checkpoint.checkpoint_at ?? null,
    active_task: checkpoint.active_task ?? null,
    last_workboard_check_at: checkpoint.last_workboard_check_at ?? null,
    continuation_blockers: checkpoint.continuation_blockers ?? [],
    next_intended_action: checkpoint.next_intended_action ?? null,
    checkpoint_contamination: checkpoint.checkpoint_contamination ?? null,
  };
}

function compactBootstrap(bootstrap) {
  if (!bootstrap || typeof bootstrap !== 'object') return bootstrap;
  if (bootstrap.status && bootstrap.status !== 'ok') return bootstrap;
  return {
    status: bootstrap.status ?? 'ok',
    agent_start_event: bootstrap.agent_start_event ?? null,
    identity: bootstrap.identity ?? null,
    runtime: bootstrap.runtime ?? null,
    execution_context_summary: {
      cwd: bootstrap.execution_context_summary?.cwd ?? null,
      runtime: bootstrap.execution_context_summary?.runtime ?? null,
      role_binding: bootstrap.execution_context_summary?.role_binding ?? null,
      capability_policy: bootstrap.execution_context_summary?.capability_policy ?? null,
      mcp_servers: bootstrap.execution_context_summary?.mcp_servers ?? [],
    },
    intelligence_context_summary: bootstrap.intelligence_context_summary ?? null,
  };
}

function compactTaskLifecycleNext(taskLifecycleNext) {
  if (!taskLifecycleNext || typeof taskLifecycleNext !== 'object') return taskLifecycleNext;
  return {
    status: taskLifecycleNext.status ?? null,
    generated_at: taskLifecycleNext.generated_at ?? null,
    workboard_generated_at: taskLifecycleNext.workboard_generated_at ?? null,
    workloop_authority: taskLifecycleNext.workloop_authority ?? null,
    workloop_summary: taskLifecycleNext.workloop_summary ?? null,
    large_output_handling: taskLifecycleNext.large_output_handling ?? null,
    recommendation: taskLifecycleNext.recommendation ?? null,
    executable_work_available: taskLifecycleNext.executable_work_available ?? null,
    agent_actionable_recommendation: taskLifecycleNext.agent_actionable_recommendation ?? null,
    counts: taskLifecycleNext.counts ?? null,
    mcp_freshness: taskLifecycleNext.mcp_freshness ? compactMcpFreshness(taskLifecycleNext.mcp_freshness) : null,
  };
}

function compactMcpFreshness(freshness) {
  return {
    schema: freshness.schema ?? null,
    server_name: freshness.server_name ?? null,
    server_entrypoint: freshness.server_entrypoint ?? null,
    pending_restart: freshness.pending_restart === true,
    stale_live_surface_possible: freshness.stale_live_surface_possible === true,
    live_process: freshness.live_process ?? null,
    restart_request: freshness.restart_request
      ? { state: freshness.restart_request.state ?? null, path: freshness.restart_request.path ?? null }
      : null,
    host_registry_reference: freshness.host_registry_reference ?? null,
  };
}

function buildHydrationLocusOrientation({ bootstrap = null, sessionSiteRoot }) {
  const executionContext = bootstrap?.execution_context_summary ?? {};
  const cwd = executionContext.cwd ?? bootstrap?.cwd ?? null;
  const siteLoci = buildCanonicalSiteLoci({ userSiteRoot: sessionSiteRoot });
  const operatorStatedRoot = process.env.NARADA_OPERATOR_STATED_SITE_ROOT
    || process.env.NARADA_REQUESTED_WORK_ROOT
    || process.env.NARADA_TARGET_SITE_ROOT
    || null;
  return {
    schema: 'narada.agent_context.locus_orientation.v0',
    site_loci: siteLoci,
    session_control_surface: {
      site_root: sessionSiteRoot,
      site_locus: siteLoci.user_site_locus,
      cwd,
      identity_source: 'agent_start_event_or_live_session',
      authority_semantics: 'orientation_and_control_surface_only',
    },
    requested_work_substrate: {
      status: operatorStatedRoot ? 'operator_stated' : 'not_inferred_from_startup',
      operator_stated_root: operatorStatedRoot,
      rule: 'Startup hydration, agent identity, and task workboard surfaces do not by themselves select the Site or repository to mutate.',
      short_nudge_rule: 'Short duty-loop nudges preserve the last explicit operator locus correction; they do not infer target locus from this startup packet.',
    },
    mutation_preflight: {
      required_when: [
        'cwd differs from MCP default target root',
        'operator-stated locus differs from MCP default target root',
        'the requested action would mutate task, inbox, chapter, lifecycle, dispatch, evidence, or publication state',
      ],
      required_argument: 'target_site_root',
    },
  };
}

function buildCanonicalSiteLoci({ userSiteRoot = siteRoot, pcSiteRoot = process.env.NARADA_PC_SITE_ROOT || null } = {}) {
  return {
    schema: 'narada.site_loci.canonical.v0',
    user_site_locus: NARADA_USER_SITE_LOCUS,
    user_site_root: userSiteRoot,
    pc_site_locus: NARADA_PC_SITE_LOCUS,
    pc_site_root: pcSiteRoot,
    rule: 'Site locus labels name authority domains; agent IDs and carrier/session IDs remain separate identity fields.',
  };
}

function canonicalRoot(value) {
  return resolve(String(value ?? '')).replace(/[\\/]+$/, '').toLowerCase();
}

function pathInsideRoot(pathValue, rootValue) {
  const root = canonicalRoot(rootValue);
  const candidate = canonicalRoot(pathValue);
  return candidate === root || candidate.startsWith(`${root}\\`) || candidate.startsWith(`${root}/`);
}

function collectCheckpointPathEvidence(toolArgs) {
  const evidence = [];
  const add = (field, value) => {
    if (typeof value !== 'string' || value.trim().length === 0) return;
    evidence.push({ field, value: value.trim() });
  };
  const walk = (field, value) => {
    if (value == null) return;
    if (typeof value === 'string') {
      add(field, value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(`${field}[${index}]`, item));
      return;
    }
    if (typeof value === 'object') {
      for (const [key, nested] of Object.entries(value)) {
        walk(`${field}.${key}`, nested);
      }
    }
  };

  walk('cwd', toolArgs?.cwd);
  walk('files_touched', toolArgs?.files_touched);
  walk('evidence_refs', toolArgs?.evidence_refs);
  walk('worktree_state.dirty_files', toolArgs?.worktree_state?.dirty_files);
  walk('worktree_state.cwd', toolArgs?.worktree_state?.cwd);
  walk('active_task', toolArgs?.active_task);
  walk('next_intended_action', toolArgs?.next_intended_action);
  walk('tactical_resume_notes', toolArgs?.tactical_resume_notes);
  walk('key_decisions', toolArgs?.key_decisions);
  return evidence;
}

function extractAbsolutePathCandidates(value) {
  if (typeof value !== 'string') return [];
  const candidates = [];
  const windowsPathPattern = /[A-Za-z]:[\\/][^\s"'`<>|]+(?:[\\/][^\s"'`<>|]+)*/g;
  for (const match of value.matchAll(windowsPathPattern)) {
    candidates.push(match[0]);
  }
  if (value.startsWith('/') || value.startsWith('\\\\')) {
    candidates.push(value);
  }
  return candidates;
}

function evaluateCheckpointSiteBinding(toolArgs) {
  const mismatches = [];
  const configuredSiteRoot = siteRoot;
  const targetSiteRoot = typeof toolArgs?.target_site_root === 'string' && toolArgs.target_site_root.trim().length > 0
    ? toolArgs.target_site_root.trim()
    : null;
  if (targetSiteRoot && !pathInsideRoot(targetSiteRoot, configuredSiteRoot)) {
    mismatches.push({
      kind: 'target_site_root_mismatch',
      field: 'target_site_root',
      supplied_root: targetSiteRoot,
      configured_site_root: configuredSiteRoot,
    });
  }

  for (const evidence of collectCheckpointPathEvidence(toolArgs)) {
    for (const candidate of extractAbsolutePathCandidates(evidence.value)) {
      if (!pathInsideRoot(candidate, configuredSiteRoot)) {
        mismatches.push({
          kind: 'outside_site_path_evidence',
          field: evidence.field,
          path: candidate,
          configured_site_root: configuredSiteRoot,
        });
      }
    }
  }

  if (mismatches.length === 0) {
    return { status: 'pass', site_root: configuredSiteRoot };
  }

  return {
    status: 'refuse',
    schema: 'narada.agent_context.checkpoint_site_binding_guard.v0',
    reason: 'checkpoint_payload_site_root_mismatch',
    configured_site_root: configuredSiteRoot,
    target_site_root: targetSiteRoot,
    required_authority: {
      kind: 'explicit_cross_site_checkpoint_remediation_or_target_site_local_agent_context',
      summary: 'Use the target Site agent-context MCP surface, or route a typed contamination/remediation record with explicit authority.',
    },
    mismatches,
  };
}

function buildCheckpointContamination({ checkpointId, payload }) {
  const guard = evaluateCheckpointSiteBinding(payload ?? {});
  if (guard.status !== 'refuse') {
    return {
      schema: 'narada.agent_context.checkpoint_contamination.v0',
      status: 'clear',
      checkpoint_id: checkpointId ?? null,
    };
  }

  return {
    schema: 'narada.agent_context.checkpoint_contamination.v0',
    status: 'contaminated',
    checkpoint_id: checkpointId ?? null,
    reason: guard.reason,
    configured_site_root: guard.configured_site_root,
    mismatches: guard.mismatches,
    remediation: {
      classification: 'superseded_contamination_evidence',
      rule: 'Do not treat this checkpoint as live resume authority for the target Site.',
      next_steps: [
        'Use the target Site agent-context MCP surface for fresh checkpoint memory.',
        'Route a typed remediation/observation record instead of deleting the mistaken checkpoint casually.',
      ],
    },
    known_incident_ref: JSON.stringify(payload ?? {}).includes('chk_f33f42bae1034e2dacf8e0bf7a5a769e')
      ? 'chk_f33f42bae1034e2dacf8e0bf7a5a769e'
      : null,
  };
}

function buildSiteLiftOrientation({ role, bootstrap = null }) {
  const base = {
    schema: 'narada.site_lift.orientation.v0',
    surface_id: 'site-lift-catalog-mcp.local',
    catalog_path: 'site-lift/lift-catalog.json',
    catalog_posture: 'advisory_only',
    receiving_site_must_admit: true,
    no_copy_or_install_authority: true,
  };

  if (!bootstrapHasMcpServer(bootstrap, 'site-lift-catalog-mcp.local')) {
    return {
      ...base,
      status: 'unavailable',
      role_visibility: role,
      reason: 'site_lift_catalog_mcp_not_in_current_bootstrap',
      top_artifacts: [],
      available_tools: [],
    };
  }

  const catalogFile = join(siteRoot, 'site-lift', 'lift-catalog.json');
  if (!existsSync(catalogFile)) {
    return {
      ...base,
      status: 'unavailable',
      role_visibility: role,
      reason: 'site_lift_catalog_not_found',
      top_artifacts: [],
      available_tools: [],
    };
  }

  try {
    const catalog = JSON.parse(readFileSync(catalogFile, 'utf8'));
    const artifacts = Array.isArray(catalog.artifacts) ? catalog.artifacts : [];
    return {
      ...base,
      status: 'available',
      authority_posture: catalog.authority_posture ?? 'advisory_export_manifest',
      role_visibility: role,
      summary: siteLiftOrientationSummary(role),
      available_tools: [
        'site_lift_catalog_list',
        'site_lift_catalog_show',
        'site_lift_catalog_adoption_plan',
        'site_lift_catalog_adoption_command',
      ],
      top_artifacts: artifacts.slice(0, 5).map((artifact) => ({
        artifact_id: artifact.artifact_id,
        name: artifact.name,
        version: artifact.version,
        lift_class: artifact.lift_class,
        source_locus: artifact.source_locus,
        portable_scope: artifact.portable_scope,
        includes_mcp_server: artifact.includes_mcp_server === true,
        receiving_site_must_admit: artifact.receiving_site_must_admit === true,
      })),
    };
  } catch (error) {
    return {
      ...base,
      status: 'degraded',
      role_visibility: role,
      reason: 'site_lift_catalog_invalid_json',
      message: error instanceof Error ? error.message : String(error),
      top_artifacts: [],
      available_tools: [],
    };
  }
}

function bootstrapHasMcpServer(bootstrap, serverNameOrSurfaceId) {
  const servers = bootstrap?.execution_context_summary?.mcp_servers;
  if (!Array.isArray(servers)) return false;
  return servers.some((server) => server?.name === serverNameOrSurfaceId || server?.surface_id === serverNameOrSurfaceId);
}

function siteLiftOrientationSummary(role) {
  if (role === 'resident') return 'Advisory reusable Site machinery catalog is available for local operation and repair context.';
  if (role === 'architect') return 'Advisory lift catalog is available for evaluating possible cross-Site adoption paths.';
  return 'Advisory read-only lift catalog is available for discovery; receiving-Site adoption still requires separate authority.';
}

function safeCall(fn) {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function normalizeDoctrineDetail(value) {
  const allowed = new Set(['status', 'summary', 'reground', 'full']);
  if (!allowed.has(value)) {
    throw new Error(`invalid_doctrine_detail: ${value}`);
  }
  return value;
}

function normalizeGroundingTrigger(value) {
  const allowed = new Set(['startup', 'post_compaction', 'manual_reground', 'hydration']);
  if (!allowed.has(value)) {
    throw new Error(`invalid_grounding_trigger: ${value}`);
  }
  return value;
}

function normalizeHydrateOutputMode(value) {
  const allowed = new Set(['summary', 'full', 'readiness', 'debug']);
  if (!allowed.has(value)) {
    throw new Error(`invalid_hydrate_output: ${value}`);
  }
  return value;
}

function buildHydrateActionSafety({
  agentId,
  hydratedAt,
  whoami,
  checkpoint,
  bootstrap,
  taskLifecycleNext,
  recommendedNextAction,
  workboardFreshnessInput,
  operatorOverrideRef,
  mcpPressure,
}) {
  const identityVerified = whoami?.status === 'ok'
    && whoami.source === 'NARADA_AGENT_ID'
    && whoami.confidence === 'high';
  const workboardGeneratedAt = taskLifecycleNext?.generated_at ?? taskLifecycleNext?.workboard_generated_at ?? null;
  const liveWorkboardStatus = taskLifecycleNext?.status === 'ok' ? 'fresh' : 'unavailable';
  const checkpointAt = checkpoint?.status === 'ok' ? checkpoint.checkpoint_at ?? checkpoint.checkpointed_at ?? null : null;
  const checkpointLastWorkboardCheckAt = checkpoint?.status === 'ok' ? checkpoint.last_workboard_check_at ?? null : null;
  const capabilityPolicy = bootstrap?.execution_context_summary?.capability_policy ?? null;
  const authorizedAction = deriveAuthorizedAction({ checkpoint, recommendedNextAction, operatorOverrideRef, taskLifecycleNext });
  const missingAuthorityReason = authorizedAction
    ? null
    : deriveMissingAuthorityReason({ recommendedNextAction, checkpoint, taskLifecycleNext });
  const activationAuthority = buildActivationAuthorityProjection({
    authorizedAction,
    missingAuthorityReason,
    recommendedNextAction,
    identityVerified,
    roleBinding: whoami?.role_binding ?? null,
    capabilityPolicy,
  });
  const blockers = [];
  if (!identityVerified) {
    blockers.push({ kind: 'identity_unverified', summary: 'Hydrate transition requires high-confidence NARADA_AGENT_ID binding.' });
  }
  if (taskLifecycleNext?.status !== 'ok') {
    blockers.push({ kind: 'workboard_unavailable', summary: taskLifecycleNext?.message ?? 'task_lifecycle_next is unavailable.' });
  }
  if (checkpoint?.checkpoint_contamination?.status === 'contaminated') {
    blockers.push({
      kind: 'checkpoint_contamination',
      summary: 'Loaded checkpoint contains path/root evidence for a different Site; treat it as superseded evidence, not live resume authority.',
      checkpoint_id: checkpoint.checkpoint_id ?? null,
      remediation: checkpoint.checkpoint_contamination.remediation ?? null,
    });
  }

  return {
    schema: 'narada.agent_lifecycle.action_safety.v0',
    agent_id: agentId,
    transition: 'hydrate',
    generated_at: hydratedAt,
    identity_verified: identityVerified,
    live_state_sources: {
      task_lifecycle_next: {
        status: liveWorkboardStatus,
        generated_at: workboardGeneratedAt,
        provenance: taskLifecycleNext?.status === 'ok' ? 'live_mcp_call' : 'unavailable',
      },
      bootstrap: {
        status: bootstrap ? 'loaded' : 'unavailable',
      },
      capability_policy: {
        status: capabilityPolicy ? 'loaded' : 'unavailable',
      },
    },
    authority_surfaces: {
      verified_identity: {
        status: identityVerified ? 'verified' : 'unverified',
        source: whoami?.source ?? 'none',
      },
      role_binding: whoami?.role_binding ?? {
        schema: 'narada.agent.role_binding.v0',
        agent_id: agentId ?? null,
        role_name: whoami?.role ?? null,
        binding_source: 'unavailable',
        binding_authority: 'agent_roster',
        status: 'missing',
      },
      capability_envelope: buildCapabilityEnvelopeProjection(capabilityPolicy),
      activation_authority: activationAuthority,
    },
    remembered_state_sources: {
      checkpoint: {
        status: checkpoint?.status ?? 'unknown',
        checkpoint_at: checkpointAt,
        last_workboard_check_at: checkpointLastWorkboardCheckAt,
        workboard_freshness_input: workboardFreshnessInput ?? null,
      },
    },
    recommended_action: recommendedNextAction ?? null,
    authorized_action: authorizedAction,
    activation_authority: activationAuthority,
    missing_authority_reason: missingAuthorityReason,
    reporting_guidance: buildActionSafetyReportingGuidance({ 
      recommendedAction: recommendedNextAction,
      authorizedAction,
      missingAuthorityReason,
      mcpPressure,
    }),
    standby_verification: buildStandbyVerification({
      taskLifecycleNext,
      recommendedNextAction,
      mcpPressure,
    }),
    touch_risks: [
      {
        kind: 'path_whitelist_unenforced',
        status: 'residual',
        summary: 'Per-agent path allowlists are not enforced in this slice; filesystem/touch actions still require separate MCP/policy guards.',
      },
    ],
    required_rereads: buildHydrateRequiredRereads({ checkpoint, recommendedNextAction }),
    blockers,
    authority_basis: authorizedAction?.authority_basis ?? {
      kind: 'verified_hydration',
      summary: 'Hydrate is authorized by mechanical session identity verification; downstream action authority is not implied.',
    },
    guard_results: [
      { guard: 'identity_verified', status: identityVerified ? 'pass' : 'fail', evidence_ref: 'whoami' },
      { guard: 'live_workboard_loaded', status: taskLifecycleNext?.status === 'ok' ? 'pass' : 'fail', evidence_ref: 'task_lifecycle_next' },
      { guard: 'checkpoint_site_binding', status: checkpoint?.checkpoint_contamination?.status === 'contaminated' ? 'fail' : 'pass', evidence_ref: 'checkpoint.checkpoint_contamination' },
      { guard: 'recommendation_authority_separated', status: authorizedAction ? 'pass' : 'residual', evidence_ref: 'action_safety.recommended_action' },
    ],
    evidence_refs: [
      `hydrate:${hydratedAt}`,
      identityVerified ? `agent_id:${agentId}` : 'agent_id:unverified',
      workboardGeneratedAt ? `workboard_generated_at:${workboardGeneratedAt}` : `workboard_status:${taskLifecycleNext?.status ?? 'missing'}`,
      checkpointAt ? `checkpoint_at:${checkpointAt}` : `checkpoint_status:${checkpoint?.status ?? 'missing'}`,
    ],
  };
}

function deriveAuthorizedAction({ checkpoint, recommendedNextAction, operatorOverrideRef, taskLifecycleNext }) {
  if (checkpoint?.checkpoint_contamination?.status === 'contaminated') return null;
  if (checkpoint?.status === 'ok' && checkpoint.active_task && isCheckpointActiveTaskLive({ checkpoint, taskLifecycleNext })) {
    return {
      action: 'continue_active_task',
      source: 'checkpoint.active_task+task_lifecycle_next',
      authority_basis: checkpoint.authority_basis ?? {
        kind: 'active_task_checkpoint',
        summary: 'Checkpoint active task was confirmed against live task lifecycle assignment state.',
      },
      task: checkpoint.active_task,
    };
  }
  if (operatorOverrideRef && recommendedNextAction?.action) {
    return {
      action: recommendedNextAction.action,
      source: 'operator_override_ref',
      authority_basis: {
        kind: 'operator_override_ref',
        summary: operatorOverrideRef,
      },
      task: recommendedNextAction.task ?? null,
    };
  }
  return null;
}

function isCheckpointActiveTaskLive({ checkpoint, taskLifecycleNext }) {
  const checkpointTaskNumber = checkpoint?.active_task?.task_number;
  if (!checkpointTaskNumber || taskLifecycleNext?.status !== 'ok') return false;

  const liveTaskCollections = [
    taskLifecycleNext.in_progress,
    taskLifecycleNext.needs_continuation,
  ];
  for (const collection of liveTaskCollections) {
    if (!Array.isArray(collection)) continue;
    if (collection.some((task) => Number(task?.task_number) === Number(checkpointTaskNumber))) {
      return true;
    }
  }

  return false;
}

function buildActionSafetyReportingGuidance({ recommendedAction, authorizedAction, missingAuthorityReason, mcpPressure }) {
  if (!recommendedAction?.action && mcpPressure?.status === 'active') {
    return {
      summary: `No task workboard action is available, but MCP restart pressure is active: ${mcpPressure.summary}`,
      recommended_phrase: 'External MCP restart pressure is active; do not declare standby.',
      authorized_phrase: null,
    };
  }
  if (!recommendedAction?.action) {
    return {
      summary: authorizedAction
        ? `Authorized action: ${authorizedAction.action}.`
        : 'No task workboard action recommendation is available from this hydration; standby requires checking inbox_next, capa_queue, and capability_next.',
      recommended_phrase: null,
      authorized_phrase: authorizedAction ? `Authorized action: ${authorizedAction.action}.` : null,
    };
  }

  const taskNumber = recommendedAction.task?.task_number;
  const target = taskNumber ? ` task #${taskNumber}` : '';
  const recommendedPhrase = `Workboard recommends ${recommendedAction.action}${target}.`;
  if (authorizedAction) {
    return {
      summary: `${recommendedPhrase} Authorized action: ${authorizedAction.action}${target}.`,
      recommended_phrase: recommendedPhrase,
      authorized_phrase: `Authorized action: ${authorizedAction.action}${target}.`,
    };
  }
  return {
    summary: `${recommendedPhrase} Not authorized by hydration alone: ${missingAuthorityReason ?? 'missing_authority_basis'}.`,
    recommended_phrase: recommendedPhrase,
    authorized_phrase: null,
  };
}

function buildStandbyVerification({ taskLifecycleNext, recommendedNextAction, mcpPressure }) {
  const noTaskWorkboardAction = taskLifecycleNext?.status === 'ok' && !recommendedNextAction?.action;
  const restartPressureActive = mcpPressure?.status === 'active';
  const correctiveDebtPressure = classifyCorrectiveDebtPressure(taskLifecycleNext?.corrective_debt_readiness);
  const correctiveDebtPressureActive = correctiveDebtPressure.status === 'active';
  const correctiveDebtSource = buildCorrectiveDebtSourceProjection({ taskLifecycleNext });
  return {
    schema: 'narada.agent_lifecycle.standby_verification.v0',
    no_task_workboard_action: noTaskWorkboardAction,
    mcp_restart_pressure_active: restartPressureActive,
    corrective_debt_pressure_active: correctiveDebtPressureActive,
    corrective_debt_pressure: correctiveDebtPressure,
    corrective_debt_source: correctiveDebtSource,
    standby_verified: false,
    required_before_declaring_standby: noTaskWorkboardAction
      ? [
          'inbox_next',
          'capa_queue',
          'capability_next',
          'corrective_debt_readiness',
          ...(restartPressureActive ? ['external_mcp_restart_pressure_disposition'] : []),
        ]
      : [],
    actionable_surfaces: ['task_lifecycle_next', 'inbox_next', 'capability_next'],
    pressure_surfaces: ['capa_queue', 'corrective_debt_readiness', ...(restartPressureActive ? ['mcp_restart_pressure'] : [])],
    guidance: noTaskWorkboardAction
      ? (restartPressureActive
        ? 'A null task workboard recommendation is not a standby verdict. MCP restart pressure is active, so report the external carrier/session restart need or use fresh one-shot verification before standby.'
        : correctiveDebtPressureActive
          ? 'A null task workboard recommendation is not a standby verdict. The connected Site corrective-debt read model reports unresolved high-severity CAPA/corrective debt; report connected-Site corrective pressure instead of terminal_complete. Do not imply the current agent or target repo owns that CAPA backlog unless the CAPA item says so.'
          : 'A null task workboard recommendation is not a standby verdict. Check inbox_next and capability_next for actionable work, and inspect connected-Site capa_queue/corrective_debt_readiness as pressure evidence before declaring standby.')
      : 'Task workboard action exists or workboard is unavailable; standby verification is not applicable.',
  };
}

function buildCorrectiveDebtSourceProjection({ taskLifecycleNext }) {
  const readiness = taskLifecycleNext?.corrective_debt_readiness;
  return {
    schema: 'narada.agent_lifecycle.corrective_debt_source.v0',
    scope: 'connected_site_read_model',
    source_site_root: siteRoot,
    inbox_index_db_path: taskLifecycleNext?.inbox_index?.db_path ?? null,
    authority: readiness?.authority ?? null,
    sources: readiness?.sources ?? null,
    ownership_note: 'Corrective-debt counts describe the connected Site read model. They are pressure evidence, not proof that the current agent or target repository owns every CAPA item.',
  };
}

function classifyCorrectiveDebtPressure(correctiveDebtReadiness) {
  if (!correctiveDebtReadiness || typeof correctiveDebtReadiness !== 'object') {
    return {
      status: 'unknown',
      scope: 'connected_site_read_model',
      reason: 'corrective_debt_readiness_unavailable',
    };
  }
  const counts = correctiveDebtReadiness.counts ?? {};
  const highSeverity = Number(counts.high_severity ?? 0);
  const missingCoverage = Number(counts.missing_corrective_task_coverage ?? 0);
  const state = correctiveDebtReadiness.state ?? 'unknown';
  if (highSeverity > 0 || missingCoverage > 0) {
    return {
      status: 'active',
      scope: 'connected_site_read_model',
      reason: `unresolved_corrective_debt_blocks_terminal_complete: state=${state}, high_severity=${highSeverity}, missing_corrective_task_coverage=${missingCoverage}`,
      state,
      high_severity: highSeverity,
      missing_corrective_task_coverage: missingCoverage,
      ownership_note: 'Active corrective debt is pressure evidence from the connected Site read model, not activation authority and not an ownership claim about the current agent or target repository.',
    };
  }
  return {
    status: 'clear',
    scope: 'connected_site_read_model',
    reason: 'no_high_severity_corrective_debt_detected',
    state,
  };
}

function deriveMissingAuthorityReason({ recommendedNextAction, checkpoint, taskLifecycleNext }) {
  if (taskLifecycleNext?.status !== 'ok') {
    return 'live_workboard_unavailable';
  }
  if (checkpoint?.status === 'ok' && checkpoint.active_task && !isCheckpointActiveTaskLive({ checkpoint, taskLifecycleNext })) {
    return 'checkpoint_active_task_not_confirmed_by_live_lifecycle';
  }
  if (recommendedNextAction?.action === 'claim') {
    return 'claim_recommendation_is_not_claim_authority';
  }
  if (recommendedNextAction?.action) {
    return 'recommended_action_requires_explicit_authority_basis';
  }
  if (checkpoint?.status === 'ok' && !checkpoint.active_task) {
    return 'no_active_task_or_explicit_authority';
  }
  return 'no_authorized_action_available';
}

function buildHydrateRequiredRereads({ checkpoint, recommendedNextAction }) {
  const rereads = [];
  if (recommendedNextAction?.task?.task_number) {
    rereads.push({
      kind: 'task_body',
      reason: 'Task body and acceptance criteria must be current before claim, finish, or review.',
      task_number: recommendedNextAction.task.task_number,
    });
  }
  if (checkpoint?.status === 'ok' && checkpoint.active_task?.task_number) {
    rereads.push({
      kind: 'active_task_body',
      reason: 'Active task must be re-read before continuation after hydration.',
      task_number: checkpoint.active_task.task_number,
    });
  }
  for (const filePath of checkpoint?.files_touched ?? []) {
    rereads.push({
      kind: 'file',
      reason: 'Previously touched files must be re-read before further edits after hydration.',
      path: filePath,
    });
  }
  return rereads;
}

function emitLifecycleTransitionEvent({
  agentId,
  sessionId,
  transition,
  sourceZone,
  targetZone,
  authorityBasis,
  guardResults,
  evidenceRefs,
  recommendedAction,
  authorizedAction,
  actionSafety,
  createdAt,
}) {
  if (!db) return { status: 'skipped', reason: 'agent_context_db_not_available' };
  const transitionId = `life_${randomUUID().replace(/-/g, '')}`;
  const payload = {
    schema: 'narada.agent_lifecycle.transition.v0',
    transition_id: transitionId,
    agent_id: agentId,
    session_id: sessionId ?? null,
    transition,
    source_zone: sourceZone,
    target_zone: targetZone,
    status: 'recorded',
    authority_basis: authorityBasis ?? null,
    guard_results: guardResults ?? [],
    evidence_refs: evidenceRefs ?? [],
    recommended_action: recommendedAction ?? null,
    authorized_action: authorizedAction ?? null,
    action_safety: actionSafety ?? null,
    created_at: createdAt,
  };
  const eventId = `evt_${randomUUID().replace(/-/g, '')}`;
  db.prepare(
    `INSERT INTO agent_lifecycle_transitions (
      transition_id, agent_id, session_id, transition, source_zone, target_zone, status,
      authority_basis_json, guard_results_json, evidence_refs_json,
      recommended_action_json, authorized_action_json, action_safety_json,
      payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    transitionId,
    agentId,
    sessionId ?? null,
    transition,
    sourceZone ?? null,
    targetZone ?? null,
    'recorded',
    JSON.stringify(authorityBasis ?? null),
    JSON.stringify(guardResults ?? []),
    JSON.stringify(evidenceRefs ?? []),
    JSON.stringify(recommendedAction ?? null),
    JSON.stringify(authorizedAction ?? null),
    JSON.stringify(actionSafety ?? null),
    JSON.stringify(payload),
    createdAt
  );
  db.prepare(
    `INSERT INTO agent_events (event_id, agent_id, session_id, event_type, task_number, payload_json, emitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    eventId,
    agentId,
    sessionId ?? `session_${agentId ?? 'unknown'}`,
    'lifecycle_transition',
    null,
    JSON.stringify(payload),
    createdAt
  );
  return { status: 'emitted', event_id: eventId, transition_id: transitionId };
}

function agentContextLifecycleHistory(toolArgs) {
  if (!db) throw new Error('agent_context_db_not_available');
  const agentId = stringField(toolArgs ?? {}, 'agent_id');
  const transition = stringField(toolArgs ?? {}, 'transition');
  const limit = Math.min(Math.max(parseInt(toolArgs?.limit ?? '10', 10), 1), 50);
  const where = [];
  const params = [];
  if (agentId) {
    where.push('agent_id = ?');
    params.push(agentId);
  }
  if (transition) {
    where.push('transition = ?');
    params.push(transition);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT * FROM agent_lifecycle_transitions
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...params, limit);
  return {
    status: rows.length > 0 ? 'ok' : 'no_lifecycle_transitions',
    schema: 'narada.agent_lifecycle.transition_history.v0',
    authority: 'agent_context_sqlite',
    not_action_authority: true,
    agent_id: agentId ?? null,
    transition: transition ?? null,
    count: rows.length,
    transitions: rows.map((row) => parseLifecycleTransitionRow(row)),
  };
}

function agentContextLifecycleShow(toolArgs) {
  if (!db) throw new Error('agent_context_db_not_available');
  const transitionId = stringField(toolArgs ?? {}, 'transition_id');
  if (!transitionId) throw new Error('transition_id is required');
  const row = db.prepare('SELECT * FROM agent_lifecycle_transitions WHERE transition_id = ?').get(transitionId);
  if (!row) {
    return {
      status: 'not_found',
      schema: 'narada.agent_lifecycle.transition_show.v0',
      transition_id: transitionId,
    };
  }
  return {
    status: 'ok',
    schema: 'narada.agent_lifecycle.transition_show.v0',
    authority: 'agent_context_sqlite',
    not_action_authority: true,
    transition: parseLifecycleTransitionRow(row, { includePayload: true }),
  };
}

function parseLifecycleTransitionRow(row, { includePayload = false } = {}) {
  const parsed = {
    transition_id: row.transition_id,
    agent_id: row.agent_id,
    session_id: row.session_id,
    transition: row.transition,
    source_zone: row.source_zone,
    target_zone: row.target_zone,
    status: row.status,
    authority_basis: parseJsonField(row.authority_basis_json, null),
    guard_results: parseJsonField(row.guard_results_json, []),
    evidence_refs: parseJsonField(row.evidence_refs_json, []),
    recommended_action: parseJsonField(row.recommended_action_json, null),
    authorized_action: parseJsonField(row.authorized_action_json, null),
    action_safety: parseJsonField(row.action_safety_json, null),
    created_at: row.created_at,
  };
  if (includePayload) {
    parsed.payload = parseJsonField(row.payload_json, null);
  }
  return parsed;
}

const ISN_PLANES = new Set([
  'discovery',
  'selection',
  'de_arbitrization',
  'coverage',
  'execution',
  'verification',
  'integration',
]);

function agentContextIsnCreate(toolArgs) {
  if (!db) throw new Error('agent_context_db_not_available');
  const agentId = requireString(toolArgs, 'agent_id');
  assertBoundIdentity(agentId);
  const title = requireString(toolArgs, 'title');
  const summary = requireString(toolArgs, 'summary');
  const plane = stringField(toolArgs ?? {}, 'plane') ?? 'discovery';
  inquirySpaceService.validateIsnPlane(plane);

  const now = new Date().toISOString();
  const nodeId = `isn_${randomUUID().replace(/-/g, '')}`;
  const authorityOwner = objectField(toolArgs ?? {}, 'authority_owner') ?? { kind: 'unspecified' };
  const relations = arrayField(toolArgs ?? {}, 'relations');
  const evidenceRefs = arrayField(toolArgs ?? {}, 'evidence_refs');
  const nextMovement = objectField(toolArgs ?? {}, 'next_movement');
  const linkedTaskNumber = integerField(toolArgs ?? {}, 'linked_task_number');
  const payload = inquirySpaceService.buildIsnPayload({
    nodeId,
    title,
    plane,
    status: 'active',
    summary,
    authorityOwner,
    relations,
    evidenceRefs,
    nextMovement,
    linkedTaskNumber,
    createdBy: agentId,
    updatedBy: agentId,
    createdAt: now,
    updatedAt: now,
  });

  db.prepare(`
    INSERT INTO inquiry_space_nodes (
      node_id, title, plane, status, summary, authority_owner_json,
      relations_json, evidence_refs_json, next_movement_json, linked_task_number,
      created_by, updated_by, created_at, updated_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    nodeId,
    title,
    plane,
    'active',
    summary,
    JSON.stringify(authorityOwner),
    JSON.stringify(relations),
    JSON.stringify(evidenceRefs),
    nextMovement ? JSON.stringify(nextMovement) : null,
    linkedTaskNumber,
    agentId,
    agentId,
    now,
    now,
    JSON.stringify(payload)
  );
  appendIsnEvent({
    nodeId,
    eventType: 'created',
    fromPlane: null,
    toPlane: plane,
    actorAgentId: agentId,
    reason: 'ISN created',
    payload,
    createdAt: now,
  });
  return {
    status: 'created',
    schema: 'narada.inquiry_space.node.create.v0',
    authority: 'agent_context_sqlite',
    task_lifecycle_authority_preserved: true,
    node: payload,
  };
}

function agentContextIsnList(toolArgs) {
  if (!db) throw new Error('agent_context_db_not_available');
  const plane = stringField(toolArgs ?? {}, 'plane');
  if (plane) inquirySpaceService.validateIsnPlane(plane);
  const status = stringField(toolArgs ?? {}, 'status');
  const linkedTaskNumber = integerField(toolArgs ?? {}, 'linked_task_number');
  const limit = Math.min(Math.max(parseInt(toolArgs?.limit ?? '20', 10), 1), 50);
  const where = [];
  const params = [];
  if (plane) {
    where.push('plane = ?');
    params.push(plane);
  }
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  if (linkedTaskNumber !== null) {
    where.push('linked_task_number = ?');
    params.push(linkedTaskNumber);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT * FROM inquiry_space_nodes
    ${whereSql}
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(...params, limit);
  return {
    status: 'ok',
    schema: 'narada.inquiry_space.node.list.v0',
    authority: 'agent_context_sqlite',
    not_task_lifecycle_authority: true,
    count: rows.length,
    nodes: rows.map((row) => inquirySpaceService.parseIsnRow(row, parseJsonField)),
  };
}

function agentContextIsnShow(toolArgs) {
  if (!db) throw new Error('agent_context_db_not_available');
  const nodeId = requireString(toolArgs, 'node_id');
  const row = db.prepare('SELECT * FROM inquiry_space_nodes WHERE node_id = ?').get(nodeId);
  if (!row) {
    return {
      status: 'not_found',
      schema: 'narada.inquiry_space.node.show.v0',
      node_id: nodeId,
    };
  }
  const events = db.prepare(`
    SELECT * FROM inquiry_space_node_events
    WHERE node_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(nodeId);
  return {
    status: 'ok',
    schema: 'narada.inquiry_space.node.show.v0',
    authority: 'agent_context_sqlite',
    not_task_lifecycle_authority: true,
    node: inquirySpaceService.parseIsnRow(row, parseJsonField, { includePayload: true }),
    events: events.map((event) => inquirySpaceService.parseIsnEventRow(event, parseJsonField)),
  };
}

function agentContextIsnTransition(toolArgs) {
  if (!db) throw new Error('agent_context_db_not_available');
  const agentId = requireString(toolArgs, 'agent_id');
  assertBoundIdentity(agentId);
  const nodeId = requireString(toolArgs, 'node_id');
  const nextPlane = requireString(toolArgs, 'plane');
  const reason = requireString(toolArgs, 'reason');
  inquirySpaceService.validateIsnPlane(nextPlane);
  const existing = db.prepare('SELECT * FROM inquiry_space_nodes WHERE node_id = ?').get(nodeId);
  if (!existing) throw new Error(`isn_node_not_found: ${nodeId}`);

  const current = inquirySpaceService.parseIsnRow(existing, parseJsonField, { includePayload: true });
  const now = new Date().toISOString();
  const title = current.title;
  const summary = stringField(toolArgs ?? {}, 'summary') ?? current.summary;
  const authorityOwner = objectField(toolArgs ?? {}, 'authority_owner') ?? current.authority_owner;
  const relations = Object.prototype.hasOwnProperty.call(toolArgs ?? {}, 'relations')
    ? arrayField(toolArgs ?? {}, 'relations')
    : current.relations;
  const evidenceRefs = Object.prototype.hasOwnProperty.call(toolArgs ?? {}, 'evidence_refs')
    ? arrayField(toolArgs ?? {}, 'evidence_refs')
    : current.evidence_refs;
  const nextMovement = Object.prototype.hasOwnProperty.call(toolArgs ?? {}, 'next_movement')
    ? objectField(toolArgs ?? {}, 'next_movement')
    : current.next_movement;
  const linkedTaskNumber = Object.prototype.hasOwnProperty.call(toolArgs ?? {}, 'linked_task_number')
    ? integerField(toolArgs ?? {}, 'linked_task_number')
    : current.linked_task_number;
  const payload = inquirySpaceService.buildIsnPayload({
    nodeId,
    title,
    plane: nextPlane,
    status: current.status,
    summary,
    authorityOwner,
    relations,
    evidenceRefs,
    nextMovement,
    linkedTaskNumber,
    createdBy: current.created_by,
    updatedBy: agentId,
    createdAt: current.created_at,
    updatedAt: now,
  });

  db.prepare(`
    UPDATE inquiry_space_nodes
    SET plane = ?, summary = ?, authority_owner_json = ?, relations_json = ?,
        evidence_refs_json = ?, next_movement_json = ?, linked_task_number = ?,
        updated_by = ?, updated_at = ?, payload_json = ?
    WHERE node_id = ?
  `).run(
    nextPlane,
    summary,
    JSON.stringify(authorityOwner),
    JSON.stringify(relations),
    JSON.stringify(evidenceRefs),
    nextMovement ? JSON.stringify(nextMovement) : null,
    linkedTaskNumber,
    agentId,
    now,
    JSON.stringify(payload),
    nodeId
  );
  const event = appendIsnEvent({
    nodeId,
    eventType: 'transitioned',
    fromPlane: current.plane,
    toPlane: nextPlane,
    actorAgentId: agentId,
    reason,
    payload,
    createdAt: now,
  });
  return {
    status: 'transitioned',
    schema: 'narada.inquiry_space.node.transition.v0',
    authority: 'agent_context_sqlite',
    task_lifecycle_authority_preserved: true,
    event_id: event.event_id,
    from_plane: current.plane,
    to_plane: nextPlane,
    node: payload,
  };
}

function buildIsnPayload({
  nodeId,
  title,
  plane,
  status,
  summary,
  authorityOwner,
  relations,
  evidenceRefs,
  nextMovement,
  linkedTaskNumber,
  createdBy,
  updatedBy,
  createdAt,
  updatedAt,
}) {
  return {
    schema: 'narada.inquiry_space.node.v0',
    node_id: nodeId,
    title,
    plane,
    status,
    summary,
    authority_owner: authorityOwner,
    relations,
    evidence_refs: evidenceRefs,
    next_movement: nextMovement ?? null,
    linked_task_number: linkedTaskNumber,
    created_by: createdBy,
    updated_by: updatedBy,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function appendIsnEvent({ nodeId, eventType, fromPlane, toPlane, actorAgentId, reason, payload, createdAt }) {
  const eventId = `isnevt_${randomUUID().replace(/-/g, '')}`;
  const eventPayload = inquirySpaceService.buildIsnEventPayload({
    eventId,
    nodeId,
    eventType,
    fromPlane,
    toPlane,
    actorAgentId,
    reason,
    payload,
    createdAt,
  });
  db.prepare(`
    INSERT INTO inquiry_space_node_events (
      event_id, node_id, event_type, from_plane, to_plane,
      actor_agent_id, reason, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    eventId,
    nodeId,
    eventType,
    fromPlane,
    toPlane,
    actorAgentId,
    reason ?? null,
    JSON.stringify(eventPayload),
    createdAt
  );
  return { event_id: eventId, payload: eventPayload };
}

function parseIsnRow(row, { includePayload = false } = {}) {
  const parsed = {
    node_id: row.node_id,
    title: row.title,
    plane: row.plane,
    status: row.status,
    summary: row.summary,
    authority_owner: parseJsonField(row.authority_owner_json, { kind: 'unreadable' }),
    relations: parseJsonField(row.relations_json, []),
    evidence_refs: parseJsonField(row.evidence_refs_json, []),
    next_movement: parseJsonField(row.next_movement_json, null),
    linked_task_number: row.linked_task_number,
    created_by: row.created_by,
    updated_by: row.updated_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (includePayload) parsed.payload = parseJsonField(row.payload_json, null);
  return parsed;
}

function parseIsnEventRow(row) {
  return {
    event_id: row.event_id,
    node_id: row.node_id,
    event_type: row.event_type,
    from_plane: row.from_plane,
    to_plane: row.to_plane,
    actor_agent_id: row.actor_agent_id,
    reason: row.reason,
    created_at: row.created_at,
    payload: parseJsonField(row.payload_json, null),
  };
}

function validateIsnPlane(plane) {
  if (!ISN_PLANES.has(plane)) {
    throw new Error(`invalid_isn_plane: ${plane}`);
  }
}

function assertBoundIdentity(agentId) {
  const sessionIdentity = process.env.NARADA_AGENT_ID || null;
  if (sessionIdentity && sessionIdentity !== agentId) {
    throw new Error(`identity_mismatch: session_identity=${sessionIdentity} requested_agent_id=${agentId}`);
  }
}

function agentContextIsMovementTraceRecord(toolArgs) {
  if (!db) throw new Error('agent_context_db_not_available');
  const agentId = requireString(toolArgs, 'agent_id');
  assertBoundIdentity(agentId);
  const now = new Date().toISOString();
  let sequenceId = stringField(toolArgs ?? {}, 'sequence_id');
  const sequenceInput = objectField(toolArgs ?? {}, 'sequence');
  const disciplineProfile = objectField(toolArgs ?? {}, 'discipline_profile') ?? sequenceInput?.discipline_profile ?? {};

  if (!sequenceId && sequenceInput) {
    sequenceId = createMovementSequence({ agentId, sequenceInput, disciplineProfile, now });
  } else if (sequenceId) {
    const existing = db.prepare('SELECT * FROM inquiry_space_movement_sequences WHERE sequence_id = ?').get(sequenceId);
    if (!existing) throw new Error(`movement_sequence_not_found: ${sequenceId}`);
  }

  const movementId = `ismove_${randomUUID().replace(/-/g, '')}`;
  const stepIndex = integerField(toolArgs ?? {}, 'step_index') ?? 1;
  const navigationPlane = requireString(toolArgs, 'navigation_plane');
  const nodeType = requireString(toolArgs, 'node_type');
  const isnNodeId = stringField(toolArgs ?? {}, 'isn_node_id');
  const linkedTaskNumber = integerField(toolArgs ?? {}, 'linked_task_number');
  const beforeState = objectField(toolArgs ?? {}, 'before_state') ?? {};
  const afterState = objectField(toolArgs ?? {}, 'after_state') ?? {};
  const observedDrift = objectField(toolArgs ?? {}, 'observed_drift') ?? {};
  const actionTaken = objectField(toolArgs ?? {}, 'action_taken') ?? { kind: 'observed_only' };
  const evidenceRefs = arrayField(toolArgs ?? {}, 'evidence_refs');
  const nextPressure = objectField(toolArgs ?? {}, 'next_pressure') ?? {};
  const payload = inquirySpaceService.buildMovementTracePayload({
    movementId,
    sequenceId,
    stepIndex,
    agentId,
    createdAt: now,
    navigationPlane,
    nodeType,
    isnNodeId,
    linkedTaskNumber,
    beforeState,
    afterState,
    observedDrift,
    actionTaken,
    evidenceRefs,
    nextPressure,
    disciplineProfile,
  });

  db.prepare(`
    INSERT INTO inquiry_space_movement_traces (
      movement_id, sequence_id, step_index, agent_id, created_at,
      navigation_plane, node_type, isn_node_id, linked_task_number,
      before_state_json, after_state_json, observed_drift_json, action_taken_json,
      evidence_refs_json, next_pressure_json, discipline_profile_json, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    movementId,
    sequenceId,
    stepIndex,
    agentId,
    now,
    navigationPlane,
    nodeType,
    isnNodeId,
    linkedTaskNumber,
    JSON.stringify(beforeState),
    JSON.stringify(afterState),
    JSON.stringify(observedDrift),
    JSON.stringify(actionTaken),
    JSON.stringify(evidenceRefs),
    JSON.stringify(nextPressure),
    JSON.stringify(disciplineProfile),
    JSON.stringify(payload)
  );

  if (sequenceId) updateMovementSequenceAfterTrace(sequenceId, stepIndex, now);
  const sequence = sequenceId
    ? db.prepare('SELECT * FROM inquiry_space_movement_sequences WHERE sequence_id = ?').get(sequenceId)
    : null;

  return {
    status: 'recorded',
    schema: 'narada.inquiry_space.movement_trace.record.v0',
    authority: 'agent_context_sqlite',
    observational_only: true,
    task_lifecycle_authority_preserved: true,
    isn_authority_preserved: true,
    no_task_claim: true,
    no_task_route: true,
    no_task_reconcile: true,
    no_isn_transition: true,
    trace: payload,
    sequence: sequence ? inquirySpaceService.parseMovementSequenceRow(sequence, parseJsonField, { includePayload: true }) : null,
  };
}

function createMovementSequence({ agentId, sequenceInput, disciplineProfile, now }) {
  const sequenceId = stringField(sequenceInput, 'sequence_id') ?? `ismseq_${randomUUID().replace(/-/g, '')}`;
  const title = stringField(sequenceInput, 'title');
  const summary = stringField(sequenceInput, 'summary');
  const requestedStepCount = integerField(sequenceInput, 'requested_step_count');
  const completedStepCount = integerField(sequenceInput, 'completed_step_count') ?? 0;
  const startingNodeRef = stringField(sequenceInput, 'starting_node_ref');
  const terminationReason = stringField(sequenceInput, 'termination_reason');
  const driftSummary = objectField(sequenceInput, 'drift_summary') ?? {};
  const linkedArtifacts = arrayField(sequenceInput, 'linked_artifacts');
  const payload = inquirySpaceService.buildMovementSequencePayload({
    sequenceId,
    agentId,
    title,
    summary,
    startingNodeRef,
    requestedStepCount,
    completedStepCount,
    terminationReason,
    driftSummary,
    linkedArtifacts,
    disciplineProfile,
    createdAt: now,
    updatedAt: now,
  });
  db.prepare(`
    INSERT INTO inquiry_space_movement_sequences (
      sequence_id, agent_id, starting_node_ref, requested_step_count,
      completed_step_count, termination_reason, drift_summary_json,
      linked_artifacts_json, discipline_profile_json, created_at, updated_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sequenceId,
    agentId,
    startingNodeRef,
    requestedStepCount,
    completedStepCount,
    terminationReason,
    JSON.stringify(driftSummary),
    JSON.stringify(linkedArtifacts),
    JSON.stringify(disciplineProfile),
    now,
    now,
    JSON.stringify(payload)
  );
  return sequenceId;
}

function updateMovementSequenceAfterTrace(sequenceId, stepIndex, updatedAt) {
  const row = db.prepare('SELECT * FROM inquiry_space_movement_sequences WHERE sequence_id = ?').get(sequenceId);
  if (!row) return;
  const completed = Math.max(row.completed_step_count ?? 0, stepIndex);
  const payload = inquirySpaceService.buildMovementSequencePayload({
    sequenceId: row.sequence_id,
    agentId: row.agent_id,
    title: parseJsonField(row.payload_json, {})?.title ?? null,
    summary: parseJsonField(row.payload_json, {})?.summary ?? null,
    startingNodeRef: row.starting_node_ref,
    requestedStepCount: row.requested_step_count,
    completedStepCount: completed,
    terminationReason: row.termination_reason,
    driftSummary: parseJsonField(row.drift_summary_json, {}),
    linkedArtifacts: parseJsonField(row.linked_artifacts_json, []),
    disciplineProfile: parseJsonField(row.discipline_profile_json, {}),
    createdAt: row.created_at,
    updatedAt,
  });
  db.prepare(`
    UPDATE inquiry_space_movement_sequences
    SET completed_step_count = ?, updated_at = ?, payload_json = ?
    WHERE sequence_id = ?
  `).run(completed, updatedAt, JSON.stringify(payload), sequenceId);
}

function agentContextIsMovementTraceList(toolArgs) {
  if (!db) throw new Error('agent_context_db_not_available');
  const agentId = stringField(toolArgs ?? {}, 'agent_id');
  const sequenceId = stringField(toolArgs ?? {}, 'sequence_id');
  const linkedTaskNumber = integerField(toolArgs ?? {}, 'linked_task_number');
  const isnNodeId = stringField(toolArgs ?? {}, 'isn_node_id');
  const limit = Math.min(Math.max(parseInt(toolArgs?.limit ?? '20', 10), 1), 50);
  const where = [];
  const params = [];
  if (agentId) { where.push('agent_id = ?'); params.push(agentId); }
  if (sequenceId) { where.push('sequence_id = ?'); params.push(sequenceId); }
  if (linkedTaskNumber !== null) { where.push('linked_task_number = ?'); params.push(linkedTaskNumber); }
  if (isnNodeId) { where.push('isn_node_id = ?'); params.push(isnNodeId); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT * FROM inquiry_space_movement_traces
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...params, limit);
  const sequences = new Map();
  for (const row of rows) {
    if (!row.sequence_id || sequences.has(row.sequence_id)) continue;
    const sequence = db.prepare('SELECT * FROM inquiry_space_movement_sequences WHERE sequence_id = ?').get(row.sequence_id);
    if (sequence) sequences.set(row.sequence_id, inquirySpaceService.parseMovementSequenceRow(sequence, parseJsonField));
  }
  return {
    status: 'ok',
    schema: 'narada.inquiry_space.movement_trace.list.v0',
    authority: 'agent_context_sqlite',
    observational_only: true,
    not_task_lifecycle_authority: true,
    count: rows.length,
    traces: rows.map((row) => inquirySpaceService.parseMovementTraceRow(row, parseJsonField)),
    sequences: Array.from(sequences.values()),
  };
}

function agentContextIsMovementTraceShow(toolArgs) {
  if (!db) throw new Error('agent_context_db_not_available');
  const movementId = requireString(toolArgs, 'movement_id');
  const row = db.prepare('SELECT * FROM inquiry_space_movement_traces WHERE movement_id = ?').get(movementId);
  if (!row) {
    return { status: 'not_found', schema: 'narada.inquiry_space.movement_trace.show.v0', movement_id: movementId };
  }
  const trace = inquirySpaceService.parseMovementTraceRow(row, parseJsonField, { includePayload: true });
  const sequence = trace.sequence_id
    ? db.prepare('SELECT * FROM inquiry_space_movement_sequences WHERE sequence_id = ?').get(trace.sequence_id)
    : null;
  return {
    status: 'ok',
    schema: 'narada.inquiry_space.movement_trace.show.v0',
    authority: 'agent_context_sqlite',
    observational_only: true,
    not_task_lifecycle_authority: true,
    trace,
    sequence: sequence ? inquirySpaceService.parseMovementSequenceRow(sequence, parseJsonField, { includePayload: true }) : null,
  };
}

function buildMovementSequencePayload({
  sequenceId,
  agentId,
  title,
  summary,
  startingNodeRef,
  requestedStepCount,
  completedStepCount,
  terminationReason,
  driftSummary,
  linkedArtifacts,
  disciplineProfile,
  createdAt,
  updatedAt,
}) {
  return {
    schema: 'narada.inquiry_space.movement_sequence.v0',
    sequence_id: sequenceId,
    agent_id: agentId,
    title: title ?? null,
    summary: summary ?? null,
    starting_node_ref: startingNodeRef ?? null,
    requested_step_count: requestedStepCount,
    completed_step_count: completedStepCount,
    termination_reason: terminationReason ?? null,
    drift_summary: driftSummary,
    linked_artifacts: linkedArtifacts,
    discipline_profile: disciplineProfile,
    observational_only: true,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function buildMovementTracePayload({
  movementId,
  sequenceId,
  stepIndex,
  agentId,
  createdAt,
  navigationPlane,
  nodeType,
  isnNodeId,
  linkedTaskNumber,
  beforeState,
  afterState,
  observedDrift,
  actionTaken,
  evidenceRefs,
  nextPressure,
  disciplineProfile,
}) {
  return {
    schema: 'narada.inquiry_space.movement_trace.v0',
    movement_id: movementId,
    sequence_id: sequenceId ?? null,
    step_index: stepIndex,
    agent_id: agentId,
    created_at: createdAt,
    navigation_plane: navigationPlane,
    node_type: nodeType,
    isn_node_id: isnNodeId ?? null,
    linked_task_number: linkedTaskNumber,
    before_state: beforeState,
    after_state: afterState,
    observed_drift: observedDrift,
    action_taken: actionTaken,
    evidence_refs: evidenceRefs,
    next_pressure: nextPressure,
    discipline_profile: disciplineProfile,
    observational_only: true,
    task_lifecycle_authority_preserved: true,
    isn_authority_preserved: true,
  };
}

function parseMovementTraceRow(row, { includePayload = false } = {}) {
  const parsed = {
    movement_id: row.movement_id,
    sequence_id: row.sequence_id,
    step_index: row.step_index,
    agent_id: row.agent_id,
    created_at: row.created_at,
    navigation_plane: row.navigation_plane,
    node_type: row.node_type,
    isn_node_id: row.isn_node_id,
    linked_task_number: row.linked_task_number,
    before_state: parseJsonField(row.before_state_json, {}),
    after_state: parseJsonField(row.after_state_json, {}),
    observed_drift: parseJsonField(row.observed_drift_json, {}),
    action_taken: parseJsonField(row.action_taken_json, {}),
    evidence_refs: parseJsonField(row.evidence_refs_json, []),
    next_pressure: parseJsonField(row.next_pressure_json, {}),
    discipline_profile: parseJsonField(row.discipline_profile_json, {}),
  };
  if (includePayload) parsed.payload = parseJsonField(row.payload_json, null);
  return parsed;
}

function parseMovementSequenceRow(row, { includePayload = false } = {}) {
  const payload = parseJsonField(row.payload_json, {});
  const parsed = {
    sequence_id: row.sequence_id,
    agent_id: row.agent_id,
    title: payload?.title ?? null,
    summary: payload?.summary ?? null,
    starting_node_ref: row.starting_node_ref,
    requested_step_count: row.requested_step_count,
    completed_step_count: row.completed_step_count,
    termination_reason: row.termination_reason,
    drift_summary: parseJsonField(row.drift_summary_json, {}),
    linked_artifacts: parseJsonField(row.linked_artifacts_json, []),
    discipline_profile: parseJsonField(row.discipline_profile_json, {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (includePayload) parsed.payload = payload || null;
  return parsed;
}

function agentContextConceptLifecycleRecord(toolArgs) {
  return conceptLifecycleService.recordLifecycleEvent({ db, toolArgs, assertBoundIdentity });
}

function agentContextConceptLifecycleHistory(toolArgs) {
  return conceptLifecycleService.readLifecycleHistory({ db, toolArgs, parseJsonField });
}

function agentContextConceptLifecycleCurrent(toolArgs) {
  return conceptLifecycleService.readCurrentLifecycleState({ db, toolArgs, parseJsonField });
}

function agentContextToolSurfaceReadiness() {
  const registeredToolNames = TOOLS.map((tool) => tool.name).sort();
  const missingExpectedTools = EXPECTED_TOOL_NAMES.filter((name) => !registeredToolNames.includes(name));
  const groupStatus = Object.fromEntries(Object.entries(EXPECTED_TOOL_GROUPS).map(([group, names]) => [group, {
    expected: names,
    registered: names.filter((name) => registeredToolNames.includes(name)),
    missing: names.filter((name) => !registeredToolNames.includes(name)),
  }]));
  const freshness = buildMcpFreshnessStatus({
    siteRoot,
    serverName: SERVER_NAME,
    serverEntryPoint: 'tools/agent-context/agent-context-mcp-server.mjs',
    serverBootedAt: SERVER_BOOTED_AT,
    watchedPaths: ['tools/agent-context', 'tools/mcp-freshness-service.mjs'],
    expectedTools: EXPECTED_TOOL_NAMES,
    registeredTools: registeredToolNames,
    restartRequestPath: join(siteRoot, '.ai', 'tmp', 'agent-context-restart-request.json'),
    baselinePath: join(siteRoot, '.ai', 'tmp', 'agent-context-mcp-baseline.json'),
    restartToolName: 'agent_context_restart',
  });
  return {
    status: missingExpectedTools.length === 0 ? 'ok' : 'missing_expected_tools',
    schema: 'narada.agent_context.tool_surface_readiness.v0',
    authority: 'live_mcp_process_read_model',
    mutation: 'none',
    self_restart_supported: false,
    registered_tool_count: registeredToolNames.length,
    registered_tools: registeredToolNames,
    source_expected_tools: EXPECTED_TOOL_NAMES,
    source_expected_groups: groupStatus,
    missing_source_expected_tools: missingExpectedTools,
    restart_request_state: freshness.restart_request.state,
    restart_request: freshness.restart_request.payload,
    stale_live_surface_possible: freshness.stale_live_surface_possible,
    mcp_freshness: freshness,
    sanctioned_remediation: freshness.remediation,
  };
}

function agentContextRestart(toolArgs) {
  const mode = stringField(toolArgs ?? {}, 'mode') ?? 'request';
  if (!['request', 'status', 'acknowledge', 'clear'].includes(mode)) {
    throw new Error(`invalid_restart_mode: ${mode}`);
  }
  const requestPath = join(siteRoot, '.ai', 'tmp', 'agent-context-restart-request.json');
  const baselinePath = join(siteRoot, '.ai', 'tmp', 'agent-context-mcp-baseline.json');
  const watchedPaths = ['tools/agent-context', 'tools/mcp-freshness-service.mjs'];
  const existingRequest = readMcpFreshnessJsonFile(requestPath);

  if (mode === 'acknowledge' || mode === 'clear') {
    return acknowledgeMcpRestartRequest({
      siteRoot,
      serverName: SERVER_NAME,
      targetSurface: 'agent-context-mcp.local',
      targetEntrypoint: 'tools/agent-context/agent-context-mcp-server.mjs',
      restartRequestPath: requestPath,
      baselinePath,
      watchedPaths,
      expectedTools: EXPECTED_TOOL_NAMES,
      registeredTools: TOOLS.map((tool) => tool.name).sort(),
      acknowledgedBy: process.env.NARADA_AGENT_ID ?? null,
      reason: stringField(toolArgs ?? {}, 'reason') ?? 'agent_context_restart acknowledged after external restart',
      note: 'Agent-context MCP external restart acknowledged; restart request marker cleared.',
    });
  }

  if (mode === 'status') {
    return {
      status: existingRequest ? 'restart_requested' : 'no_restart_request',
      schema: 'narada.agent_context.restart_request.v0',
      can_self_restart: false,
      restart_mechanism: 'external_stdio_mcp_restart_required',
      request_path: requestPath,
      baseline_path: baselinePath,
      request: existingRequest,
      message: existingRequest
        ? 'Agent-context MCP restart has been requested. Restart the carrier/session MCP servers externally to load new code.'
        : 'No agent-context MCP restart request file is present.',
    };
  }

  return writeMcpRestartRequest({
    siteRoot,
    serverName: SERVER_NAME,
    targetSurface: 'agent-context-mcp.local',
    targetEntrypoint: 'tools/agent-context/agent-context-mcp-server.mjs',
    restartRequestPath: requestPath,
    baselinePath,
    requestedBy: process.env.NARADA_AGENT_ID ?? null,
    reason: stringField(toolArgs ?? {}, 'reason') ?? 'agent_context_restart requested through MCP',
    note: 'This tool cannot restart its own stdio MCP process. Restart the carrier/session MCP servers externally to load new code.',
  });
}

function readJsonFile(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    return {
      status: 'unreadable',
      path: filePath,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildHydrationGrounding({ detail, whoami, capabilityPolicy, checkpoint, taskLifecycleNext }) {
  const reground = safeCall(() => buildReground(siteRoot));
  if (!reground.ok) {
    return {
      status: 'unavailable',
      provenance: 'unavailable',
      layers: buildGroundingLayers({
        whoami,
        capabilityPolicy,
        checkpoint,
        taskLifecycleNext,
        reground: null,
        regroundAvailable: false,
      }),
      payload: {
        status: 'unavailable',
        mode: detail,
        message: reground.error,
      },
    };
  }

  const value = reground.value;
  const status = computeGroundingStatus(value);
  const layers = buildGroundingLayers({
    whoami,
    capabilityPolicy,
    checkpoint,
    taskLifecycleNext,
    reground: value,
    regroundAvailable: true,
  });

  return {
    status,
    provenance: detail,
    layers,
    payload: shapeDoctrinePayload(value, detail, status, layers),
  };
}

function computeGroundingStatus(reground) {
  const localAvailable = reground?.corpus_status?.local_sources?.all_available === true;
  const thoughtsAvailable = reground?.corpus_status?.thoughts_corpus?.available === true;
  if (localAvailable && thoughtsAvailable) return 'grounded';
  if (localAvailable || thoughtsAvailable) return 'degraded';
  return 'unavailable';
}

function buildGroundingLayers({ whoami, capabilityPolicy, checkpoint, taskLifecycleNext, reground, regroundAvailable }) {
  return {
    identity: whoami?.status === 'ok' ? 'loaded' : 'missing',
    capability_policy: capabilityPolicy ? 'loaded' : 'missing',
    local_doctrine_sources: regroundAvailable && reground?.corpus_status?.local_sources?.all_available ? 'loaded' : 'missing',
    thoughts_corpus: regroundAvailable && reground?.corpus_status?.thoughts_corpus?.available ? 'loaded' : 'missing',
    checkpoint: checkpoint?.status === 'ok' ? 'loaded' : checkpoint?.status === 'no_checkpoint' ? 'missing' : 'degraded',
    workboard: taskLifecycleNext?.status === 'ok' ? 'loaded' : 'degraded',
  };
}

function shapeDoctrinePayload(reground, detail, groundingStatus, groundingLayers) {
  const base = {
    status: 'ok',
    mode: detail,
    schema: reground.schema,
    generated_at: reground.generated_at,
    grounding_status: groundingStatus,
    grounding_layers: groundingLayers,
    corpus_status: reground.corpus_status,
  };

  if (detail === 'status') {
    return base;
  }

  if (detail === 'summary') {
    return {
      ...base,
      posture_summary: reground.posture_summary,
      doctrine_catalog: reground.doctrine_catalog,
    };
  }

  if (detail === 'reground') {
    const { source_excerpts, site_root, ...compact } = reground;
    return {
      ...compact,
      status: 'ok',
      mode: detail,
      grounding_status: groundingStatus,
      grounding_layers: groundingLayers,
    };
  }

  return {
    ...reground,
    status: 'ok',
    mode: detail,
    grounding_status: groundingStatus,
    grounding_layers: groundingLayers,
  };
}

function emitGroundingEvent({ agentId, sessionId, trigger, doctrineDetail, grounding, operatorOverrideRef }) {
  if (!db) {
    throw new Error('agent_context_db_not_available');
  }

  const eventId = `ground_${randomUUID().replace(/-/g, '')}`;
  const createdAt = new Date().toISOString();
  const sourceRefs = buildGroundingSourceRefs(grounding?.payload);
  const sourceHashes = buildGroundingSourceHashes(sourceRefs);
  const groundingSummary = {
    status: grounding?.status ?? 'unknown',
    mode: doctrineDetail,
    generated_at: grounding?.payload?.generated_at ?? null,
    schema: grounding?.payload?.schema ?? null,
    doctrine_catalog_count: Array.isArray(grounding?.payload?.doctrine_catalog)
      ? grounding.payload.doctrine_catalog.length
      : null,
    local_sources_all_available: grounding?.payload?.corpus_status?.local_sources?.all_available ?? null,
    thoughts_corpus_available: grounding?.payload?.corpus_status?.thoughts_corpus?.available ?? null,
  };
  const degradedReason = computeGroundingDegradedReason(grounding);
  const payload = {
    schema: 'narada.agent_context.grounding_event.v0',
    event_id: eventId,
    agent_id: agentId,
    session_id: sessionId,
    trigger,
    created_at: createdAt,
    doctrine_detail: doctrineDetail,
    grounding_status: grounding?.status ?? 'unknown',
    grounding_layers: grounding?.layers ?? {},
    source_refs: sourceRefs,
    source_hashes: sourceHashes,
    grounding_summary: groundingSummary,
    degraded_reason: degradedReason,
    operator_override_ref: operatorOverrideRef ?? null,
  };

  db.prepare(`
    INSERT INTO agent_grounding_events (
      event_id, agent_id, session_id, trigger, created_at, doctrine_detail,
      grounding_status, grounding_layers_json, source_refs_json, source_hashes_json,
      grounding_summary_json, degraded_reason, operator_override_ref, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    eventId,
    agentId,
    sessionId,
    trigger,
    createdAt,
    doctrineDetail,
    grounding?.status ?? 'unknown',
    JSON.stringify(grounding?.layers ?? {}),
    JSON.stringify(sourceRefs),
    JSON.stringify(sourceHashes),
    JSON.stringify(groundingSummary),
    degradedReason,
    operatorOverrideRef ?? null,
    JSON.stringify(payload)
  );

  return {
    event_id: eventId,
    agent_id: agentId,
    session_id: sessionId,
    trigger,
    created_at: createdAt,
    grounding_status: grounding?.status ?? 'unknown',
    degraded_reason: degradedReason,
  };
}

function buildGroundingSourceRefs(payload) {
  const refs = [];
  const localSources = payload?.corpus_status?.local_sources?.sources_checked ?? [];
  for (const source of localSources) {
    refs.push({
      kind: 'file',
      label: source.label ?? null,
      path: source.path,
      absolute_path: resolve(siteRoot, source.path),
      available: source.available === true,
      source: 'local_doctrine',
    });
  }

  const thoughts = payload?.corpus_status?.thoughts_corpus;
  if (thoughts?.path) {
    refs.push({
      kind: 'corpus',
      label: 'Thoughts corpus',
      path: thoughts.path,
      absolute_path: thoughts.path,
      available: thoughts.available === true,
      source: thoughts.source ?? 'thoughts_corpus',
      note: thoughts.note ?? null,
    });
  }

  for (const candidate of thoughts?.checked_candidates ?? []) {
    if (candidate.path === thoughts?.path) continue;
    refs.push({
      kind: 'corpus_candidate',
      label: 'Thoughts corpus candidate',
      path: candidate.path,
      absolute_path: candidate.path,
      available: candidate.available === true,
      source: candidate.source ?? null,
    });
  }

  return refs;
}

function buildGroundingSourceHashes(sourceRefs) {
  const hashes = {};
  for (const ref of sourceRefs) {
    const key = ref.path;
    if (ref.kind === 'file' && ref.available === true) {
      try {
        hashes[key] = `sha256:${createHash('sha256').update(readFileSync(ref.absolute_path)).digest('hex')}`;
        continue;
      } catch (error) {
        hashes[key] = {
          status: 'unavailable',
          reason: error instanceof Error ? error.message : String(error),
        };
        continue;
      }
    }
    hashes[key] = `sha256:${createHash('sha256').update(JSON.stringify({
      kind: ref.kind,
      path: ref.path,
      available: ref.available,
      source: ref.source,
      note: ref.note ?? null,
    })).digest('hex')}`;
  }
  return hashes;
}

function computeGroundingDegradedReason(grounding) {
  if (!grounding || grounding.status === 'grounded') return null;
  const missing = Object.entries(grounding.layers ?? {})
    .filter(([, status]) => status !== 'loaded')
    .map(([layer, status]) => `${layer}:${status}`);
  return missing.length > 0 ? `grounding_not_complete:${missing.join(',')}` : `grounding_status:${grounding.status}`;
}

function parseGroundingRow(row, { includePayload = false } = {}) {
  if (!row) return null;
  const parsed = {
    event_id: row.event_id,
    agent_id: row.agent_id,
    session_id: row.session_id,
    trigger: row.trigger,
    created_at: row.created_at,
    doctrine_detail: row.doctrine_detail,
    grounding_status: row.grounding_status,
    grounding_layers: parseJsonField(row.grounding_layers_json, {}),
    source_refs: parseJsonField(row.source_refs_json, []),
    source_hashes: parseJsonField(row.source_hashes_json, {}),
    grounding_summary: parseJsonField(row.grounding_summary_json, {}),
    degraded_reason: row.degraded_reason,
    operator_override_ref: row.operator_override_ref,
  };
  if (includePayload) {
    parsed.payload = parseJsonField(row.payload_json, null);
  }
  return parsed;
}

function parseJsonField(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function agentContextGroundingLatest(toolArgs) {
  if (!db) throw new Error('agent_context_db_not_available');
  const agentId = toolArgs?.agent_id;
  if (!agentId) throw new Error('agent_id is required');
  const row = db.prepare('SELECT * FROM agent_grounding_events WHERE agent_id = ? ORDER BY created_at DESC LIMIT 1').get(agentId);
  if (!row) {
    return { status: 'no_grounding_event', agent_id: agentId };
  }
  return { status: 'ok', event: parseGroundingRow(row, { includePayload: true }) };
}

function agentContextGroundingHistory(toolArgs) {
  if (!db) throw new Error('agent_context_db_not_available');
  const agentId = toolArgs?.agent_id;
  if (!agentId) throw new Error('agent_id is required');
  const limit = Math.min(Math.max(parseInt(toolArgs?.limit ?? '10', 10), 1), 50);
  const rows = db.prepare('SELECT * FROM agent_grounding_events WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?').all(agentId, limit);
  return {
    status: rows.length > 0 ? 'ok' : 'no_grounding_events',
    agent_id: agentId,
    count: rows.length,
    events: rows.map((row) => parseGroundingRow(row)),
  };
}

function agentContextGroundingShow(toolArgs) {
  if (!db) throw new Error('agent_context_db_not_available');
  const eventId = toolArgs?.event_id;
  if (!eventId) throw new Error('event_id is required');
  const row = db.prepare('SELECT * FROM agent_grounding_events WHERE event_id = ?').get(eventId);
  if (!row) {
    return { status: 'not_found', event_id: eventId };
  }
  return { status: 'ok', event: parseGroundingRow(row, { includePayload: true }) };
}

function agentContextSiteEvolutionOrientationCreate(toolArgs) {
  return createSiteEvolutionOrientationSnapshot({
    siteRoot,
    db,
    reason: stringField(toolArgs ?? {}, 'reason') ?? 'explicit_create',
  });
}

function buildStartupReadinessVerdict({
  hydratedAt,
  agentId,
  role,
  whoami,
  verifiedBadge,
  checkpoint,
  groundingStatus,
  groundingEventId,
  groundingEventError,
  onboardingCard,
  siteLiftOrientation,
  taskLifecycleNext,
  recommendedNextAction,
  operatorOverrideRef,
  hostRuntimeRegistry: suppliedHostRuntimeRegistry = null,
  mcpRestartReadiness: suppliedMcpRestartReadiness = null,
  mcpPressure: suppliedMcpPressure = null,
  mcpSiteReadiness: suppliedMcpSiteReadiness = null,
}) {
  const identityVerified = whoami?.status === 'ok'
    && whoami.source === 'NARADA_AGENT_ID'
    && whoami.confidence === 'high'
    && Boolean(whoami.identity);
  const hasVerifiedBadge = Boolean(verifiedBadge?.agent_id);
  const checkpointLoaded = checkpoint?.status === 'ok';
  const noCheckpoint = checkpoint?.status === 'no_checkpoint';
  const groundingEventReturned = Boolean(groundingEventId);
  const cardStatus = onboardingCard?.status ?? 'missing';
  const cardLoaded = cardStatus === 'loaded';
  const cardHasSnapshot = Boolean(onboardingCard?.snapshot_id);
  const workboardLive = taskLifecycleNext?.status === 'ok'
    && Boolean(taskLifecycleNext.generated_at ?? taskLifecycleNext.workboard_generated_at);
  const hostRuntimeRegistry = suppliedHostRuntimeRegistry ?? buildHydrateHostRuntimeRegistryStatus();
  const mcpRestartReadiness = suppliedMcpRestartReadiness ?? buildHydrateMcpRestartReadiness({ taskLifecycleNext, hostRuntimeRegistry });
  const mcpPressure = suppliedMcpPressure ?? buildMcpStaleSurfacePressure(mcpRestartReadiness, hostRuntimeRegistry);
  const mcpSiteReadiness = suppliedMcpSiteReadiness ?? buildSiteOwnedMcpReadiness(mcpPressure, mcpRestartReadiness, hostRuntimeRegistry);
  const osmSendPermissionPolicy = readOsmSendPermissionPolicy();
  const osmPolicyConstraint = buildOsmSendPermissionPolicyConstraint(osmSendPermissionPolicy);
  const criticalMcpRestartNonconformance = hasCriticalMcpRestartNonconformance(mcpPressure);
  const reconciledBlockers = reconcileStartupBlockers({
    blockers: checkpoint?.continuation_blockers ?? [],
    checkpoint,
    onboardingCard,
    mcpPressure,
    mcpRestartReadiness,
    osmSendPermissionPolicy,
  });
  const policyConstraints = [
    ...(osmPolicyConstraint ? [osmPolicyConstraint] : []),
    ...(reconciledBlockers.policy_constraints ?? []),
  ];

  const qualityChecks = [
    {
      id: 'identity_verified_from_env',
      status: identityVerified ? 'pass' : 'fail',
      evidence_ref: 'whoami',
    },
    {
      id: 'verified_badge_returned',
      status: hasVerifiedBadge ? 'pass' : 'fail',
      evidence_ref: 'verified_badge',
    },
    {
      id: 'latest_checkpoint_loaded',
      status: checkpointLoaded ? 'pass' : noCheckpoint ? 'warn' : 'fail',
      evidence_ref: 'checkpoint.checkpoint_id',
    },
    {
      id: 'grounding_event_returned',
      status: groundingEventReturned ? 'pass' : groundingEventError ? 'fail' : 'warn',
      evidence_ref: 'grounding_event_id',
    },
    {
      id: 'onboarding_card_loaded',
      status: cardLoaded ? 'pass' : ['stale', 'degraded', 'primitive_fallback'].includes(cardStatus) ? 'warn' : 'fail',
      evidence_ref: 'rehydration_onboarding_card.status',
    },
    {
      id: 'orientation_snapshot_valid',
      status: cardLoaded && cardHasSnapshot ? 'pass' : ['stale', 'degraded', 'primitive_fallback'].includes(cardStatus) ? 'warn' : 'fail',
      evidence_ref: 'rehydration_onboarding_card.snapshot_id',
    },
    {
      id: 'workboard_live',
      status: workboardLive ? 'pass' : 'fail',
      evidence_ref: 'task_lifecycle_next.generated_at',
    },
    {
      id: 'prior_blockers_reconciled',
      status: reconciledBlockers.active.length === 0
        ? (reconciledBlockers.cleared.length > 0 || reconciledBlockers.superseded.length > 0 ? 'changed' : 'pass')
        : 'fail',
      evidence_ref: 'checkpoint.continuation_blockers',
    },
    {
      id: 'site_owned_mcp_readiness',
      status: mcpSiteReadiness.local_blockers.length > 0
        ? 'fail'
        : mcpSiteReadiness.local_advisory_debt.length > 0 || mcpSiteReadiness.foreign_substrate_advisory.length > 0 ? 'warn' : 'pass',
      evidence_ref: 'mcp_site_readiness',
    },
  ];

  const status = computeStartupReadinessStatus({
    identityVerified,
    hasVerifiedBadge,
    groundingStatus,
    groundingEventReturned,
    cardStatus,
    cardHasSnapshot,
    workboardLive,
    operatorOverrideRef,
    activeBlockers: reconciledBlockers.active,
    policyConstraints,
    criticalMcpRestartNonconformance,
  });
  const actionAuthority = computeStartupActionAuthority({ checkpoint, status });

  return {
    status: 'ok',
    schema: 'narada.agent_context.startup_readiness.v0',
    generated_at: hydratedAt,
    site_loci: buildCanonicalSiteLoci(),
    agent: {
      agent_id: agentId ?? null,
      role: role ?? null,
      verified: identityVerified,
      identity_source: whoami?.source ?? null,
      confidence: whoami?.confidence ?? null,
    },
    verdict: {
      status,
      action_authority: actionAuthority,
      summary: summarizeStartupReadiness({ status, actionAuthority, recommendedNextAction, mcpPressure, mcpSiteReadiness }),
    },
    quality_checks: qualityChecks,
    checkpoint: {
      checkpoint_id: checkpointLoaded ? checkpoint.checkpoint_id : null,
      active_task: checkpointLoaded ? checkpoint.active_task ?? null : null,
      next_intended_action: checkpointLoaded ? checkpoint.next_intended_action ?? null : null,
    },
    grounding: {
      status: groundingStatus ?? 'unknown',
      event_id: groundingEventId ?? null,
    },
    orientation: {
      status: cardStatus,
      snapshot_id: onboardingCard?.snapshot_id ?? null,
    },
    ...(siteLiftOrientation ? { site_lift_orientation: compactSiteLiftOrientation(siteLiftOrientation) } : {}),
    workboard: {
      live: workboardLive,
      generated_at: taskLifecycleNext?.generated_at ?? taskLifecycleNext?.workboard_generated_at ?? null,
      recommended_next_action: recommendedNextAction ?? null,
    },
    pc_runtime_registry: compactHostRuntimeRegistry(hostRuntimeRegistry),
    mcp_restart_readiness: mcpRestartReadiness,
    mcp_pressure: mcpPressure,
    mcp_site_readiness: mcpSiteReadiness,
    operator_surface_message_send_permission_policy: osmSendPermissionPolicy,
    blockers: {
      ...reconciledBlockers,
      policy_constraints: policyConstraints,
    },
  };
}

function buildMcpStaleSurfacePressure(mcpRestartReadiness, hostRuntimeRegistry = null) {
  const accounting = buildMcpReadinessAccounting(mcpRestartReadiness, hostRuntimeRegistry);
  const staleSurfaces = accounting.surfaces.filter((entry) => entry?.stale_live_surface_possible === true || entry?.pending_restart === true);
  const criticalSurfaces = staleSurfaces.filter(isCriticalMcpRestartSurface);
  const registryStatus = hostRuntimeRegistry?.status === 'ok' ? 'available' : 'unavailable';
  return {
    schema: 'narada.mcp.stale_surface_pressure.v0',
    status: staleSurfaces.length > 0 ? 'active' : 'clear',
    site_loci: buildCanonicalSiteLoci(),
    pressure_kind: 'stale_live_mcp_surface',
    severity: criticalSurfaces.length > 0 ? 'critical' : staleSurfaces.length > 0 ? 'warning' : 'none',
    summary: staleSurfaces.length > 0
      ? `${accounting.counts.pending_restart} local MCP surface(s) have pending restart markers; ${accounting.counts.missing_observation} have missing observation evidence; ${accounting.counts.registry_hygiene} registry hygiene item(s) are advisory; ${criticalSurfaces.length} require critical carrier/session disposition.`
      : 'No stale live MCP surface pressure detected.',
    readiness_accounting: accounting,
    counts: accounting.counts,
    surfaces: staleSurfaces.map((entry) => ({
      surface_id: entry.surface_id ?? null,
      server_name: entry.server_name ?? null,
      server_entrypoint: entry.server_entrypoint ?? null,
      pending_restart: entry.pending_restart === true,
      stale_live_surface_possible: entry.stale_live_surface_possible === true,
      restart_request_state: entry.restart_request_state ?? 'unknown',
      source_newer_than_baseline: entry.source_newer_than_baseline === true,
      self_restart_supported: entry.self_restart_supported === true,
      restart_mechanism: entry.restart_mechanism ?? 'unknown',
      startup_disposition: entry.startup_disposition ?? null,
      carrier_session_binding: entry.carrier_session_binding ?? null,
      disposition: entry.disposition ?? buildMcpRestartDisposition(entry),
      operator_guidance: entry.operator_guidance ?? null,
      sanctioned_remediation: entry.sanctioned_remediation ?? [],
      current_max_path: entry.source?.current_max_path ?? null,
    })),
    pc_runtime_registry_status: registryStatus,
    pc_runtime_registry_ref: hostRuntimeRegistry?.registry_path ?? null,
    next_actions: staleSurfaces.length > 0
      ? [
          criticalSurfaces.length > 0
            ? 'Treat terminal MCP restart dispositions as critical startup nonconformance.'
            : 'Treat nonterminal MCP restart dispositions as advisory until baseline/runtime projection is refreshed.',
          registryStatus === 'available'
            ? 'Use PC-locus runtime disposition evidence to choose restart coordination, external carrier action, acknowledged refresh, or missing-evidence blocker.'
            : 'Register enough PC-locus carrier/runtime evidence for restart coordination to act.',
          criticalSurfaces.length > 0
            ? 'Until the terminal restart disposition is resolved, block normal readiness/standby claims.'
            : 'Do not demand parent-carrier restart when live boot and carrier evidence contradict a no-request marker.',
          'Use fresh one-shot MCP verification only as bounded evidence, not as proof that the live carrier was restarted.',
        ]
      : [],
    is_navigation_pressure: staleSurfaces.length > 0,
  };
}

function hasCriticalMcpRestartNonconformance(mcpPressure) {
  return (mcpPressure?.surfaces ?? []).some(isCriticalMcpRestartSurface);
}

function buildSiteOwnedMcpReadiness(mcpPressure, mcpRestartReadiness, hostRuntimeRegistry = null) {
  const accounting = mcpPressure?.readiness_accounting ?? buildMcpReadinessAccounting(mcpRestartReadiness, hostRuntimeRegistry);
  const surfaces = accounting.surfaces ?? [];
  const localBlockers = [];
  const localAdvisoryDebt = [];
  const foreignSubstrateAdvisory = [];
  for (const surface of surfaces) {
    const compact = compactMcpReadinessSurface(surface);
    if (surface.foreign_status === true || surface.pc_runtime?.foreign_status === true) {
      foreignSubstrateAdvisory.push({
        ...compact,
        reason: 'foreign_site_status_advisory',
        authority_owner: surface.registry_authority?.owning_site
          ?? surface.pc_runtime?.registry_authority?.owning_site
          ?? null,
        ordinary_cross_site_boundary: surface.registry_authority?.ordinary_cross_site_boundary
          ?? surface.pc_runtime?.registry_authority?.ordinary_cross_site_boundary
          ?? 'postal_admitted_envelope_only',
      });
      continue;
    }
    const disposition = surface.disposition ?? buildMcpRestartDisposition(surface);
    if (surface.pending_restart === true && disposition?.terminal_blocker === true) {
      localBlockers.push({
        ...compact,
        reason: 'local_pending_restart_terminal_disposition',
        required_external_action: disposition.required_external_action ?? null,
      });
      continue;
    }
    if (surface.pending_restart === true || surface.stale_live_surface_possible === true) {
      localAdvisoryDebt.push({
        ...compact,
        reason: surface.pending_restart === true ? 'local_pending_restart_nonterminal' : 'local_stale_surface_possible',
      });
      continue;
    }
    if (surface.pc_runtime?.observation_freshness === 'missing' || surface.source_newer_than_baseline === true) {
      localAdvisoryDebt.push({
        ...compact,
        reason: surface.pc_runtime?.observation_freshness === 'missing' ? 'missing_local_observation' : 'local_source_newer_than_baseline',
      });
    }
  }
  const registryStatus = hostRuntimeRegistry?.status === 'ok' ? 'available' : 'unavailable';
  const nextActions = [];
  if (localBlockers.length > 0) {
    nextActions.push('Resolve local MCP blockers through admitted restart/carrier authority before declaring startup ready.');
  }
  if (localAdvisoryDebt.length > 0) {
    nextActions.push('Refresh local MCP observation evidence or prove the affected surface is not needed for the next action.');
  }
  if (foreignSubstrateAdvisory.length > 0) {
    nextActions.push('Route foreign MCP status through postal handoff/restart_request to the owning Site; do not count it as local startup blocking evidence.');
  }
  return {
    schema: 'narada.mcp.site_owned_readiness.v0',
    status: localBlockers.length > 0
      ? 'blocked_local'
      : localAdvisoryDebt.length > 0 ? 'ready_with_local_advisory_debt' : 'ready',
    site_loci: buildCanonicalSiteLoci(),
    authority_site_locus: hostRuntimeRegistry?.site_registry_authority?.owning_site_locus
      ?? NARADA_USER_SITE_LOCUS,
    pc_runtime_locus: hostRuntimeRegistry?.pc_runtime_locus
      ?? hostRuntimeRegistry?.site_registry_authority?.pc_runtime_locus
      ?? NARADA_PC_SITE_LOCUS,
    scope: 'current_site_owned_mcp_surfaces',
    registry_status: registryStatus,
    counts: {
      local_blockers: localBlockers.length,
      local_advisory_debt: localAdvisoryDebt.length,
      foreign_substrate_advisory: foreignSubstrateAdvisory.length,
      canonical_surface_count: accounting.canonical_surface_count ?? surfaces.length,
      raw_surface_count: accounting.raw_surface_count ?? surfaces.length,
      deduplicated_alias_count: accounting.deduplicated_alias_count ?? 0,
    },
    local_blockers: localBlockers,
    local_advisory_debt: localAdvisoryDebt,
    foreign_substrate_advisory: foreignSubstrateAdvisory,
    accounting,
    operator_summary: localBlockers.length > 0
      ? `${localBlockers.length} local MCP blocker(s); ${localAdvisoryDebt.length} local advisory item(s); ${foreignSubstrateAdvisory.length} foreign/substrate advisory item(s).`
      : `${localAdvisoryDebt.length} local advisory MCP item(s); ${foreignSubstrateAdvisory.length} foreign/substrate advisory item(s).`,
    next_actions: nextActions,
  };
}

function compactMcpReadinessSurface(surface) {
  const disposition = surface.disposition ?? buildMcpRestartDisposition(surface);
  return {
    surface_id: surface.surface_id ?? null,
    server_name: surface.server_name ?? null,
    server_entrypoint: surface.server_entrypoint ?? null,
    pending_restart: surface.pending_restart === true,
    stale_live_surface_possible: surface.stale_live_surface_possible === true,
    restart_request_state: surface.restart_request_state ?? 'unknown',
    restart_disposition: disposition?.restart_disposition ?? disposition?.status ?? null,
    disposition_status: disposition?.status ?? null,
    required_external_action: disposition?.required_external_action ?? null,
  };
}

function isCriticalMcpRestartSurface(surface) {
  if (surface?.pending_restart !== true) return false;
  const disposition = surface.disposition ?? buildMcpRestartDisposition(surface);
  return disposition?.terminal_blocker === true;
}

function buildHydrateMcpRestartReadiness({ taskLifecycleNext, hostRuntimeRegistry = null }) {
  const agentContextFreshness = buildMcpFreshnessStatus({
    siteRoot,
    serverName: SERVER_NAME,
    serverEntryPoint: 'tools/agent-context/agent-context-mcp-server.mjs',
    serverBootedAt: SERVER_BOOTED_AT,
    watchedPaths: ['tools/agent-context', 'tools/mcp-freshness-service.mjs'],
    expectedTools: EXPECTED_TOOL_NAMES,
    registeredTools: TOOLS.map((tool) => tool.name).sort(),
    restartRequestPath: join(siteRoot, '.ai', 'tmp', 'agent-context-restart-request.json'),
    baselinePath: join(siteRoot, '.ai', 'tmp', 'agent-context-mcp-baseline.json'),
    restartToolName: 'agent_context_restart',
  });
  const localReadiness = [agentContextFreshness, taskLifecycleNext?.mcp_freshness]
    .filter(Boolean)
    .map(compactMcpRestartReadiness);
  return mergePcRuntimeRestartReadiness({ localReadiness, hostRuntimeRegistry });
}

function compactMcpRestartReadiness(freshness) {
  const selfRestartSupported = freshness.live_process?.self_restart_supported === true;
  const restartMechanism = selfRestartSupported
    ? 'self_restart_supported'
    : 'external_stdio_mcp_restart_required';
  return {
    schema: 'narada.mcp.restart_readiness.v0',
    server_name: freshness.server_name ?? null,
    server_entrypoint: freshness.server_entrypoint ?? null,
    pending_restart: freshness.pending_restart === true,
    stale_live_surface_possible: freshness.stale_live_surface_possible === true,
    source_newer_than_baseline: freshness.baseline?.source_newer_than_baseline === true,
    restart_request_state: freshness.restart_request?.state ?? 'unknown',
    self_restart_supported: selfRestartSupported,
    restart_mechanism: restartMechanism,
    live_process: freshness.live_process ?? null,
    carrier_session_binding: buildLocalMcpCarrierSessionBinding(),
    source: {
      watched_paths: freshness.source?.watched_paths ?? [],
      current_max_path: freshness.source?.current_max_path ?? null,
      current_max_mtime: freshness.source?.current_max_mtime ?? null,
    },
    tool_surface: freshness.tool_surface ?? null,
    operator_guidance: freshness.pending_restart === true
      ? (selfRestartSupported
        ? 'Use the MCP restart tool for this surface, then re-run readiness.'
        : 'This stdio MCP server cannot restart itself. Use fresh-server probes for verification until the carrier/session MCP servers are restarted externally; do not use native shell as a fallback.')
      : 'No restart is currently indicated for this MCP surface.',
    sanctioned_remediation: freshness.remediation ?? [],
  };
}

function buildLocalMcpCarrierSessionBinding() {
  const carrierSessionId = process.env.NARADA_CARRIER_SESSION_ID || null;
  if (!carrierSessionId) return null;
  const pcSiteRoot = process.env.NARADA_PC_SITE_ROOT || 'C:/ProgramData/Narada/sites/pc/desktop-sunroom-2';
  const recordPath = join(resolve(pcSiteRoot), 'runtime', 'carrier-sessions', `${carrierSessionId}.json`);
  const record = readMcpFreshnessJsonFile(recordPath);
  return {
    schema: 'narada.pc_runtime.mcp_child_carrier_session_binding.v0',
    status: record && record.status !== 'unreadable' ? 'bound_to_parent_carrier_session' : 'carrier_session_record_missing',
    carrier_session_id: carrierSessionId,
    verification_source: 'NARADA_CARRIER_SESSION_ID',
    parent_carrier_session_ref: {
      schema: 'narada.pc_runtime.parent_carrier_session_ref.v0',
      carrier_session_id: carrierSessionId,
      record_path: recordPath,
      record_status: record && record.status !== 'unreadable' ? 'found' : 'missing',
      verification_source: 'NARADA_CARRIER_SESSION_ID',
    },
    record_summary: record && record.status !== 'unreadable'
      ? {
          status: record.status ?? null,
          verified_agent_identity: record.verified_agent_identity ?? record.principal ?? null,
          agent_start_event_id: record.agent_start_event_id ?? null,
          started_at: record.started_at ?? record.created_at ?? null,
          restart_handle: record.restart_handle ?? null,
        }
      : null,
  };
}

function buildHydrateHostRuntimeRegistryStatus() {
  try {
    return buildMcpRuntimeRegistryStatus({
      siteRoot,
      pcSiteRoot: process.env.NARADA_PC_SITE_ROOT || undefined,
    });
  } catch (error) {
    return {
      status: 'unavailable',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function autoAcknowledgeHydrateMcpRefreshes({ mcpRestartReadiness, taskLifecycleNext }) {
  const results = [];
  for (const entry of mcpRestartReadiness ?? []) {
    const config = hydrateAutoAckConfigForSurface(entry, taskLifecycleNext);
    if (!config) continue;
    if (isNoRequestFreshnessMarkerContradicted(entry)) {
      const result = reconcileNoRequestMcpFreshnessMarker({
        siteRoot,
        pcSiteRoot: process.env.NARADA_PC_SITE_ROOT || undefined,
        ...config,
        reconciledBy: process.env.NARADA_AGENT_ID ?? null,
        reason: 'startup hydration reconciled no-request freshness marker from live carrier evidence',
        note: 'No-request MCP freshness marker reconciled during startup hydration after live carrier verification.',
      });
      results.push({
        surface_id: entry.surface_id ?? config.targetSurface,
        server_name: entry.server_name ?? config.serverName,
        status: result.status === 'no_request_freshness_marker_reconciled'
          ? 'stale_marker_contradicted_acknowledged'
          : result.status,
        reason: result.reason ?? result.validation?.reason ?? 'live_boot_and_carrier_evidence_contradict_no_request_restart_marker',
        acknowledged_at: result.reconciled_at ?? new Date().toISOString(),
        registry_reconciliation_status: result.registry_reconciliation?.status ?? null,
        reconciliation_status: result.status,
        validation: result.validation ?? null,
      });
      continue;
    }
    if (entry?.restart_request_state !== 'restart_requested') continue;
    const result = acknowledgeMcpRestartRequest({
      siteRoot,
      pcSiteRoot: process.env.NARADA_PC_SITE_ROOT || undefined,
      ...config,
      acknowledgedBy: process.env.NARADA_AGENT_ID ?? null,
      reason: 'startup hydration auto-acknowledged already-refreshed MCP surface from PC runtime evidence',
    });
    results.push({
      surface_id: entry.surface_id ?? config.targetSurface,
      server_name: entry.server_name ?? config.serverName,
      status: result.status,
      reason: result.reason ?? result.validation?.reason ?? null,
      acknowledged_at: result.acknowledged_at ?? null,
      registry_reconciliation_status: result.registry_reconciliation?.status ?? null,
    });
  }
  return {
    schema: 'narada.agent_context.mcp_restart_auto_acknowledgement.v0',
    status: results.some((result) => isHydrateMcpAutoAckStatus(result.status))
      ? 'acknowledged'
      : results.length > 0 ? 'attempted_no_acknowledgement' : 'not_applicable',
    acknowledged: results.filter((result) => isHydrateMcpAutoAckStatus(result.status)),
    rejected: results.filter((result) => !isHydrateMcpAutoAckStatus(result.status)),
  };
}

function isHydrateMcpAutoAckStatus(status) {
  return status === 'restart_acknowledged' || status === 'stale_marker_contradicted_acknowledged';
}

function hydrateAutoAckConfigForSurface(entry, taskLifecycleNext) {
  if (entry?.surface_id === 'agent-context-mcp.local'
    || entry?.server_entrypoint === 'tools/agent-context/agent-context-mcp-server.mjs') {
    return {
      serverName: SERVER_NAME,
      targetSurface: 'agent-context-mcp.local',
      targetEntrypoint: 'tools/agent-context/agent-context-mcp-server.mjs',
      restartRequestPath: join(siteRoot, '.ai', 'tmp', 'agent-context-restart-request.json'),
      baselinePath: join(siteRoot, '.ai', 'tmp', 'agent-context-mcp-baseline.json'),
      watchedPaths: ['tools/agent-context', 'tools/mcp-freshness-service.mjs'],
      expectedTools: EXPECTED_TOOL_NAMES,
      registeredTools: TOOLS.map((tool) => tool.name).sort(),
      note: 'Agent-context MCP restart auto-acknowledged during startup hydration after post-request boot evidence.',
    };
  }
  if (entry?.surface_id === 'task-lifecycle-mcp.local'
    || entry?.server_entrypoint === 'task-lifecycle-mcp'
    || entry?.server_entrypoint === 'tools/task-lifecycle/task-mcp-server.mjs'
    || entry?.server_entrypoint === 'node_modules/@narada2/task-lifecycle-mcp/dist/src/task-lifecycle/task-mcp-server.js'
    || entry?.server_entrypoint === 'node_modules/@narada2/task-lifecycle-mcp/src/task-lifecycle/task-mcp-server.mjs') {
    if (taskLifecycleNext?.status !== 'ok') return null;
    const taskToolNames = taskLifecycleTools().map((tool) => tool.name).sort();
    return {
      serverName: 'narada-task-lifecycle-mcp',
      targetSurface: 'task-lifecycle-mcp.local',
      targetEntrypoint: 'task-lifecycle-mcp',
      restartRequestPath: join(siteRoot, '.ai', 'tmp', 'task-lifecycle-restart-request.json'),
      baselinePath: join(siteRoot, '.ai', 'tmp', 'task-lifecycle-mcp-baseline.json'),
      watchedPaths: ['node_modules/@narada2/task-lifecycle-mcp/dist/src', 'node_modules/@narada2/task-lifecycle-mcp/src', 'node_modules/@narada2/mcp-transport', 'tools/task-lifecycle'],
      expectedTools: taskToolNames,
      registeredTools: taskToolNames,
      note: 'Task-lifecycle MCP restart auto-acknowledged during startup hydration after post-request boot evidence.',
    };
  }
  return null;
}

function mergePcRuntimeRestartReadiness({ localReadiness, hostRuntimeRegistry }) {
  if (hostRuntimeRegistry?.status !== 'ok') return localReadiness;
  const byServerName = new Map(localReadiness.map((entry) => [entry.server_name, entry]));
  const byEntrypoint = new Map(localReadiness.map((entry) => [entry.server_entrypoint, entry]));
  const merged = [...localReadiness];
  for (const surface of hostRuntimeRegistry.known_surfaces ?? []) {
    const surfaceEntrypoint = surface.server_entrypoint ?? surface.entrypoint ?? null;
    const local = byServerName.get(surface.server_name) ?? byEntrypoint.get(surfaceEntrypoint);
    const readiness = compactPcRuntimeSurfaceReadiness(surface, local);
    if (local) {
      Object.assign(local, readiness);
    } else {
      merged.push(readiness);
    }
  }
  return merged;
}

function compactPcRuntimeSurfaceReadiness(surface, local = null) {
  const serverEntrypoint = surface.server_entrypoint ?? surface.entrypoint ?? local?.server_entrypoint ?? null;
  const registryAuthority = surface.registry_authority ?? null;
  const localStartupBlockingAllowed = registryAuthority?.local_startup_blocking_allowed !== false;
  const foreignStatus = registryAuthority?.authority_scope === 'foreign_site_status_advisory';
  const surfacePendingRestart = localStartupBlockingAllowed && (
    surface.restart_request?.state === 'restart_requested'
    || surface.source_freshness?.pending_restart === true
  );
  const pendingRestart = surfacePendingRestart
    || local?.pending_restart === true;
  const hasLiveRuntimeEvidence = Boolean(surface.runtime?.pid ?? local?.live_process?.pid);
  const staleLiveSurfacePossible = (localStartupBlockingAllowed && hasLiveRuntimeEvidence && surface.observed_state === 'live_surface_stale')
    || pendingRestart
    || (localStartupBlockingAllowed && surface.source_freshness?.source_newer_than_baseline === true)
    || local?.stale_live_surface_possible === true;
  const selfRestartSupported = surface.self_restart_supported === true || local?.self_restart_supported === true;
  const readiness = {
    schema: 'narada.mcp.restart_readiness.v0',
    server_name: surface.server_name ?? local?.server_name ?? null,
    server_entrypoint: serverEntrypoint,
    surface_id: surface.surface_id ?? null,
    pending_restart: pendingRestart,
    stale_live_surface_possible: staleLiveSurfacePossible,
    source_newer_than_baseline: surface.source_freshness?.source_newer_than_baseline === true
      || local?.source_newer_than_baseline === true,
    restart_request_state: surface.restart_request?.state ?? local?.restart_request_state ?? 'unknown',
    self_restart_supported: selfRestartSupported,
    restart_mechanism: selfRestartSupported
      ? 'pc_runtime_supervisor_restart_possible'
      : surface.restart_semantics === 'carrier_session_restart_required'
        ? 'external_stdio_mcp_restart_required'
        : local?.restart_mechanism ?? 'restart_capability_unproven',
    live_process: local?.live_process ?? surface.runtime ?? null,
    source: {
      watched_paths: local?.source?.watched_paths ?? [],
      current_max_path: local?.source?.current_max_path ?? null,
      current_max_mtime: surface.source_freshness?.source_max_mtime ?? local?.source?.current_max_mtime ?? null,
    },
    tool_surface: local?.tool_surface ?? null,
    pc_runtime: {
      supervisor_locus: surface.supervisor_locus ?? NARADA_PC_SITE_LOCUS,
      pc_runtime_locus: surface.pc_runtime_locus ?? NARADA_PC_SITE_LOCUS,
      carrier_session_owner: surface.carrier_session_owner ?? null,
      observed_state: surface.observed_state ?? null,
      observation_freshness: surface.observation_freshness ?? null,
      restart_semantics: surface.restart_semantics ?? null,
      startup_disposition: surface.startup_disposition ?? null,
      carrier_session_binding: surface.carrier_session_binding ?? null,
      missing_carrier_action: surface.missing_carrier_action ?? null,
      critical_nonconformance: surface.critical_nonconformance ?? null,
      registry_authority: registryAuthority,
      foreign_status: foreignStatus,
    },
    registry_authority: registryAuthority,
    foreign_status: foreignStatus,
    carrier_session_binding: surface.carrier_session_binding ?? null,
    startup_disposition: surface.startup_disposition ?? null,
    operator_guidance: buildMcpOperatorGuidance({ surface, local }),
    sanctioned_remediation: buildMcpSanctionedRemediation({ surface, local }),
  };
  readiness.disposition = buildMcpRestartDisposition(readiness);
  readiness.restart_disposition = readiness.disposition?.restart_disposition ?? readiness.disposition?.status ?? null;
  return readiness;
}

function buildMcpReadinessAccounting(mcpRestartReadiness, hostRuntimeRegistry = null) {
  const canonical = new Map();
  for (const entry of mcpRestartReadiness ?? []) {
    if (!entry) continue;
    const key = canonicalMcpReadinessKey(entry);
    const existing = canonical.get(key);
    canonical.set(key, existing ? mergeMcpReadinessEntry(existing, entry) : { ...entry });
  }
  const surfaces = [...canonical.values()];
  const hostInstances = hostRuntimeRegistry?.host_freshness_projection?.instances ?? [];
  const counts = {
    pending_restart: 0,
    missing_observation: 0,
    callable_now: 0,
    stale_source: 0,
    registry_hygiene: 0,
    foreign_status: 0,
  };
  for (const surface of surfaces) {
    const foreignStatus = surface.foreign_status === true || surface.pc_runtime?.foreign_status === true;
    if (!foreignStatus && (surface.pending_restart === true || surface.restart_request_state === 'restart_requested')) counts.pending_restart += 1;
    if (surface.source_newer_than_baseline === true) counts.stale_source += 1;
    if (surface.pc_runtime?.observation_freshness === 'missing') counts.missing_observation += 1;
    if (surface.pending_restart !== true
      && surface.stale_live_surface_possible !== true
      && surface.pc_runtime?.observation_freshness === 'fresh') counts.callable_now += 1;
    if (foreignStatus) counts.foreign_status += 1;
  }
  counts.registry_hygiene = Math.max(0, hostInstances.length - surfaces.length);
  return {
    schema: 'narada.mcp.readiness_accounting.v0',
    status: 'ok',
    canonical_surface_count: surfaces.length,
    raw_surface_count: (mcpRestartReadiness ?? []).filter(Boolean).length,
    deduplicated_alias_count: Math.max(0, (mcpRestartReadiness ?? []).filter(Boolean).length - surfaces.length),
    counts,
    surfaces,
  };
}

function canonicalMcpReadinessKey(entry) {
  return entry.surface_id
    ?? entry.server_entrypoint
    ?? entry.server_name
    ?? 'unknown-mcp-surface';
}

function mergeMcpReadinessEntry(left, right) {
  const merged = { ...left, ...right };
  merged.pending_restart = left.pending_restart === true || right.pending_restart === true;
  merged.stale_live_surface_possible = left.stale_live_surface_possible === true || right.stale_live_surface_possible === true;
  merged.source_newer_than_baseline = left.source_newer_than_baseline === true || right.source_newer_than_baseline === true;
  merged.surface_id = left.surface_id ?? right.surface_id ?? null;
  merged.server_entrypoint = left.server_entrypoint ?? right.server_entrypoint ?? null;
  merged.server_name = left.server_name ?? right.server_name ?? null;
  merged.sanctioned_remediation = [...new Set([...(left.sanctioned_remediation ?? []), ...(right.sanctioned_remediation ?? [])])];
  merged.disposition = right.disposition ?? left.disposition ?? buildMcpRestartDisposition(merged);
  return merged;
}

function isNoRequestFreshnessMarkerContradicted(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.restart_request_state !== 'no_restart_request') return false;
  if (entry.pending_restart !== true && entry.stale_live_surface_possible !== true) return false;
  const sourceEpoch = mcpSourceEpoch(entry);
  const bootEpoch = mcpBootEpoch(entry);
  if (!Number.isFinite(sourceEpoch) || !Number.isFinite(bootEpoch) || bootEpoch < sourceEpoch) return false;
  return hasMcpCarrierSessionEvidence(entry);
}

function hasMcpCarrierSessionEvidence(entry) {
  const binding = entry?.carrier_session_binding ?? entry?.pc_runtime?.carrier_session_binding ?? null;
  const bindingStatus = binding?.status ?? null;
  const parentRef = binding?.parent_carrier_session_ref ?? entry?.parent_carrier_session_ref ?? null;
  const restartHandle = binding?.record_summary?.restart_handle ?? entry?.restart_handle ?? null;
  return bindingStatus === 'bound_to_parent_carrier_session'
    || parentRef?.record_status === 'found'
    || Boolean(restartHandle?.handle || restartHandle?.class);
}

function mcpSourceEpoch(entry) {
  const candidates = [
    entry?.source?.current_max_mtime,
    entry?.pc_runtime?.source_freshness?.source_max_mtime,
    entry?.source_freshness?.source_max_mtime,
    entry?.source_epoch,
  ];
  return firstFiniteEpoch(candidates);
}

function mcpBootEpoch(entry) {
  const candidates = [
    entry?.live_process?.booted_at,
    entry?.pc_runtime?.runtime?.booted_at,
    entry?.runtime?.booted_at,
    entry?.booted_at,
  ];
  return firstFiniteEpoch(candidates);
}

function firstFiniteEpoch(candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      const numeric = Number(candidate);
      if (Number.isFinite(numeric)) return numeric;
      const parsed = Date.parse(candidate);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return NaN;
}

function buildMcpRestartDisposition(entry) {
  if (entry?.pending_restart !== true && entry?.stale_live_surface_possible !== true) {
    return {
      status: 'clear',
      restart_disposition: 'clear',
      authority_owner: 'live_mcp_surface',
      required_external_action: null,
      terminal_blocker: false,
    };
  }
  if (isNoRequestFreshnessMarkerContradicted(entry)) {
    return {
      status: 'stale_marker_contradicted',
      restart_disposition: 'stale_marker_contradicted',
      authority_owner: 'live_mcp_surface',
      required_external_action: 'refresh_baseline_or_runtime_projection_without_parent_restart',
      terminal_blocker: false,
      reason: 'no_restart_request_and_live_boot_is_newer_than_source_with_carrier_evidence',
    };
  }
  if (entry?.startup_disposition === 'operator_restart_required_with_handle') {
    return {
      status: 'operator_restart_required_with_handle',
      restart_disposition: 'external_restart_required',
      authority_owner: 'operator_or_parent_carrier_session',
      required_external_action: 'restart_parent_carrier_session_using_recorded_handle_then_rehydrate',
      terminal_blocker: true,
      reason: 'stdio_child_cannot_restart_itself_but_parent_restart_handle_is_recorded',
    };
  }
  if (entry?.startup_disposition === 'already_refreshed_acknowledgeable') {
    return {
      status: 'already_refreshed_acknowledgeable',
      restart_disposition: 'restart_acknowledgeable',
      authority_owner: 'pc_site_runtime',
      required_external_action: 'acknowledge_restart_marker_after_post_restart_boot_evidence',
      terminal_blocker: false,
      reason: 'post_restart_runtime_evidence_available',
    };
  }
  if (entry?.startup_disposition === 'legacy_unbound_carrier_session') {
    return {
      status: 'legacy_unbound_carrier_session',
      restart_disposition: 'missing_runtime_evidence',
      authority_owner: 'pc_site_runtime',
      required_external_action: 'relaunch_through_registered_agent_start_path_to_inherit_NARADA_CARRIER_SESSION_ID',
      terminal_blocker: true,
      reason: 'legacy_session_missing_verified_carrier_session_id',
      migration_guidance: entry?.carrier_session_binding?.migration_guidance ?? null,
    };
  }
  if (entry?.startup_disposition === 'terminal_blocked_missing_parent_carrier_restart_handle'
    || entry?.startup_disposition === 'terminal_blocked_missing_embodiment_authority') {
    return {
      status: entry.startup_disposition,
      restart_disposition: 'missing_runtime_evidence',
      authority_owner: 'pc_site_runtime',
      required_external_action: 'register_or_relaunch_with_carrier_session_authority_before_restart_instruction',
      terminal_blocker: true,
      reason: 'missing_verified_parent_carrier_session_restart_handle',
      migration_guidance: entry?.carrier_session_binding?.migration_guidance ?? null,
    };
  }
  if (entry?.self_restart_supported === true
    || entry?.restart_mechanism === 'pc_runtime_supervisor_restart_possible'
    || entry?.startup_disposition === 'restartable_by_supervisor') {
    return {
      status: 'restartable_by_admitted_coordinator',
      restart_disposition: 'restart_required',
      authority_owner: 'pc_site_runtime',
      required_external_action: 'invoke_operator_surface_mcp_restart_request_with_mutating_authority',
      terminal_blocker: false,
    };
  }
  if (entry?.restart_mechanism === 'external_stdio_mcp_restart_required'
    || entry?.restart_semantics === 'carrier_session_restart_required'
    || entry?.missing_carrier_action === 'external_stdio_mcp_restart_required') {
    return {
      status: 'terminal_blocked_missing_parent_carrier_restart_handle',
      restart_disposition: 'missing_runtime_evidence',
      authority_owner: 'pc_site_runtime',
      required_external_action: 'register_or_relaunch_with_carrier_session_authority_before_restart_instruction',
      terminal_blocker: true,
      reason: 'stdio_child_restart_handle_missing_or_unproven',
    };
  }
  return {
    status: 'terminal_missing_carrier_evidence',
    restart_disposition: 'missing_runtime_evidence',
    authority_owner: 'pc_site_runtime',
    required_external_action: 'register_pc_locus_carrier_runtime_evidence_or_declare_external_restart_owner',
    terminal_blocker: true,
  };
}

function buildMcpOperatorGuidance({ surface, local }) {
  const migrationGuidance = surface.carrier_session_binding?.migration_guidance;
  if (migrationGuidance?.operator_guidance) return migrationGuidance.operator_guidance;
  if (surface.startup_disposition === 'operator_restart_required_with_handle') {
    return 'Restart the recorded parent carrier/session handle, then re-run hydration and acknowledge the restart marker only after post-request boot evidence.';
  }
  if (surface.startup_disposition === 'terminal_blocked_missing_parent_carrier_restart_handle'
    || surface.startup_disposition === 'terminal_blocked_missing_embodiment_authority') {
    return 'Relaunch through the registered Narada agent-start path to create carrier session authority before issuing restart or acknowledgement instructions.';
  }
  if (surface.startup_disposition === 'restartable_by_supervisor') {
    return 'Use operator_surface_mcp_restart_request through the admitted PC runtime coordinator.';
  }
  return local?.operator_guidance ?? 'Use PC runtime registry evidence to decide restart disposition.';
}

function buildMcpSanctionedRemediation({ surface, local }) {
  const remediation = [...(local?.sanctioned_remediation ?? [])];
  const migrationPath = surface.carrier_session_binding?.migration_guidance?.migration_path;
  if (migrationPath && !remediation.includes(migrationPath)) remediation.push(migrationPath);
  if ((surface.startup_disposition === 'terminal_blocked_missing_parent_carrier_restart_handle'
    || surface.startup_disposition === 'terminal_blocked_missing_embodiment_authority')
    && !remediation.includes('register_or_relaunch_with_carrier_session_authority_before_restart_instruction')) {
    remediation.push('register_or_relaunch_with_carrier_session_authority_before_restart_instruction');
  }
  return remediation;
}

function compactHostRuntimeRegistry(hostRuntimeRegistry) {
  if (!hostRuntimeRegistry) return null;
  if (hostRuntimeRegistry.status !== 'ok') {
    return {
      status: hostRuntimeRegistry.status ?? 'unavailable',
      reason: hostRuntimeRegistry.reason ?? null,
    };
  }
  return {
    status: 'ok',
    supervisor_locus: hostRuntimeRegistry.supervisor_locus ?? null,
    registry_path: hostRuntimeRegistry.registry_path ?? null,
    known_surface_count: hostRuntimeRegistry.known_surface_count ?? null,
    host_freshness_projection: hostRuntimeRegistry.host_freshness_projection
      ? {
          schema: hostRuntimeRegistry.host_freshness_projection.schema ?? null,
          status: hostRuntimeRegistry.host_freshness_projection.status ?? null,
          known_surface_count: hostRuntimeRegistry.host_freshness_projection.known_surface_count ?? null,
          instance_count: Array.isArray(hostRuntimeRegistry.host_freshness_projection.instances)
            ? hostRuntimeRegistry.host_freshness_projection.instances.length
            : 0,
          pc_runtime_locus: hostRuntimeRegistry.host_freshness_projection.pc_runtime_locus ?? null,
          user_site_locus: hostRuntimeRegistry.host_freshness_projection.user_site_locus ?? null,
        }
      : null,
    notes: hostRuntimeRegistry.notes ?? [],
  };
}

function compactSiteLiftOrientation(siteLiftOrientation, rawEvidenceRef = null, { includeTopArtifacts = true } = {}) {
  if (!siteLiftOrientation) return null;
  return {
    schema: siteLiftOrientation.schema,
    status: siteLiftOrientation.status,
    surface_id: siteLiftOrientation.surface_id,
    catalog_path: siteLiftOrientation.catalog_path,
    catalog_posture: siteLiftOrientation.catalog_posture,
    authority_posture: siteLiftOrientation.authority_posture,
    role_visibility: siteLiftOrientation.role_visibility,
    available_tools: siteLiftOrientation.available_tools ?? [],
    ...(includeTopArtifacts ? { top_artifacts: siteLiftOrientation.top_artifacts ?? [] } : {}),
    top_artifact_count: Array.isArray(siteLiftOrientation.top_artifacts) ? siteLiftOrientation.top_artifacts.length : null,
    receiving_site_must_admit: siteLiftOrientation.receiving_site_must_admit === true,
    no_copy_or_install_authority: siteLiftOrientation.no_copy_or_install_authority === true,
    reason: siteLiftOrientation.reason ?? null,
    raw_evidence_ref: rawEvidenceRef,
  };
}

function computeStartupReadinessStatus({
  identityVerified,
  hasVerifiedBadge,
  groundingStatus,
  groundingEventReturned,
  cardStatus,
  cardHasSnapshot,
  workboardLive,
  operatorOverrideRef,
  activeBlockers,
  policyConstraints = [],
  criticalMcpRestartNonconformance,
}) {
  if (!identityVerified) return 'blocked_identity';
  if (!hasVerifiedBadge) return 'blocked_capability';
  if (criticalMcpRestartNonconformance) return 'blocked_mcp_restart_nonconformance';
  if (!workboardLive) return 'blocked_workboard';
  if (activeBlockers.length > 0) return 'blocked_stale_checkpoint_state';
  if (groundingStatus === 'unavailable' && !operatorOverrideRef) return 'blocked_grounding';
  if (cardStatus === 'missing') return 'blocked_orientation';
  if (policyConstraints.length > 0) return 'ready_with_constraints';
  const residual = groundingStatus !== 'grounded'
    || !groundingEventReturned
    || cardStatus !== 'loaded'
    || !cardHasSnapshot;
  return residual ? 'ready_with_residuals' : 'ready';
}

function computeStartupActionAuthority({ checkpoint, status }) {
  if (status?.startsWith('blocked_')) return 'observation_only';
  if (checkpoint?.status === 'ok' && checkpoint.active_task) return 'continue_authorized';
  return 'observation_only';
}

function summarizeStartupReadiness({ status, actionAuthority, recommendedNextAction, mcpPressure, mcpSiteReadiness }) {
  const siteOwnedMcpSummary = mcpSiteReadiness?.operator_summary
    ? ` Site-owned MCP readiness: ${mcpSiteReadiness.operator_summary}`
    : '';
  if (!recommendedNextAction && mcpPressure?.status === 'active') {
    if (mcpPressure.severity !== 'critical') {
      return `Startup status ${status}; local MCP advisory pressure is active but not a critical startup nonconformance.${siteOwnedMcpSummary} Work may proceed only when the affected surface is not needed; do not declare clean standby/readiness until the pressure is resolved or superseded by fresh evidence.`;
    }
    return `Startup status ${status}; no task workboard action is available, and local MCP restart staleness is a critical nonconformance until carrier/session restart capability and live evidence are proven.${siteOwnedMcpSummary}`;
  }
  if (status === 'ready') {
    return `Startup ready; action authority is ${actionAuthority}.`;
  }
  if (status === 'ready_with_residuals') {
    return `Startup ready with residuals; action authority is ${actionAuthority}.`;
  }
  if (status === 'ready_with_constraints') {
    return `Startup ready with active policy constraints; action authority is ${actionAuthority}.`;
  }
  if (status === 'blocked_identity') {
    return 'Startup blocked: session identity is not mechanically verified.';
  }
  if (status === 'blocked_workboard') {
    return 'Startup blocked: live workboard recommendation is unavailable.';
  }
  if (status === 'blocked_grounding') {
    return 'Startup blocked: doctrinal grounding is unavailable.';
  }
  if (status === 'blocked_orientation') {
    return 'Startup blocked: Site Evolution Orientation card is missing.';
  }
  if (status === 'blocked_capability') {
    return 'Startup blocked: verified badge or capability policy evidence is unavailable.';
  }
  if (status === 'blocked_mcp_restart_nonconformance') {
    return `Startup blocked: local MCP restart staleness is a critical nonconformance until both PC-locus carrier evidence and live restart disposition are proven.${siteOwnedMcpSummary}`;
  }
  if (status === 'blocked_stale_checkpoint_state') {
    return 'Startup blocked: remembered checkpoint state is unreconciled and cannot be treated as current authority.';
  }
  return recommendedNextAction
    ? `Startup status ${status}; recommendation is ${recommendedNextAction.action ?? 'available'}.`
    : `Startup status ${status}.`;
}

function readOsmSendPermissionPolicy() {
  const defaultPolicy = {
    schema: 'narada.site.osm_send_permission_policy.v0',
    mode: 'allowed',
    source: 'default_missing_site_config',
    modes: ['allowed', 'not_allowed', 'on_operator_request_only'],
  };
  const configPath = join(siteRoot, 'config.json');
  if (!existsSync(configPath)) return defaultPolicy;
  let config = null;
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    return {
      ...defaultPolicy,
      mode: 'not_allowed',
      source: 'config_parse_error',
      parse_error_blocks_osm_send: true,
    };
  }
  const policy = config?.runtime_config?.operator_surface_message_send_permission_policy?.current_value
    ?? config?.structural_config?.operator_surface_message_send_permission_policy
    ?? defaultPolicy;
  return {
    schema: policy?.schema ?? defaultPolicy.schema,
    mode: typeof policy?.mode === 'string' ? policy.mode : defaultPolicy.mode,
    source: policy === defaultPolicy ? defaultPolicy.source : 'config.json',
    modes: Array.isArray(policy?.modes) ? policy.modes : defaultPolicy.modes,
    explicit_request_required: policy?.explicit_request_required === true,
    explicit_operator_command_required: policy?.explicit_operator_command_required === true,
    explicit_command_must_name_osm_send_or_handoff: policy?.explicit_command_must_name_osm_send_or_handoff === true,
    prior_context_does_not_carry_osm_authority: policy?.prior_context_does_not_carry_osm_authority === true,
    generic_continuation_phrases_do_not_authorize: Array.isArray(policy?.generic_continuation_phrases_do_not_authorize)
      ? policy.generic_continuation_phrases_do_not_authorize
      : ['go on', 'next', 'continue', 'proceed', 'try now', 'retry'],
  };
}

function buildOsmSendPermissionPolicyConstraint(policy) {
  if (!policy || policy.mode === 'allowed') return null;
  return {
    kind: 'osm_send_permission_policy',
    severity: 'policy',
    source: policy.source ?? null,
    policy_ref: 'runtime_config.operator_surface_message_send_permission_policy',
    mode: policy.mode,
    reason: policy.mode === 'on_operator_request_only'
      ? 'Site config requires an explicit current operator OSM/send/handoff request before OSM sends.'
      : 'Site config does not allow OSM sends.',
  };
}

function reconcileStartupBlockers({ blockers, checkpoint, onboardingCard, mcpPressure, mcpRestartReadiness, osmSendPermissionPolicy }) {
  const active = [];
  const policyConstraints = [];
  const cleared = [];
  const superseded = [];
  for (const blocker of blockers ?? []) {
    const text = stringifyBlocker(blocker).toLowerCase();
    if (isDurableOperatorProhibitionBlocker(text)) {
      if (osmSendPermissionPolicy?.source && osmSendPermissionPolicy.source !== 'default_missing_site_config') {
        superseded.push({
          blocker,
          reason: 'OSM send permission is governed by Site config runtime_config.operator_surface_message_send_permission_policy.',
        });
        continue;
      }
      policyConstraints.push({
        kind: 'durable_operator_prohibition',
        severity: 'policy',
        original_blocker: blocker,
        reason: 'Explicit operator prohibition persists until lifted; it is active policy state, not stale checkpoint residue.',
      });
      continue;
    }
    if (isOrientationReloadBlocker(text) && onboardingCard?.status === 'loaded') {
      cleared.push({
        blocker,
        reason: 'Current hydration returned rehydration_onboarding_card.status=loaded.',
      });
      continue;
    }
    if (text.includes('superseded')) {
      superseded.push({ blocker, reason: 'Checkpoint blocker is already marked superseded.' });
      continue;
    }
    if (isMcpRestartPressureBlocker(text) && isMcpRestartPressureCleared({ mcpPressure, mcpRestartReadiness })) {
      superseded.push({
        blocker,
        reason: 'Live MCP restart readiness reports no pending restart request and no stale live MCP surface pressure.',
      });
      continue;
    }
    if (isWorkSelectionCheckpointBlocker(text) && !checkpoint?.active_task) {
      superseded.push({
        blocker,
        reason: 'Historical work-selection blocker has no current checkpoint active_task; live workboard state must be used for action authority.',
      });
      continue;
    }
    active.push({
      kind: 'critical_unreconciled_checkpoint_state',
      severity: 'critical',
      original_blocker: blocker,
      reason: 'Remembered checkpoint blocker was not live-reconciled; stale state must not be treated as current operational authority.',
    });
  }
  return { active, policy_constraints: policyConstraints, cleared, superseded };
}

function stringifyBlocker(blocker) {
  if (typeof blocker === 'string') return blocker;
  try {
    return JSON.stringify(blocker);
  } catch {
    return String(blocker);
  }
}

function isOrientationReloadBlocker(text) {
  return (text.includes('mcp reload') || text.includes('reload') || text.includes('new session'))
    && (text.includes('orientation') || text.includes('onboarding card') || text.includes('orientation surface'));
}

function isMcpRestartPressureBlocker(text) {
  return text.includes('mcp')
    && (
      text.includes('restart pressure')
      || text.includes('external_stdio_mcp_restart_required')
      || text.includes('pending restart')
      || text.includes('stale live mcp')
      || text.includes('mcp restart staleness')
      || text.includes('stdio mcp restart')
      || text.includes('carrier restart')
    );
}

function isDurableOperatorProhibitionBlocker(text) {
  return (
    (text.includes('osm') || text.includes('operator surface message'))
    && (text.includes('prohibited') || text.includes('do not send') || text.includes('prior operator instruction'))
  );
}

function isMcpRestartPressureCleared({ mcpPressure, mcpRestartReadiness }) {
  const readiness = mcpRestartReadiness ?? [];
  return (mcpPressure?.status === 'clear' || mcpPressure?.severity !== 'critical')
    && readiness.length > 0
    && readiness.every((entry) => {
      const disposition = entry?.disposition ?? buildMcpRestartDisposition(entry);
      return disposition?.terminal_blocker !== true;
    });
}

function isWorkSelectionCheckpointBlocker(text) {
  return (text.includes('do not duplicate') || text.includes('duplicate'))
    && (text.includes('owned') || text.includes('execution') || text.includes('active task') || text.includes('working on'));
}

function maybeCheckpointStartup({
  checkpointStartup,
  readiness,
  agentId,
  hydratedAt,
  checkpoint,
  groundingEventId,
  onboardingCard,
  taskLifecycleNext,
  recommendedNextAction,
}) {
  if (!checkpointStartup) return readiness;
  if (readiness.verdict.status.startsWith('blocked_')) {
    return {
      ...readiness,
      startup_checkpoint: {
        status: 'skipped',
        reason: `readiness_blocked:${readiness.verdict.status}`,
      },
    };
  }
  const checkpointResult = safeCall(() => agentContextCheckpoint({
    agent_id: agentId,
    active_task: checkpoint?.status === 'ok' ? checkpoint.active_task ?? null : null,
    files_touched: checkpoint?.status === 'ok' ? checkpoint.files_touched ?? [] : [],
    key_decisions: [
      `Startup readiness verdict: ${readiness.verdict.status}.`,
      `Startup action authority: ${readiness.verdict.action_authority}.`,
    ],
    open_questions: checkpoint?.status === 'ok' ? checkpoint.open_questions ?? [] : [],
    git_head: checkpoint?.status === 'ok' ? checkpoint.git_head ?? null : null,
    last_workboard_check_at: taskLifecycleNext?.generated_at ?? taskLifecycleNext?.workboard_generated_at ?? hydratedAt,
    next_intended_action: recommendedNextAction ?? null,
    authority_basis: {
      kind: 'startup_readiness',
      summary: `Startup checkpoint recorded ${readiness.verdict.status} at ${hydratedAt}.`,
    },
    continuation_blockers: readiness.blockers.active,
    evidence_refs: [
      `startup_readiness:${readiness.verdict.status}`,
      groundingEventId ? `grounding_event:${groundingEventId}` : 'grounding_event:null',
      onboardingCard?.snapshot_id ? `orientation_snapshot:${onboardingCard.snapshot_id}` : `orientation_status:${onboardingCard?.status ?? 'missing'}`,
      taskLifecycleNext?.generated_at ? `workboard_generated_at:${taskLifecycleNext.generated_at}` : `workboard_status:${taskLifecycleNext?.status ?? 'missing'}`,
    ],
    worktree_state: checkpoint?.status === 'ok' ? checkpoint.worktree_state ?? null : null,
    tactical_resume_notes: [
      `Startup readiness quality checks: ${readiness.quality_checks.map((check) => `${check.id}=${check.status}`).join(', ')}`,
    ],
  }));
  if (checkpointResult.ok) {
    return {
      ...readiness,
      startup_checkpoint: checkpointResult.value,
    };
  }
  return {
    ...readiness,
    verdict: {
      ...readiness.verdict,
      status: readiness.verdict.status === 'ready' ? 'ready_with_residuals' : readiness.verdict.status,
      summary: `${readiness.verdict.summary} Startup checkpoint failed: ${checkpointResult.error}`,
    },
    blockers: {
      ...readiness.blockers,
      active: [
        ...readiness.blockers.active,
        { kind: 'startup_checkpoint_failed', summary: checkpointResult.error },
      ],
    },
    startup_checkpoint: {
      status: 'error',
      message: checkpointResult.error,
    },
  };
}

function buildResumeBrief({ agentId, role, checkpoint, taskLifecycleNext, recommendedNextAction, hydratedAt, workboardFreshnessInput, provenance, groundingEvent }) {
  return {
    schema: 'narada.agent_context.resume_brief.v0',
    hydrated_at: hydratedAt ?? null,
    agent_id: agentId,
    role,
    checkpoint_status: checkpoint?.status ?? 'unknown',
    grounding_event_id: groundingEvent?.event_id ?? null,
    grounding_status: groundingEvent?.grounding_status ?? null,
    active_task: checkpoint?.active_task ?? null,
    checkpoint_next_intended_action: checkpoint?.next_intended_action ?? null,
    current_recommended_next_action: recommendedNextAction,
    authority_basis: checkpoint?.authority_basis ?? null,
    continuation_blockers: checkpoint?.continuation_blockers ?? [],
    evidence_refs: checkpoint?.evidence_refs ?? [],
    worktree_state: checkpoint?.worktree_state ?? null,
    tactical_resume_notes: checkpoint?.tactical_resume_notes ?? [],
    checkpoint_last_workboard_check_at: checkpoint?.last_workboard_check_at ?? null,
    workboard_freshness_input: workboardFreshnessInput ?? null,
    provenance: provenance ?? null,
    task_lifecycle_next_generated_at: taskLifecycleNext?.generated_at ?? null,
    workboard_generated_at: taskLifecycleNext?.workboard_generated_at ?? null,
    last_workboard_check_at: workboardFreshnessInput?.last_workboard_check_at ?? checkpoint?.last_workboard_check_at ?? null,
    state_freshness: taskLifecycleNext?.state_freshness ?? null,
  };
}

function buildCapabilityEnvelopeProjection(capabilityPolicy) {
  return {
    schema: 'narada.agent.capability_envelope.v0',
    status: capabilityPolicy ? 'loaded' : 'missing',
    policy_ref: capabilityPolicy ? 'capability_policy' : null,
    activation_authority: 'not_implied',
    summary: capabilityPolicy
      ? 'Capability policy describes allowed surfaces and prohibitions; it does not authorize a specific action.'
      : 'Capability policy was not available; no action authority can be inferred.',
  };
}

function buildActivationAuthorityProjection({ authorizedAction, missingAuthorityReason, recommendedNextAction, identityVerified, roleBinding, capabilityPolicy }) {
  return {
    schema: 'narada.agent.activation_authority.v0',
    status: authorizedAction ? 'present' : 'absent',
    authorized_action_ref: authorizedAction ? 'authorized_action' : null,
    missing_reason: authorizedAction ? null : missingAuthorityReason ?? 'missing_authority_basis',
    recommendation_ref: recommendedNextAction?.action ? 'recommended_action' : null,
    prerequisites: {
      verified_identity: identityVerified ? 'present' : 'missing',
      role_binding: roleBinding ? 'present' : 'missing',
      capability_envelope: capabilityPolicy ? 'present' : 'missing',
      explicit_authority_basis: authorizedAction ? 'present' : 'missing',
    },
    no_inference_rule: 'Do not infer activation authority from agent_id spelling, role title, role binding, or capability policy.',
  };
}

function buildRequiredPosture(capabilityPolicy) {
  const posture = [
    'Verify identity from NARADA_AGENT_ID before role-gated action.',
    'Use MCP for task lifecycle mutations.',
  ];
  if (capabilityPolicy?.direct_substrate_shell_access === 'forbidden') {
    posture.push('Native/substrate shell is forbidden; do not use Codex shell_tool or direct shell commands.');
  }
  if (capabilityPolicy?.script_execution_surface === 'mcp_only') {
    posture.push('Script execution is MCP-only: use declared Narada MCP tools, including policy-aware shell MCP when permitted; do not run rg, node, PowerShell, Python, raw SQL, or ad hoc filesystem scans from the substrate.');
  }
  if (capabilityPolicy?.mcp_shell_execution === 'allowed') {
    posture.push('Policy-aware shell MCP execution is allowed; this does not authorize native/substrate shell use.');
  }
  if (capabilityPolicy?.filesystem_discovery === 'mcp_only') {
    posture.push('Use MCP filesystem/code surfaces for discovery and edits.');
  }
  posture.push('If no MCP capability exists for required work, stop and report the missing capability precisely.');
  return posture;
}

function buildCapabilityPolicySummary(capabilityPolicy) {
  if (!capabilityPolicy) {
    return 'Capability policy unavailable; stop before any role-gated action and rehydrate through MCP.';
  }
  const nativeShell = capabilityPolicy.direct_substrate_shell_access === 'forbidden'
    ? 'Native/substrate shell is forbidden'
    : 'Native/substrate shell policy is not forbidden';
  const mcpShell = capabilityPolicy.mcp_shell_execution === 'allowed'
    ? 'policy-aware shell MCP is allowed'
    : 'policy-aware shell MCP is not allowed';
  const scriptExecution = capabilityPolicy.script_execution_surface === 'mcp_only'
    ? 'script execution is MCP-only'
    : `script execution surface is ${capabilityPolicy.script_execution_surface ?? 'unspecified'}`;
  const filesystem = capabilityPolicy.filesystem_discovery === 'mcp_only'
    ? 'filesystem discovery is MCP-only'
    : `filesystem discovery is ${capabilityPolicy.filesystem_discovery ?? 'unspecified'}`;
  const lifecycle = capabilityPolicy.lifecycle_mutations === 'mcp_only'
    ? 'task lifecycle mutations are MCP-only'
    : `task lifecycle mutations are ${capabilityPolicy.lifecycle_mutations ?? 'unspecified'}`;
  return `${nativeShell}; ${mcpShell}. ${scriptExecution}; ${filesystem}; ${lifecycle}.`;
}

function callTaskLifecycleNextMcp({ agentId, limit, lastWorkboardCheckAt }) {
  const server = resolveTaskLifecycleMcpServer();
  if (!server) {
    const packageBinName = process.platform === 'win32' ? 'task-lifecycle-mcp.cmd' : 'task-lifecycle-mcp';
    const packageBinPath = join(siteRoot, 'node_modules', '.bin', packageBinName);
    return {
      status: 'unavailable',
      message: `task_lifecycle_mcp_server_not_found: ${packageBinPath}`,
    };
  }

  const init = JSON.stringify({
    jsonrpc: '2.0',
    id: 0,
    method: 'initialize',
    params: {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    },
  });
  const args = {
    agent_id: agentId,
    limit,
  };
  if (lastWorkboardCheckAt) args.last_workboard_check_at = lastWorkboardCheckAt;
  const req = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'task_lifecycle_next',
      arguments: args,
    },
  });

  const proc = runHiddenPostureCommandSync(server.command, server.args, {
    cwd: siteRoot,
    input: `${init}\n${req}\n`,
    encoding: 'utf8',
    timeout: 30000,
    posture: 'mcp_server',
    env: {
      ...process.env,
      NARADA_AGENT_ID: agentId,
    },
  });

  if (proc.error || proc.status !== 0) {
    return {
      status: 'unavailable',
      message: `task_lifecycle_next_mcp_unavailable: ${proc.error?.message || proc.stderr || `exit ${proc.status}`}`,
    };
  }

  const responses = (proc.stdout ?? '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
  const call = responses.find((response) => response.id === 1);
  if (!call) {
    return {
      status: 'unavailable',
      message: `task_lifecycle_next_mcp_no_response: ${proc.stderr || proc.stdout || '<empty>'}`,
    };
  }
  if (call.error) {
    return {
      status: 'error',
      message: call.error.message,
      error: call.error,
    };
  }
  const text = call.result?.content?.[0]?.text;
  if (!text) {
    return {
      status: 'error',
      message: 'task_lifecycle_next_mcp_empty_tool_result',
      raw_result: call.result ?? null,
    };
  }
  try {
    return resolveTaskLifecycleNextToolPayload(JSON.parse(text));
  } catch (error) {
    return {
      status: 'error',
      message: `task_lifecycle_next_mcp_parse_error: ${error.message}`,
      raw_text: text,
    };
  }
}

function resolveTaskLifecycleMcpServer() {
  return resolveTaskLifecycleMcpServerForSite(siteRoot);
}


function resolveTaskLifecycleNextToolPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  if (typeof payload.output_ref !== 'string') return payload;
  const match = payload.output_ref.match(/^mcp_output:([A-Za-z0-9_-]+)$/);
  if (!match) return payload;
  const outputPath = join(siteRoot, '.ai', 'tmp', 'mcp-outputs', 'workspace', `${match[1]}.json`);
  if (!existsSync(outputPath)) return payload;
  try {
    const envelope = JSON.parse(readFileSync(outputPath, 'utf8'));
    if (typeof envelope.output_text === 'string') {
      return {
        ...JSON.parse(envelope.output_text),
        large_output_handling: {
          output_ref: payload.output_ref,
          reader_tool: payload.reader_tool ?? 'mcp_output_show',
          original_truncated: payload.truncated === true,
        },
      };
    }
    if (typeof envelope.text === 'string') return JSON.parse(envelope.text);
    if (envelope.full_output && typeof envelope.full_output === 'object') return envelope.full_output;
    return envelope;
  } catch (error) {
    return {
      status: 'error',
      message: `task_lifecycle_next_mcp_output_ref_parse_error: ${error.message}`,
      output_ref: payload.output_ref,
    };
  }
}

function agentContextListSessions(toolArgs) {
  return listAgentStartSessions({
    db,
    identity: toolArgs?.identity ?? null,
    dateFrom: toolArgs?.date_from ?? toolArgs?.from ?? null,
    dateTo: toolArgs?.date_to ?? toolArgs?.to ?? null,
    substrate: toolArgs?.substrate ?? toolArgs?.runtime ?? null,
    limit: toolArgs?.limit ?? 100,
  });
}

function agentContextShowEvent(toolArgs) {
  const eventId = toolArgs?.event_id;
  if (!eventId) {
    throw new Error('event_id is required');
  }

  if (!db) {
    throw new Error('agent_context_db_not_available');
  }

  const event = db.prepare('SELECT * FROM agent_start_events WHERE event_id = ?').get(eventId);
  if (!event) {
    throw new Error(`event_not_found: ${eventId}`);
  }

  const ec = db.prepare('SELECT * FROM execution_context_materializations WHERE event_id = ?').get(eventId);
  const ic = db.prepare('SELECT * FROM intelligence_context_materializations WHERE event_id = ?').get(eventId);
  const proposals = db.prepare('SELECT proposal_id, proposal_type, verdict, verdict_at, verdict_by, created_at FROM proposal_records WHERE event_id = ?').all(eventId);
  const residuals = db.prepare('SELECT residual_id, label, status, promoted_task_id, created_at, status_at FROM residual_records WHERE event_id = ?').all(eventId);

  return {
    status: 'ok',
    event,
    execution_context_materialization: ec ?? null,
    intelligence_context_materialization: ic ?? null,
    proposals,
    residuals,
  };
}

function parsePayload(row) {
  if (!row?.payload_json) return null;
  try {
    return JSON.parse(row.payload_json);
  } catch (error) {
    return { payload_parse_error: error.message, payload_raw: row.payload_json };
  }
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function agentContextShowBootstrap(toolArgs) {
  let eventId = toolArgs?.event_id;
  const identity = toolArgs?.identity;

  if (!eventId && !identity) {
    throw new Error('Either event_id or identity is required');
  }

  if (!db) {
    throw new Error('agent_context_db_not_available');
  }

  if (!eventId && identity) {
    const latest = db.prepare('SELECT event_id FROM agent_start_events WHERE identity_id = ? ORDER BY created_at DESC LIMIT 1').get(identity);
    if (!latest) {
      throw new Error(`no_event_found_for_identity: ${identity}`);
    }
    eventId = latest.event_id;
  }

  const event = db.prepare('SELECT * FROM agent_start_events WHERE event_id = ?').get(eventId);
  if (!event) {
    throw new Error(`event_not_found: ${eventId}`);
  }

  const ec = db.prepare('SELECT runtime, cwd, payload_json FROM execution_context_materializations WHERE event_id = ?').get(eventId);
  const ic = db.prepare('SELECT materialization_id, schema_id, payload_json FROM intelligence_context_materializations WHERE event_id = ?').get(eventId);
  const proposals = db.prepare('SELECT proposal_id, proposal_type, verdict FROM proposal_records WHERE event_id = ?').all(eventId);

  const residualRows = db.prepare('SELECT residual_id, label, status, payload_json, created_at, status_at, promoted_task_id FROM residual_records WHERE event_id = ?').all(eventId);
  const residuals = residualRows.map((row) => ({
    residual_id: row.residual_id,
    label: row.label,
    status: row.status,
    payload: parsePayload(row),
    created_at: row.created_at,
    status_at: row.status_at,
  }));

  const openInventoryRows = db.prepare("SELECT residual_id, label, status, payload_json, created_at, promoted_task_id FROM residual_records WHERE status IN ('noted', 'deferred')").all();
  const open_residual_inventory = openInventoryRows.map((row) => ({
    residual_id: row.residual_id,
    label: row.label,
    status: row.status,
    payload: parsePayload(row),
    created_at: row.created_at,
    promoted_task_id: row.promoted_task_id,
  }));

  let ecPayload = null;
  let icPayload = null;
  try { if (ec?.payload_json) ecPayload = JSON.parse(ec.payload_json); } catch {}
  try { if (ic?.payload_json) icPayload = JSON.parse(ic.payload_json); } catch {}
  const eventPayload = parseJsonObject(event.event_json);
  const eventIdentity = event.identity_id ?? event.identity ?? event.agent_id ?? eventPayload.identity ?? null;
  const eventRuntime = event.runtime ?? event.substrate ?? eventPayload.runtime ?? null;
  const eventRole = event.role ?? eventPayload.role ?? resolveRoleBindingFromRoster(eventIdentity).role ?? null;
  const fallbackCapabilityPolicy = eventRole ? defaultCapabilityPolicy(eventRole) : null;
  const fallbackRoleBinding = eventIdentity
    ? buildRoleBindingProjection({
      agentId: eventIdentity,
      role: eventRole,
      source: 'agent_start_event_compatibility',
    })
    : null;

  return {
    status: 'ok',
    agent_start_event: event.event_id,
    identity: eventIdentity,
    runtime: eventRuntime,
    resume_command: event.resume_command,
    bootstrap_prompt: `Reconstruct Intelligence Context from event ${eventId}...`,
    execution_context_summary: {
      runtime: ecPayload?.runtime ?? ec?.runtime ?? eventRuntime,
      cwd: ecPayload?.cwd ?? ec?.cwd ?? event.cwd ?? event.site_root ?? null,
      mcp_servers: ecPayload?.mcp_servers ?? null,
      role_binding: ecPayload?.role_binding ?? fallbackRoleBinding,
      capability_policy: ecPayload?.capability_policy ?? fallbackCapabilityPolicy,
      compatibility_source: ecPayload ? 'execution_context_materialization' : 'agent_start_events_event_json',
    },
    intelligence_context_summary: {
      materialization_id: ic?.materialization_id ?? null,
      schema_id: ic?.schema_id ?? null,
      work_frame_intent: icPayload?.work_frame?.principal_intent_as_understood ?? null,
    },
    proposals,
    residuals,
    open_residual_inventory,
    bootstrap_posture: {
      authority_state_rule: 'authority_state must contain only observed facts from authority surfaces; inferred doctrine belongs in authority_hypotheses',
      proposal_rule: 'proposal_output is evaluation only; it is not decision, intent, execution, or confirmation',
      residual_rule: 'residuals are pressure markers, not obligations; promotion requires explicit decision',
    },
  };
}

function agentContextCheckpoint(toolArgs) {
  if (!db) {
    throw new Error('agent_context_db_not_available');
  }

  const agentId = toolArgs?.agent_id;
  if (!agentId) {
    throw new Error('agent_id is required');
  }

  const checkpointId = `chk_${randomUUID().replace(/-/g, '')}`;
  const now = new Date().toISOString();

  const activeTask = toolArgs?.active_task ?? null;
  const filesTouched = toolArgs?.files_touched ?? [];
  const keyDecisions = toolArgs?.key_decisions ?? [];
  const openQuestions = toolArgs?.open_questions ?? [];
  const gitHead = toolArgs?.git_head ?? null;
  const lastWorkboardCheckAt = toolArgs?.last_workboard_check_at ?? null;
  const nextIntendedAction = toolArgs?.next_intended_action ?? null;
  const authorityBasis = toolArgs?.authority_basis ?? null;
  const continuationBlockers = toolArgs?.continuation_blockers ?? [];
  const evidenceRefs = toolArgs?.evidence_refs ?? [];
  const worktreeState = toolArgs?.worktree_state ?? null;
  const tacticalResumeNotes = toolArgs?.tactical_resume_notes ?? [];
  const siteBindingGuard = evaluateCheckpointSiteBinding(toolArgs);
  if (siteBindingGuard.status === 'refuse') {
    const incidentEvidence = {
      schema: 'narada.mcp.wrong_site_mutation_refusal.v0',
      signal: 'authority_boundary_incident',
      surface_id: 'agent-context-mcp.local',
      tool_name: 'agent_context_checkpoint',
      bound_site_root: siteRoot,
      requested_target_site_root: siteBindingGuard.target_site_root,
      inferred_target_site_root: siteBindingGuard.target_site_root,
      agent_identity_evidence: {
        argument_agent_id: agentId,
        env_agent_id: process.env.NARADA_AGENT_ID || null,
        env_agent_start_event_id: process.env.NARADA_AGENT_START_EVENT_ID || null,
        verification_state: 'unverified_payload_identity',
      },
      payload_root_evidence: siteBindingGuard.mismatches,
      example_incident_ref: JSON.stringify(toolArgs).includes('chk_f33f42bae1034e2dacf8e0bf7a5a769e')
        ? 'chk_f33f42bae1034e2dacf8e0bf7a5a769e'
        : null,
      recommended_route: {
        kind: 'observation',
        target_locus: 'local_site',
        target_role: 'architect',
        capa_material: true,
        summary: 'Route as authority-boundary incident evidence; do not retry through the same wrong-Site mutation surface.',
      },
    };
    return {
      status: 'cross_site_checkpoint_refused',
      checkpoint_written: false,
      agent_id: agentId,
      guard: siteBindingGuard,
      incident_evidence: incidentEvidence,
      incident_routing: {
        schema: 'narada.mcp.wrong_site_mutation_refusal_route.v0',
        recommended_kind: 'observation',
        recommended_target_locus: 'local_site',
        recommended_target_role: 'architect',
        capa_material: true,
        summary: 'Checkpoint write refused because payload evidence names a different Site root.',
        manual_route: 'Submit incident_evidence through the local Site inbox as an observation for architect review when automatic routing is not safe.',
      },
    };
  }

  const payload = hydrationService.buildCheckpointPayload({
    checkpointId,
    agentId,
    sessionId: toolArgs?.session_id ?? null,
    checkpointAt: now,
    activeTask,
    filesTouched,
    keyDecisions,
    openQuestions,
    gitHead,
    lastWorkboardCheckAt,
    nextIntendedAction,
    authorityBasis,
    continuationBlockers,
    evidenceRefs,
    worktreeState,
    tacticalResumeNotes,
  });

  // Archive existing checkpoint for this agent before writing new one
  const existing = db.prepare('SELECT * FROM agent_checkpoints WHERE agent_id = ?').get(agentId);
  if (existing) {
    db.prepare(
      `INSERT INTO agent_checkpoint_history (
        history_id, checkpoint_id, agent_id, session_id, checkpoint_at,
        active_task_json, files_touched_json, key_decisions_json,
        open_questions_json, git_head, payload_json, archived_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `hist_${randomUUID().replace(/-/g, '')}`,
      existing.checkpoint_id,
      existing.agent_id,
      existing.session_id,
      existing.checkpoint_at,
      existing.active_task_json,
      existing.files_touched_json,
      existing.key_decisions_json,
      existing.open_questions_json,
      existing.git_head,
      existing.payload_json,
      now
    );
    db.prepare('DELETE FROM agent_checkpoints WHERE checkpoint_id = ?').run(existing.checkpoint_id);
  }

  db.prepare(
    `INSERT INTO agent_checkpoints (
      checkpoint_id, agent_id, session_id, checkpoint_at,
      active_task_json, files_touched_json, key_decisions_json,
      open_questions_json, git_head, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    checkpointId,
    agentId,
    toolArgs?.session_id ?? null,
    now,
    activeTask ? JSON.stringify(activeTask) : null,
    filesTouched.length > 0 ? JSON.stringify(filesTouched) : null,
    keyDecisions.length > 0 ? JSON.stringify(keyDecisions) : null,
    openQuestions.length > 0 ? JSON.stringify(openQuestions) : null,
    gitHead,
    JSON.stringify(payload)
  );

  const lifecycleTransition = emitLifecycleTransitionEvent({
    agentId,
    sessionId: toolArgs?.session_id ?? null,
    transition: 'checkpoint',
    sourceZone: 'memory',
    targetZone: 'memory',
    authorityBasis,
    guardResults: [
      { guard: 'checkpoint_written', status: 'pass', evidence_ref: checkpointId },
      { guard: 'checkpoint_is_projection', status: 'pass', evidence_ref: 'agent_context_checkpoint' },
    ],
    evidenceRefs: [
      `checkpoint_id:${checkpointId}`,
      ...evidenceRefs,
    ],
    recommendedAction: nextIntendedAction,
    authorizedAction: null,
    actionSafety: null,
    createdAt: now,
  });

  return {
    status: 'checkpointed',
    checkpoint_id: checkpointId,
    agent_id: agentId,
    checkpoint_at: now,
    archived_prior: existing ? existing.checkpoint_id : null,
    lifecycle_transition: lifecycleTransition,
  };
}

function agentContextRehydrate(toolArgs) {
  if (!db) {
    throw new Error('agent_context_db_not_available');
  }

  const agentId = toolArgs?.agent_id;
  if (!agentId) {
    throw new Error('agent_id is required');
  }

  const historyMode = toolArgs?.history === true || toolArgs?.history === 'true';
  const limit = Math.min(Math.max(parseInt(toolArgs?.limit ?? '1', 10), 1), 50);

  if (historyMode || limit > 1) {
    const rows = db.prepare(
      'SELECT * FROM agent_checkpoint_history WHERE agent_id = ? ORDER BY archived_at DESC LIMIT ?'
    ).all(agentId, limit);

    if (!rows || rows.length === 0) {
      return {
        status: 'no_history',
        agent_id: agentId,
        message: 'No checkpoint history found for this agent.',
      };
    }

    const checkpoints = rows.map((row) => {
      let payload = null;
      try { if (row.payload_json) payload = JSON.parse(row.payload_json); } catch { payload = null; }
      return {
        checkpoint_id: row.checkpoint_id,
        agent_id: row.agent_id,
        session_id: row.session_id,
        checkpoint_at: row.checkpoint_at,
        archived_at: row.archived_at,
        git_head: row.git_head,
        active_task: payload?.active_task ?? null,
        files_touched: payload?.files_touched ?? [],
        key_decisions: payload?.key_decisions ?? [],
        open_questions: payload?.open_questions ?? [],
        last_workboard_check_at: payload?.last_workboard_check_at ?? null,
        next_intended_action: payload?.next_intended_action ?? null,
        authority_basis: payload?.authority_basis ?? null,
        continuation_blockers: payload?.continuation_blockers ?? [],
        evidence_refs: payload?.evidence_refs ?? [],
        worktree_state: payload?.worktree_state ?? null,
        tactical_resume_notes: payload?.tactical_resume_notes ?? [],
        payload_schema: payload?.schema ?? null,
        checkpoint_contamination: buildCheckpointContamination({ checkpointId: row.checkpoint_id, payload }),
      };
    });

    return {
      status: 'ok',
      mode: 'history',
      agent_id: agentId,
      count: checkpoints.length,
      checkpoints,
    };
  }

  const row = db.prepare(
    'SELECT * FROM agent_checkpoints WHERE agent_id = ? ORDER BY checkpoint_at DESC LIMIT 1'
  ).get(agentId);

  if (!row) {
    return {
      status: 'no_checkpoint',
      agent_id: agentId,
      message: 'No checkpoint found for this agent.',
    };
  }

  let payload = null;
  try {
    if (row.payload_json) payload = JSON.parse(row.payload_json);
  } catch {
    payload = null;
  }

  return {
    status: 'ok',
    checkpoint_id: row.checkpoint_id,
    agent_id: row.agent_id,
    session_id: row.session_id,
    checkpoint_at: row.checkpoint_at,
    git_head: row.git_head,
    active_task: payload?.active_task ?? null,
    files_touched: payload?.files_touched ?? [],
    key_decisions: payload?.key_decisions ?? [],
    open_questions: payload?.open_questions ?? [],
    last_workboard_check_at: payload?.last_workboard_check_at ?? null,
    next_intended_action: payload?.next_intended_action ?? null,
    authority_basis: payload?.authority_basis ?? null,
    continuation_blockers: payload?.continuation_blockers ?? [],
    evidence_refs: payload?.evidence_refs ?? [],
    worktree_state: payload?.worktree_state ?? null,
    tactical_resume_notes: payload?.tactical_resume_notes ?? [],
    payload_schema: payload?.schema ?? null,
    checkpoint_contamination: buildCheckpointContamination({ checkpointId: row.checkpoint_id, payload }),
  };
}

function agentContextWhoami(toolArgs) {
  const hint = toolArgs?.hint ?? null;

  // Source 1: Environment variable (highest confidence)
  const envIdentity = process.env.NARADA_AGENT_ID || null;
  if (envIdentity) {
    const roleBindingResolution = resolveRoleBindingFromRoster(envIdentity);
    const role = roleBindingResolution.role;
    const agentIdentityRef = resolveAgentIdentityRef(envIdentity, {
      site_id: process.env.NARADA_SITE_ID || null,
      role,
    }).value ?? buildAgentIdentityRefV2({
      identity_scope: process.env.NARADA_SITE_ID
        ? { kind: 'narada_site', site_id: process.env.NARADA_SITE_ID }
        : { kind: 'unscoped' },
      local_agent_id: envIdentity,
      role,
      legacy_agent_id: envIdentity,
    });
    const displayIdentity = agentIdentityDisplay(agentIdentityRef, envIdentity) ?? envIdentity;
    return {
      status: 'ok',
      identity: envIdentity,
      agent_identity_ref: agentIdentityRef,
      role,
      role_binding: roleBindingResolution.role_binding,
      role_source: roleBindingResolution.role_binding ? 'agent_roster' : 'unresolved',
      role_resolution_warning: roleBindingResolution.error ?? null,
      confidence: 'high',
      source: 'NARADA_AGENT_ID',
      hint_match: hint ? envIdentity === hint : null,
      message: `Session identity is ${displayIdentity} (${role ?? 'role unresolved'}) from environment variable.`,
    };
  }

  // Source 2: Most recent checkpoint across all agents
  if (db) {
    try {
      const checkpoint = db.prepare(
        'SELECT agent_id, checkpoint_at FROM agent_checkpoints ORDER BY checkpoint_at DESC LIMIT 1'
      ).get();
      if (checkpoint?.agent_id) {
        const rosterRoleBinding = resolveRoleBindingFromRoster(checkpoint.agent_id);
        const role = rosterRoleBinding.role ?? inferRoleFromIdentity(checkpoint.agent_id);
        const agentIdentityRef = resolveAgentIdentityRef(checkpoint.agent_id, {
          site_id: process.env.NARADA_SITE_ID || null,
          role,
        }).value ?? buildAgentIdentityRefV2({
          identity_scope: process.env.NARADA_SITE_ID
            ? { kind: 'narada_site', site_id: process.env.NARADA_SITE_ID }
            : { kind: 'unscoped' },
          local_agent_id: checkpoint.agent_id,
          role,
          legacy_agent_id: checkpoint.agent_id,
        });
        const displayIdentity = agentIdentityDisplay(agentIdentityRef, checkpoint.agent_id) ?? checkpoint.agent_id;
        return {
          status: 'ok',
          identity: checkpoint.agent_id,
          agent_identity_ref: agentIdentityRef,
          role,
          role_binding: rosterRoleBinding.role_binding,
          role_source: rosterRoleBinding.role_binding ? 'agent_roster' : 'identity_inference_non_authoritative',
          role_resolution_warning: rosterRoleBinding.error ?? null,
          confidence: 'medium',
          source: 'latest_checkpoint',
          checkpoint_at: checkpoint.checkpoint_at,
          hint_match: hint ? checkpoint.agent_id === hint : null,
          message: `Session identity is likely ${displayIdentity} (${role}) from most recent checkpoint.`,
        };
      }
    } catch {
      // ignore
    }
  }

  // Source 3: Most recent agent start event
  if (db) {
    try {
      const event = db.prepare(
        'SELECT identity_id, created_at FROM agent_start_events ORDER BY created_at DESC LIMIT 1'
      ).get();
      if (event?.identity_id) {
        const rosterRoleBinding = resolveRoleBindingFromRoster(event.identity_id);
        const role = rosterRoleBinding.role ?? inferRoleFromIdentity(event.identity_id);
        const agentIdentityRef = resolveAgentIdentityRef(event.identity_id, {
          site_id: process.env.NARADA_SITE_ID || null,
          role,
        }).value ?? buildAgentIdentityRefV2({
          identity_scope: process.env.NARADA_SITE_ID
            ? { kind: 'narada_site', site_id: process.env.NARADA_SITE_ID }
            : { kind: 'unscoped' },
          local_agent_id: event.identity_id,
          role,
          legacy_agent_id: event.identity_id,
        });
        const displayIdentity = agentIdentityDisplay(agentIdentityRef, event.identity_id) ?? event.identity_id;
        return {
          status: 'ok',
          identity: event.identity_id,
          agent_identity_ref: agentIdentityRef,
          role,
          role_binding: rosterRoleBinding.role_binding,
          role_source: rosterRoleBinding.role_binding ? 'agent_roster' : 'identity_inference_non_authoritative',
          role_resolution_warning: rosterRoleBinding.error ?? null,
          confidence: 'low',
          source: 'latest_start_event',
          event_at: event.created_at,
          hint_match: hint ? event.identity_id === hint : null,
          message: `Session identity is likely ${displayIdentity} (${role}) from most recent agent start event.`,
        };
      }
    } catch {
      // ignore
    }
  }

  return {
    status: 'unknown',
    identity: null,
    role: null,
    confidence: 'none',
    source: 'none',
    hint_match: hint ? false : null,
    message: 'No session identity could be determined. Set NARADA_AGENT_ID or ensure checkpoints/start events are recorded.',
  };
}

function resolveRoleBindingFromRoster(identity) {
  if (!identity) return { role: null, role_binding: null, error: 'identity_required' };
  try {
    const rosterCheck = validateIdentityAgainstRoster(siteRoot, identity);
    if (!rosterCheck.valid) {
      return { role: null, role_binding: null, error: rosterCheck.error ?? 'role_binding_unresolved' };
    }
    return {
      role: rosterCheck.role,
      role_binding: rosterCheck.role_binding ?? buildRoleBindingProjection({
        agentId: identity,
        role: rosterCheck.role,
        source: rosterCheck.roster_source ?? 'agent_roster',
      }),
      error: null,
    };
  } catch (error) {
    return { role: null, role_binding: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function inferRoleFromIdentity(identity) {
  if (!identity) return null;
  const parts = identity.split('.');
  const last = parts[parts.length - 1].toLowerCase();
  const roleMap = {
    kevin: 'architect',
    architect: 'architect',
    bob: 'builder',
    robin: 'builder',
    builder: 'builder',
    builder2: 'builder',
    resident: 'resident',
    stuart: 'resident',
    operator: 'operator',
  };
  return roleMap[last] || null;
}

function stringField(record, key) {
  const value = record?.[key];
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return null;
  return String(value);
}

function requireString(record, key) {
  const value = stringField(record ?? {}, key);
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function objectField(record, key) {
  const value = record?.[key];
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return null;
}

function arrayField(record, key) {
  const value = record?.[key];
  return Array.isArray(value) ? value : [];
}

function integerField(record, key) {
  const value = record?.[key];
  if (typeof value === 'number') return Number.isFinite(value) ? Math.floor(value) : null;
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function agentContextDoctrinalGrounding(toolArgs) {
  const mode = toolArgs?.mode ?? 'summary';
  const requestedIds = Array.isArray(toolArgs?.doctrine_ids) ? toolArgs.doctrine_ids : null;

  // Reground mode uses local doctrinal-reground.mjs (no WSL dependency)
  if (mode === 'reground') {
    const result = buildReground(siteRoot);
    if (requestedIds) {
      result.doctrine_catalog = result.doctrine_catalog.filter((d) =>
        requestedIds.includes(d.acronym.toLowerCase()) || requestedIds.includes(d.name.toLowerCase())
      );
    }
    return {
      status: 'ok',
      mode: 'reground',
      schema: result.schema,
      generated_at: result.generated_at,
      corpus_status: result.corpus_status,
      posture_summary: result.posture_summary,
      doctrine_catalog: result.doctrine_catalog,
      ccc_coordinates: result.ccc_coordinates,
      ias_mapping: result.ias_mapping,
      review_protocol: result.review_protocol,
    };
  }

  const configPath = join(siteRoot, 'config.json');
  let config = null;
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf8'));
    } catch (err) {
      return { status: 'error', message: `failed_to_parse_config: ${err.message}` };
    }
  }

  const sources = resolveDoctrinalCorpusSources({ config, siteRoot });
  if (sources.length === 0) {
    return { status: 'error', message: 'doctrinal_corpus_not_configured' };
  }

  const filtered = requestedIds
    ? sources.filter((s) => requestedIds.includes(s.doctrine_id))
    : sources;

  if (mode === 'list') {
    return {
      status: 'ok',
      mode: 'list',
      count: filtered.length,
      doctrines: filtered.map((s) => ({
        doctrine_id: s.doctrine_id,
        name: s.name,
        path: s.path,
        readable: existsSync(s.path),
      })),
    };
  }

  const doctrines = [];
  for (const source of filtered) {
    if (!existsSync(source.path)) {
      doctrines.push({
        doctrine_id: source.doctrine_id,
        name: source.name,
        path: source.path,
        readable: false,
        content: null,
        error: 'file_not_found',
      });
      continue;
    }

    try {
      const fullText = readFileSync(source.path, 'utf8');
      const content = mode === 'summary'
        ? fullText.slice(0, 2000) + (fullText.length > 2000 ? '\n\n[...truncated...]' : '')
        : fullText;

      doctrines.push({
        doctrine_id: source.doctrine_id,
        name: source.name,
        path: source.path,
        readable: true,
        length: fullText.length,
        content,
      });
    } catch (err) {
      doctrines.push({
        doctrine_id: source.doctrine_id,
        name: source.name,
        path: source.path,
        readable: false,
        content: null,
        error: err.message,
      });
    }
  }

  return {
    status: 'ok',
    mode,
    count: doctrines.length,
    doctrines,
  };
}

const CANONICAL_THOUGHTS_DOCTRINE_SOURCES = [
  { doctrine_id: 'ie', name: 'Inhabited Evolution', file: 'inhabited-evolution.md' },
  { doctrine_id: 'cipda', name: 'Constructively Invariant Progressive De-arbitrarization', file: 'constructively-invariant-progressive-de-arbitrarization.md' },
  { doctrine_id: 'ccc', name: 'Constructive Coherence Coordinates', file: 'constructive-coherence-coordinates.md' },
  { doctrine_id: 'ias', name: 'Intelligence Authority Separation', file: 'intelligence-authority-separation.md' },
  { doctrine_id: 'pesa', name: 'Plural Embodiment Singular Authority', file: 'plural-embodiment-singular-authority.md' },
  { doctrine_id: 'cu', name: 'Constructive Universalization by Re-instantiation', file: 'constructive-universalization-by-re-instantiation.md' },
  { doctrine_id: 'cis', name: 'On Constructively Invariant Systems', file: 'on-constructively-invariant-systems.md' },
  { doctrine_id: 'governed_crossing', name: 'Governed Crossing', file: 'governed-crossing.md' },
];

function resolveDoctrinalCorpusSources({ config, siteRoot }) {
  const configuredSources = firstArray(
    config?.doctrinal_corpus?.sources,
    config?.doctrinal_corpus?.current_value?.sources,
    config?.doctrinal_corpus?.default_value?.sources,
    config?.runtime_config?.doctrinal_corpus?.current_value?.sources,
    config?.runtime_config?.doctrinal_corpus?.default_value?.sources,
  );
  if (configuredSources.length > 0) return configuredSources;

  const corpusRoot = resolveThoughtsDoctrineCorpusRoot(siteRoot);
  if (!corpusRoot) return [];
  return CANONICAL_THOUGHTS_DOCTRINE_SOURCES
    .map((source) => ({ doctrine_id: source.doctrine_id, name: source.name, path: join(corpusRoot, source.file) }))
    .filter((source) => existsSync(source.path));
}

function firstArray(...candidates) {
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) return candidate;
  }
  return [];
}

function resolveThoughtsDoctrineCorpusRoot(root) {
  const candidates = [
    process.env.NARADA_DOCTRINE_CORPUS_ROOT,
    resolve(dirname(resolve(root)), 'thoughts', 'content', 'concepts'),
    resolve('D:/code/thoughts/content/concepts'),
  ].filter((candidate) => typeof candidate === 'string' && candidate.trim().length > 0);

  for (const candidate of candidates) {
    const resolved = resolve(candidate);
    if (existsSync(resolved)) return resolved;
  }
  return null;
}

// Stdio loop
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;

  while (true) {
    if (/^Content-Length:/i.test(buffer)) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) break;
      const header = buffer.slice(0, headerEnd);
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        writeMcpFrame({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'missing Content-Length' } });
        buffer = buffer.slice(headerEnd + 4);
        continue;
      }
      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      if (buffer.length < bodyStart + length) break;
      const body = buffer.slice(bodyStart, bodyStart + length);
      buffer = buffer.slice(bodyStart + length);
      mcpOutputMode = 'framed';
      dispatchMcpRequest(body);
      continue;
    }

    const newlineIndex = buffer.indexOf('\n');
    if (newlineIndex < 0) break;

    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);
    if (!line) continue;
    mcpOutputMode = 'line';
    dispatchMcpRequest(line);
  }
});

function dispatchMcpRequest(raw) {
  try {
    const request = JSON.parse(raw);
    handleRequest(request).catch((error) => {
      writeMcpFrame({ jsonrpc: '2.0', id: request.id ?? null, error: { code: -32603, message: error.message } });
    });
  } catch (error) {
    writeMcpFrame({ jsonrpc: '2.0', id: null, error: { code: -32700, message: error.message } });
  }
}
process.stdin.on('end', () => {
  if (db) db.close();
});
