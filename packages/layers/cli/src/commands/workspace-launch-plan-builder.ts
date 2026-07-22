import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { buildLaunchProcessOwnership, launchSessionIdFromToken } from '@narada2/launch-process-ownership';
import { NARADA_AGENT_RUNTIME_SERVER_KIND } from '@narada2/operator-surface-runtime-contract/operator-surface-runtime-selection';
import { createIntelligenceSelectionAuthority } from '@narada2/invokable-intelligence-contract';
import type {
  WorkspaceLaunchAgentPlan,
  WorkspaceLaunchOperatorProjectionOpenRequest,
  WorkspaceLaunchPlanOptions,
  WorkspaceLaunchRecord,
} from './workspace-launch-types.js';
import type { WorkspaceLaunchRegistryContext } from './workspace-launch-registry.js';
import {
  workspaceLaunchCommandArgv,
  workspaceLaunchNodeNaradaCommandSpec,
  workspaceLaunchPnpmNaradaCommandSpec,
  workspaceLaunchRuntimeCommandSpec,
  workspaceLaunchSmokeCommandSpec,
} from './workspace-launch-command-spec.js';
import { unique } from './workspace-launch-support.js';
import {
  workspaceLaunchPowerShellCommand,
  workspaceLaunchPowerShellHostMessage,
  workspaceLaunchRuntimeHandoffCommand,
  workspaceLaunchTerminalArgs,
  type WorkspaceLaunchTerminalTab,
} from './workspace-launch-terminal.js';
import { resolveWorkspaceLaunchSelection } from './workspace-launch-resolution.js';
import {
  buildWorkspaceLaunchCapabilityAdmission,
  buildWorkspaceLaunchPathProvenance,
  createWorkspaceLaunchTransaction,
  normalizeExplicitWorkspaceLaunchMcpScope,
  normalizeWorkspaceLaunchAuthority,
} from './workspace-launch-contracts.js';
import { WorkspaceLaunchContractError } from './workspace-launch-contracts.js';
import { workspaceLaunchProjectionReadinessPath } from './workspace-launch-process.js';

function normalizeMcpScope(value: string | undefined): string {
  return normalizeExplicitWorkspaceLaunchMcpScope(value, 'the Site/agent launch record or explicit launcher option');
}

function agentTuiAttachTerminalTab(record: WorkspaceLaunchRecord, naradaProper: string, launchBindingPath: string | null): WorkspaceLaunchTerminalTab {
  const agentDisplay = workspaceLaunchQualifiedAgentId(record);
  if (!launchBindingPath) throw new Error(`workspace_launch_agent_tui_launch_binding_required: ${agentDisplay}`);
  const tuiRoot = resolve(process.env.NARADA_AGENT_TUI_ROOT ?? join(naradaProper, '..', 'agent-tui'));
  const attachCommand = [
    'cargo',
    'run',
    '--manifest-path',
    join(tuiRoot, 'Cargo.toml'),
    '--bin',
    'narada-agent-tui',
    '--',
    '--launch-binding',
    launchBindingPath,
    '--identity',
    agentDisplay,
  ];
  return {
    title: `${agentDisplay} agent-tui`,
    cwd: tuiRoot,
    keepOpen: true,
    command: `${workspaceLaunchPowerShellHostMessage(`agent-tui: waiting for ${agentDisplay} NARS event endpoint`)}\n${workspaceLaunchPowerShellCommand(attachCommand)}`,
    command_argv: attachCommand,
    command_authority: 'projection_only',
  };
}

function agentPiTuiAttachTerminalTab(record: WorkspaceLaunchRecord, naradaProper: string, launchBindingPath: string | null): WorkspaceLaunchTerminalTab {
  const agentDisplay = workspaceLaunchQualifiedAgentId(record);
  if (!launchBindingPath) throw new Error(`workspace_launch_agent_pi_tui_launch_binding_required: ${agentDisplay}`);
  const piTuiRoot = resolve(join(naradaProper, 'packages', 'agent-pi-tui'));
  const attachCommand = [
    'pnpm',
    '--dir',
    piTuiRoot,
    'exec',
    'narada-agent-pi-tui',
    '--',
    '--launch-binding',
    launchBindingPath,
  ];
  return {
    title: `${agentDisplay} agent-pi-tui`,
    cwd: piTuiRoot,
    keepOpen: true,
    command: `${workspaceLaunchPowerShellHostMessage(`agent-pi-tui: waiting for ${agentDisplay} NARS event endpoint`)}\n${workspaceLaunchPowerShellCommand(attachCommand)}`,
    command_argv: attachCommand,
    command_authority: 'projection_only',
  };
}

function normalizeRuntimeAuthority(value: string | undefined | null): string {
  return normalizeWorkspaceLaunchAuthority(value);
}

export function buildAgentPlan(record: WorkspaceLaunchRecord, options: WorkspaceLaunchPlanOptions, context: WorkspaceLaunchRegistryContext): WorkspaceLaunchAgentPlan {
  // Identity is a launch invariant. Validate it before capability admission so a malformed
  // record cannot be reported as an unrelated provider or runtime refusal.
  const qualifiedAgentId = workspaceLaunchQualifiedAgentId(record);
  const operatorSurfaceSelection = resolveWorkspaceLaunchSelection(options.operatorSurface, record.operator_surface, 'operator_surface');
  const launchOperatorSurfaces = normalizeOperatorSurfaceList(operatorSurfaceSelection.value);
  const primaryOperatorSurfaceInput = launchOperatorSurfaces.includes('agent-cli') ? 'agent-cli' : launchOperatorSurfaces[0];
  const runtimeSelectionInput = resolveWorkspaceLaunchSelection(options.runtime, record.runtime, 'runtime');
  const runtimeSelection = context.admission.resolveOperatorSurfaceRuntimeSelection(primaryOperatorSurfaceInput, runtimeSelectionInput.value);
  const launchOperatorSurface = runtimeSelection.operator_surface_kind;
  const operatorSurfaceKind = runtimeSelection.operator_surface_kind;
  const launchRuntime = runtimeSelection.runtime_substrate_kind;
  const runtimeHostKind = runtimeSelection.runtime_host_kind;
  assertOperatorSurfaceRuntimeCoherence(launchOperatorSurfaces, launchRuntime, runtimeHostKind, context);
  const onboarding = options.onboarding === true;
  const enableNativeShell = options.enableNativeShell === true || record.enable_native_shell;
  const mcpScope = normalizeMcpScope(options.mcpScope ?? record.mcp_scope ?? undefined);
  const authority = normalizeRuntimeAuthority(options.authority ?? record.authority ?? undefined);
  const isNarsRuntimeHost = runtimeHostKind === NARADA_AGENT_RUNTIME_SERVER_KIND;
  const hasAgentTuiOperatorSurface = launchOperatorSurfaces.includes('agent-tui');
  const hasAgentWebUiOperatorSurface = launchOperatorSurfaces.includes('agent-web-ui');
  const hasAgentPiTuiOperatorSurface = launchOperatorSurfaces.includes('agent-pi-tui');
  const webUiOnly = hasAgentWebUiOperatorSurface
    && !launchOperatorSurfaces.includes('agent-cli')
    && !hasAgentTuiOperatorSurface;
  const waitForEnter = options.noWaitForEnterBeforeExec !== true && launchOperatorSurfaces[0] !== 'agent-web-ui' && !isNarsRuntimeHost;
  const intelligenceSelectionAuthority = createIntelligenceSelectionAuthority({
    siteId: record.site,
    storeKind: 'node:sqlite',
    catalogLocator: join(record.site_root, '.ai', 'intelligence-registry.db'),
  });
  const capabilityAdmission = buildWorkspaceLaunchCapabilityAdmission({
    operatorSurface: launchOperatorSurface,
    runtime: launchRuntime,
    mcpScope,
    authority,
  });
  const cloudflareApiBaseUrl = options.cloudflareApiBaseUrl?.trim()
    || process.env.NARADA_CLOUDFLARE_NARS_PROJECTION_URL
    || process.env.CLOUDFLARE_NARS_PROJECTION_URL
    || null;
  const naradaProper = resolve(process.env.NARADA_PROPER_ROOT ?? 'D:/code/narada');
  const launchSessionToken = workspaceLaunchSessionToken(record);
  const launchSessionId = launchSessionIdFromToken(launchSessionToken);
  // Every hidden NARS launch gets a durable binding. Web UI/TUI use it for
  // attachment; CLI-only launches use the same evidence for failure diagnosis
  // and later surface attachment.
  const launchBindingPath = isNarsRuntimeHost
    ? operatorProjectionLaunchBindingPath(record, launchSessionToken)
    : null;
  const runtimeWorkspaceRoot = record.workspace_root ?? record.narada_root;
  const processOwnership = launchSessionId
    ? buildLaunchProcessOwnership({
        launchSessionId,
        processRole: 'workspace_launch_plan',
        siteRoot: record.site_root,
        workspaceRoot: record.workspace_root ?? record.narada_root,
        createdByPid: process.pid,
      })
    : null;
  const runtimeStartCwd = record.workspace_root ?? record.narada_root;
  const runtimeCommandOptions = {
    operatorSurface: launchOperatorSurface,
    siteRoot: record.site_root,
    agent: record.agent,
    targetSiteId: record.site,
    runtime: launchRuntime,
    workspaceRoot: runtimeWorkspaceRoot,
    authority,
    mcpScope,
    enableNativeShell,
    launchBindingPath,
    launchSessionId,
    waitForEnter,
  };
  const runtimeCommandSpec = workspaceLaunchRuntimeCommandSpec(runtimeCommandOptions, 'execute');
  const operatorSurfaceStartCommandSpec = workspaceLaunchPnpmNaradaCommandSpec(naradaProper, runtimeCommandSpec);
  const hiddenRuntimeStartCommandSpec = workspaceLaunchNodeNaradaCommandSpec(naradaProper, runtimeCommandSpec);
  const operatorSurfaceStartCommand = workspaceLaunchCommandArgv(operatorSurfaceStartCommandSpec);
  const hiddenRuntimeStartCommand = workspaceLaunchCommandArgv(hiddenRuntimeStartCommandSpec);
  const selectionResolution = {
    schema: 'narada.workspace_launch.selection_resolution.v1' as const,
    operator_surfaces: {
      requested: operatorSurfaceSelection.requested,
      resolved: launchOperatorSurfaces,
      source: operatorSurfaceSelection.source,
    },
    runtime: {
      requested: runtimeSelectionInput.requested,
      resolved: launchRuntime,
      source: runtimeSelectionInput.source,
    },
    intelligence: intelligenceSelectionAuthority,
  };
  const runtimeStartExecutionMode: WorkspaceLaunchAgentPlan['runtime_start_execution_mode'] = isNarsRuntimeHost
    && options.visibleRuntimeTerminal !== true
    ? 'hidden_detached'
    : 'operator_terminal';

  const terminalTabs: WorkspaceLaunchTerminalTab[] = runtimeStartExecutionMode === 'operator_terminal' ? [{
      title: `${qualifiedAgentId} runtime`,
      cwd: runtimeStartCwd,
      keepOpen: waitForEnter,
      command: workspaceLaunchRuntimeHandoffCommand(operatorSurfaceStartCommand, qualifiedAgentId, waitForEnter),
      command_argv: operatorSurfaceStartCommand,
      command_authority: 'projection_only',
    }] : [];
  if (hasAgentTuiOperatorSurface) {
    terminalTabs.push(agentTuiAttachTerminalTab(record, naradaProper, launchBindingPath));
  }
  if (hasAgentPiTuiOperatorSurface) {
    terminalTabs.push(agentPiTuiAttachTerminalTab(record, naradaProper, launchBindingPath));
  }
  if (!webUiOnly && launchOperatorSurface === 'agent-web-ui') {
    terminalTabs.push(agentWebUiAttachTerminalTab(record, naradaProper, cloudflareApiBaseUrl, launchBindingPath, onboarding));
  }
  for (const extraOperatorSurface of launchOperatorSurfaces.filter((surface) => surface !== launchOperatorSurface)) {
    if (extraOperatorSurface === 'agent-web-ui') {
      terminalTabs.push(agentWebUiAttachTerminalTab(record, naradaProper, cloudflareApiBaseUrl, launchBindingPath, onboarding));
    } else if (extraOperatorSurface === 'agent-tui' && !hasAgentTuiOperatorSurface) {
      terminalTabs.push(agentTuiAttachTerminalTab(record, naradaProper, launchBindingPath));
    } else if (extraOperatorSurface === 'agent-pi-tui' && !hasAgentPiTuiOperatorSurface) {
      terminalTabs.push(agentPiTuiAttachTerminalTab(record, naradaProper, launchBindingPath));
    } else if (extraOperatorSurface !== 'agent-tui' && extraOperatorSurface !== 'agent-pi-tui') {
      throw new Error(`unsupported_multi_operator_surface_projection: ${extraOperatorSurface}`);
    }
  }
  const wtArgs = workspaceLaunchTerminalArgs(terminalTabs);
  const operatorProjectionStartCommand = webUiOnly
    ? agentWebUiAttachCommand(record, naradaProper, cloudflareApiBaseUrl, launchBindingPath, onboarding)
    : undefined;

  const smokeCommand = workspaceLaunchCommandArgv(workspaceLaunchSmokeCommandSpec(workspaceLaunchRuntimeCommandSpec({
    ...runtimeCommandOptions,
    waitForEnter: false,
  }, 'dry-run')));
  const operatorProjectionOpenRequests = launchOperatorSurfaces.includes('agent-web-ui')
    ? [plannedAgentWebUiProjectionOpenRequest(record)]
    : [];

  return {
    ...record,
    operator_surface: operatorSurfaceKind,
    operator_surface_kind: operatorSurfaceKind,
    runtime_host_kind: runtimeHostKind,
    launch_operator_surface: launchOperatorSurface,
    launch_operator_surfaces: launchOperatorSurfaces,
    launch_runtime_host: runtimeHostKind,
    launch_runtime_hosts: [runtimeHostKind],
    launch_runtime: launchRuntime,
    onboarding_mode: onboarding ? 'user-site' : null,
    launch_session_id: launchSessionId,
    process_ownership: processOwnership,
    intelligence_selection_authority: intelligenceSelectionAuthority,
    capability_admission: capabilityAdmission,
    path_provenance: buildWorkspaceLaunchPathProvenance(record),
    selection_resolution: selectionResolution,
    authority,
    wait_for_enter_before_exec: waitForEnter,
    runtime_start_execution_mode: runtimeStartExecutionMode,
    runtime_start_command: operatorSurfaceStartCommand,
    hidden_runtime_start_command: hiddenRuntimeStartCommand,
    ...(operatorProjectionStartCommand ? { operator_projection_start_command: operatorProjectionStartCommand } : {}),
    runtime_start_cwd: runtimeStartCwd,
    terminal_tabs: terminalTabs,
    transaction: createWorkspaceLaunchTransaction(launchSessionId),
    mcp_scope: mcpScope,
    enable_native_shell: enableNativeShell,
    wt_args: wtArgs,
    smoke_command: smokeCommand,
    operator_projection_launch_binding: launchBindingPath
      ? {
          schema: 'narada.operator_projection_launch_binding_ref.v1',
          path: launchBindingPath,
          exact_attach_required: true,
          lease: {
            schema: 'narada.operator_projection_attachment_lease.v1',
            launch_session_id: launchSessionId,
            binding_path: launchBindingPath,
            exact_session: true,
            exact_endpoint: true,
            endpoint_resolution: 'session_started.health_endpoint_and_events_endpoint',
          },
        }
      : null,
    operator_projection_open_requests: operatorProjectionOpenRequests,
  };
}

export function normalizeOperatorSurfaceList(value: string): string[] {
  const operatorSurfaces = value
    .split(',')
    .map((item) => nonEmpty(item))
    .filter((item): item is string => Boolean(item));
  if (operatorSurfaces.length === 0) throw new Error('workspace_launch_operator_surface_selection_empty');
  return unique(operatorSurfaces);
}

function workspaceLaunchSessionToken(record: WorkspaceLaunchRecord): string {
  const stamp = new Date().toISOString().replace(/[^0-9A-Za-z]+/g, '');
  return `${stamp}-${safePathToken(record.site)}-${safePathToken(record.role)}-${randomUUID()}`;
}

function operatorProjectionLaunchBindingPath(record: WorkspaceLaunchRecord, launchSessionToken: string): string {
  const root = record.workspace_root ?? record.narada_root;
  const name = `${launchSessionToken}.json`;
  return join(root, '.ai', 'runtime', 'operator-projection-launch-bindings', name);
}

function safePathToken(value: string): string {
  return value.replace(/[^0-9A-Za-z_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

function workspaceLaunchQualifiedAgentId(record: WorkspaceLaunchRecord): string {
  const canonical = record.agent_identity_ref?.canonical_agent_id;
  if (typeof canonical === 'string' && canonical.trim()) return canonical.trim();
  throw new Error(`workspace_launch_agent_identity_missing: ${record.agent}`);
}

function agentWebUiAttachTerminalTab(record: WorkspaceLaunchRecord, naradaProper: string, cloudflareApiBaseUrl: string | null, launchBindingPath: string | null, onboarding: boolean): WorkspaceLaunchTerminalTab {
  const agentDisplay = workspaceLaunchQualifiedAgentId(record);
  const attachCommand = agentWebUiAttachCommand(record, naradaProper, cloudflareApiBaseUrl, launchBindingPath, onboarding);
  return {
    title: `${agentDisplay} web ui`,
    cwd: record.workspace_root ?? record.narada_root,
    keepOpen: true,
    command: `${workspaceLaunchPowerShellHostMessage(`agent-web-ui: waiting for ${agentDisplay} launch binding, then starting browser projection`)}\n${workspaceLaunchPowerShellCommand(attachCommand)}`,
    command_argv: attachCommand,
    command_authority: 'projection_only',
  };
}

function agentWebUiAttachCommand(record: WorkspaceLaunchRecord, naradaProper: string, cloudflareApiBaseUrl: string | null, launchBindingPath: string | null, onboarding: boolean): string[] {
  const agentDisplay = workspaceLaunchQualifiedAgentId(record);
  if (!launchBindingPath) throw new Error(`workspace_launch_web_ui_launch_binding_required: ${agentDisplay}`);
  const attachCommand = [
    'pnpm',
    '--dir', naradaProper,
    'exec',
    'narada',
    'agent-web-ui',
    'attach',
    '--site-root', record.site_root,
    '--launch-binding', launchBindingPath,
    '--ready-file', workspaceLaunchProjectionReadinessPath(launchBindingPath),
    '--wait-for-session-ms', '60000',
    '--open',
  ];
  if (onboarding) attachCommand.push('--onboarding');
  if (cloudflareApiBaseUrl) attachCommand.push('--cloudflare-api-base-url', cloudflareApiBaseUrl);
  return attachCommand;
}

function plannedAgentWebUiProjectionOpenRequest(record: WorkspaceLaunchRecord): WorkspaceLaunchOperatorProjectionOpenRequest {
  return {
    schema: 'narada.operator_projection_open_request.v1',
    status: 'planned',
    projection_kind: 'browser_url',
    target_ref: null,
    target_ref_resolution: 'agent-web-ui attach resolves local URL after NARS session attach and server start',
    purpose: 'agent_web_ui_attach',
    caller: { package: '@narada2/cli', command: 'workspace launch', module: 'commands/launcher' },
    mode: 'execute',
    policy: { allow_visible_host_effect: true, suppress_reason: null },
    mutation_performed: false,
    launch_agent: record.agent,
    launch_site: record.site,
  };
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function quoteShArgument(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function assertOperatorSurfaceRuntimeCoherence(
  operatorSurfaces: string[],
  runtime: string,
  runtimeHost: string,
  context: WorkspaceLaunchRegistryContext,
): void {
  for (const operatorSurface of operatorSurfaces) {
    try {
      const selection = context.admission.resolveOperatorSurfaceRuntimeSelection(operatorSurface, runtime);
      if (selection.runtime_substrate_kind === runtime && selection.runtime_host_kind === runtimeHost) continue;
    } catch {
      // Normalize every incompatible sibling surface to one launcher-level refusal.
    }
    throw new WorkspaceLaunchContractError(
      'workspace_launch_operator_surface_runtime_mismatch',
      `Operator surface ${operatorSurface} is not admitted on runtime ${runtime} with host ${runtimeHost}.`,
      'Select operator surfaces that share one admitted runtime substrate and runtime host.',
    );
  }
}
