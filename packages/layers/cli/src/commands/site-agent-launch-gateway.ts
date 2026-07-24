import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type {
  OperatorSiteAgentLaunchFailurePhase,
  OperatorSiteAgentLaunchWireResponse,
  OperatorSiteAgentLaunchHandoffWireRecord,
  OperatorSiteAgentWireRecord,
} from '@narada2/operator-console-contract';
import { silentCommandContext } from '../lib/command-wrapper.js';
import { agentWebUiAttachCommand } from './agent-web-ui.js';
import { workspaceLaunchCommand } from './workspace-launch-application.js';
import { readWorkspaceLaunchRecords } from './workspace-launch-registry.js';
import type { SiteAgentOverviewReadModel } from './site-agent-overview-read-model.js';
import {
  createSiteAgentLaunchAdmission,
  type SiteAgentLaunchAdmission,
} from './site-agent-launch-admission.js';
import {
  createSiteAgentLaunchDiagnostics,
  type SiteAgentLaunchDiagnostics,
  type SiteAgentLaunchFailureContext,
} from './site-agent-launch-diagnostics.js';
import { WorkspaceLaunchContractError } from './workspace-launch-contracts.js';

export interface SiteAgentLaunchRequest {
  siteId: string;
  agentId: string;
  operatorSurface?: string;
}

function surfaceSelection(
  agent: OperatorSiteAgentWireRecord,
  request: SiteAgentLaunchRequest,
): { surface: string; refusal: string | null; message: string | null } {
  const explicit = request.operatorSurface?.trim() || null;
  const surface = explicit ?? agent.operator_surfaces.default_kind;
  const choice = agent.operator_surfaces.choices.find((candidate) => candidate.kind === surface);
  if (!surface) return { surface: '', refusal: 'operator_surface_required', message: 'Select an operator surface.' };
  if (explicit && (!choice || choice.status !== 'available')) {
    return {
      surface,
      refusal: choice ? 'operator_surface_not_available' : 'operator_surface_unsupported',
      message: choice?.reason ?? 'This operator surface is not admitted for this agent.',
    };
  }
  if (choice && choice.status !== 'available') {
    return { surface, refusal: 'operator_surface_not_available', message: choice.reason ?? 'This operator surface is not available.' };
  }
  return { surface, refusal: null, message: null };
}

function handoffFor(
  surface: string,
  status: 'reused' | 'launched',
  messageOverride: string | null = null,
): OperatorSiteAgentLaunchHandoffWireRecord {
  if (surface === 'agent-web-ui') {
    return {
      kind: 'browser',
      status: status === 'reused' ? 'ready' : 'pending',
      url: null,
      command: null,
      message: messageOverride ?? (status === 'reused'
        ? 'The existing healthy session can be opened in the Web UI.'
        : 'The Web UI route will open when the new runtime session is ready.'),
    };
  }
  if (surface === 'agent-cli' || surface === 'agent-tui') {
    return {
      kind: 'terminal',
      status: status === 'reused' ? 'refused' : 'started',
      url: null,
      command: null,
      message: messageOverride ?? (status === 'reused'
        ? 'An existing session cannot be attached to this terminal surface from the Operator Console.'
        : `${surface === 'agent-cli' ? 'CLI' : 'TUI'} terminal handoff started.`),
    };
  }
  return {
    kind: 'none',
    status: status === 'reused' ? 'refused' : 'started',
    url: null,
    command: null,
    message: messageOverride ?? (status === 'reused'
      ? 'The configured operator surface cannot attach to an existing session from the Operator Console.'
      : null),
  };
}

function operatorConsoleWorkspaceResultPath(requestId: string): string {
  const userSiteRoot = process.env.NARADA_USER_SITE_ROOT ?? join(homedir(), 'Narada');
  return join(
    userSiteRoot,
    '.narada',
    'runtime',
    'operator-console',
    'workspace-launch-results',
    `${Date.now()}-${requestId}.json`,
  );
}

export interface SiteAgentLaunchGateway {
  launch(request: SiteAgentLaunchRequest): Promise<OperatorSiteAgentLaunchWireResponse>;
  close?(): Promise<void>;
}

export interface SiteAgentLaunchGatewayDependencies {
  overview: SiteAgentOverviewReadModel;
  readLaunchRecords?: typeof readWorkspaceLaunchRecords;
  launchCommand?: typeof workspaceLaunchCommand;
  attachWebUiCommand?: typeof agentWebUiAttachCommand;
  launchAdmission?: SiteAgentLaunchAdmission;
  diagnostics?: SiteAgentLaunchDiagnostics;
}

function response(
  status: OperatorSiteAgentLaunchWireResponse['status'],
  request: SiteAgentLaunchRequest,
  sessionId: string | null,
  reason: string | null,
  requestId: string,
  failure: OperatorSiteAgentLaunchWireResponse['failure'] = null,
  operatorSurface: string | null = request.operatorSurface?.trim() || null,
  handoff: OperatorSiteAgentLaunchHandoffWireRecord | null = null,
): OperatorSiteAgentLaunchWireResponse {
  return {
    schema: 'narada.operator_console.agent_launch.v1',
    status,
    site_id: request.siteId,
    agent_id: request.agentId,
    session_id: sessionId,
    reason,
    ...(operatorSurface ? { operator_surface: operatorSurface } : {}),
    ...(handoff ? { handoff } : {}),
    request_id: requestId,
    failure,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function messageField(value: unknown): string | null {
  return stringField(value) ?? (isRecord(value) ? stringField(value.message) : null);
}

function launchResultFailure(value: unknown): {
  code: string;
  message: string;
  error: unknown;
  workspaceResultPath: string | null;
} {
  const result = isRecord(value) ? value : {};
  const failure = isRecord(result.failure) ? result.failure : {};
  return {
    code: stringField(failure.reason_code)
      ?? stringField(failure.code)
      ?? 'workspace_launch_failed',
    message: stringField(failure.message)
      ?? messageField(result.error)
      ?? stringField(result.reason)
      ?? 'Workspace launch exited with a nonzero status.',
    error: failure.error ?? result.error,
    workspaceResultPath: stringField(result.result_path),
  };
}

function sessionIdFromLaunchResult(value: unknown): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  const attachment = result.attachment;
  if (attachment === null || typeof attachment !== 'object' || Array.isArray(attachment)) return null;
  const sessions = (attachment as Record<string, unknown>).sessions;
  if (!Array.isArray(sessions) || sessions.length !== 1) return null;
  const session = sessions[0];
  if (session === null || typeof session !== 'object' || Array.isArray(session)) return null;
  const sessionId = (session as Record<string, unknown>).session_id;
  return typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : null;
}

type WebUiAttachmentOutcome =
  | { ok: true }
  | { ok: false; code: string; message: string; error: unknown };

function cleanupFromWebUiAttachResult(value: unknown): (() => Promise<void>) | null {
  if (!isRecord(value) || typeof value._cleanup !== 'function') return null;
  const cleanup = value._cleanup as () => unknown;
  return async () => {
    await cleanup();
  };
}

function webUiAttachFailure(value: unknown): {
  code: string;
  message: string;
  error: unknown;
} {
  const result = isRecord(value) ? value : {};
  return {
    code: stringField(result.reason) ?? stringField(result.code) ?? 'agent_web_ui_attach_failed',
    message: stringField(result.message)
      ?? stringField(result.detail)
      ?? messageField(result.error)
      ?? stringField(result._formatted)
      ?? 'Agent Web UI attachment failed.',
    error: result.error ?? result,
  };
}

function workspaceLaunchFailureContext(error: unknown): SiteAgentLaunchFailureContext | undefined {
  return error instanceof WorkspaceLaunchContractError && error.artifactPath
    ? { workspace_result_path: error.artifactPath }
    : undefined;
}

export function createSiteAgentLaunchGateway(
  dependencies: SiteAgentLaunchGatewayDependencies,
): SiteAgentLaunchGateway {
  const readLaunchRecords = dependencies.readLaunchRecords ?? readWorkspaceLaunchRecords;
  const launchCommand = dependencies.launchCommand ?? workspaceLaunchCommand;
  const attachWebUiCommand = dependencies.attachWebUiCommand ?? agentWebUiAttachCommand;
  const launchAdmission = dependencies.launchAdmission ?? createSiteAgentLaunchAdmission();
  const diagnostics = dependencies.diagnostics ?? createSiteAgentLaunchDiagnostics();
  const webUiAttachmentCleanups = new Map<string, () => Promise<void>>();
  const webUiAttachmentInFlight = new Map<string, Promise<WebUiAttachmentOutcome>>();

  async function failureResponse(
    request: SiteAgentLaunchRequest,
    requestId: string,
    phase: OperatorSiteAgentLaunchFailurePhase,
    code: string,
    error?: unknown,
    message?: string,
    context?: SiteAgentLaunchFailureContext,
    sessionId: string | null = null,
  ): Promise<OperatorSiteAgentLaunchWireResponse> {
    const recorded = await diagnostics.recordFailure({
      requestId,
      siteId: request.siteId,
      agentId: request.agentId,
      phase,
      code,
      error,
      message,
      context,
    });
    return response('failed', request, sessionId, code, requestId, recorded.failure);
  }

  async function ensureWebUiAttachment(
    request: SiteAgentLaunchRequest,
    sessionId: string,
  ): Promise<WebUiAttachmentOutcome> {
    if (webUiAttachmentCleanups.has(sessionId)) return { ok: true };
    const inFlight = webUiAttachmentInFlight.get(sessionId);
    if (inFlight) return inFlight;

    const attachment = (async (): Promise<WebUiAttachmentOutcome> => {
      try {
        const result = await attachWebUiCommand({
          session: sessionId,
          agent: request.agentId,
          site: request.siteId,
          format: 'json',
          open: false,
        }, silentCommandContext({}));
        if (result.exitCode !== 0) {
          return { ok: false, ...webUiAttachFailure(result.result) };
        }
        const cleanup = cleanupFromWebUiAttachResult(result.result);
        if (cleanup) webUiAttachmentCleanups.set(sessionId, cleanup);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          code: 'agent_web_ui_attach_exception',
          message: error instanceof Error ? error.message : String(error),
          error,
        };
      }
    })();
    webUiAttachmentInFlight.set(sessionId, attachment);
    try {
      return await attachment;
    } finally {
      webUiAttachmentInFlight.delete(sessionId);
    }
  }

  async function reuseHealthySession(
    request: SiteAgentLaunchRequest,
    requestId: string,
  ): Promise<OperatorSiteAgentLaunchWireResponse | null> {
    const overview = await dependencies.overview.read().catch(() => null);
    if (!overview || overview.status !== 'success') return null;
    const matches = overview.groups
      .flatMap((group) => group.sites)
      .filter((site) => site.site_id === request.siteId)
      .flatMap((site) => site.agents)
      .filter((candidate) => candidate.agent_id === request.agentId);
    const agent = matches.length === 1 ? matches[0] : null;
    if (!agent) return null;
    const selection = surfaceSelection(agent, request);
    if (selection.refusal) {
      return response(
        'refused',
        request,
        null,
        selection.refusal,
        requestId,
        null,
        selection.surface,
        handoffFor(selection.surface, 'reused', selection.message),
      );
    }
    const sessionId = agent.runtime.state === 'running' ? agent.runtime.selected_session_id : null;
    if (!sessionId) return null;
    if (selection.surface === 'agent-web-ui') {
      const attachment = await ensureWebUiAttachment(request, sessionId);
      if (!attachment.ok) {
        return failureResponse(
          request,
          requestId,
          'web_ui_attach',
          attachment.code,
          attachment.error,
          attachment.message,
          undefined,
          sessionId,
        );
      }
    }
    return response(
        'reused',
        request,
        sessionId,
        null,
        requestId,
        null,
        selection.surface,
        handoffFor(selection.surface, 'reused', selection.message),
      );
  }

  async function launchAdmitted(
    request: SiteAgentLaunchRequest,
    requestId: string,
  ): Promise<OperatorSiteAgentLaunchWireResponse> {
    let overview;
    try {
      overview = await dependencies.overview.read();
    } catch (error) {
      return failureResponse(request, requestId, 'overview_read', 'site_agent_overview_read_failed', error);
    }
    if (overview.status !== 'success') {
      return response('refused', request, null, 'site_agent_overview_refused', requestId);
    }
    const matches = overview.groups
      .flatMap((group) => group.sites)
      .filter((site) => site.site_id === request.siteId)
      .flatMap((site) => site.agents)
      .filter((candidate) => candidate.agent_id === request.agentId);
    if (matches.length > 1) return response('refused', request, null, 'duplicate_agent_identity', requestId);
    const agent = matches[0];
    if (!agent) return response('refused', request, null, 'agent_not_admitted_to_site', requestId);
    const selection = surfaceSelection(agent, request);
    if (selection.refusal) {
      return response(
        'refused',
        request,
        null,
        selection.refusal,
        requestId,
        null,
        selection.surface,
        handoffFor(selection.surface, 'reused'),
      );
    }
    if (agent.runtime.state === 'running' && agent.runtime.selected_session_id) {
      if (selection.surface === 'agent-web-ui') {
        const attachment = await ensureWebUiAttachment(request, agent.runtime.selected_session_id);
        if (!attachment.ok) {
          return failureResponse(
            request,
            requestId,
            'web_ui_attach',
            attachment.code,
            attachment.error,
            attachment.message,
            undefined,
            agent.runtime.selected_session_id,
          );
        }
      }
      return response(
        'reused',
        request,
        agent.runtime.selected_session_id,
        null,
        requestId,
        null,
        selection.surface,
        handoffFor(selection.surface, 'reused'),
      );
    }
    if (agent.runtime.state !== 'stopped') {
      return response('refused', request, null, `agent_runtime_${agent.runtime.state}`, requestId);
    }

    let launchLoad;
    try {
      launchLoad = await readLaunchRecords({ all: true });
    } catch (error) {
      return failureResponse(request, requestId, 'launch_record_read', 'launch_record_read_failed', error);
    }
    const launchRecord = launchLoad.records.find((record) =>
      record.site === request.siteId
      && `${record.site}.${record.agent_identity_ref.local_agent_id}` === request.agentId);
    if (!launchRecord) return response('refused', request, null, 'launch_record_not_found', requestId);

    let launch;
    try {
      launch = await launchCommand({
        agent: [launchRecord.agent],
        configPath: [launchRecord.config_path],
        format: 'json',
        suppressResultOutput: true,
        operatorSurface: selection.surface,
        resultPath: operatorConsoleWorkspaceResultPath(requestId),
      }, silentCommandContext({}));
    } catch (error) {
      return failureResponse(
        request,
        requestId,
        'workspace_launch',
        'workspace_launch_exception',
        error,
        undefined,
        workspaceLaunchFailureContext(error),
      );
    }
    if (launch.exitCode !== 0) {
      const details = launchResultFailure(launch.result);
      return failureResponse(
        request,
        requestId,
        'workspace_launch',
        details.code,
        details.error,
        details.message,
        { exit_code: launch.exitCode, workspace_result_path: details.workspaceResultPath },
      );
    }
    return response(
      'launched',
      request,
      sessionIdFromLaunchResult(launch.result),
      null,
      requestId,
      null,
      selection.surface,
      handoffFor(selection.surface, 'launched'),
    );
  }

  return {
    async launch(request): Promise<OperatorSiteAgentLaunchWireResponse> {
      const requestId = randomUUID();
      const existing = await reuseHealthySession(request, requestId);
      if (existing) return existing;
      const key = `${request.siteId.toLowerCase()}/${request.agentId.toLowerCase()}`;
      try {
        return await launchAdmission.run(key, () => launchAdmitted(request, requestId));
      } catch (error) {
        return failureResponse(request, requestId, 'admission', 'workspace_launch_admission_failed', error);
      }
    },
    async close(): Promise<void> {
      await Promise.allSettled([...webUiAttachmentInFlight.values()]);
      const cleanups = [...webUiAttachmentCleanups.values()];
      webUiAttachmentCleanups.clear();
      await Promise.allSettled(cleanups.map((cleanup) => cleanup()));
    },
  };
}
