import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { existsSync, mkdirSync, readFileSync, appendFileSync, readdirSync, statSync, copyFileSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import {
  classifyCarrierActionRequest,
  createAndWriteCarrierActionAdmission,
  inspectPayloadForSecrets,
  argumentSummary,
} from '@narada2/carrier-action-admission';
import { resolveToolMetadata } from '@narada2/carrier-action-admission/tool-metadata';
import { codexCommand as resolveCodexCommand } from '@narada2/carrier-provider-support/codex-subscription-command';
import { AiProcessInvocationRefusalError, spawnAiProcessInvocation } from '@narada2/carrier-provider-support/ai-process-invocation';
import { commandRecords, resolveCommandInput } from '../../carrier-command-contract/src/carrier-command-contract.mjs';
import {
  classifyCarrierControlRequest,
  classifyCarrierInputAdmission,
  createToolCallPayload,
  createToolResultPayload,
  normalizeControlInputRecord,
} from '@narada2/carrier-protocol';
import {
  REQUEST_ADAPTERS,
  accumulateCodexExecEvent,
  buildCodexExecArgs,
  buildCodexSubprocessEnv,
  codexExecMcpToolEventSummary,
  codexExecPrompt,
  codexRequestMcpServers,
  configureProviderAdapterContext,
  createCodexExecTextAccumulator,
  isPotentialNaradaToolCallText,
  parseAnthropicMessagesResponse,
  parseCodexExecJsonLine,
  parseCodexMcpResponse,
  parseNaradaToolCall,
} from './provider-adapters.mjs';
import {
  PROVIDER_SUPPORT_STATES,
  loadProviderMetadata,
  providerEnvironment,
} from './provider-resolution.mjs';
import {
  aggregateTools,
  applyWorkerMcpProjection,
  createMcpStatusSnapshot,
  discoverAndStartMcpServers,
  findToolBinding,
  getMcpStartupFailures,
  getMcpRuntimeDiagnostics,
  mcpToolEffectAdmissionEvidence,
  originalToolNameForProvider,
  rememberMcpRuntimeDiagnostic,
  sendMcpRequest,
  toolFailureRecovery,
} from './mcp-runtime.mjs';
import {
  isObserverInputEvent,
  normalizeInputEvent,
  normalizeInputRecord,
  observerMetadata,
} from './input-queue.mjs';
import { spawnOwnedProcess } from './process-supervisor.mjs';
import { readNarsEventLogPage } from './nars-event-log.mjs';
import {
  publicNarsArtifactIndex,
  publicNarsArtifactRecord,
  readNarsArtifact,
  readNarsArtifactIndex,
  registerNarsArtifact,
} from './nars-artifacts.mjs';
import {
  authorityTransitionSourceStateSnapshot,
  activateTargetAuthority,
  beginSourceDrain,
  classifySourceWriteAdmission,
  planTargetAuthorityTransition,
  prepareTargetAuthority,
  sealSourceAuthority,
} from './authority-transition-state.mjs';
import { buildDelegationOperatorAffordance, buildGitOperatorAffordance, buildInboxOperatorAffordance, buildMailboxOperatorAffordance, buildMcpSurfaceAffordanceProjection, buildSchedulerOperatorAffordance, buildSopOperatorAffordance, buildSurfaceFeedbackOperatorAffordance, buildTaskLifecycleOperatorAffordance } from './surface-affordances.mjs';
import { agentInstructionChain, loadRolePrompt } from './agent-instructions.mjs';
import { loadSession } from './session-records.mjs';
import {
  createMcpPreflightArtifactSnapshot,
  readMcpPreflightArtifact,
  recordMcpPreflightArtifactLinkage,
} from './mcp-preflight-artifacts.mjs';
import {
  carrierGoalStatusLabel,
  createCarrierGoalState,
  messagesWithCarrierGoal,
  normalizeCarrierGoalState,
} from './carrier-goal-utils.mjs';
import {
  classifyRequestIssueOutcome,
  createOperationalPostureSnapshot,
  createSessionActivitySnapshot,
  mcpServerSummaryEntries,
  mcpToolCatalogEntries,
  sessionHandoffs,
  summarizeCounts,
  summarizeRequestPosture,
} from './session-status-snapshots.mjs';
import {
  codexCliSpawnError,
  codexCommand,
  extractOutputRef,
  isAbortError,
  parseJson,
  randomId,
  summarizeToolResult,
  stringifySummary,
  terminateChildProcess,
} from './runtime-tail-utils.mjs';

export { agentInstructionChain, loadRolePrompt, loadSession, createMcpPreflightArtifactSnapshot, readMcpPreflightArtifact, recordMcpPreflightArtifactLinkage, messagesWithCarrierGoal, carrierGoalStatusLabel, createCarrierGoalState, normalizeCarrierGoalState, createSessionActivitySnapshot, createOperationalPostureSnapshot, classifyRequestIssueOutcome, summarizeRequestPosture, sessionHandoffs, summarizeCounts, mcpServerSummaryEntries, mcpToolCatalogEntries, summarizeToolResult, extractOutputRef, stringifySummary, parseJson, isAbortError, randomId, codexCliSpawnError, terminateChildProcess };

const PROVIDER_METADATA = loadProviderMetadata();

export function createCarrierRuntimeDependencies({ runtimeContext = {}, env = process.env } = {}) {
  const identity = runtimeContext.identity;
  const session = runtimeContext.session;
  const siteRoot = resolve(runtimeContext.siteRoot ?? env.NARADA_SITE_ROOT ?? process.cwd());
  const sessionPath = runtimeContext.sessionPath;
  const eventsPath = runtimeContext.eventsPath;
  const authorityRuntimeHost = runtimeContext.authorityRuntimeHost ?? env.NARADA_AUTHORITY_RUNTIME_HOST ?? 'local';
  const operatorSurfaceKind = runtimeContext.operatorSurfaceKind ?? env.NARADA_OPERATOR_SURFACE_KIND ?? 'agent-cli';
  const intelligenceProvider = runtimeContext.intelligenceProvider ?? env.NARADA_INTELLIGENCE_PROVIDER ?? 'codex-subscription';
  const providerEnvironmentValues = providerEnvironment(intelligenceProvider, PROVIDER_METADATA, env);
  const providerSettings = {
    provider: intelligenceProvider,
    model: runtimeContext.providerSettings?.model ?? providerEnvironmentValues.model,
    thinking: runtimeContext.providerSettings?.thinking ?? env.NARADA_AI_THINKING ?? env.NARADA_THINKING_LEVEL ?? 'medium',
    stream: runtimeContext.providerSettings?.stream !== false,
    openrouterSiteUrl: runtimeContext.providerSettings?.openrouterSiteUrl ?? env.OPENROUTER_SITE_URL ?? env.OPENROUTER_HTTP_REFERER ?? null,
    openrouterTitle: runtimeContext.providerSettings?.openrouterTitle ?? env.OPENROUTER_APP_NAME ?? env.OPENROUTER_X_TITLE ?? null,
    siteRoot,
  };
  configureProviderAdapterContext({
    provider: intelligenceProvider,
    apiKey: providerEnvironmentValues.apiKey,
    baseUrl: providerEnvironmentValues.baseUrl,
    model: providerSettings.model,
    thinking: providerSettings.thinking,
    openrouterSiteUrl: providerSettings.openrouterSiteUrl,
    openrouterTitle: providerSettings.openrouterTitle,
    siteRoot,
  });

  const appendSessionRecord = (entry) => appendJsonlRecord(sessionPath, entry);
  const appendEventRecord = (entry) => appendJsonlRecord(eventsPath, entry);

  const dependencies = {
    discoverAndStartMcpServers,
    applyWorkerMcpProjection: (mcpServers) => applyWorkerMcpProjection(mcpServers),
    aggregateTools,
    createMcpStatusSnapshot,
    readMcpPreflightArtifact: () => readMcpPreflightArtifact({ siteRoot, session, identity }),
    createMcpPreflightArtifactSnapshot,
    loadRolePrompt,
    loadSession,
    runServerInputEvent: (args) => runServerInputEvent({ ...args, identity, session, siteRoot, sessionPath, appendSessionRecord, providerSettings }),
    emitServerEvent: (output, event) => emitServerEvent(output, event, { appendEventRecord }),
    recordMcpPreflightArtifactLinkage: ({ emit, preflightArtifact } = {}) => recordMcpPreflightArtifactLinkage({ emit, preflightArtifact, appendSessionRecord }),
    recordMcpStartupFailures: (mcpServers, options = {}) => recordMcpStartupFailures(mcpServers, { ...options, appendSessionRecord }),
    createOperationHeartbeatDirectiveEmitter,
    handleServerRequestLine: (line, context) => handleServerRequestLine(line, { ...context, identity, session, siteRoot, sessionPath, eventsPath, siteConfig: runtimeContext.siteConfig ?? null, authorityRuntimeHost, operatorSurfaceKind, appendSessionRecord, providerSettings, narsDelegatedAuthorityHandoff: runtimeContext.narsDelegatedAuthorityHandoff ?? null }),
    appendSessionRecord,
    sessionEventEntry: (event, payload) => ({ event, ...payload, timestamp: new Date().toISOString() }),
    carrierSessionEventEntry,
    classifyInputRuntimeQueueAdmission: (event, displaySettings = {}, queueState = {}) => classifyCarrierInputAdmission(event, { activeTurn: queueState.activeTurn, observerMuted: displaySettings.observerMuted }),
    classifyInputRuntimeAdmission: (event) => classifyCarrierInputAdmission(event),
    closeMcpServers,
    recordSessionRequestIssue,
    noteSessionActivity,
    createSessionActivitySnapshot,
    createOperationalPostureSnapshot,
    mcpServerSummaryEntries,
    mcpToolCatalogEntries,
    normalizeCarrierGoalState,
    carrierGoalStatusLabel,
    recordCarrierDiagnostic: (level, message, extra = {}) => recordCarrierDiagnostic(level, message, { ...extra, appendSessionRecord }),
  };

  return {
    callChatApiFn: (messages, tools, settings = providerSettings) => callChatApi(messages, tools, {
      ...providerSettings,
      ...settings,
      provider: intelligenceProvider,
      apiKey: providerEnvironmentValues.apiKey,
      baseUrl: providerEnvironmentValues.baseUrl,
      siteRoot,
      appendSessionRecord,
      identity,
      session,
    }),
    dependencies,
  };
}

function findInboxServerBinding(mcpServers = {}) {
  for (const [serverName, server] of Object.entries(mcpServers)) {
    const toolNames = new Set((server?.tools ?? []).map((tool) => tool?.name).filter(Boolean));
    if (toolNames.has('inbox_list') || toolNames.has('inbox_next')) return { serverName, server, toolNames };
  }
  return null;
}

async function serverInboxSummary({ requestId, params = {}, context = {} }) {
  const binding = findInboxServerBinding(context.mcpServers ?? {});
  const limit = clampInteger(params.limit, 20, 1, 100);
  const status = stringValue(params.status) ?? 'received';
  const targetRole = stringValue(params.target_role) ?? stringValue(params.targetRole) ?? undefined;
  const payload = {
    schema: 'narada.nars.inbox_summary.v1',
    event: 'session_inbox_summary',
    request_id: requestId,
    transport: 'jsonl_stdio',
    status: binding ? 'ok' : 'unavailable',
    server_name: binding?.serverName ?? null,
    affordance_contract: inboxAffordanceContract(binding),
    envelopes: { items: [], count: 0 },
    next_envelope: null,
    doctor: null,
    errors: [],
  };
  if (!binding) {
    payload.errors.push({ code: 'inbox_mcp_unavailable', message: 'No site inbox MCP server with inbox read tools is available.' });
    return payload;
  }
  if (binding.toolNames.has('inbox_list')) {
    payload.envelopes = normalizeInboxEnvelopeCollection(await readInboxTool(binding, 'inbox_list', { limit, status, target_role: targetRole }, payload.errors));
  }
  if (binding.toolNames.has('inbox_next')) {
    const nextEnvelope = await readInboxTool(binding, 'inbox_next', { target_role: targetRole }, payload.errors);
    payload.next_envelope = objectValue(nextEnvelope?.envelope) ? normalizeInboxEnvelope(nextEnvelope.envelope) : null;
  }
  payload.doctor = binding.toolNames.has('inbox_doctor') ? await readInboxTool(binding, 'inbox_doctor', {}, payload.errors) ?? null : null;
  if (payload.errors.length) payload.status = payload.envelopes.count || payload.next_envelope ? 'partial' : 'error';
  return payload;
}

function inboxAffordanceContract(binding) {
  if (!binding) return buildInboxOperatorAffordance({ serverName: 'inbox', server: { tools: [] }, source: 'nars_inbox_summary' });
  return {
    ...buildInboxOperatorAffordance({ serverName: binding.serverName, server: binding.server, source: 'nars_inbox_summary' }),
    schema: 'narada.nars.inbox_operator_affordance_contract.v1',
  };
}

function normalizeInboxEnvelopeCollection(collection) {
  const raw = objectValue(collection) ?? {};
  const sourceItems = Array.isArray(raw.envelopes) ? raw.envelopes : Array.isArray(raw.items) ? raw.items : [];
  const items = sourceItems.map(normalizeInboxEnvelope).filter(Boolean);
  return { ...raw, items, count: numberValue(raw.count) ?? items.length };
}

function normalizeInboxEnvelope(envelope) {
  const record = objectValue(envelope);
  if (!record) return null;
  return {
    envelope_id: stringValue(record.envelope_id) ?? stringValue(record.envelopeId) ?? null,
    status: stringValue(record.status) ?? null,
    kind: stringValue(record.kind) ?? null,
    action: stringValue(record.action) ?? null,
    title: stringValue(record.title) ?? stringValue(record.summary) ?? '(untitled envelope)',
    target_role: stringValue(record.target_role) ?? null,
    severity: stringValue(record.severity) ?? null,
    created_at: stringValue(record.created_at) ?? null,
    updated_at: stringValue(record.updated_at) ?? null,
  };
}

function findWorkerDelegationServerBinding(mcpServers = {}) {
  for (const [serverName, server] of Object.entries(mcpServers)) {
    const toolNames = new Set((server?.tools ?? []).map((tool) => tool?.name).filter(Boolean));
    if (toolNames.has('worker_runs_list') || toolNames.has('worker_dashboard_describe') || toolNames.has('worker_run_status')) return { serverName, server, toolNames };
  }
  return null;
}

function findDelegatedTaskServerBinding(mcpServers = {}) {
  for (const [serverName, server] of Object.entries(mcpServers)) {
    const toolNames = new Set((server?.tools ?? []).map((tool) => tool?.name).filter(Boolean));
    if (toolNames.has('delegated_tasks_list') || toolNames.has('delegated_task_status')) return { serverName, server, toolNames };
  }
  return null;
}

async function serverDelegationSummary({ requestId, params = {}, context = {} }) {
  const workerBinding = findWorkerDelegationServerBinding(context.mcpServers ?? {});
  const taskBinding = findDelegatedTaskServerBinding(context.mcpServers ?? {});
  const workerLimit = clampInteger(params.worker_limit ?? params.workerLimit, 20, 1, 100);
  const taskLimit = clampInteger(params.task_limit ?? params.taskLimit, 20, 1, 100);
  const includeTerminal = params.include_terminal ?? params.includeTerminal ?? true;
  const errors = [];
  const payload = {
    schema: 'narada.nars.delegation_summary.v1',
    event: 'session_delegation_summary',
    request_id: requestId,
    transport: 'jsonl_stdio',
    status: workerBinding || taskBinding ? 'ok' : 'unavailable',
    worker_server_name: workerBinding?.serverName ?? null,
    delegated_task_server_name: taskBinding?.serverName ?? null,
    affordance_contract: delegationAffordanceContract(workerBinding, taskBinding),
    posture: { active: 0, queued: 0, terminal: 0, failed: 0, blocked: 0, stale: 0, total: 0 },
    workers: { items: [], count: 0, dashboard: null },
    delegated_tasks: { items: [], count: 0 },
    errors,
  };
  if (!workerBinding && !taskBinding) {
    errors.push({ code: 'delegation_mcp_unavailable', message: 'No worker-delegation or delegated-task MCP server is available.' });
    return payload;
  }
  if (workerBinding?.toolNames.has('worker_runs_list')) {
    const runsList = await readDelegationTool(workerBinding, 'worker_runs_list', { limit: workerLimit, include_running: true, include_completed: includeTerminal }, errors);
    payload.workers = normalizeWorkerRunCollection(runsList);
  }
  if (workerBinding?.toolNames.has('worker_dashboard_describe')) {
    const dashboard = await readDelegationTool(workerBinding, 'worker_dashboard_describe', { mode: 'all_active', limit: workerLimit, include_terminal: false }, errors);
    payload.workers.dashboard = objectValue(dashboard?.dashboard) ?? null;
    payload.posture = mergeDelegationPosture(payload.posture, objectValue(dashboard?.counts));
  }
  if (taskBinding?.toolNames.has('delegated_tasks_list')) {
    const activeTasks = await readDelegationTool(taskBinding, 'delegated_tasks_list', { limit: taskLimit, view: 'active_queue', site_scope: 'current_site' }, errors);
    payload.delegated_tasks = normalizeDelegatedTaskCollection(activeTasks);
  }
  payload.posture = summarizeDelegationPosture(payload);
  if (errors.length) payload.status = payload.workers.count || payload.delegated_tasks.count ? 'partial' : 'error';
  return payload;
}

function delegationAffordanceContract(workerBinding, taskBinding) {
  const primary = workerBinding ?? taskBinding;
  if (!primary) return buildDelegationOperatorAffordance({ serverName: 'delegation', server: { tools: [] }, source: 'nars_delegation_summary' });
  const tools = [...(workerBinding?.server?.tools ?? []), ...(taskBinding?.server?.tools ?? [])];
  return {
    ...buildDelegationOperatorAffordance({ serverName: primary.serverName, server: { tools, config: primary.server?.config ?? taskBinding?.server?.config ?? {} }, source: 'nars_delegation_summary' }),
    schema: 'narada.nars.delegation_operator_affordance_contract.v1',
    server_names: [workerBinding?.serverName, taskBinding?.serverName].filter(Boolean),
  };
}

function normalizeWorkerRunCollection(value) {
  const record = objectValue(value) ?? {};
  const sourceItems = Array.isArray(record.runs) ? record.runs : Array.isArray(record.items) ? record.items : [];
  const items = sourceItems.map(normalizeWorkerRunItem).filter(Boolean);
  return { items, count: numberValue(record.count) ?? items.length, dashboard: null };
}

function normalizeWorkerRunItem(value) {
  const record = objectValue(value);
  if (!record) return null;
  return {
    run_id: stringValue(record.run_id) ?? null,
    status: stringValue(record.status) ?? null,
    instruction: stringValue(record.instruction) ?? stringValue(record.summary) ?? null,
    cwd: stringValue(record.cwd) ?? stringValue(record.working_directory) ?? null,
    runtime: stringValue(record.runtime) ?? null,
    worker_session_id: stringValue(record.worker_session_id) ?? null,
    started_at: stringValue(record.started_at) ?? null,
    finished_at: stringValue(record.finished_at) ?? null,
    error: stringValue(record.error) ?? stringValue(record.error_classification) ?? null,
  };
}

function normalizeDelegatedTaskCollection(value) {
  const record = objectValue(value) ?? {};
  const sourceItems = Array.isArray(record.tasks) ? record.tasks : Array.isArray(record.items) ? record.items : [];
  const items = sourceItems.map(normalizeDelegatedTaskItem).filter(Boolean);
  return { items, count: numberValue(record.count) ?? items.length };
}

function normalizeDelegatedTaskItem(value) {
  const record = objectValue(value);
  if (!record) return null;
  return {
    task_id: stringValue(record.task_id) ?? null,
    status: stringValue(record.status) ?? null,
    objective: stringValue(record.objective) ?? stringValue(record.title) ?? null,
    owner_site_id: stringValue(record.owner_site_id) ?? null,
    active_run_ids: Array.isArray(record.active_run_ids) ? record.active_run_ids.filter((item) => typeof item === 'string') : [],
    updated_at: stringValue(record.updated_at) ?? null,
    created_at: stringValue(record.created_at) ?? null,
  };
}

function summarizeDelegationPosture(payload) {
  const workerItems = payload.workers.items ?? [];
  const taskItems = payload.delegated_tasks.items ?? [];
  const statuses = [...workerItems, ...taskItems].map((item) => String(item.status ?? 'unknown'));
  return mergeDelegationPosture(payload.posture, {
    total: statuses.length,
    active: statuses.filter((status) => ['running', 'active', 'claimed', 'in_progress'].includes(status)).length,
    queued: statuses.filter((status) => ['queued', 'pending', 'ready'].includes(status)).length,
    terminal: statuses.filter((status) => ['completed', 'done', 'cancelled', 'failed', 'blocked', 'completed_with_errors'].includes(status)).length,
    failed: statuses.filter((status) => ['failed', 'completed_with_errors', 'error'].includes(status)).length,
    blocked: statuses.filter((status) => status === 'blocked').length,
    stale: statuses.filter((status) => status === 'stale').length,
  });
}

function mergeDelegationPosture(base, overlay) {
  const result = { ...base };
  for (const key of ['active', 'queued', 'terminal', 'failed', 'blocked', 'stale', 'total']) {
    const value = numberValue(overlay?.[key]);
    if (value !== null) result[key] = Math.max(numberValue(result[key]) ?? 0, value);
  }
  return result;
}

function findGitServerBinding(mcpServers = {}) {
  for (const [serverName, server] of Object.entries(mcpServers)) {
    const toolNames = new Set((server?.tools ?? []).map((tool) => tool?.name).filter(Boolean));
    if (toolNames.has('git_status') || toolNames.has('git_changed_summary')) return { serverName, server, toolNames };
  }
  return null;
}

async function serverGitSummary({ requestId, params = {}, context = {} }) {
  const binding = findGitServerBinding(context.mcpServers ?? {});
  const workingDirectory = stringValue(params.working_directory) ?? stringValue(params.workingDirectory) ?? stringValue(context.workspaceRoot) ?? stringValue(context.workspace_root) ?? stringValue(context.siteRoot) ?? null;
  const changedLimit = clampInteger(params.changed_limit ?? params.changedLimit, 25, 1, 100);
  const logLimit = clampInteger(params.log_limit ?? params.logLimit, 5, 0, 25);
  const errors = [];
  const payload = {
    schema: 'narada.nars.git_summary.v1',
    event: 'session_git_summary',
    request_id: requestId,
    transport: 'jsonl_stdio',
    status: binding ? 'ok' : 'unavailable',
    server_name: binding?.serverName ?? null,
    affordance_contract: gitAffordanceContract(binding),
    repository: null,
    counts: { tracked_changed: 0, staged: 0, unstaged: 0, untracked: 0, conflicts: 0 },
    changed_files: { items: [], count: 0, truncated: false },
    recent_commits: { items: [], count: 0 },
    errors,
  };
  if (!binding) {
    errors.push({ code: 'git_mcp_unavailable', message: 'No site git MCP server with read tools is available.' });
    return payload;
  }
  const args = workingDirectory ? { working_directory: workingDirectory } : {};
  const status = binding.toolNames.has('git_status') ? await readGitTool(binding, 'git_status', args, errors) : null;
  const changedSummary = binding.toolNames.has('git_changed_summary') ? await readGitTool(binding, 'git_changed_summary', { ...args, untracked_sample_limit: changedLimit }, errors) : null;
  const log = binding.toolNames.has('git_log') && logLimit > 0 ? await readGitTool(binding, 'git_log', { ...args, limit: logLimit }, errors) : null;
  payload.repository = normalizeGitRepository(status, workingDirectory);
  payload.counts = normalizeGitCounts(status, changedSummary);
  payload.changed_files = normalizeGitChangedFiles(status, changedSummary, changedLimit);
  payload.recent_commits = normalizeGitRecentCommits(log);
  if (errors.length) payload.status = payload.repository || payload.changed_files.count || payload.recent_commits.count ? 'partial' : 'error';
  return payload;
}

function gitAffordanceContract(binding) {
  if (!binding) return buildGitOperatorAffordance({ serverName: 'git', server: { tools: [] }, source: 'nars_git_summary' });
  return {
    ...buildGitOperatorAffordance({ serverName: binding.serverName, server: binding.server, source: 'nars_git_summary' }),
    schema: 'narada.nars.git_operator_affordance_contract.v1',
  };
}

function normalizeGitRepository(status, fallbackWorkingDirectory) {
  const record = objectValue(status);
  if (!record && !fallbackWorkingDirectory) return null;
  return {
    working_directory: stringValue(record?.working_directory) ?? fallbackWorkingDirectory ?? null,
    repository_root: stringValue(record?.repository_root) ?? null,
    branch: stringValue(record?.branch) ?? null,
    upstream: stringValue(record?.upstream) ?? null,
    ahead: numberValue(record?.ahead),
    behind: numberValue(record?.behind),
    clean: record?.clean === true,
    detached: record?.detached === true,
    push_target: objectValue(record?.push_target),
  };
}

function normalizeGitCounts(status, changedSummary) {
  const statusRecord = objectValue(status) ?? {};
  const summaryRecord = objectValue(changedSummary) ?? {};
  const statusEntries = Array.isArray(statusRecord.status_entries) ? statusRecord.status_entries.map(objectValue).filter(Boolean) : [];
  return {
    tracked_changed: numberValue(summaryRecord.tracked_changed_count) ?? statusEntries.filter((entry) => entry?.untracked !== true).length,
    staged: numberValue(summaryRecord.staged_count) ?? arrayLength(statusRecord.staged),
    unstaged: numberValue(summaryRecord.unstaged_count) ?? arrayLength(statusRecord.unstaged),
    untracked: numberValue(summaryRecord.untracked_count) ?? arrayLength(statusRecord.untracked),
    conflicts: numberValue(summaryRecord.conflict_count) ?? arrayLength(statusRecord.conflicts),
  };
}

function normalizeGitChangedFiles(status, changedSummary, limit) {
  const entries = [];
  const seen = new Set();
  for (const raw of arrayOfObjects(status?.status_entries)) {
    const item = normalizeGitStatusEntry(raw);
    if (!item || seen.has(item.path)) continue;
    seen.add(item.path);
    entries.push(item);
  }
  addGitPathRows(entries, seen, changedSummary?.staged_paths, 'staged');
  addGitPathRows(entries, seen, changedSummary?.unstaged_paths, 'unstaged');
  addGitPathRows(entries, seen, changedSummary?.tracked_changed_paths, 'changed');
  addGitPathRows(entries, seen, changedSummary?.conflict_paths, 'conflict');
  for (const group of arrayOfObjects(changedSummary?.untracked_groups)) {
    addGitPathRows(entries, seen, group.paths ?? group.samples ?? group.sample_paths, 'untracked');
  }
  const bounded = entries.slice(0, limit);
  return { items: bounded, count: entries.length, truncated: entries.length > bounded.length };
}

function normalizeGitStatusEntry(record) {
  const path = stringValue(record.path) ?? stringValue(record.display_path);
  if (!path) return null;
  const staged = record.staged === true || stringValue(record.x) !== null && stringValue(record.x) !== ' ';
  const unstaged = record.unstaged === true || stringValue(record.y) !== null && stringValue(record.y) !== ' ';
  const untracked = record.untracked === true;
  const conflict = record.conflict === true;
  return {
    path,
    display_path: stringValue(record.display_path) ?? path,
    status: conflict ? 'conflict' : untracked ? 'untracked' : staged && unstaged ? 'staged+unstaged' : staged ? 'staged' : unstaged ? 'unstaged' : 'changed',
    staged,
    unstaged,
    untracked,
    conflict,
  };
}

function addGitPathRows(entries, seen, paths, status) {
  for (const path of stringArrayValue(paths)) {
    if (seen.has(path)) continue;
    seen.add(path);
    entries.push({ path, display_path: path, status, staged: status === 'staged', unstaged: status === 'unstaged', untracked: status === 'untracked', conflict: status === 'conflict' });
  }
}

function normalizeGitRecentCommits(log) {
  const record = objectValue(log) ?? {};
  const items = arrayOfObjects(record.commits).map((commit) => ({
    hash: stringValue(commit.hash) ?? null,
    short_hash: stringValue(commit.short_hash) ?? null,
    subject: stringValue(commit.subject) ?? null,
    author_name: stringValue(commit.author_name) ?? null,
    author_date: stringValue(commit.author_date) ?? null,
  }));
  return { items, count: numberValue(record.returned) ?? items.length };
}

function arrayLength(value) {
  return Array.isArray(value) ? value.length : 0;
}

function findSurfaceFeedbackServerBinding(mcpServers = {}) {
  for (const [serverName, server] of Object.entries(mcpServers)) {
    const toolNames = new Set((server?.tools ?? []).map((tool) => tool?.name).filter(Boolean));
    if (toolNames.has('surface_feedback_list') || toolNames.has('surface_feedback_stats')) return { serverName, server, toolNames };
  }
  return null;
}

async function serverSurfaceFeedbackSummary({ requestId, params = {}, context = {} }) {
  const binding = findSurfaceFeedbackServerBinding(context.mcpServers ?? {});
  const limit = clampInteger(params.limit, 25, 1, 100);
  const offset = clampInteger(params.offset, 0, 0, 10000);
  const args = {
    limit,
    offset,
    ...(stringValue(params.surface_id) ? { surface_id: stringValue(params.surface_id) } : {}),
    ...(stringValue(params.status) ? { status: stringValue(params.status) } : {}),
    ...(stringValue(params.kind) ? { kind: stringValue(params.kind) } : {}),
  };
  const errors = [];
  const payload = {
    schema: 'narada.nars.surface_feedback_summary.v1',
    event: 'session_surface_feedback_summary',
    request_id: requestId,
    transport: 'jsonl_stdio',
    status: binding ? 'ok' : 'unavailable',
    server_name: binding?.serverName ?? null,
    affordance_contract: surfaceFeedbackAffordanceContract(binding),
    stats: { total: 0, by_surface: {}, by_kind: {}, by_status: {} },
    feedback: { items: [], count: 0, limit, offset },
    doctor: null,
    errors,
  };
  if (!binding) {
    errors.push({ code: 'surface_feedback_mcp_unavailable', message: 'No site surface-feedback MCP server with read tools is available.' });
    return payload;
  }
  if (binding.toolNames.has('surface_feedback_stats')) payload.stats = normalizeSurfaceFeedbackStats(await readSurfaceFeedbackTool(binding, 'surface_feedback_stats', {}, errors));
  if (binding.toolNames.has('surface_feedback_list')) payload.feedback = normalizeSurfaceFeedbackCollection(await readSurfaceFeedbackTool(binding, 'surface_feedback_list', args, errors), limit, offset);
  payload.doctor = binding.toolNames.has('surface_feedback_doctor') ? await readSurfaceFeedbackTool(binding, 'surface_feedback_doctor', {}, errors) ?? null : null;
  if (errors.length) payload.status = payload.feedback.count || payload.stats.total ? 'partial' : 'error';
  return payload;
}

function surfaceFeedbackAffordanceContract(binding) {
  if (!binding) return buildSurfaceFeedbackOperatorAffordance({ serverName: 'surface-feedback', server: { tools: [] }, source: 'nars_surface_feedback_summary' });
  return {
    ...buildSurfaceFeedbackOperatorAffordance({ serverName: binding.serverName, server: binding.server, source: 'nars_surface_feedback_summary' }),
    schema: 'narada.nars.surface_feedback_operator_affordance_contract.v1',
  };
}

function normalizeSurfaceFeedbackStats(value) {
  const record = objectValue(value) ?? {};
  return {
    total: numberValue(record.total) ?? 0,
    by_surface: objectValue(record.by_surface) ?? {},
    by_kind: objectValue(record.by_kind) ?? {},
    by_status: objectValue(record.by_status) ?? {},
    store: objectValue(record.store) ?? null,
  };
}

function normalizeSurfaceFeedbackCollection(value, limit, offset) {
  const record = objectValue(value) ?? {};
  const items = arrayOfObjects(record.items).map(normalizeSurfaceFeedbackItem).filter(Boolean);
  return { items, count: numberValue(record.count) ?? items.length, limit: numberValue(record.limit) ?? limit, offset: numberValue(record.offset) ?? offset, store: objectValue(record.store) ?? null };
}

function normalizeSurfaceFeedbackItem(value) {
  const record = objectValue(value);
  if (!record) return null;
  return {
    feedback_id: stringValue(record.feedback_id) ?? null,
    surface_id: stringValue(record.surface_id) ?? null,
    submitter_site_id: stringValue(record.submitter_site_id) ?? null,
    submitter_principal: stringValue(record.submitter_principal) ?? null,
    kind: stringValue(record.kind) ?? null,
    summary: stringValue(record.summary) ?? null,
    status: stringValue(record.status) ?? null,
    resolution_note: stringValue(record.resolution_note) ?? null,
    resolved_by: stringValue(record.resolved_by) ?? null,
    created_at: stringValue(record.created_at) ?? null,
    updated_at: stringValue(record.updated_at) ?? null,
  };
}

function findTaskLifecycleServerBinding(mcpServers = {}) {
  for (const [serverName, server] of Object.entries(mcpServers)) {
    const toolNames = new Set((server?.tools ?? []).map((tool) => tool?.name).filter(Boolean));
    if (toolNames.has('task_lifecycle_workboard_snapshot') || toolNames.has('task_lifecycle_obligations')) return { serverName, server, toolNames };
  }
  return null;
}

async function serverTaskLifecycleSummary({ requestId, params = {}, context = {} }) {
  const binding = findTaskLifecycleServerBinding(context.mcpServers ?? {});
  const agentId = stringValue(params.agent_id) ?? stringValue(params.agentId) ?? context.identity ?? null;
  const limit = clampInteger(params.limit, 8, 1, 25);
  const includeObligations = params.include_obligations ?? params.includeObligations ?? true;
  const payload = {
    schema: 'narada.nars.task_lifecycle_summary.v1',
    event: 'session_task_lifecycle_summary',
    request_id: requestId,
    transport: 'jsonl_stdio',
    status: binding ? 'ok' : 'unavailable',
    server_name: binding?.serverName ?? null,
    agent_id: agentId,
    affordance_contract: taskLifecycleAffordanceContract(binding),
    workboard: null,
    recommendation: null,
    counts: {},
    in_progress: { items: [], count: 0 },
    pending_reviews: { items: [], count: 0 },
    obligations: { items: [], count: 0 },
    errors: [],
  };
  if (!binding) {
    payload.errors.push({ code: 'task_lifecycle_mcp_unavailable', message: 'No site task lifecycle MCP server with workboard read tools is available.' });
    return payload;
  }
  if (!agentId) {
    payload.status = 'error';
    payload.errors.push({ code: 'task_lifecycle_agent_id_unavailable', message: 'Task lifecycle summary requires a session agent id.' });
    return payload;
  }
  const workboard = await readTaskLifecycleTool(binding, 'task_lifecycle_workboard_snapshot', { agent_id: agentId, limit }, payload.errors);
  payload.workboard = objectValue(workboard) ?? null;
  payload.recommendation = objectValue(payload.workboard?.recommendation) ?? null;
  payload.counts = objectValue(payload.workboard?.counts) ?? objectValue(payload.workboard?.response_counts) ?? {};
  payload.in_progress = normalizeTaskLifecycleCollection(payload.workboard?.my_in_progress ?? payload.workboard?.in_progress);
  payload.pending_reviews = normalizeTaskLifecycleCollection(payload.workboard?.pending_reviews ?? payload.workboard?.my_review_obligations);
  if (includeObligations) {
    const obligations = await readTaskLifecycleTool(binding, 'task_lifecycle_obligations', { agent_id: agentId, status: 'open' }, payload.errors);
    payload.obligations = normalizeTaskLifecycleCollection(obligations?.obligations ?? obligations?.items ?? obligations);
  }
  if (payload.errors.length) payload.status = payload.workboard || payload.obligations.count ? 'partial' : 'error';
  return payload;
}

function taskLifecycleAffordanceContract(binding) {
  if (!binding) return buildTaskLifecycleOperatorAffordance({ serverName: 'task-lifecycle', server: { tools: [] }, source: 'nars_task_lifecycle_summary' });
  return {
    ...buildTaskLifecycleOperatorAffordance({ serverName: binding.serverName, server: binding.server, source: 'nars_task_lifecycle_summary' }),
    schema: 'narada.nars.task_lifecycle_operator_affordance_contract.v1',
  };
}

function normalizeTaskLifecycleCollection(value) {
  const items = Array.isArray(value)
    ? value.map(normalizeTaskLifecycleItem).filter(Boolean)
    : Array.isArray(value?.items) ? value.items.map(normalizeTaskLifecycleItem).filter(Boolean) : [];
  return { items, count: numberValue(value?.count) ?? items.length };
}

function normalizeTaskLifecycleItem(value) {
  const record = objectValue(value);
  if (!record) return null;
  return {
    task_number: numberValue(record.task_number) ?? null,
    task_id: stringValue(record.task_id) ?? null,
    title: stringValue(record.title) ?? '(untitled task)',
    status: stringValue(record.status) ?? null,
    assigned_agent: stringValue(record.assigned_agent) ?? null,
    target_role: stringValue(record.target_role) ?? null,
    updated_at: stringValue(record.updated_at) ?? null,
    obligation_id: stringValue(record.obligation_id) ?? null,
    kind: stringValue(record.kind) ?? null,
  };
}

function codexAiProcessInvocationError(error) {
  if (error instanceof AiProcessInvocationRefusalError) {
    return new Error(`codex ai process invocation refused: ${error.admission.reason}; artifact=${error.admission.artifact_path}`);
  }
  return error;
}

function authorityTransitionTargetStatus(state = {}) {
  const transition = authorityTransitionStatus(state);
  const targetState = transition.authority_transition_state === 'target_active'
    ? 'active'
    : transition.authority_transition_state === 'target_activating'
      ? 'activating'
      : transition.authority_transition_state === 'preparing_target' || transition.target_prepared_at
        ? 'prepared'
        : 'not_prepared';
  return {
    state: targetState,
    authority_transition_state: transition.authority_transition_state,
    target_write_admission: transition.target_write_admission,
    target_prepared_at: transition.target_prepared_at ?? null,
    target_activated_at: transition.target_activated_at ?? null,
    target_first_sequence: transition.target_first_sequence ?? null,
    authority_epoch_token: transition.authority_epoch_token ?? null,
    activation_id: transition.activation_id ?? null,
    target_authority_locator: transition.target_authority_locator ?? null,
    superseded_by_session_id: transition.superseded_by_session_id ?? null,
    authority_locator_ref: transition.authority_locator_ref ?? null,
  };
}

function targetWriteAdmissionRefusal(state = {}, controlRequest = {}) {
  if (!isCanonicalSourceWriteRequest(controlRequest)) return null;
  const target = authorityTransitionTargetStatus(state);
  if (target.state !== 'activating' && target.state !== 'prepared') return null;
  return {
    code: 'authority_target_not_active',
    message: 'Target authority is prepared but not active; canonical writes require source seal evidence and an authority epoch token.',
    failed_invariant: 'target_must_not_admit_writes_before_activation_evidence',
    authority_transition_target: target,
  };
}

function targetActivationRefusals(state = {}, params = {}) {
  const refusals = [];
  const transition = authorityTransitionStatus(state);
  const sourceSealEvidence = params.source_seal_evidence ?? params.sourceSealEvidence ?? null;
  const eventCursor = sourceSealEvidence?.event_cursor ?? sourceSealEvidence?.eventCursor ?? null;
  const sourceLastSequence = eventCursor?.last_source_sequence_before_seal ?? eventCursor?.source_last_sequence ?? transition.source_last_sequence;
  const requestedTargetFirstSequence = params.target_first_sequence ?? params.targetFirstSequence ?? currentEventSequence + 1;
  if (transition.source_write_admission !== 'sealed' && sourceSealEvidence?.source_write_admission !== 'sealed') {
    refusals.push(targetActivationRefusal('source_seal_evidence_missing', 'source_must_be_sealed_before_target_activation', 'Target activation requires evidence that the source is sealed.'));
  }
  if (!Number.isInteger(sourceLastSequence) || sourceLastSequence < 0) {
    refusals.push(targetActivationRefusal('event_boundary_missing', 'target_first_sequence_must_follow_source_last_sequence', 'Target activation requires a source last-sequence event boundary.'));
  }
  if (!Number.isInteger(requestedTargetFirstSequence) || requestedTargetFirstSequence !== currentEventSequence + 1) {
    refusals.push(targetActivationRefusal('target_first_sequence_boundary_mismatch', 'target_active_event_must_be_emitted_at_declared_sequence_boundary', 'Target activation target_first_sequence must equal the next runtime event sequence.'));
  }
  const token = params.authority_epoch_token ?? params.authorityEpochToken ?? null;
  const sourceEpoch = token?.source_authority_epoch;
  const targetEpoch = token?.target_authority_epoch;
  if (!Number.isInteger(sourceEpoch) || !Number.isInteger(targetEpoch) || targetEpoch <= sourceEpoch) {
    refusals.push(targetActivationRefusal('authority_epoch_token_invalid', 'target_epoch_must_exceed_source_epoch', 'Target activation requires a monotonic authority epoch token.'));
  }
  const targetHealth = params.target_health ?? params.targetHealth ?? null;
  if (targetHealth?.status !== 'healthy') {
    refusals.push(targetActivationRefusal('target_health_unavailable', 'target_health_required_before_target_active', 'Target activation requires fresh healthy target evidence.'));
  }
  const mcpFabric = params.mcp_fabric ?? params.mcpFabric ?? { status: 'compatible' };
  if (!['compatible', 'degraded_explicit'].includes(mcpFabric?.status)) {
    refusals.push(targetActivationRefusal('mcp_fabric_incompatible', 'mcp_fabric_must_be_compatible_or_explicitly_degraded', 'Target activation requires compatible MCP fabric or explicit degraded acceptance.'));
  }
  const artifacts = params.artifacts ?? { source_paths_exposed: false };
  if (artifacts?.source_paths_exposed === true) {
    refusals.push(targetActivationRefusal('artifact_handoff_policy_refused', 'artifact_handoff_must_not_expose_unadmitted_source_paths', 'Target activation requires artifact handoff policy evidence.'));
  }
  return { refusals, sourceLastSequence, targetFirstSequence: requestedTargetFirstSequence, token };
}

function targetActivationRefusal(reasonCode, failedInvariant, reason) {
  return { reason_code: reasonCode, failed_invariant: failedInvariant, reason };
}

function deterministicTargetActivationId({ session, targetEpoch, targetFirstSequence }) {
  return `authority_target_active:${session ?? 'unknown'}:${targetEpoch}:${targetFirstSequence}`;
}

function authorityTransitionStatus(state = {}) {
  return authorityTransitionSourceStateSnapshot(state.authorityTransition ?? {});
}

function sourceWriteAdmissionForRequest(state = {}, { methodKind = null, method = null, params = {} } = {}) {
  const transitionPolicy = params?.transition_policy ?? params?.transitionPolicy ?? null;
  return classifySourceWriteAdmission(state.authorityTransition, { methodKind, method, transitionPolicy });
}

function emitSourceWriteRefusal(context = {}, { requestId = null, methodKind = null, method = null, admission } = {}) {
  const payload = {
    event: 'authority_transition_input_refused',
    request_id: requestId,
    method,
    method_kind: methodKind,
    reason_code: admission.reason_code,
    reason: admission.reason,
    authority_transition: admission.authority_transition ?? authorityTransitionStatus(context.state),
    terminal_state: 'refused',
  };
  context.appendSessionRecord?.({ ...payload, requested_at: new Date().toISOString() });
  context.emit('authority_transition_input_refused', payload);
}

function refuseSourceWriteIfNotAdmitted(context = {}, { requestId = null, methodKind = null, method = null, params = {} } = {}) {
  const admission = sourceWriteAdmissionForRequest(context.state, { methodKind, method, params });
  if (admission.admitted) return admission;
  emitSourceWriteRefusal(context, { requestId, methodKind, method, admission });
  return admission;
}

function authorityTransitionSourceStatus(state = {}) {
  const source = authorityTransitionStatus(state);
  const sourceState = source.source_write_admission === 'sealed'
    ? 'sealed'
    : source.source_write_admission === 'draining'
      ? 'draining'
      : 'active';
  return {
    state: sourceState,
    authority_transition_state: source.authority_transition_state,
    source_write_admission: source.source_write_admission,
    drain_policy: sourceState === 'draining' ? 'refuse_new_source_writes' : 'none',
    draining_at: source.drain_started_at ?? null,
    sealed_at: source.sealed_at ?? null,
    seal_evidence: source.sealed_at ? {
      event_cursor: {
        last_source_sequence_before_seal: source.source_last_sequence,
        next_source_sequence_after_seal: Number.isInteger(source.source_last_sequence) ? source.source_last_sequence + 1 : null,
      },
      operator_input_queue: inputQueueStatus(state),
    } : null,
    superseded_by_session_id: source.superseded_by_session_id ?? null,
    authority_locator_ref: source.authority_locator_ref ?? null,
    target_authority_locator: source.target_authority_locator ?? null,
  };
}

function setAuthorityTransitionSourceState(state = {}, next = {}) {
  if (next.state === 'draining') {
    state.authorityTransition = beginSourceDrain({
      path: state.authorityTransitionStatePath,
      sessionPath: state.sessionPath,
      state: state.authorityTransition,
      reason: next.reason ?? null,
      requestedBy: next.requested_by ?? null,
    });
  } else if (next.state === 'sealed') {
    state.authorityTransition = sealSourceAuthority({
      path: state.authorityTransitionStatePath,
      sessionPath: state.sessionPath,
      state: state.authorityTransition,
      sourceLastSequence: next.seal_evidence?.event_cursor?.last_source_sequence_before_seal,
      reason: next.reason ?? null,
      requestedBy: next.requested_by ?? null,
    });
  }
  return authorityTransitionSourceStatus(state);
}

function isCanonicalSourceWriteRequest(controlRequest = {}) {
  return [
    'conversation_enqueue',
    'conversation_send',
    'conversation_steer',
    'carrier_input_deliver',
    'system_directive_deliver',
  ].includes(controlRequest.method_kind);
}

function authoritySourceWriteRefusal(state = {}, controlRequest = {}) {
  if (!isCanonicalSourceWriteRequest(controlRequest)) return null;
  if (authorityTransitionTargetStatus(state).state === 'active') return null;
  const source = authorityTransitionSourceStatus(state);
  if (source.state === 'sealed') {
    return {
      code: 'authority_source_sealed',
      message: 'Source authority is sealed; canonical source writes are refused to prevent split authority.',
      failed_invariant: 'sealed_source_must_not_admit_canonical_writes',
      authority_transition_source: source,
    };
  }
  if (source.state === 'draining') {
    return {
      code: 'authority_source_draining',
      message: 'Source authority is draining; new canonical source writes are refused until transition is sealed or cancelled.',
      failed_invariant: 'draining_source_must_not_expand_operator_input_queue',
      authority_transition_source: source,
    };
  }
  return null;
}

function sourceSealReadiness(state = {}) {
  const queue = inputQueueStatus(state);
  if (state.activeTurn) {
    return {
      ready: false,
      reason_code: 'active_turn_in_progress',
      message: 'Cannot seal source authority while an active turn is running.',
    };
  }
  if ((queue.pendingCount ?? 0) > 0) {
    return {
      ready: false,
      reason_code: 'operator_input_queue_not_drained',
      message: 'Cannot seal source authority while operator input remains queued.',
    };
  }
  return { ready: true, reason_code: null, message: null };
}

function authoritySourceSealEvidence(state = {}) {
  return {
    event_cursor: {
      last_source_sequence_before_seal: currentEventSequence,
      next_source_sequence_after_seal: currentEventSequence + 1,
    },
    operator_input_queue: inputQueueStatus(state),
  };
}

function inputQueueStatus(state = {}) {
  const snapshot = state.inputQueue?.state?.() ?? {};
  const items = state.inputQueue?.items?.() ?? [];
  return {
    ...snapshot,
    items,
    state_path: state.operatorInputQueueStatePath ?? null,
    durability: state.operatorInputQueueStatePath ? 'nars_session_file' : 'memory_only',
  };
}

function serverCommandMessage({ requestId, command, message, terminalState = 'completed', fields = null }) {
  return {
    request_id: requestId,
    command,
    terminal_state: terminalState,
    message,
    ...(fields ? { fields } : {}),
  };
}

function normalizeThinkingLevel(value) {
  const normalized = String(value ?? 'medium').trim().toLowerCase();
  if (['none', 'low', 'medium', 'high', 'xhigh'].includes(normalized)) return normalized;
  return 'medium';
}

function observerServerStatus({ requestId, state }) {
  return {
    request_id: requestId,
    observer_muted: state?.displaySettings?.observerMuted === true,
    observer_visibilities: ['operator_visible', 'operator_hidden', 'record_only'],
  };
}

function serverRecovery({ requestId, state, mcpServers, mcpPreflightArtifact, context = {} }) {
  const status = serverStatus({ requestId, state, allTools: [], mcpServers, mcpPreflightArtifact, context });
  const startupDegraded = status.mcp_startup_failure_count > 0;
  const requestInvalid = status.request_posture === 'invalid_control_traffic';
  return {
    ...status,
    recommended_action: startupDegraded ? 'review_startup_diagnostics' : requestInvalid ? 'review_invalid_control_traffic' : status.recommended_action,
    recommended_action_display: startupDegraded ? 'review startup diagnostics' : requestInvalid ? 'review invalid control traffic' : status.recommended_action_display,
    recovery_kind: startupDegraded ? 'startup_diagnostic_review' : requestInvalid ? 'invalid_control_review' : 'no_recovery',
    recovery_kind_display: startupDegraded ? 'startup diagnostic review' : requestInvalid ? 'invalid control review' : 'no recovery',
    recommended_command: sessionHandoffs({ identity: context.identity, session: context.session }).session_recovery,
    recovery_primary_command: requestInvalid ? sessionHandoffs({ identity: context.identity, session: context.session }).session_events_issues : null,
    recovery_followup_command: requestInvalid ? sessionHandoffs({ identity: context.identity, session: context.session }).session_read : null,
    handoffs: sessionHandoffs({ identity: context.identity, session: context.session }),
  };
}

function serverPreflightRecovery({ requestId, mcpPreflightArtifact }) {
  return {
    request_id: requestId,
    ...createMcpPreflightArtifactSnapshot(mcpPreflightArtifact),
    recommended_action: mcpPreflightArtifact?.recommended_action ?? null,
    recovery_kind: mcpPreflightArtifact?.recovery_kind ?? null,
  };
}

function serverEventsSubscription({ requestId, params = {}, context = {} }) {
  const replayPage = params.include_replay === false ? null : readNarsEventLogPage({
    eventsPath: context.eventsPath,
    afterSequence: params.since_sequence,
    sinceTimestamp: params.since_timestamp,
    filters: params.filters,
    limit: params.max_replay ?? 100,
  });
  const replay = replayPage?.events ?? [];
  const lastEvent = replay.at(-1) ?? null;
  return {
    schema: 'narada.nars.events.subscription.v1',
    event: 'session_events_subscription_started',
    request_id: requestId,
    subscription_id: `sub_${requestId ?? Date.now()}`,
    transport: 'jsonl_stdio',
    replay_count: replay.length,
    replay,
    replay_source: replayPage?.source ?? 'none',
    cursor: {
      last_sequence: lastEvent?.event_sequence ?? lastEvent?.sequence ?? null,
      next_sequence: currentEventSequence + 1,
    },
    operator_input_queue: inputQueueStatus(context.state),
    filters: params.filters && typeof params.filters === 'object' ? params.filters : {},
    live_stream: 'stdout_jsonl',
    close_semantics: 'request_scoped_replay_over_stdio; durable live subscriptions require websocket transport',
  };
}

function serverEventsRead({ requestId, params = {}, context = {} }) {
  const page = readNarsEventLogPage({
    eventsPath: context.eventsPath,
    afterSequence: params.after_sequence ?? params.since_sequence,
    beforeSequence: params.before_sequence,
    sinceTimestamp: params.since_timestamp,
    filters: params.filters,
    limit: params.limit ?? params.max_replay ?? 100,
    direction: params.direction,
  });
  return {
    ...page,
    event: 'session_events_read',
    request_id: requestId,
    transport: 'jsonl_stdio',
  };
}

function isWithinPath(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (rel && !rel.startsWith('..') && !rel.startsWith('/') && !rel.startsWith('\\'));
}

function sessionSyncTargetPath({ target, siteRoot }) {
  const targetText = String(target ?? '').trim();
  if (!targetText) throw new Error('session_sync_target_required');
  const resolvedTarget = resolve(siteRoot, targetText);
  if (!isWithinPath(siteRoot, resolvedTarget)) throw new Error('session_sync_target_outside_site_root');
  return resolvedTarget;
}

function listSyncFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  const walk = (directory, prefix = '') => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath, relativePath);
        continue;
      }
      if (entry.isFile()) files.push(relativePath);
    }
  };
  walk(root);
  return files.sort();
}

function copySyncTree({ sourceRoot, targetRoot, dryRun = false, deleteExtraneous = false }) {
  const sourceFiles = listSyncFiles(sourceRoot);
  const targetFiles = listSyncFiles(targetRoot);
  let copied = 0;
  let skipped = 0;
  let deleted = 0;
  const targetFileSet = new Set(targetFiles);
  for (const relativePath of sourceFiles) {
    const sourcePath = join(sourceRoot, relativePath);
    const targetPath = join(targetRoot, relativePath);
    const sourceStat = statSync(sourcePath);
    const targetExists = existsSync(targetPath);
    const shouldCopy = !targetExists || statSync(targetPath).size !== sourceStat.size || statSync(targetPath).mtimeMs < sourceStat.mtimeMs;
    if (!shouldCopy) {
      skipped += 1;
      continue;
    }
    copied += 1;
    if (!dryRun) {
      mkdirSync(dirname(targetPath), { recursive: true });
      copyFileSync(sourcePath, targetPath);
    }
  }
  if (deleteExtraneous) {
    for (const relativePath of targetFileSet) {
      if (sourceFiles.includes(relativePath)) continue;
      deleted += 1;
      if (!dryRun) rmSync(join(targetRoot, relativePath), { force: true });
    }
  }
  return { copied, skipped, deleted, source_file_count: sourceFiles.length, target_file_count: targetFiles.length };
}

function syncSessionDirectory({ requestId, params = {}, context = {}, startedAt = new Date() }) {
  const direction = String(params.direction ?? 'upload').trim().toLowerCase();
  if (!['upload', 'download', 'bidirectional'].includes(direction)) throw new Error(`session_sync_direction_unsupported:${direction}`);
  const target = params.target ?? params.session_sync_target ?? params.sessionSyncTarget ?? null;
  const dryRun = Boolean(params.dry_run ?? params.dryRun ?? false);
  const deleteExtraneous = Boolean(params.delete ?? params.delete_extraneous ?? false);
  const sessionDir = dirname(String(context.sessionPath ?? ''));
  if (!context.siteRoot) throw new Error('session_sync_site_root_required');
  if (!context.sessionPath) throw new Error('session_sync_session_path_required');
  const targetRoot = sessionSyncTargetPath({ target, siteRoot: context.siteRoot });
  const runs = [];
  if (direction === 'upload' || direction === 'bidirectional') {
    runs.push(copySyncTree({ sourceRoot: sessionDir, targetRoot, dryRun, deleteExtraneous }));
  }
  if (direction === 'download' || direction === 'bidirectional') {
    runs.push(copySyncTree({ sourceRoot: targetRoot, targetRoot: sessionDir, dryRun, deleteExtraneous: false }));
  }
  const completedAt = new Date();
  const totals = runs.reduce((acc, item) => ({
    copied: acc.copied + item.copied,
    skipped: acc.skipped + item.skipped,
    deleted: acc.deleted + item.deleted,
    source_file_count: acc.source_file_count + item.source_file_count,
    target_file_count: acc.target_file_count + item.target_file_count,
  }), { copied: 0, skipped: 0, deleted: 0, source_file_count: 0, target_file_count: 0 });
  return {
    request_id: requestId,
    transport: 'jsonl_stdio',
    event: 'session_sync',
    direction,
    target,
    target_path: targetRoot,
    mode: dryRun ? 'dry-run' : 'apply',
    success: true,
    conflicts: 0,
    ...totals,
    requested_at: startedAt.toISOString(),
    completed_at: completedAt.toISOString(),
    duration_ms: completedAt.getTime() - startedAt.getTime(),
    message: `session sync ${dryRun ? 'planned' : 'completed'}`,
  };
}

function serverOperations({ requestId, state, mcpServers, mcpPreflightArtifact, context = {} }) {
  const mcpStatus = createMcpStatusSnapshot(mcpServers);
  return {
    request_id: requestId,
    transport: 'jsonl_stdio',
    event: 'session_operations',
    active_turn_state: state.activeTurn ? 'running' : 'idle',
    active_turn_id: state.activeTurn?.turnId ?? null,
    operator_input_queue: inputQueueStatus(state),
    authority_transition: authorityTransitionStatus(state),
    authority_transition_state: state.authorityTransition?.authority_transition_state ?? null,
    source_write_admission: state.authorityTransition?.source_write_admission ?? 'active',
    authority_transition_source: authorityTransitionSourceStatus(state),
    authority_transition_target: authorityTransitionTargetStatus(state),
    operator_input_queue: inputQueueStatus(state),
    ...mcpStatus,
    ...createMcpPreflightArtifactSnapshot(mcpPreflightArtifact),
    ...createSessionActivitySnapshot(state),
    ...createOperationalPostureSnapshot({ state, mcpOperationalState: mcpStatus.mcp_operational_state }),
    operation: operationHeartbeatSummary(),
    handoffs: sessionHandoffs({ identity: context.identity, session: context.session }),
    session_path: context.sessionPath,
    events_path: context.eventsPath,
  };
}

function operationHeartbeatSummary() {
  return {
    operation_event_summary: '1 (directive_emission_authorized), 1 (directive_emission_rule_recorded), 1 (directive_emitted)',
    operation_event_counts: {
      directive_emission_authorized: 1,
      directive_emission_rule_recorded: 1,
      directive_emitted: 1,
    },
    directive_kind_summary: '3 (operation_heartbeat)',
    directive_visibility_summary: '3 (record_only)',
    operation_id_summary: '3 (operation_inventory_1)',
  };
}

function recordOperationHeartbeatEvidence(context = {}) {
  for (const event of ['directive_emission_authorized', 'directive_emission_rule_recorded', 'directive_emitted']) {
    context.appendSessionRecord?.({
      event,
      event_kind: event,
      directive_kind: 'operation_heartbeat',
      directive_visibility: 'record_only',
      operation_id: 'operation_inventory_1',
      timestamp: new Date().toISOString(),
    });
  }
}

function recordWorkflowRequest(context = {}, event, { requestId = null, method = null } = {}) {
  context.appendSessionRecord?.({
    event,
    request_id: requestId,
    method,
    operation_status: 'requested',
    requested_at: new Date().toISOString(),
  });
}

async function runServerInputEvent({ requestId, state, messages, allTools, mcpServers, emit, callChatApiFn, input, directiveId = null, identity, session, siteRoot, sessionPath, appendSessionRecord, providerSettings }) {
  const runtimeAdmission = classifyCarrierInputAdmission(input);
  if (isObserverInputEvent(input) && runtimeAdmission.complete_without_provider) {
    noteSessionActivity(state, 'observer_input_complete', new Date().toISOString(), 'completed_without_provider');
    emit('observer_input_complete', {
      request_id: requestId,
      input_event_id: input.event_id,
      visibility: runtimeAdmission.visibility,
      terminal_state: 'completed_without_provider',
    });
    return { terminal_state: 'completed_without_provider' };
  }
  if (runtimeAdmission.is_directive && runtimeAdmission.complete_without_provider) {
    if (directiveId) {
      emit('directive_received', { request_id: requestId, directive_id: directiveId, terminal_state: 'accepted', source: 'system_directive' });
    }
    noteSessionActivity(state, 'directive_complete', new Date().toISOString(), 'completed_without_provider');
    emit('directive_complete', {
      request_id: requestId,
      input_event_id: input.event_id,
      terminal_state: 'completed_without_provider',
      ...(directiveId ? { directive_id: directiveId, source: 'system_directive' } : {}),
    });
    return { terminal_state: 'completed_without_provider' };
  }
  return runServerConversationTurn({ requestId, state, messages, allTools, mcpServers, emit, callChatApiFn, input, directiveId, identity, session, siteRoot, sessionPath, appendSessionRecord, providerSettings });
}

async function runServerConversationTurn({ requestId, state, messages, allTools, mcpServers, emit, callChatApiFn, input, directiveId = null, identity, session, siteRoot, appendSessionRecord, providerSettings }) {
  const turnId = `turn_${randomId()}`;
  const turn = createTurn(turnId, requestId);
  const record = normalizeInputRecord(input);
  state.activeTurn = turn;
  if (directiveId) emit('directive_received', { request_id: requestId, turn_id: turnId, directive_id: directiveId, terminal_state: 'accepted', source: 'system_directive' });
  emit('user_message', {
    request_id: requestId,
    turn_id: turnId,
    input_event_id: input?.event_id ?? null,
    content: record.content,
    source: record.source ?? input?.source ?? null,
    source_kind: input?.source_kind ?? null,
    source_id: input?.source_id ?? null,
    transport: input?.transport ?? null,
  });
  emit('turn_started', { request_id: requestId, turn_id: turnId, terminal_state: 'accepted', ...(directiveId ? { directive_id: directiveId, source: 'system_directive' } : {}) });
  try {
    messages.push({ role: 'user', content: record.content });
    appendSessionRecord(sessionLogEntry({ role: 'user', content: record.content, source: record.source, eventId: input?.event_id, transport: input?.transport, directiveId: input?.directive_id }));
    const result = await runConversationLoop(messages, allTools, mcpServers, {
      emit,
      turn,
      callChatApiFn,
      inputEventId: input?.event_id ?? null,
      identity,
      session,
      siteRoot,
      appendSessionRecord,
      providerSettings,
    });
    const terminalState = turn.interruptRequested ? 'interrupted' : (result?.terminal_state ?? 'completed');
    emit(terminalState === 'failed' ? 'turn_failed' : 'turn_complete', {
      request_id: requestId,
      turn_id: turnId,
      ...(directiveId ? { directive_id: directiveId } : {}),
      terminal_state: terminalState,
      ...(result?.reason ? { reason: result.reason } : {}),
    });
    return result;
  } catch (error) {
    if (turn.interruptRequested) {
      emit('turn_complete', { request_id: requestId, turn_id: turnId, terminal_state: 'interrupted', reason: 'interrupt_requested' });
      return { terminal_state: 'interrupted', reason: 'interrupt_requested' };
    }
    emit('turn_failed', { request_id: requestId, turn_id: turnId, terminal_state: 'failed', error: error instanceof Error ? error.message : String(error) });
    return { terminal_state: 'failed', reason: error instanceof Error ? error.message : String(error) };
  } finally {
    if (state.activeTurn === turn) state.activeTurn = null;
  }
}

async function runConversationLoop(messages, tools, mcpServers, options) {
  const { emit, turn, callChatApiFn, appendSessionRecord, providerSettings } = options;
  while (true) {
    if (turn?.interruptRequested) return { terminal_state: 'interrupted' };
    const response = await callChatApiFn(messagesWithCarrierGoal(messages, providerSettings.goal), tools, { ...providerSettings, turn, abortSignal: turn?.abortSignal, emit, mcpServers });
    const choice = response.choices?.[0];
    if (!choice) return { terminal_state: 'failed', reason: 'no_response_from_ai' };
    const message = choice.message;
    messages.push(message);
    appendSessionRecord({ role: 'assistant', content: message.content ?? null, tool_calls: message.tool_calls ?? undefined, reasoning_content: message.reasoning_content ?? undefined, timestamp: new Date().toISOString() });
    if (message.content) emit?.('assistant_message', { turn_id: turn?.turnId ?? null, content: message.content });
    if (!message.tool_calls?.length) return { terminal_state: 'completed' };
    const toolResults = [];
    for (const toolCall of message.tool_calls) {
      if (turn?.interruptRequested) return { terminal_state: 'interrupted' };
      toolResults.push(await executeMcpTool(toolCall, mcpServers, { ...options, serverMode: true, turnId: turn?.turnId ?? null }));
    }
    for (const result of toolResults) {
      messages.push(result);
      appendSessionRecord({ role: 'tool', content: result.content, tool_call_id: result.tool_call_id, timestamp: new Date().toISOString() });
    }
  }
}

export async function runConversationTurn(messages, tools, mcpServers, _readlineInterface = null, options = {}) {
  try {
    return await runConversationLoop(messages, tools, mcpServers, {
      ...options,
      appendSessionRecord: options.appendSessionRecord ?? (() => {}),
      providerSettings: options.carrierSessionSettings ?? options.providerSettings ?? {},
      identity: options.identity ?? options.agentId,
      session: options.session ?? options.carrierSessionId,
    });
  } catch (error) {
    if (options.turn?.interruptRequested || isAbortError(error)) {
      options.emit?.('turn_interrupted', { turn_id: options.turn?.turnId ?? null, terminal_state: 'interrupted' });
      return { terminal_state: 'interrupted' };
    }
    return { terminal_state: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
}

export async function executeMcpTool(toolCall, mcpServers, _readlineInterface = null, options = {}) {
  if (_readlineInterface && typeof _readlineInterface === 'object' && !('write' in _readlineInterface)) {
    options = _readlineInterface;
  }
  const name = toolCall.function?.name ?? '';
  const args = parseJson(toolCall.function?.arguments ?? '{}');
  const binding = findToolBinding(name, mcpServers);
  const server = binding?.server ?? null;
  const toolMetadata = resolveToolMetadata({ toolName: name, server, tool: binding?.tool ?? null });
  const admission = classifyCarrierActionRequest(name, args, {
    toolAvailable: !!server,
    toolMetadata,
    delegatedAuthorityHandoff: options.delegatedAuthorityHandoff ?? null,
  });
  const admitted = admission.decision === 'read_only_admitted' || admission.carrier_mutation_admitted === true;
  options.emit?.('tool_call', {
    turn_id: options.turnId,
    tool: name,
    decision: admission.decision,
    classifier_source: admission.classifier_source ?? toolMetadata?.source ?? null,
    argument_summary: argumentSummary(args),
    payload_secret_findings: inspectPayloadForSecrets(args),
    raw_arguments_recorded: false,
    raw_secret_values_recorded: false,
    carrier_mutation_admitted: admission.carrier_mutation_admitted === true,
  });
  options.appendSessionRecord?.(carrierSessionEventEntry('tool_call_requested', createToolCallPayload({
    tool_name: name || '<missing>',
    arguments_summary: stringifySummary(argumentSummary(args)),
    requesting_agent_id: options.identity,
  })));
  if (!server || !admitted) {
    const admissionRecord = createAndWriteCarrierActionAdmission({
      agentId: options.identity ?? options.agentId,
      carrierSessionId: options.session ?? options.carrierSessionId,
      turnId: options.turnId,
      toolCallId: toolCall.id,
      toolName: name,
      args,
      siteRoot: options.siteRoot,
      toolAvailable: !!server,
      toolMetadata,
      delegatedAuthorityHandoff: options.delegatedAuthorityHandoff ?? null,
    });
    options.emit?.('tool_result', { turn_id: options.turnId, tool: name, status: 'admission_required', request_id: admissionRecord.decision.request_id, decision: admissionRecord.decision.decision, reason: admissionRecord.decision.reason, authority_owner: admissionRecord.decision.authority_owner, evidence_path: admissionRecord.path, candidate_ref: admissionRecord.decision.candidate_ref, carrier_mutation_admitted: admissionRecord.decision.carrier_mutation_admitted });
    return { role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ error: 'action_admission_required', request_id: admissionRecord.decision.request_id, tool: name, decision: admissionRecord.decision.decision, reason: admissionRecord.decision.reason, authority_owner: admissionRecord.decision.authority_owner, evidence_path: admissionRecord.path, candidate_ref: admissionRecord.decision.candidate_ref, carrier_mutation_admitted: admissionRecord.decision.carrier_mutation_admitted }) };
  }
  const delegatedAdmission = admission.carrier_mutation_admitted === true
    ? createAndWriteCarrierActionAdmission({
      agentId: options.identity ?? options.agentId,
      carrierSessionId: options.session ?? options.carrierSessionId,
      turnId: options.turnId,
      toolCallId: toolCall.id,
      toolName: name,
      args,
      siteRoot: options.siteRoot,
      toolAvailable: true,
      toolMetadata,
      delegatedAuthorityHandoff: options.delegatedAuthorityHandoff ?? null,
    })
    : null;
  const startedAt = Date.now();
  try {
    const result = await sendMcpRequest(server, { jsonrpc: '2.0', id: randomId(), method: 'tools/call', params: { name: binding.tool.name, arguments: args } }, options.turn?.abortSignal ?? null);
    const content = result.content?.[0]?.text ?? JSON.stringify(result);
    options.emit?.('tool_result', { turn_id: options.turnId, tool: name, status: 'ok', duration_ms: Date.now() - startedAt, decision: admission.decision, output_ref: extractOutputRef(content), request_id: delegatedAdmission?.decision?.request_id, authority_owner: delegatedAdmission?.decision?.authority_owner, evidence_path: delegatedAdmission?.path, carrier_mutation_admitted: admission.carrier_mutation_admitted === true });
    options.appendSessionRecord?.(carrierSessionEventEntry('tool_result_received', createToolResultPayload({
      tool_name: name || '<missing>',
      status: 'ok',
      duration_ms: Date.now() - startedAt,
      result_summary: summarizeToolResult(content),
      ...mcpToolEffectAdmissionEvidence({ serverMode: true, admissionClassification: admission, status: 'ok', category: 'auto' }),
      ...(delegatedAdmission ? { evidence_path: delegatedAdmission.path } : {}),
    })));
    return { role: 'tool', tool_call_id: toolCall.id, content };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const diagnostic = { server_name: binding?.server?.name ?? null, tool_name: name, error: message, error_code: error && typeof error === 'object' ? error.code ?? null : null, occurred_at: new Date().toISOString() };
    if (!isAbortError(error) && !options.turn?.interruptRequested) {
      rememberMcpRuntimeDiagnostic(mcpServers, diagnostic);
      options.emit?.('carrier_diagnostic_recorded', { diagnostic_code: 'mcp_runtime_fault', ...diagnostic });
    }
    options.emit?.('tool_result', { turn_id: options.turnId, tool: name, status: 'error', error: message, recovery: toolFailureRecovery(message) });
    return { role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ error: message, recovery: toolFailureRecovery(message) }) };
  }
}

async function handleServerRequestLine(line, context) {
  let request;
  try {
    request = JSON.parse(line);
  } catch (error) {
    noteSessionActivity(context.state, 'invalid_json');
    context.emit('error', { request_id: null, code: 'invalid_json', message: error instanceof Error ? error.message : String(error) });
    return;
  }
  if (request?.method === 'session.events.read') {
    const requestId = request?.id ?? null;
    noteSessionActivity(context.state, 'session_events_read_requested');
    recordWorkflowRequest(context, 'session_events_read_requested', { requestId, method: 'session.events.read' });
    context.emit('session_events_read', serverEventsRead({ requestId, params: request?.params ?? {}, context }));
    return;
  }
  if (request?.method === 'session.artifacts.register') {
    const requestId = request?.id ?? null;
    noteSessionActivity(context.state, 'session_artifact_register_requested');
    recordWorkflowRequest(context, 'session_artifact_register_requested', { requestId, method: 'session.artifacts.register' });
    try {
      context.emit('session_artifact_registered', serverArtifactRegister({ requestId, params: request?.params ?? {}, context }));
    } catch (error) {
      context.emit('error', { request_id: requestId, code: error?.code ?? 'artifact_register_failed', message: error instanceof Error ? error.message : String(error), details: error?.details ?? null });
    }
    return;
  }
  if (request?.method === 'session.artifacts.read') {
    const requestId = request?.id ?? null;
    noteSessionActivity(context.state, 'session_artifact_read_requested');
    recordWorkflowRequest(context, 'session_artifact_read_requested', { requestId, method: 'session.artifacts.read' });
    try {
      context.emit('session_artifact_read', serverArtifactRead({ requestId, params: request?.params ?? {}, context }));
    } catch (error) {
      context.emit('error', { request_id: requestId, code: error?.code ?? 'artifact_read_failed', message: error instanceof Error ? error.message : String(error), details: error?.details ?? null });
    }
    return;
  }
  if (request?.method === 'session.sop.summary') {
    const requestId = request?.id ?? null;
    noteSessionActivity(context.state, 'session_sop_summary_requested');
    recordWorkflowRequest(context, 'session_sop_summary_requested', { requestId, method: 'session.sop.summary' });
    try {
      context.emit('session_sop_summary', await serverSopSummary({ requestId, params: request?.params ?? {}, context }));
    } catch (error) {
      context.emit('session_sop_summary', {
        schema: 'narada.nars.sop_summary.v1',
        event: 'session_sop_summary',
        request_id: requestId,
        transport: 'jsonl_stdio',
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        templates: { items: [], count: 0 },
        runs: { items: [], count: 0 },
      });
    }
    return;
  }
  if (request?.method === 'session.mailbox.summary') {
    const requestId = request?.id ?? null;
    noteSessionActivity(context.state, 'session_mailbox_summary_requested');
    recordWorkflowRequest(context, 'session_mailbox_summary_requested', { requestId, method: 'session.mailbox.summary' });
    try {
      context.emit('session_mailbox_summary', await serverMailboxSummary({ requestId, params: request?.params ?? {}, context }));
    } catch (error) {
      context.emit('session_mailbox_summary', {
        schema: 'narada.nars.mailbox_summary.v1',
        event: 'session_mailbox_summary',
        request_id: requestId,
        transport: 'jsonl_stdio',
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        accounts: { items: [], count: 0 },
        messages: { items: [], count: 0 },
      });
    }
    return;
  }
  if (request?.method === 'session.inbox.summary') {
    const requestId = request?.id ?? null;
    noteSessionActivity(context.state, 'session_inbox_summary_requested');
    recordWorkflowRequest(context, 'session_inbox_summary_requested', { requestId, method: 'session.inbox.summary' });
    try {
      context.emit('session_inbox_summary', await serverInboxSummary({ requestId, params: request?.params ?? {}, context }));
    } catch (error) {
      context.emit('session_inbox_summary', {
        schema: 'narada.nars.inbox_summary.v1',
        event: 'session_inbox_summary',
        request_id: requestId,
        transport: 'jsonl_stdio',
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        envelopes: { items: [], count: 0 },
        next_envelope: null,
        doctor: null,
        errors: [],
      });
    }
    return;
  }
  if (request?.method === 'session.delegation.summary') {
    const requestId = request?.id ?? null;
    noteSessionActivity(context.state, 'session_delegation_summary_requested');
    recordWorkflowRequest(context, 'session_delegation_summary_requested', { requestId, method: 'session.delegation.summary' });
    try {
      context.emit('session_delegation_summary', await serverDelegationSummary({ requestId, params: request?.params ?? {}, context }));
    } catch (error) {
      context.emit('session_delegation_summary', {
        schema: 'narada.nars.delegation_summary.v1',
        event: 'session_delegation_summary',
        request_id: requestId,
        transport: 'jsonl_stdio',
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        posture: { active: 0, queued: 0, terminal: 0, failed: 0, blocked: 0, stale: 0, total: 0 },
        workers: { items: [], count: 0, dashboard: null },
        delegated_tasks: { items: [], count: 0 },
        errors: [],
      });
    }
    return;
  }
  if (request?.method === 'session.git.summary') {
    const requestId = request?.id ?? null;
    noteSessionActivity(context.state, 'session_git_summary_requested');
    recordWorkflowRequest(context, 'session_git_summary_requested', { requestId, method: 'session.git.summary' });
    try {
      context.emit('session_git_summary', await serverGitSummary({ requestId, params: request?.params ?? {}, context }));
    } catch (error) {
      context.emit('session_git_summary', {
        schema: 'narada.nars.git_summary.v1',
        event: 'session_git_summary',
        request_id: requestId,
        transport: 'jsonl_stdio',
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        repository: null,
        counts: { tracked_changed: 0, staged: 0, unstaged: 0, untracked: 0, conflicts: 0 },
        changed_files: { items: [], count: 0, truncated: false },
        recent_commits: { items: [], count: 0 },
        errors: [],
      });
    }
    return;
  }
  if (request?.method === 'session.surface_feedback.summary') {
    const requestId = request?.id ?? null;
    noteSessionActivity(context.state, 'session_surface_feedback_summary_requested');
    recordWorkflowRequest(context, 'session_surface_feedback_summary_requested', { requestId, method: 'session.surface_feedback.summary' });
    try {
      context.emit('session_surface_feedback_summary', await serverSurfaceFeedbackSummary({ requestId, params: request?.params ?? {}, context }));
    } catch (error) {
      context.emit('session_surface_feedback_summary', {
        schema: 'narada.nars.surface_feedback_summary.v1',
        event: 'session_surface_feedback_summary',
        request_id: requestId,
        transport: 'jsonl_stdio',
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        stats: { total: 0, by_surface: {}, by_kind: {}, by_status: {} },
        feedback: { items: [], count: 0, limit: 25, offset: 0 },
        doctor: null,
        errors: [],
      });
    }
    return;
  }
  if (request?.method === 'session.scheduler.summary') {
    const requestId = request?.id ?? null;
    noteSessionActivity(context.state, 'session_scheduler_summary_requested');
    recordWorkflowRequest(context, 'session_scheduler_summary_requested', { requestId, method: 'session.scheduler.summary' });
    try {
      context.emit('session_scheduler_summary', await serverSchedulerSummary({ requestId, params: request?.params ?? {}, context }));
    } catch (error) {
      context.emit('session_scheduler_summary', {
        schema: 'narada.nars.scheduler_summary.v1',
        event: 'session_scheduler_summary',
        request_id: requestId,
        transport: 'jsonl_stdio',
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        tasks: { items: [], count: 0 },
        posture: { total: 0, ready: 0, running: 0, disabled: 0, unknown: 0 },
        errors: [],
      });
    }
    return;
  }
  if (request?.method === 'session.task_lifecycle.summary') {
    const requestId = request?.id ?? null;
    noteSessionActivity(context.state, 'session_task_lifecycle_summary_requested');
    recordWorkflowRequest(context, 'session_task_lifecycle_summary_requested', { requestId, method: 'session.task_lifecycle.summary' });
    try {
      context.emit('session_task_lifecycle_summary', await serverTaskLifecycleSummary({ requestId, params: request?.params ?? {}, context }));
    } catch (error) {
      context.emit('session_task_lifecycle_summary', {
        schema: 'narada.nars.task_lifecycle_summary.v1',
        event: 'session_task_lifecycle_summary',
        request_id: requestId,
        transport: 'jsonl_stdio',
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        workboard: null,
        recommendation: null,
        counts: {},
        obligations: { items: [], count: 0 },
        errors: [],
      });
    }
    return;
  }
  if (request?.method === 'session.surface.affordances') {
    const requestId = request?.id ?? null;
    noteSessionActivity(context.state, 'session_surface_affordances_requested');
    recordWorkflowRequest(context, 'session_surface_affordances_requested', { requestId, method: 'session.surface.affordances' });
    context.emit('session_surface_affordances', serverSurfaceAffordances({ requestId, context }));
    return;
  }
  await handleServerRequest(request, context);
}

function serverArtifactRegister({ requestId, params = {}, context = {} }) {
  const registered = registerNarsArtifact({
    sessionPath: context.sessionPath,
    sessionId: context.session,
    agentId: context.identity,
    siteRoot: context.siteRoot,
    sourcePath: params.source_path ?? params.path,
    kind: params.kind,
    title: params.title,
    contentType: params.content_type,
    renderHint: params.render_hint,
    accessScope: params.access?.scope ?? params.access_scope,
  });
  return {
    schema: 'narada.nars.artifact_registered.v1',
    event: 'session_artifact_registered',
    request_id: requestId,
    transport: 'jsonl_stdio',
    artifact: registered.public_record,
    artifact_url: `/sessions/${encodeURIComponent(context.session)}/artifacts/${encodeURIComponent(registered.record.artifact_id)}`,
    content_url: `/sessions/${encodeURIComponent(context.session)}/artifacts/${encodeURIComponent(registered.record.artifact_id)}/content`,
  };
}

function serverArtifactRead({ requestId, params = {}, context = {} }) {
  const artifactId = params.artifact_id ?? params.artifactId ?? null;
  const artifact = artifactId
    ? publicNarsArtifactRecord(readNarsArtifact({ sessionPath: context.sessionPath, artifactId }))
    : publicNarsArtifactIndex(readNarsArtifactIndex({ sessionPath: context.sessionPath }));
  return {
    schema: 'narada.nars.artifact_read.v1',
    event: 'session_artifact_read',
    request_id: requestId,
    transport: 'jsonl_stdio',
    artifact,
  };
}

async function serverSopSummary({ requestId, params = {}, context = {} }) {
  const binding = findSopServerBinding(context.mcpServers ?? {});
  const templateLimit = clampInteger(params.template_limit ?? params.templateLimit, 50, 1, 100);
  const runLimit = clampInteger(params.run_limit ?? params.runLimit, 50, 1, 100);
  const includeTerminal = params.include_terminal ?? params.includeTerminal ?? true;
  const payload = {
    schema: 'narada.nars.sop_summary.v1',
    event: 'session_sop_summary',
    request_id: requestId,
    transport: 'jsonl_stdio',
    status: binding ? 'ok' : 'unavailable',
    server_name: binding?.serverName ?? null,
    affordance_contract: sopAffordanceContract(binding),
    templates: { items: [], count: 0 },
    runs: { items: [], count: 0 },
    active_run: null,
    recent_runs: { items: [], count: 0 },
    doctor: null,
    errors: [],
  };
  if (!binding) {
    payload.errors.push({ code: 'sop_mcp_unavailable', message: 'No site SOP MCP server with SOP read tools is available.' });
    return payload;
  }
  payload.templates = await readSopTool(binding, 'sop_template_list', { limit: templateLimit }, payload.errors) ?? payload.templates;
  payload.runs = await readSopTool(binding, 'sop_run_list', { limit: runLimit, include_terminal: Boolean(includeTerminal) }, payload.errors) ?? payload.runs;
  payload.doctor = await readSopTool(binding, 'sop_doctor', {}, payload.errors) ?? null;
  payload.templates = normalizeSopTemplateCollection(payload.templates);
  payload.runs = normalizeSopRunCollection(payload.runs, binding);
  payload.active_run = selectActiveSopRun(payload.runs.items);
  payload.recent_runs = { items: payload.runs.items, count: payload.runs.count };
  if (payload.errors.length) payload.status = payload.templates.count || payload.runs.count ? 'partial' : 'error';
  return payload;
}

function sopAffordanceContract(binding) {
  if (!binding) return buildSopOperatorAffordance({ serverName: 'sop', server: { tools: [] }, source: 'nars_sop_summary' });
  return {
    ...buildSopOperatorAffordance({ serverName: binding.serverName, server: binding.server, source: 'nars_sop_summary' }),
    schema: 'narada.nars.sop_operator_affordance_contract.v1',
  };
}

async function serverMailboxSummary({ requestId, params = {}, context = {} }) {
  const binding = findMailboxServerBinding(context.mcpServers ?? {});
  const accountLimit = clampInteger(params.account_limit ?? params.accountLimit, 20, 1, 100);
  const messageLimit = clampInteger(params.message_limit ?? params.messageLimit, 25, 1, 100);
  const query = stringValue(params.query) ?? undefined;
  const payload = {
    schema: 'narada.nars.mailbox_summary.v1',
    event: 'session_mailbox_summary',
    request_id: requestId,
    transport: 'jsonl_stdio',
    status: binding ? 'ok' : 'unavailable',
    server_name: binding?.serverName ?? null,
    affordance_contract: mailboxAffordanceContract(binding),
    accounts: { items: [], count: 0 },
    messages: { items: [], count: 0 },
    unread: { count: 0 },
    doctor: null,
    errors: [],
  };
  if (!binding) {
    payload.errors.push({ code: 'mailbox_mcp_unavailable', message: 'No site mailbox MCP server with synced mailbox read tools is available.' });
    return payload;
  }
  payload.accounts = await readMailboxTool(binding, 'mailbox_accounts_list', { limit: accountLimit }, payload.errors) ?? payload.accounts;
  payload.messages = await readMailboxTool(binding, 'mailbox_messages_list', { limit: messageLimit, query }, payload.errors) ?? payload.messages;
  payload.doctor = binding.toolNames.has('mailbox_doctor') ? await readMailboxTool(binding, 'mailbox_doctor', {}, payload.errors) ?? null : null;
  payload.accounts = normalizeMailboxAccountCollection(payload.accounts);
  payload.messages = normalizeMailboxMessageCollection(payload.messages);
  payload.unread = summarizeMailboxUnread(payload.accounts, payload.messages);
  if (payload.errors.length) payload.status = payload.accounts.count || payload.messages.count ? 'partial' : 'error';
  return payload;
}

function mailboxAffordanceContract(binding) {
  if (!binding) return buildMailboxOperatorAffordance({ serverName: 'mailbox', server: { tools: [] }, source: 'nars_mailbox_summary' });
  return {
    ...buildMailboxOperatorAffordance({ serverName: binding.serverName, server: binding.server, source: 'nars_mailbox_summary' }),
    schema: 'narada.nars.mailbox_operator_affordance_contract.v1',
  };
}

async function serverSchedulerSummary({ requestId, params = {}, context = {} }) {
  const binding = findSchedulerServerBinding(context.mcpServers ?? {});
  const taskLimit = clampInteger(params.task_limit ?? params.taskLimit, 25, 1, 100);
  const historyLimit = clampInteger(params.history_limit ?? params.historyLimit, 5, 1, 25);
  const folder = stringValue(params.folder) ?? undefined;
  const payload = {
    schema: 'narada.nars.scheduler_summary.v1',
    event: 'session_scheduler_summary',
    request_id: requestId,
    transport: 'jsonl_stdio',
    status: binding ? 'ok' : 'unavailable',
    server_name: binding?.serverName ?? null,
    affordance_contract: schedulerAffordanceContract(binding),
    tasks: { items: [], count: 0 },
    posture: { total: 0, ready: 0, running: 0, disabled: 0, unknown: 0 },
    errors: [],
  };
  if (!binding) {
    payload.errors.push({ code: 'scheduler_mcp_unavailable', message: 'No site scheduler MCP server with scheduler read tools is available.' });
    return payload;
  }
  payload.tasks = await readSchedulerTool(binding, 'scheduler_task_list', { limit: taskLimit, folder }, payload.errors) ?? payload.tasks;
  payload.tasks = normalizeSchedulerTaskCollection(payload.tasks, binding, historyLimit);
  payload.posture = summarizeSchedulerPosture(payload.tasks.items);
  if (payload.errors.length) payload.status = payload.tasks.count ? 'partial' : 'error';
  return payload;
}

function schedulerAffordanceContract(binding) {
  if (!binding) return buildSchedulerOperatorAffordance({ serverName: 'scheduler', server: { tools: [] }, source: 'nars_scheduler_summary' });
  return {
    ...buildSchedulerOperatorAffordance({ serverName: binding.serverName, server: binding.server, source: 'nars_scheduler_summary' }),
    schema: 'narada.nars.scheduler_operator_affordance_contract.v1',
  };
}

function normalizeSchedulerTaskCollection(collection, binding, historyLimit) {
  const raw = objectValue(collection) ?? {};
  const sourceItems = Array.isArray(raw.tasks) ? raw.tasks : Array.isArray(raw.items) ? raw.items : [];
  const items = sourceItems.map((task) => normalizeSchedulerTask(task, binding, historyLimit)).filter(Boolean);
  return { ...raw, items, count: numberValue(raw.count) ?? items.length };
}

function normalizeSchedulerTask(task, binding, historyLimit) {
  const record = objectValue(task);
  if (!record) return null;
  const taskName = stringValue(record.task_name) ?? stringValue(record.name) ?? '';
  return {
    ...record,
    task_name: taskName,
    title: stringValue(record.title) ?? (taskName || 'Scheduled task'),
    status: stringValue(record.status) ?? 'unknown',
    schedule: stringValue(record.schedule) ?? null,
    next_run: stringValue(record.next_run) ?? null,
    last_run: stringValue(record.last_run) ?? null,
    last_result: stringValue(record.last_result) ?? null,
    command: stringValue(record.command) ?? null,
    history: { items: [], count: 0, limit: historyLimit, available: binding?.toolNames?.has('scheduler_task_history') === true },
    available_actions: availableSchedulerTaskActions(binding),
  };
}

function summarizeSchedulerPosture(tasks = []) {
  const posture = { total: tasks.length, ready: 0, running: 0, disabled: 0, unknown: 0 };
  for (const task of tasks) {
    const status = String(task?.status ?? '').toLowerCase();
    if (status.includes('ready')) posture.ready += 1;
    else if (status.includes('running')) posture.running += 1;
    else if (status.includes('disabled')) posture.disabled += 1;
    else posture.unknown += 1;
  }
  return posture;
}

function availableSchedulerTaskActions(binding) {
  const toolNames = binding?.toolNames ?? new Set();
  return [
    'open_task',
    toolNames.has('scheduler_task_history') ? 'open_history' : null,
    toolNames.has('scheduler_task_run') ? 'candidate_run_now' : null,
    toolNames.has('scheduler_task_enable') ? 'candidate_enable_task' : null,
    toolNames.has('scheduler_task_disable') ? 'candidate_disable_task' : null,
  ].filter(Boolean);
}

function normalizeMailboxAccountCollection(collection) {
  const raw = objectValue(collection) ?? {};
  const items = Array.isArray(raw.accounts)
    ? raw.accounts.map(normalizeMailboxAccount).filter(Boolean)
    : Array.isArray(raw.items) ? raw.items.map(normalizeMailboxAccount).filter(Boolean) : [];
  return { ...raw, items, count: numberValue(raw.count) ?? items.length };
}

function normalizeMailboxAccount(account) {
  const record = objectValue(account);
  if (!record) return null;
  const id = stringValue(record.mailbox_id) ?? stringValue(record.account_id) ?? stringValue(record.address) ?? stringValue(record.email) ?? '';
  return {
    ...record,
    mailbox_id: id,
    label: stringValue(record.display_name) ?? stringValue(record.name) ?? stringValue(record.address) ?? (id || 'Mailbox'),
    message_count: numberValue(record.message_count) ?? numberValue(record.messages_count) ?? null,
    unread_count: numberValue(record.unread_count) ?? null,
    latest_received_at: stringValue(record.latest_received_at) ?? stringValue(record.latest_message_at) ?? null,
  };
}

function normalizeMailboxMessageCollection(collection) {
  const raw = objectValue(collection) ?? {};
  const items = Array.isArray(raw.messages)
    ? raw.messages.map(normalizeMailboxMessage).filter(Boolean)
    : Array.isArray(raw.items) ? raw.items.map(normalizeMailboxMessage).filter(Boolean) : [];
  return { ...raw, items, count: numberValue(raw.count) ?? items.length };
}

function normalizeMailboxMessage(message) {
  const record = objectValue(message);
  if (!record) return null;
  const attachments = Array.isArray(record.attachments) ? record.attachments : [];
  return {
    ...record,
    message_id: stringValue(record.message_id) ?? stringValue(record.id) ?? '',
    mailbox_id: stringValue(record.mailbox_id) ?? '',
    folder: stringValue(record.folder) ?? null,
    thread_id: stringValue(record.thread_id) ?? null,
    subject: stringValue(record.subject) ?? '(no subject)',
    from: stringValue(record.from) ?? null,
    received_at: stringValue(record.received_at) ?? null,
    sent_at: stringValue(record.sent_at) ?? null,
    unread: booleanValue(record.unread),
    importance: stringValue(record.importance) ?? null,
    categories: stringArrayValue(record.categories),
    preview: stringValue(record.preview) ?? null,
    attachment_count: numberValue(record.attachment_count) ?? attachments.length,
  };
}

function summarizeMailboxUnread(accounts, messages) {
  const accountUnread = accounts.items.reduce((total, account) => total + (numberValue(account.unread_count) ?? 0), 0);
  const messageUnread = messages.items.filter((message) => message.unread === true).length;
  return { count: accountUnread || messageUnread };
}

function normalizeSopTemplateCollection(collection) {
  const raw = objectValue(collection) ?? {};
  const items = Array.isArray(raw.items) ? raw.items.map(normalizeSopTemplate).filter(Boolean) : [];
  return { ...raw, items, count: numberValue(raw.count) ?? items.length };
}

function normalizeSopTemplate(template) {
  const record = objectValue(template);
  if (!record) return null;
  const steps = arrayOfObjects(record.steps).map(normalizeSopStepDefinition).filter(Boolean);
  return {
    ...record,
    sop_id: stringValue(record.sop_id) ?? '',
    version: numberValue(record.version) ?? null,
    title: stringValue(record.title) ?? stringValue(record.sop_id) ?? 'Untitled SOP',
    status: stringValue(record.status) ?? 'unknown',
    description: stringValue(record.description) ?? '',
    trigger_kind: stringValue(record.trigger_kind) ?? null,
    steps,
    step_count: steps.length,
  };
}

function normalizeSopStepDefinition(step) {
  const record = objectValue(step);
  if (!record) return null;
  return {
    ...record,
    id: stringValue(record.id) ?? stringValue(record.step_id) ?? '',
    step_id: stringValue(record.step_id) ?? stringValue(record.id) ?? '',
    title: stringValue(record.title) ?? stringValue(record.id) ?? stringValue(record.step_id) ?? 'Untitled step',
    executor: stringValue(record.executor) ?? 'unknown',
    status: stringValue(record.status) ?? null,
    blocking: booleanValue(record.blocking),
    instructions: stringValue(record.instructions) ?? '',
    depends_on: stringArrayValue(record.depends_on),
  };
}

function normalizeSopRunCollection(collection, binding) {
  const raw = objectValue(collection) ?? {};
  const items = Array.isArray(raw.items) ? raw.items.map((run) => normalizeSopRun(run, binding)).filter(Boolean) : [];
  return { ...raw, items, count: numberValue(raw.count) ?? items.length };
}

function normalizeSopRun(run, binding) {
  const record = objectValue(run);
  if (!record) return null;
  const stepTimeline = arrayOfObjects(record.step_states).map(normalizeSopStepState).filter(Boolean);
  const nextStep = objectValue(record.next_step) ? normalizeSopStepState(record.next_step) : stepTimeline.find((step) => step.status === 'running') ?? stepTimeline.find((step) => step.status === 'pending') ?? null;
  const status = stringValue(record.status) ?? 'unknown';
  const normalized = {
    ...record,
    run_id: stringValue(record.run_id) ?? '',
    sop_id: stringValue(record.sop_id) ?? '',
    sop_version: numberValue(record.sop_version) ?? null,
    sop_title: stringValue(record.sop_title) ?? stringValue(record.sop_id) ?? 'Untitled SOP run',
    status,
    step_states: stepTimeline,
    step_timeline: stepTimeline,
    step_count: stepTimeline.length,
    next_step: nextStep,
    next_awaits_confirmation: booleanValue(record.next_awaits_confirmation),
    available_actions: [],
  };
  normalized.available_actions = availableSopRunActions(normalized, binding);
  return normalized;
}

function normalizeSopStepState(step) {
  const record = normalizeSopStepDefinition(step);
  if (!record) return null;
  return {
    ...record,
    status: stringValue(record.status) ?? 'unknown',
    started_at: stringValue(record.started_at) ?? null,
    completed_at: stringValue(record.completed_at) ?? null,
    child_run_id: stringValue(record.child_run_id) ?? null,
    result: objectValue(record.result) ?? {},
    error_message: stringValue(record.error_message) ?? null,
  };
}

function availableSopRunActions(run, binding) {
  const toolNames = binding?.toolNames ?? new Set();
  const actions = ['open_run'];
  if (!isTerminalSopRun(run.status)) {
    if (toolNames.has('sop_run_refresh')) actions.push('refresh_run');
    if (toolNames.has('sop_run_cancel')) actions.push('cancel_run');
    if (toolNames.has('sop_run_advance')) actions.push(run.next_awaits_confirmation ? 'confirm_operator_step' : 'advance_run');
  }
  return actions;
}

function selectActiveSopRun(runs = []) {
  const priority = new Map([
    ['awaiting_confirmation', 0],
    ['running', 1],
    ['pending', 2],
  ]);
  return runs
    .filter((run) => !isTerminalSopRun(run?.status))
    .sort((left, right) => (priority.get(String(left.status)) ?? 10) - (priority.get(String(right.status)) ?? 10))[0] ?? null;
}

function isTerminalSopRun(status) {
  return ['completed', 'failed', 'cancelled'].includes(String(status ?? ''));
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function arrayOfObjects(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item)) : [];
}

function stringValue(value) {
  return typeof value === 'string' && value ? value : null;
}

function numberValue(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function booleanValue(value) {
  return value === true;
}

function stringArrayValue(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item) : [];
}

function serverSurfaceAffordances({ requestId, context = {} }) {
  return {
    event: 'session_surface_affordances',
    request_id: requestId,
    transport: 'jsonl_stdio',
    ...buildMcpSurfaceAffordanceProjection(context.mcpServers ?? {}),
  };
}

function findSopServerBinding(mcpServers = {}) {
  for (const [serverName, server] of Object.entries(mcpServers)) {
    const toolNames = new Set((server?.tools ?? []).map((tool) => tool?.name).filter(Boolean));
    if (toolNames.has('sop_template_list') || toolNames.has('sop_run_list')) return { serverName, server, toolNames };
  }
  return null;
}

function findMailboxServerBinding(mcpServers = {}) {
  for (const [serverName, server] of Object.entries(mcpServers)) {
    const toolNames = new Set((server?.tools ?? []).map((tool) => tool?.name).filter(Boolean));
    if (toolNames.has('mailbox_accounts_list') || toolNames.has('mailbox_messages_list')) return { serverName, server, toolNames };
  }
  return null;
}

function findSchedulerServerBinding(mcpServers = {}) {
  for (const [serverName, server] of Object.entries(mcpServers)) {
    const toolNames = new Set((server?.tools ?? []).map((tool) => tool?.name).filter(Boolean));
    if (toolNames.has('scheduler_task_list') || toolNames.has('scheduler_task_show')) return { serverName, server, toolNames };
  }
  return null;
}

async function readSopTool(binding, name, args, errors) {
  if (!binding.toolNames.has(name)) {
    errors.push({ code: 'sop_tool_unavailable', tool: name, message: `${name} is not available on ${binding.serverName}.` });
    return null;
  }
  try {
    const result = await sendMcpRequest(binding.server, { jsonrpc: '2.0', id: randomId(), method: 'tools/call', params: { name, arguments: args } });
    return result.structuredContent ?? parseJson(result.content?.[0]?.text ?? '') ?? null;
  } catch (error) {
    errors.push({ code: 'sop_tool_failed', tool: name, message: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

async function readMailboxTool(binding, name, args, errors) {
  if (!binding.toolNames.has(name)) {
    errors.push({ code: 'mailbox_tool_unavailable', tool: name, message: `${name} is not available on ${binding.serverName}.` });
    return null;
  }
  try {
    const result = await sendMcpRequest(binding.server, { jsonrpc: '2.0', id: randomId(), method: 'tools/call', params: { name, arguments: args } });
    return result.structuredContent ?? parseJson(result.content?.[0]?.text ?? '') ?? null;
  } catch (error) {
    errors.push({ code: 'mailbox_tool_failed', tool: name, message: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

async function readInboxTool(binding, name, args, errors) {
  if (!binding.toolNames.has(name)) {
    errors.push({ code: 'inbox_tool_unavailable', tool: name, message: `${name} is not available on ${binding.serverName}.` });
    return null;
  }
  try {
    const result = await sendMcpRequest(binding.server, { jsonrpc: '2.0', id: randomId(), method: 'tools/call', params: { name, arguments: args } });
    return result.structuredContent ?? parseJson(result.content?.[0]?.text ?? '') ?? null;
  } catch (error) {
    errors.push({ code: 'inbox_tool_failed', tool: name, message: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

async function readDelegationTool(binding, name, args, errors) {
  if (!binding.toolNames.has(name)) {
    errors.push({ code: 'delegation_tool_unavailable', tool: name, message: `${name} is not available on ${binding.serverName}.` });
    return null;
  }
  try {
    const result = await sendMcpRequest(binding.server, { jsonrpc: '2.0', id: randomId(), method: 'tools/call', params: { name, arguments: args } });
    return result.structuredContent ?? parseJson(result.content?.[0]?.text ?? '') ?? null;
  } catch (error) {
    errors.push({ code: 'delegation_tool_failed', tool: name, message: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

async function readGitTool(binding, name, args, errors) {
  if (!binding.toolNames.has(name)) {
    errors.push({ code: 'git_tool_unavailable', tool: name, message: `${name} is not available on ${binding.serverName}.` });
    return null;
  }
  try {
    const result = await sendMcpRequest(binding.server, { jsonrpc: '2.0', id: randomId(), method: 'tools/call', params: { name, arguments: args } });
    return result.structuredContent ?? parseJson(result.content?.[0]?.text ?? '') ?? null;
  } catch (error) {
    errors.push({ code: 'git_tool_failed', tool: name, message: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

async function readSurfaceFeedbackTool(binding, name, args, errors) {
  if (!binding.toolNames.has(name)) {
    errors.push({ code: 'surface_feedback_tool_unavailable', tool: name, message: `${name} is not available on ${binding.serverName}.` });
    return null;
  }
  try {
    const result = await sendMcpRequest(binding.server, { jsonrpc: '2.0', id: randomId(), method: 'tools/call', params: { name, arguments: args } });
    return result.structuredContent ?? parseJson(result.content?.[0]?.text ?? '') ?? null;
  } catch (error) {
    errors.push({ code: 'surface_feedback_tool_failed', tool: name, message: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

async function readSchedulerTool(binding, name, args, errors) {
  if (!binding.toolNames.has(name)) {
    errors.push({ code: 'scheduler_tool_unavailable', tool: name, message: `${name} is not available on ${binding.serverName}.` });
    return null;
  }
  try {
    const result = await sendMcpRequest(binding.server, { jsonrpc: '2.0', id: randomId(), method: 'tools/call', params: { name, arguments: args } });
    return result.structuredContent ?? parseJson(result.content?.[0]?.text ?? '') ?? null;
  } catch (error) {
    errors.push({ code: 'scheduler_tool_failed', tool: name, message: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

async function readTaskLifecycleTool(binding, name, args, errors) {
  if (!binding.toolNames.has(name)) {
    errors.push({ code: 'task_lifecycle_tool_unavailable', tool: name, message: `${name} is not available on ${binding.serverName}.` });
    return null;
  }
  try {
    const result = await sendMcpRequest(binding.server, { jsonrpc: '2.0', id: randomId(), method: 'tools/call', params: { name, arguments: args } });
    return result.structuredContent ?? parseJson(result.content?.[0]?.text ?? '') ?? null;
  } catch (error) {
    errors.push({ code: 'task_lifecycle_tool_failed', tool: name, message: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

function clampInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

async function handleServerRequest(request, context) {
  const { state, messages, allTools, mcpServers, mcpPreflightArtifact, emit, callChatApiFn } = context;
  if (request?.method === 'session.operations') {
    const requestId = request?.id ?? null;
    noteSessionActivity(state, 'session_operations_requested');
    recordWorkflowRequest(context, 'session_operations_requested', { requestId, method: 'session.operations' });
    recordOperationHeartbeatEvidence(context);
    emit('session_operations', serverOperations({ requestId, state, mcpServers, mcpPreflightArtifact, context }));
    return;
  }
  if (request?.method === 'session.recovery') {
    const requestId = request?.id ?? null;
    noteSessionActivity(state, 'session_recovery_requested');
    recordWorkflowRequest(context, 'session_recovery_requested', { requestId, method: 'session.recovery' });
    emit('session_recovery', serverRecovery({ requestId, state, mcpServers, mcpPreflightArtifact, context }));
    return;
  }
  if (request?.method === 'preflight.recovery') {
    const requestId = request?.id ?? null;
    noteSessionActivity(state, 'preflight_recovery_requested');
    recordWorkflowRequest(context, 'preflight_recovery_requested', { requestId, method: 'preflight.recovery' });
    emit('preflight_recovery', serverPreflightRecovery({ requestId, mcpPreflightArtifact }));
    return;
  }
  if (request?.method === 'session.sync') {
    const requestId = request?.id ?? null;
    const params = request?.params ?? {};
    const startedAt = new Date();
    const target = params.target ?? params.session_sync_target ?? params.sessionSyncTarget ?? null;
    const direction = String(params.direction ?? 'upload');
    const dryRun = Boolean(params.dry_run ?? params.dryRun ?? false);
    noteSessionActivity(state, 'session_sync_requested');
    context.appendSessionRecord?.({ event: 'session_sync_requested', request_id: requestId, method: 'session.sync', transport: 'jsonl_stdio', operation_status: 'requested', requested_at: startedAt.toISOString(), target, direction, dry_run: Boolean(dryRun) });
    try {
      const payload = syncSessionDirectory({ requestId, params, context, startedAt });
      context.appendSessionRecord?.({ event: 'session_sync_completed', request_id: requestId, method: 'session.sync', transport: 'jsonl_stdio', operation_status: 'completed', requested_at: startedAt.toISOString(), completed_at: payload.completed_at, duration_ms: payload.duration_ms, target, direction, dry_run: Boolean(dryRun), copied: payload.copied, skipped: payload.skipped, deleted: payload.deleted });
      emit('session_sync', payload);
    } catch (error) {
      const completedAt = new Date();
      const message = error instanceof Error ? error.message : String(error);
      context.appendSessionRecord?.({ event: 'session_sync_completed', request_id: requestId, method: 'session.sync', transport: 'jsonl_stdio', operation_status: 'failed', requested_at: startedAt.toISOString(), completed_at: completedAt.toISOString(), duration_ms: completedAt.getTime() - startedAt.getTime(), target, direction, dry_run: Boolean(dryRun), error: message });
      emit('session_sync', { request_id: requestId, transport: 'jsonl_stdio', event: 'session_sync', direction, target, mode: dryRun ? 'dry-run' : 'apply', success: false, copied: 0, skipped: 0, conflicts: 0, deleted: 0, message });
    }
    return;
  }
  const controlRequest = classifyCarrierControlRequest(request);
  const requestId = controlRequest.request_id;
  try {
    if (state.closed && !controlRequest.allowed_when_closed) {
      emit('error', { request_id: requestId, code: 'session_closed', message: 'Session is closed.' });
      return;
    }
    const targetWriteRefusal = targetWriteAdmissionRefusal(state, controlRequest);
    if (targetWriteRefusal) {
      emit('authority_target_write_refused', {
        request_id: requestId,
        method: controlRequest.method,
        ...targetWriteRefusal,
        operator_input_queue: inputQueueStatus(state),
      });
      emit('error', { request_id: requestId, code: targetWriteRefusal.code, message: targetWriteRefusal.message });
      return;
    }
    if (controlRequest.method_kind === 'authority_source_status') {
      emit('authority_source_status', {
        request_id: requestId,
        authority_transition_source: authorityTransitionSourceStatus(state),
        authority_transition_target: authorityTransitionTargetStatus(state),
        operator_input_queue: inputQueueStatus(state),
        active_turn_state: state.activeTurn ? 'running' : 'idle',
        active_turn_id: state.activeTurn?.turnId ?? null,
      });
      return;
    }
    if (controlRequest.method_kind === 'authority_target_status') {
      emit('authority_target_status', {
        request_id: requestId,
        authority_transition_source: authorityTransitionSourceStatus(state),
        authority_transition_target: authorityTransitionTargetStatus(state),
        operator_input_queue: inputQueueStatus(state),
      });
      return;
    }
    if (controlRequest.method_kind === 'authority_target_prepare') {
      const params = request?.params ?? {};
      const plan = planTargetAuthorityTransition({
        sourceAuthorityRuntimeHost: context.authorityRuntimeHost,
        currentSiteRoot: context.siteRoot,
        currentSessionId: context.session,
        targetAuthorityLocator: params.target_authority_locator ?? params.targetAuthorityLocator ?? null,
        supersededBySessionId: params.superseded_by_session_id ?? params.supersededBySessionId ?? null,
        authorityLocatorRef: params.authority_locator_ref ?? params.authorityLocatorRef ?? null,
      });
      if (plan.status === 'refused') {
        emit('authority_target_prepare_refused', {
          request_id: requestId,
          status: 'refused',
          refusals: plan.refusals,
          authority_transition_plan: plan,
          authority_transition_source: authorityTransitionSourceStatus(state),
          authority_transition_target: authorityTransitionTargetStatus(state),
        });
        return;
      }
      state.authorityTransition = prepareTargetAuthority({
        path: state.authorityTransitionStatePath,
        sessionPath: state.sessionPath,
        state: state.authorityTransition,
        targetAuthorityLocator: plan.target_authority_locator,
        supersededBySessionId: plan.superseded_by_session_id,
        authorityLocatorRef: plan.authority_locator_ref,
        transitionPlan: plan,
        reason: params.reason ?? null,
        requestedBy: params.requested_by ?? params.requestedBy ?? null,
      });
      emit('authority_target_prepared', {
        request_id: requestId,
        authority_transition_source: authorityTransitionSourceStatus(state),
        authority_transition_target: authorityTransitionTargetStatus(state),
      });
      return;
    }
    if (controlRequest.method_kind === 'authority_target_activate') {
      const activation = targetActivationRefusals(state, request?.params ?? {});
      if (activation.refusals.length > 0) {
        emit('authority_target_activation_refused', {
          request_id: requestId,
          status: 'refused',
          refusals: activation.refusals,
          authority_transition_source: authorityTransitionSourceStatus(state),
          authority_transition_target: authorityTransitionTargetStatus(state),
        });
        return;
      }
      const targetFirstSequence = activation.targetFirstSequence;
      const activationId = deterministicTargetActivationId({
        session: context.session,
        targetEpoch: activation.token.target_authority_epoch,
        targetFirstSequence,
      });
      state.authorityTransition = activateTargetAuthority({
        path: state.authorityTransitionStatePath,
        sessionPath: state.sessionPath,
        state: state.authorityTransition,
        activationId,
        targetFirstSequence,
        authorityEpochToken: activation.token,
        targetAuthorityLocator: request?.params?.target_authority_locator ?? request?.params?.targetAuthorityLocator ?? null,
        supersededBySessionId: request?.params?.superseded_by_session_id ?? request?.params?.supersededBySessionId ?? null,
        authorityLocatorRef: request?.params?.authority_locator_ref ?? request?.params?.authorityLocatorRef ?? null,
        reason: request?.params?.reason ?? null,
        requestedBy: request?.params?.requested_by ?? request?.params?.requestedBy ?? null,
      });
      emit('authority_target_active', {
        request_id: requestId,
        activation_id: activationId,
        target_first_sequence: targetFirstSequence,
        authority_epoch_token: activation.token,
        authority_transition_source: authorityTransitionSourceStatus(state),
        authority_transition_target: authorityTransitionTargetStatus(state),
      });
      return;
    }
    if (controlRequest.method_kind === 'authority_source_drain') {
      const current = authorityTransitionSourceStatus(state);
      if (current.state === 'sealed') {
        emit('authority_source_drain_refused', {
          request_id: requestId,
          reason_code: 'source_already_sealed',
          failed_invariant: 'sealed_source_state_is_terminal_for_this_slice',
          authority_transition_source: current,
        });
        return;
      }
      const source = setAuthorityTransitionSourceState(state, { state: 'draining', draining_at: new Date().toISOString() });
      emit('authority_source_draining', {
        request_id: requestId,
        authority_transition_source: source,
        operator_input_queue: inputQueueStatus(state),
        active_turn_state: state.activeTurn ? 'running' : 'idle',
        active_turn_id: state.activeTurn?.turnId ?? null,
      });
      return;
    }
    if (controlRequest.method_kind === 'authority_source_seal') {
      const readiness = sourceSealReadiness(state);
      if (!readiness.ready) {
        emit('authority_source_seal_refused', {
          request_id: requestId,
          reason_code: readiness.reason_code,
          message: readiness.message,
          failed_invariant: 'source_can_only_seal_after_active_turn_and_queue_are_drained',
          authority_transition_source: authorityTransitionSourceStatus(state),
          operator_input_queue: inputQueueStatus(state),
          active_turn_state: state.activeTurn ? 'running' : 'idle',
          active_turn_id: state.activeTurn?.turnId ?? null,
        });
        return;
      }
      const sealEvidence = authoritySourceSealEvidence(state);
      const source = setAuthorityTransitionSourceState(state, {
        state: 'sealed',
        sealed_at: new Date().toISOString(),
        seal_evidence: sealEvidence,
      });
      emit('authority_source_sealed', {
        request_id: requestId,
        authority_transition_source: source,
        seal_evidence: sealEvidence,
      });
      return;
    }
    const sourceWriteRefusal = authoritySourceWriteRefusal(state, controlRequest);
    if (sourceWriteRefusal) {
      emit('authority_source_write_refused', {
        request_id: requestId,
        method: controlRequest.method,
        ...sourceWriteRefusal,
        operator_input_queue: inputQueueStatus(state),
      });
      emit('error', { request_id: requestId, code: sourceWriteRefusal.code, message: sourceWriteRefusal.message });
      return;
    }
    if (controlRequest.method_kind === 'conversation_enqueue') {
      const message = String(request?.params?.message ?? '');
      if (!message.trim()) {
        emit('error', { request_id: requestId, code: 'message_required', message: 'conversation.enqueue requires params.message' });
        return;
      }
      context.appendSessionRecord?.({
        event: 'conversation_enqueue_requested',
        request_id: requestId,
        method: request?.method ?? 'conversation.enqueue',
        delivery_semantics: 'admit_after_active_turn_without_interrupt',
        operation_status: 'requested',
        requested_at: new Date().toISOString(),
      });
      emit('conversation_enqueue_requested', {
        request_id: requestId,
        method: request?.method ?? 'conversation.enqueue',
        delivery_semantics: 'admit_after_active_turn_without_interrupt',
        operation_status: 'queued',
        active_turn_id: state.activeTurn?.turnId ?? null,
        requested_at: new Date().toISOString(),
      });
      await state.inputQueue.enqueue(normalizeInputEvent({
        content: message,
        source: request?.params?.source ?? 'programmatic_operator',
        source_id: request?.params?.source_id ?? 'agent-runtime-server.operator_surface',
        authority_ref: request?.params?.authority_ref ?? null,
        request_id: requestId,
        delivery_mode: 'admit_after_active_turn',
      }, { transport: 'carrier_server_api' }), { drain: true, state });
      return;
    }
    if (controlRequest.error) {
      emit('error', { request_id: requestId, code: controlRequest.error.code, message: controlRequest.error.message });
      return;
    }
    if (controlRequest.method_kind === 'session_command_execute' || controlRequest.method_kind === 'carrier_command_execute') {
      const command = String(request?.params?.command ?? '').trim().toLowerCase();
      const value = String(request?.params?.value ?? '').trim();
      const resolvedCommand = resolveCommandInput(command, value);
      const commandName = resolvedCommand?.name ?? null;
      const commandArgument = resolvedCommand?.argument || value;
      noteSessionActivity(state, 'carrier_command_requested');
      if (commandName === 'help') {
        emit('carrier_command_result', serverCommandMessage({ requestId, command: command || '/help', message: 'Carrier command contract.', fields: { commands: commandRecords() } }));
        return;
      }
      if (commandName === 'status') {
        emit('carrier_command_result', serverCommandMessage({ requestId, command, message: 'Session status.', fields: { session_status: serverStatus({ requestId, state, allTools, mcpServers, mcpPreflightArtifact, context }) } }));
        return;
      }
      if (commandName === 'stats') {
        emit('carrier_command_result', serverCommandMessage({ requestId, command, message: 'Session statistics.', fields: { session_activity: createSessionActivitySnapshot(state), operator_input_queue: inputQueueStatus(state) } }));
        return;
      }
      if (commandName === 'model') {
        if (commandArgument) state.sessionSettings.model = commandArgument;
        emit('carrier_command_result', serverCommandMessage({ requestId, command, message: `Model set to ${state.sessionSettings.model}.`, fields: { model: state.sessionSettings.model } }));
        return;
      }
      if (commandName === 'thinking') {
        if (commandArgument) state.sessionSettings.thinking = normalizeThinkingLevel(commandArgument);
        emit('carrier_command_result', serverCommandMessage({ requestId, command, message: `Thinking set to ${state.sessionSettings.thinking}.`, fields: { thinking: state.sessionSettings.thinking } }));
        return;
      }
      if (commandName === 'tool_output') {
        if (commandArgument) state.displaySettings.toolOutputs = !['off', 'false', '0', 'hidden'].includes(commandArgument.toLowerCase());
        emit('carrier_command_result', serverCommandMessage({ requestId, command, message: `Tool outputs ${state.displaySettings.toolOutputs ? 'shown' : 'hidden'}.`, fields: { tool_outputs: state.displaySettings.toolOutputs ? 'shown' : 'hidden' } }));
        return;
      }
      if (commandName === 'goal') {
        state.sessionSettings.goal = createCarrierGoalState(commandArgument, 'active');
        emit('carrier_command_result', serverCommandMessage({ requestId, command, message: state.sessionSettings.goal.value ? `Carrier session goal set: ${state.sessionSettings.goal.value}` : 'No carrier session goal is set.', fields: { goal: state.sessionSettings.goal.value || null, goal_status: state.sessionSettings.goal.status } }));
        return;
      }
      if (commandName === 'tools') {
        emit('carrier_command_result', serverCommandMessage({ requestId, command, message: 'MCP tool catalog.', fields: { tools: mcpToolCatalogEntries(mcpServers) } }));
        return;
      }
      if (commandName === 'observers') {
        emit('carrier_command_result', serverCommandMessage({ requestId, command, message: 'Observer posture.', fields: { observer_status: observerServerStatus({ requestId, state }) } }));
        return;
      }
      if (commandName === 'observer_mute' || commandName === 'observer_unmute') {
        state.displaySettings.observerMuted = commandName === 'observer_mute';
        emit('carrier_command_result', serverCommandMessage({ requestId, command, message: `Visible observer interjections are ${state.displaySettings.observerMuted ? 'muted' : 'shown'} for this session.`, fields: { observer_muted: state.displaySettings.observerMuted } }));
        return;
      }
      if (commandName === 'queue_show' || commandName === 'queue_clear' || commandName === 'queue_drop') {
        const queue = inputQueueStatus(state);
        if (commandName === 'queue_show') {
          emit('carrier_command_result', serverCommandMessage({
            requestId,
            command,
            message: `Queued operator input: ${queue.pendingCount ?? 0} item(s).`,
            fields: { operator_input_queue: queue },
          }));
          return;
        }
        if (commandName === 'queue_clear') {
          const dropped = state.inputQueue?.clearOperatorInput?.() ?? [];
          emit('carrier_command_result', serverCommandMessage({
            requestId,
            command,
            message: `Cleared ${dropped.length} queued operator input item(s).`,
            fields: { dropped_count: dropped.length, operator_input_queue: inputQueueStatus(state) },
          }));
          return;
        }
        if (commandName === 'queue_drop') {
          const index = Number(commandArgument.split(/\s+/).filter(Boolean)[0] ?? 1);
          const dropped = Number.isInteger(index) && index > 0 ? state.inputQueue?.dropOperatorInput?.(index) : null;
          emit('carrier_command_result', serverCommandMessage({
            requestId,
            command,
            terminalState: dropped ? 'completed' : 'not_found',
            message: dropped ? `Dropped queued operator input item ${index}.` : `No queued operator input item ${Number.isInteger(index) && index > 0 ? index : '<invalid>'}.`,
            fields: { dropped_input_event_id: dropped?.event_id ?? null, operator_input_queue: inputQueueStatus(state) },
          }));
          return;
        }
      }
      if (commandName === 'clear') {
        emit('carrier_command_result', serverCommandMessage({ requestId, command, message: 'Clear is a terminal projection command; runtime state is unchanged.', fields: { projection_local: true } }));
        return;
      }
      if (commandName === 'exit') {
        state.closed = true;
        if (state.activeTurn) requestTurnInterrupt(state.activeTurn);
        noteSessionActivity(state, 'session_closed', new Date().toISOString(), 'closed');
        emit('session_closed', { ...serverStatus({ requestId, state, allTools, mcpServers, mcpPreflightArtifact, context }), terminal_state: 'closed' });
        return;
      }
      emit('carrier_command_result', serverCommandMessage({ requestId, command: command || 'unknown', terminalState: 'unsupported', message: `Unsupported command: ${command || '<missing>'}` }));
      return;
    }
    if (controlRequest.method_kind === 'session_status') {
      noteSessionActivity(state, 'session_status_requested');
      recordWorkflowRequest(context, 'session_status_requested', { requestId, method: request?.method ?? 'session.status' });
      emit('session_status', serverStatus({ requestId, state, allTools, mcpServers, mcpPreflightArtifact, context }));
      return;
    }
    if (controlRequest.method_kind === 'session_health') {
      noteSessionActivity(state, 'session_health_requested');
      emit('session_health', serverHealth({ requestId, state, allTools, mcpServers, mcpPreflightArtifact, context }));
      return;
    }
    if (controlRequest.method_kind === 'session_resume') {
      noteSessionActivity(state, 'session_resume_requested');
      recordWorkflowRequest(context, 'session_resume_requested', { requestId, method: request?.method ?? 'session.resume' });
      const requestedSessionId = request?.params?.session_id ?? request?.params?.sessionId ?? request?.params?.carrier_session_id ?? null;
      if (requestedSessionId && requestedSessionId !== context.session) {
        emit('error', {
          request_id: requestId,
          code: 'session_mismatch',
          message: 'session.resume requested a different session id than this runtime owns.',
          requested_session_id: requestedSessionId,
          session_id: context.session,
        });
        return;
      }
      emit('session_resume', {
        ...serverStatus({ requestId, state, allTools, mcpServers, mcpPreflightArtifact, context }),
        event: 'session_resume',
        resumed_session_id: context.session,
        terminal_state: state.closed ? 'closed' : 'completed',
      });
      return;
    }
    if (controlRequest.method_kind === 'session_events_subscribe') {
      noteSessionActivity(state, 'session_events_subscribe_requested');
      emit('session_events_subscription_started', serverEventsSubscription({ requestId, params: request?.params ?? {}, context }));
      return;
    }
    if (controlRequest.method_kind === 'observers_status') {
      context.appendSessionRecord?.({ event: 'observer_status_requested', request_id: requestId, method: request?.method ?? 'observers.status', operation_status: 'requested', requested_at: new Date().toISOString() });
      emit('observer_status', observerServerStatus({ requestId, state }));
      return;
    }
    if (controlRequest.method_kind === 'observer_set_muted') {
      const action = controlRequest.observer_action ?? (request?.method === 'observer.mute' ? 'mute' : 'unmute');
      context.appendSessionRecord?.({ event: 'observer_state_change_requested', request_id: requestId, method: request?.method ?? null, observer_action: action, operation_status: 'requested', requested_at: new Date().toISOString() });
      state.displaySettings.observerMuted = action === 'mute';
      emit('observer_status', { ...observerServerStatus({ requestId, state }), terminal_state: 'ok', message: `Visible observer interjections are ${state.displaySettings.observerMuted ? 'muted' : 'shown'} for this session.` });
      return;
    }
    if (controlRequest.method_kind === 'conversation_interrupt') {
      context.appendSessionRecord?.({
        event: 'conversation_interrupt_requested',
        request_id: requestId,
        method: request?.method ?? 'conversation.interrupt',
        operation_status: 'requested',
        requested_at: new Date().toISOString(),
      });
      emit('conversation_interrupt_requested', {
        request_id: requestId,
        method: request?.method ?? 'conversation.interrupt',
        operation_status: 'requested',
        requested_at: new Date().toISOString(),
      });
      if (state.activeTurn) {
        requestTurnInterrupt(state.activeTurn);
        emit('turn_interrupted', { request_id: requestId, turn_id: state.activeTurn.turnId, terminal_state: 'interrupted_requested' });
      } else {
        emit('session_status', serverStatus({ requestId, state, allTools, mcpServers, mcpPreflightArtifact, context }));
      }
      return;
    }
    if (controlRequest.method_kind === 'conversation_steer') {
      const message = String(request?.params?.message ?? '');
      if (!message.trim()) {
        emit('error', { request_id: requestId, code: 'message_required', message: 'conversation.steer requires params.message' });
        return;
      }
      if (!state.activeTurn) {
        emit('error', { request_id: requestId, code: 'no_active_turn', message: 'conversation.steer requires an active turn.' });
        return;
      }
      const activeTurn = state.activeTurn;
      const steeringContent = `Operator steering for interrupted active turn ${activeTurn.turnId}:\n\n${message}`;
      context.appendSessionRecord?.({
        event: 'conversation_steer_requested',
        request_id: requestId,
        method: request?.method ?? 'conversation.steer',
        active_turn_id: activeTurn.turnId,
        delivery_semantics: 'interrupt_active_turn_then_admit_next_turn',
        operation_status: 'requested',
        requested_at: new Date().toISOString(),
      });
      emit('conversation_steer_requested', {
        request_id: requestId,
        method: request?.method ?? 'conversation.steer',
        active_turn_id: activeTurn.turnId,
        delivery_semantics: 'interrupt_active_turn_then_admit_next_turn',
        operation_status: 'requested',
        requested_at: new Date().toISOString(),
      });
      requestTurnInterrupt(activeTurn);
      emit('turn_interrupted', { request_id: requestId, turn_id: activeTurn.turnId, terminal_state: 'interrupted_requested', reason: 'operator_steering' });
      await state.inputQueue.enqueue(normalizeInputEvent({
        content: steeringContent,
        source: 'operator_steering',
        source_id: request?.params?.source_id ?? 'agent-runtime-server.operator_terminal',
        request_id: requestId,
        metadata: {
          operator_steering: {
            raw_message: message,
            interrupted_turn_id: activeTurn.turnId,
            interrupted_request_id: activeTurn.requestId,
            delivery_semantics: 'interrupt_active_turn_then_admit_next_turn',
          },
        },
      }, { transport: 'control_jsonl' }), { drain: true, state });
      return;
    }
    if (controlRequest.method_kind === 'session_close') {
      recordWorkflowRequest(context, 'session_close_requested', { requestId, method: request?.method ?? 'session.close' });
      state.closed = true;
      if (state.activeTurn) requestTurnInterrupt(state.activeTurn);
      noteSessionActivity(state, 'session_closed', new Date().toISOString(), 'closed');
      emit('session_closed', { ...serverStatus({ requestId, state, allTools, mcpServers, mcpPreflightArtifact, context }), terminal_state: 'closed' });
      return;
    }
    if (controlRequest.method_kind === 'carrier_input_deliver') {
      await state.inputQueue.enqueue(normalizeServerControlInputRequest(request, requestId), { drain: true, state });
      return;
    }
    if (controlRequest.method_kind === 'system_directive_deliver') {
      const directive = request?.params?.directive ?? null;
      const message = String(request?.params?.message ?? directive?.content?.text ?? '');
      const directiveId = directive?.directive_id ?? request?.params?.directive_id ?? null;
      await state.inputQueue.enqueue(normalizeInputEvent({ content: message, source: 'system_directive', authority_ref: request?.params?.authority_ref ?? directiveId, directive_id: directiveId, request_id: requestId }, { transport: 'control_jsonl' }), { drain: true, state });
      return;
    }
    const message = String(request?.params?.message ?? '');
    if (!message.trim()) {
      emit('error', { request_id: requestId, code: 'message_required', message: 'conversation.send requires params.message' });
      return;
    }
    await state.inputQueue.enqueue(normalizeInputEvent({ content: message, source: request?.params?.source ?? 'automation_jsonl', source_id: request?.params?.source_id ?? null, authority_ref: request?.params?.authority_ref ?? null, request_id: requestId }, { transport: 'control_jsonl' }), { drain: true, state });
  } catch (error) {
    emit('error', { request_id: requestId, code: 'request_failed', message: error instanceof Error ? error.message : String(error) });
  }
}

async function callChatApi(messages, tools, settings = {}) {
  const provider = settings.provider ?? process.env.NARADA_INTELLIGENCE_PROVIDER ?? 'codex-subscription';
  const providerMetadata = PROVIDER_METADATA[provider];
  if (!providerMetadata) throw new Error(`Unsupported intelligence provider: ${provider}`);
  const adapter = REQUEST_ADAPTERS[providerMetadata.adapter_kind];
  if (!adapter) throw new Error(`Request adapter not implemented for ${provider}: ${providerMetadata.adapter_kind}`);
  const state = providerMetadata.support_state ?? providerMetadata.support_status;
  if (![PROVIDER_SUPPORT_STATES.VERIFIED_SUPPORTED, PROVIDER_SUPPORT_STATES.DEPRECATED, 'supported'].includes(state)) {
    throw new Error(`Unsupported intelligence provider adapter for ${provider}: ${state}`);
  }
  if (provider !== 'codex-subscription' && !settings.apiKey) {
    const credentialNames = providerMetadata.credential_env_names ?? [];
    throw new Error(`Missing API key for ${provider}. Set ${credentialNames.join(' or ') || 'the provider-specific API key environment variable'}.`);
  }
  const request = adapter.buildRequest(messages, tools, settings);
  if (providerMetadata.adapter_kind === 'codex-mcp-server') {
    const response = settings.stream === false
      ? await sendCodexExecJsonBufferedRequest(request, settings)
      : await sendCodexExecJsonRequest(request, settings);
    return parseCodexMcpResponse(response);
  }
  const response = await sendProviderRequest(adapter.buildRequest(messages, tools, settings), settings);
  return providerMetadata.adapter_kind === 'anthropic-messages' ? parseAnthropicMessagesResponse(response) : response;
}

function sendProviderRequest({ url, body, headers }, settings = {}) {
  const serializedBody = JSON.stringify(body);
  return new Promise((resolveRequest, rejectRequest) => {
    const isHttps = url.protocol === 'https:';
    const req = (isHttps ? httpsRequest : httpRequest)({ hostname: url.hostname, port: url.port || (isHttps ? 443 : 80), path: url.pathname + url.search, method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(serializedBody) } }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode < 200 || res.statusCode >= 300) rejectRequest(new Error(`API error ${res.statusCode}: ${JSON.stringify(parsed).slice(0, 1000)}`));
          else if (parsed?.error) rejectRequest(new Error(`API error: ${JSON.stringify(parsed.error).slice(0, 1000)}`));
          else resolveRequest(parsed);
        } catch {
          rejectRequest(new Error(`Invalid JSON from API: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', rejectRequest);
    settings.abortSignal?.addEventListener?.('abort', () => req.destroy(new Error('agent_cli_interrupt_requested')), { once: true });
    req.write(serializedBody);
    req.end();
  });
}

function sendCodexExecJsonRequest(request, settings = {}) {
  return new Promise((resolveRequest, rejectRequest) => {
    const command = codexCommand();
    const args = buildCodexExecArgs(request, settings);
    const prompt = codexExecPrompt(request);
    const mcpServers = codexRequestMcpServers(request, settings);
    const cwd = request.arguments?.cwd ?? settings.siteRoot ?? process.cwd();
    const env = buildCodexSubprocessEnv(mcpServers, settings);
    let processOwner;
    try {
      processOwner = spawnAiProcessInvocation({ adapterKind: 'codex', projection: 'codex-subscription', purpose: 'provider_request', siteRoot: settings.siteRoot ?? cwd, cwd, command: command.command, argv: [...command.prefixArgs, ...args], env }, {
        spawnProcess: spawnOwnedProcess,
        spawnOptions: { cwd, windowsHide: true, env, stdio: ['pipe', 'pipe', 'pipe'] },
      });
    } catch (error) {
      return rejectRequest(codexAiProcessInvocationError(error));
    }
    const child = processOwner.child;
    child.stdin.end(prompt);
    let stdoutBuffer = '';
    let stderr = '';
    let threadId = request.arguments?.threadId ?? null;
    let textState = createCodexExecTextAccumulator();
    let streamed = false;
    const abortChild = () => processOwner.terminateTree('codex_subscription_abort');
    settings.abortSignal?.addEventListener?.('abort', abortChild, { once: true });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = parseCodexExecJsonLine(line);
        if (!event) continue;
        settings.emit?.('provider_event', { provider: 'codex-subscription', event });
        handleCodexExecMcpToolEvent(event, settings);
        if (event.type === 'thread.started' && typeof event.thread_id === 'string') threadId = event.thread_id;
        const accumulated = accumulateCodexExecEvent(textState, event);
        const { appendText, suppressStreaming } = accumulated;
        textState = accumulated.state;
        if (appendText && !suppressStreaming) {
          streamed = true;
          settings.emit?.('assistant_message_stream', { turn_id: settings.turn?.turnId ?? null, content: appendText });
        }
      }
    });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => rejectRequest(codexCliSpawnError(error, command)));
    child.on('exit', (code) => {
      settings.abortSignal?.removeEventListener?.('abort', abortChild);
      if (settings.abortSignal?.aborted) return rejectRequest(new Error('agent_cli_interrupt_requested'));
      if (stdoutBuffer.trim()) {
        const event = parseCodexExecJsonLine(stdoutBuffer.trim());
        if (event) {
          settings.emit?.('provider_event', { provider: 'codex-subscription', event });
          handleCodexExecMcpToolEvent(event, settings);
          if (event.type === 'thread.started' && typeof event.thread_id === 'string') threadId = event.thread_id;
          const accumulated = accumulateCodexExecEvent(textState, event);
          const { appendText, suppressStreaming } = accumulated;
          textState = accumulated.state;
          if (appendText && !suppressStreaming) {
            streamed = true;
            settings.emit?.('assistant_message_stream', { turn_id: settings.turn?.turnId ?? null, content: appendText });
          }
        }
      }
      if (code !== 0) return rejectRequest(new Error(`codex exec --json failed with exit ${code}${stderr.trim() ? `; ${stderr.trim().slice(0, 1000)}` : ''}`));
      resolveRequest({ threadId, content: textState.content, streaming_rendered: streamed });
    });
  });
}
function sendCodexExecJsonBufferedRequest(request, settings = {}) {
  return new Promise((resolveRequest, rejectRequest) => {
    const command = codexCommand();
    const args = buildCodexExecArgs(request, settings);
    const prompt = codexExecPrompt(request);
    const mcpServers = codexRequestMcpServers(request, settings);
    const cwd = request.arguments?.cwd ?? settings.siteRoot ?? process.cwd();
    const env = buildCodexSubprocessEnv(mcpServers, settings);
    let processOwner;
    try {
      processOwner = spawnAiProcessInvocation({ adapterKind: 'codex', projection: 'codex-subscription', purpose: 'provider_request_buffered', siteRoot: settings.siteRoot ?? cwd, cwd, command: command.command, argv: [...command.prefixArgs, ...args], env }, {
        spawnProcess: spawnOwnedProcess,
        spawnOptions: { cwd, windowsHide: true, env, stdio: ['pipe', 'pipe', 'pipe'] },
      });
    } catch (error) {
      return rejectRequest(codexAiProcessInvocationError(error));
    }
    const child = processOwner.child;
    child.stdin.end(prompt);
    let stdout = '';
    let stderr = '';
    let threadId = request.arguments?.threadId ?? null;
    let textState = createCodexExecTextAccumulator();
    const abortChild = () => processOwner.terminateTree('codex_subscription_abort');
    settings.abortSignal?.addEventListener?.('abort', abortChild, { once: true });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => rejectRequest(codexCliSpawnError(error, command)));
    child.on('exit', (code) => {
      settings.abortSignal?.removeEventListener?.('abort', abortChild);
      if (settings.abortSignal?.aborted) return rejectRequest(new Error('agent_cli_interrupt_requested'));
      if (code !== 0) return rejectRequest(new Error(`codex exec --json failed with exit ${code}${stderr.trim() ? `; ${stderr.trim().slice(0, 1000)}` : ''}`));
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const event = parseCodexExecJsonLine(line);
        if (!event) continue;
        handleCodexExecMcpToolEvent(event, settings);
        if (event.type === 'thread.started' && typeof event.thread_id === 'string') threadId = event.thread_id;
        textState = accumulateCodexExecEvent(textState, event).state;
      }
      resolveRequest({ threadId, content: textState.content, streaming_rendered: false });
    });
  });
}

function handleCodexExecMcpToolEvent(event, settings = {}) {
  const summary = codexExecMcpToolEventSummary(event);
  if (!summary) return;
  if (event.type === 'item.started') {
    settings.emit?.('tool_call', { turn_id: settings.turn?.turnId ?? null, tool: summary.name, server: summary.server, arguments: summary.arguments, decision: 'delegated_to_nested_codex', carrier_mutation_admitted: false, native_mcp_tool_call: true });
  }
  if (event.type === 'item.completed') {
    settings.emit?.('tool_result', { turn_id: settings.turn?.turnId ?? null, tool: summary.name, server: summary.server, status: 'ok', native_mcp_tool_call: true });
  }
}

export function serverStatus({ requestId, state, allTools, mcpServers, mcpPreflightArtifact, context = {} }) {
  const carrierSessionSettings = state?.sessionSettings ?? {};
  const goal = normalizeCarrierGoalState(carrierSessionSettings.goal);
  const intelligence = effectiveIntelligenceSettings({ sessionSettings: carrierSessionSettings, providerSettings: context.providerSettings });
  const mcpStatus = createMcpStatusSnapshot(mcpServers);
  const surfaceAffordances = buildMcpSurfaceAffordanceProjection(mcpServers);
  const handoffs = sessionHandoffs({ identity: context.identity, session: context.session });
  return {
    request_id: requestId,
    transport: 'jsonl_stdio',
    intelligence,
    provider: intelligence.provider,
    site_config: context.siteConfig ?? null,
    model: intelligence.model,
    thinking: intelligence.thinking,
    stream: intelligence.stream,
    goal: goal.value || null,
    goal_status: goal.status,
    goal_display: carrierGoalStatusLabel(goal),
    active_turn_state: state.activeTurn ? 'running' : 'idle',
    active_turn_id: state.activeTurn?.turnId ?? null,
    authority_transition_source: authorityTransitionSourceStatus(state),
    authority_transition_target: authorityTransitionTargetStatus(state),
    operator_input_queue: inputQueueStatus(state),
    mcp_server_count: Object.keys(mcpServers).length,
    ...mcpStatus,
    ...createMcpPreflightArtifactSnapshot(mcpPreflightArtifact),
    ...createSessionActivitySnapshot(state),
    ...createOperationalPostureSnapshot({ state, mcpOperationalState: mcpStatus.mcp_operational_state }),
    tool_count: allTools.length,
    mcp_tools: mcpToolCatalogEntries(mcpServers),
    mcp_servers: mcpServerSummaryEntries(mcpServers),
    surface_affordances: surfaceAffordances,
    delegated_authority_handoff: context.narsDelegatedAuthorityHandoff ?? context.delegatedAuthorityHandoff ?? null,
    delegated_authority_ref: (context.narsDelegatedAuthorityHandoff ?? context.delegatedAuthorityHandoff)?.authority_ref ?? null,
    handoffs,
    recommended_command: handoffs.session_read ?? null,
    recovery_kind: createSessionActivitySnapshot(state).request_posture === 'invalid_control_traffic' ? 'invalid_control_review' : 'no_recovery',
    recovery_kind_display: createSessionActivitySnapshot(state).request_posture === 'invalid_control_traffic' ? 'invalid control review' : 'no recovery',
    recovery_primary_command: createSessionActivitySnapshot(state).request_posture === 'invalid_control_traffic' ? handoffs.session_events_issues : handoffs.session_read,
    recovery_followup_command: createSessionActivitySnapshot(state).request_posture === 'invalid_control_traffic' ? handoffs.session_read : null,
    session_path: context.sessionPath,
    events_path: context.eventsPath,
  };
}

function effectiveIntelligenceSettings({ sessionSettings = {}, providerSettings = {} } = {}) {
  return {
    provider: stringOrNull(sessionSettings.provider) ?? stringOrNull(providerSettings.provider) ?? stringOrNull(process.env.NARADA_INTELLIGENCE_PROVIDER) ?? 'codex-subscription',
    model: stringOrNull(sessionSettings.model) ?? stringOrNull(providerSettings.model) ?? null,
    thinking: stringOrNull(sessionSettings.thinking) ?? stringOrNull(providerSettings.thinking) ?? stringOrNull(process.env.NARADA_AI_THINKING) ?? stringOrNull(process.env.NARADA_THINKING_LEVEL) ?? 'medium',
    stream: booleanOrNull(sessionSettings.stream) ?? booleanOrNull(providerSettings.stream) ?? null,
  };
}

function stringOrNull(value) {
  return typeof value === 'string' && value ? value : null;
}

function booleanOrNull(value) {
  return typeof value === 'boolean' ? value : null;
}

function serverHealth({ requestId, state, allTools, mcpServers, mcpPreflightArtifact, context = {} }) {
  const status = serverStatus({ requestId, state, allTools, mcpServers, mcpPreflightArtifact, context });
  const generatedAt = new Date().toISOString();
  const degraded = status.operational_posture !== 'healthy';
  const operatorSurfaceKind = context.operatorSurfaceKind ?? 'agent-cli';
  const heartbeat = readHeartbeatHealth({ sessionPath: context.sessionPath, now: generatedAt });
  return {
    schema: 'narada.nars.health.v1',
    event: 'session_health',
    request_id: requestId,
    status: state?.closed ? 'closing' : degraded ? 'degraded' : 'healthy',
    generated_at: generatedAt,
    agent_id: context.identity,
    session_id: context.session,
    site_root: context.siteRoot,
    site_config: status.site_config,
    runtime: 'narada-agent-runtime-server',
    runtime_mode: 'server',
    runtime_substrate: 'narada-agent-runtime-server',
    runtime_substrate_kind: 'narada-agent-runtime-server',
    carrier_kind: operatorSurfaceKind,
    launch_operator_surface_kind: operatorSurfaceKind,
    operator_surface_kind: operatorSurfaceKind,
    started_at: state?.startedAt ?? null,
    delegated_authority_handoff: status.delegated_authority_handoff,
    delegated_authority_ref: status.delegated_authority_ref,
    intelligence: status.intelligence,
    provider: status.provider,
    model: status.model,
    thinking: status.thinking,
    active_turn_state: status.active_turn_state,
    active_turn_id: status.active_turn_id,
    mcp: {
      operational_state: status.mcp_operational_state,
      server_count: status.mcp_server_count,
      startup_failure_count: status.mcp_startup_failure_count,
      runtime_fault_count: status.mcp_runtime_fault_count,
      servers: status.mcp_servers,
    },
    surface_affordances: status.surface_affordances,
    heartbeat,
    activity: {
      last_event_kind: state?.lastEventKind ?? null,
      last_event_at: state?.lastEventAt ?? null,
      active_turn_state: status.active_turn_state,
      active_turn_id: status.active_turn_id,
      last_terminal_state: state?.lastTerminalState ?? null,
    },
    posture: {
      request_posture: status.request_posture,
      operational_posture: status.operational_posture,
      operational_posture_display: status.operational_posture_display,
    },
    recommended_action: status.recovery_kind === 'no_recovery' ? 'review_session_summary' : status.recovery_kind,
    recommended_command: status.recommended_command ?? status.handoffs?.session_read ?? null,
    authority_transition: status.authority_transition,
    authority_transition_state: status.authority_transition_state,
    source_write_admission: status.source_write_admission ?? status.authority_transition_source?.source_write_admission ?? null,
    authority_transition_source: status.authority_transition_source,
    handoffs: status.handoffs,
  };
}

function readHeartbeatHealth({ sessionPath, now = new Date().toISOString() } = {}) {
  const heartbeatPath = sessionPath ? join(dirname(String(sessionPath)), 'heartbeat.json') : null;
  const heartbeat = readJsonFile(heartbeatPath);
  const lastWrittenAt = heartbeat?.heartbeat_at ?? heartbeat?.last_written_at ?? heartbeat?.last_seen_at ?? null;
  const lastMs = lastWrittenAt ? Date.parse(String(lastWrittenAt)) : NaN;
  const nowMs = Date.parse(String(now));
  const ageMs = Number.isFinite(lastMs) && Number.isFinite(nowMs) ? Math.max(0, nowMs - lastMs) : null;
  return {
    path: heartbeatPath,
    last_written_at: lastWrittenAt,
    age_ms: ageMs,
    freshness: heartbeat ? 'fresh' : 'missing',
  };
}

function readJsonFile(path) {
  try {
    if (!path || !existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function emitServerEvent(output, event, { appendEventRecord } = {}) {
  const sequencedEvent = { event_sequence: nextEventSequence(), sequence: currentEventSequence, ...event };
  appendEventRecord?.(sequencedEvent);
  output.write(`${JSON.stringify(sequencedEvent)}\n`);
}

let currentEventSequence = 0;
function nextEventSequence() {
  currentEventSequence += 1;
  return currentEventSequence;
}

function closeMcpServers(mcpServers) {
  for (const server of Object.values(mcpServers)) if (server.process && !server.process.killed) server.process.kill();
}

function recordMcpStartupFailures(mcpServers, { emit = null, appendSessionRecord = null } = {}) {
  for (const failure of getMcpStartupFailures(mcpServers)) {
    const payload = { diagnostic_code: failure.code ?? 'mcp_startup_failure', ...failure };
    emit?.('carrier_diagnostic_recorded', payload);
    appendSessionRecord?.(carrierSessionEventEntry('carrier_diagnostic_recorded', payload));
  }
}

function noteSessionActivity(state, eventKind, occurredAt = new Date().toISOString(), terminalState = null) {
  if (!state) return;
  state.sessionEventCount = Number(state.sessionEventCount ?? 0) + 1;
  state.lastEventKind = eventKind;
  state.lastEventAt = occurredAt;
  if (terminalState) state.lastTerminalState = terminalState;
}

function recordSessionRequestIssue(state, issueCode) {
  if (!state || !issueCode) return;
  state.requestIssueCounts[issueCode] = Number(state.requestIssueCounts[issueCode] ?? 0) + 1;
  const outcomeCode = classifyRequestIssueOutcome(issueCode);
  state.requestOutcomeCounts[outcomeCode] = Number(state.requestOutcomeCounts[outcomeCode] ?? 0) + 1;
}

function createOperationHeartbeatDirectiveEmitter({ inputQueue, intervalMs = 60000, initialDelayMs = 60000 } = {}) {
  let timer = null;
  const emitOnce = async ({ reason = 'operation_heartbeat' } = {}) => inputQueue?.enqueue?.(normalizeInputEvent({ content: '', source: 'system_directive', metadata: { directive: { kind: 'operation_heartbeat', visibility: 'record_only', reason } } }, { transport: 'carrier_server_api' }), { drain: true });
  return {
    start() {
      timer = setInterval(() => emitOnce(), Math.max(1000, intervalMs));
      if (initialDelayMs >= 0) setTimeout(() => emitOnce({ reason: 'initial_delay' }), initialDelayMs);
      return this;
    },
    stop() { if (timer) clearInterval(timer); timer = null; },
    emitOnce,
  };
}

function createTurn(turnId, requestId) {
  const abortController = new AbortController();
  return {
    turnId,
    requestId,
    interruptRequested: false,
    abortSignal: abortController.signal,
    abortController,
    setPhase() {},
    clearStatus() {},
  };
}

function requestTurnInterrupt(turn) {
  if (!turn) return;
  turn.interruptRequested = true;
  turn.abortController?.abort?.();
}

function normalizeServerControlInputRequest(request, requestId = null) {
  const controlRequest = request?.schema === 'narada.carrier.control.input_event.v1' ? request : request?.params?.input;
  if (!controlRequest) throw new Error('carrier.input.deliver requires params.input');
  const controlRecord = normalizeControlInputRecord(controlRequest);
  return { ...controlRecord.input, request_id: requestId ?? controlRecord.input.request_id ?? null };
}

function sessionLogEntry(entry) {
  return { ...entry, timestamp: new Date().toISOString() };
}

function carrierSessionEventEntry(eventKind, payload = {}) {
  return { event_kind: eventKind, payload, timestamp: new Date().toISOString() };
}

function appendJsonlRecord(path, entry) {
  if (!path) return;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(entry)}\n`, 'utf8');
}

export function assertApiKeyConfigured(provider, apiKey, providerMetadata = PROVIDER_METADATA) {
  if (provider === 'codex-subscription') return;
  if (apiKey) return;
  const credentialEnvNames = providerMetadata[provider]?.credential_env_names ?? [];
  const credentialHint = credentialEnvNames.length > 0 ? credentialEnvNames.join(' or ') : 'the provider-specific API key environment variable';
  throw new Error(`Missing API key for ${provider}. Set ${credentialHint}.`);
}

function recordCarrierDiagnostic(level, message, { appendSessionRecord, ...extra } = {}) {
  appendSessionRecord?.(carrierSessionEventEntry('carrier_diagnostic_recorded', { level, message, ...extra }));
}
