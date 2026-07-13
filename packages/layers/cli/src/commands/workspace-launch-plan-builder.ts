import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { buildLaunchProcessOwnership, launchSessionIdFromToken } from '@narada2/launch-process-ownership';
import type { WorkspaceLaunchAgentPlan, WorkspaceLaunchPlanOptions, WorkspaceLaunchRecord } from './workspace-launch-types.js';
import type { WorkspaceLaunchRegistryContext } from './workspace-launch-registry.js';
import { unique } from './workspace-launch-support.js';

function normalizeMcpScope(value: string | undefined): string {
  const normalized = String(value ?? 'all').trim().toLowerCase();
  if (['all', 'host', 'user-site', 'local-site', 'none'].includes(normalized)) return normalized;
  throw new Error(`mcp_scope_not_admitted: ${normalized}. Admitted scopes: all, host, user-site, local-site, none`);
}

function normalizeRuntimeAuthority(value: string | undefined | null): string {
  const normalized = String(value ?? 'auto').trim().toLowerCase();
  if (['auto', 'read', 'write'].includes(normalized)) return normalized;
  throw new Error(`runtime_authority_not_admitted: ${normalized}. Admitted values: auto, read, write`);
}

export function buildAgentPlan(record: WorkspaceLaunchRecord, options: WorkspaceLaunchPlanOptions, context: WorkspaceLaunchRegistryContext): WorkspaceLaunchAgentPlan {
  const operatorSurfaceInput = options.operatorSurface ?? record.operator_surface;
  const launchCarriers = normalizeCarrierList(operatorSurfaceInput);
  const primaryCarrierInput = launchCarriers.includes('agent-cli') ? 'agent-cli' : launchCarriers[0] ?? operatorSurfaceInput;
  const runtimeInput = options.runtime ?? record.runtime;
  const carrierRuntimeSelection = context.resolveCarrierRuntimeSelection(primaryCarrierInput, runtimeInput);
  const launchCarrier = carrierRuntimeSelection.carrier_kind;
  const operatorSurfaceKind = carrierRuntimeSelection.operator_surface_kind;
  const launchRuntime = carrierRuntimeSelection.runtime_substrate_kind;
  const runtimeHostKind = carrierRuntimeSelection.runtime_host_kind;
  const onboarding = options.onboarding === true;
  const enableNativeShell = options.enableNativeShell === true || record.enable_native_shell;
  const mcpScope = normalizeMcpScope(options.mcpScope ?? record.mcp_scope ?? undefined);
  const authority = normalizeRuntimeAuthority(options.authority ?? record.authority ?? undefined);
  const isNarsRuntimeHost = runtimeHostKind === 'narada-agent-runtime-server';
  const waitForEnter = options.noWaitForEnterBeforeExec !== true && launchCarriers[0] !== 'agent-web-ui' && !isNarsRuntimeHost;
  const isNarsOperatorSurface = launchCarrier === 'agent-cli' || launchCarrier === 'agent-web-ui';
  const intelligenceProvider = isNarsOperatorSurface
    ? (options.intelligenceProvider ?? context.providerRegistry.default_provider ?? null)
    : null;
  const cloudflareApiBaseUrl = options.cloudflareApiBaseUrl?.trim()
    || process.env.NARADA_CLOUDFLARE_NARS_PROJECTION_URL
    || process.env.CLOUDFLARE_NARS_PROJECTION_URL
    || null;
  const naradaProper = resolve(process.env.NARADA_PROPER_ROOT ?? 'D:/code/narada');
  const launchSessionToken = workspaceLaunchSessionToken(record);
  const launchSessionId = launchSessionIdFromToken(launchSessionToken);
  const launchBindingPath = launchCarriers.includes('agent-web-ui')
    ? operatorProjectionLaunchBindingPath(record, launchSessionToken)
    : null;
  const processOwnership = launchSessionId
    ? buildLaunchProcessOwnership({
        launchSessionId,
        processRole: 'workspace_launch_plan',
        siteRoot: record.site_root,
        workspaceRoot: record.workspace_root ?? record.narada_root,
        createdByPid: process.pid,
      })
    : null;
  const qualifiedAgentId = workspaceLaunchQualifiedAgentId(record);
  const runtimeStartArguments = [
    'operator-surface',
    'runtime',
    'start', launchCarrier,
    '--site-root', record.site_root,
    '--agent', record.agent,
    '--target-site-id', record.site,
    '--runtime', launchRuntime,
    '--exec',
    '--format', 'human',
  ];
  const operatorSurfaceStartCommand = [
    'pnpm',
    '--dir', naradaProper,
    'exec',
    'narada',
    ...runtimeStartArguments,
  ];
  if (record.workspace_root) operatorSurfaceStartCommand.push('--workspace-root', record.workspace_root);
  if (enableNativeShell) operatorSurfaceStartCommand.push('--enable-native-shell');
  operatorSurfaceStartCommand.push('--authority', authority);
  if (intelligenceProvider) operatorSurfaceStartCommand.push('--intelligence-provider', intelligenceProvider);
  operatorSurfaceStartCommand.push('--mcp-scope', mcpScope);
  if (launchBindingPath) operatorSurfaceStartCommand.push('--launch-binding', launchBindingPath);
  if (!launchBindingPath) operatorSurfaceStartCommand.push('--launch-session-id', launchSessionId ?? '');
  if (waitForEnter) operatorSurfaceStartCommand.push('--wait');
  const hiddenRuntimeStartCommand = [
    process.execPath,
    join(naradaProper, 'packages', 'layers', 'cli', 'dist', 'main.js'),
    ...operatorSurfaceStartCommand.slice(5),
  ];
  const runtimeStartExecutionMode: WorkspaceLaunchAgentPlan['runtime_start_execution_mode'] = isNarsRuntimeHost
    ? 'hidden_detached'
    : 'operator_terminal';
  const runtimeStartCwd = record.workspace_root ?? record.narada_root;

  const base = [
    'new-tab',
    '--title', `${qualifiedAgentId} runtime`,
    '-d', runtimeStartCwd,
    'pwsh',
    waitForEnter ? '-NoExit' : '-NoProfile',
    '-Command',
    toPowerShellCommand(operatorSurfaceStartCommand),
  ];
  const wtArgs = [...base];
  if (launchCarrier === 'agent-web-ui') {
    wtArgs.push(';', ...agentWebUiAttachWtArgs(record, naradaProper, cloudflareApiBaseUrl, launchBindingPath, onboarding));
  }
  for (const extraCarrier of launchCarriers.filter((carrier) => carrier !== launchCarrier)) {
    if (extraCarrier !== 'agent-web-ui') {
      throw new Error(`unsupported_multi_carrier_projection: ${extraCarrier}`);
    }
    wtArgs.push(';', ...agentWebUiAttachWtArgs(record, naradaProper, cloudflareApiBaseUrl, launchBindingPath, onboarding));
  }

  const smokeCommand = [
    'narada', 'operator-surface', 'runtime', 'start', launchCarrier,
    '--site-root', record.site_root,
    '--agent', record.agent,
    '--target-site-id', record.site,
    '--runtime', launchRuntime,
    '--dry-run',
    '--format', 'json',
  ];
  if (record.workspace_root) smokeCommand.push('--workspace-root', record.workspace_root);
  smokeCommand.push('--authority', authority);
  if (intelligenceProvider) smokeCommand.push('--intelligence-provider', intelligenceProvider);
  if (enableNativeShell) smokeCommand.push('--enable-native-shell');
  smokeCommand.push('--mcp-scope', mcpScope);
  if (launchBindingPath) smokeCommand.push('--launch-binding', launchBindingPath);
  if (!launchBindingPath) smokeCommand.push('--launch-session-id', launchSessionId ?? '');
  const operatorProjectionOpenRequests = launchCarriers.includes('agent-web-ui')
    ? [plannedAgentWebUiProjectionOpenRequest(record)]
    : [];

  return {
    ...record,
    operator_surface: operatorSurfaceKind,
    carrier: launchCarrier,
    operator_surface_kind: operatorSurfaceKind,
    runtime_host_kind: runtimeHostKind,
    launch_operator_surface: launchCarrier,
    launch_operator_surfaces: launchCarriers,
    launch_runtime_host: runtimeHostKind,
    launch_runtime_hosts: [runtimeHostKind],
    launch_carrier: launchCarrier,
    launch_runtime: launchRuntime,
    launch_carriers: launchCarriers,
    onboarding_mode: onboarding ? 'user-site' : null,
    launch_session_id: launchSessionId,
    process_ownership: processOwnership as Record<string, unknown> | null,
    intelligence_provider: intelligenceProvider,
    authority,
    wait_for_enter_before_exec: waitForEnter,
    runtime_start_execution_mode: runtimeStartExecutionMode,
    runtime_start_command: operatorSurfaceStartCommand,
    hidden_runtime_start_command: hiddenRuntimeStartCommand,
    runtime_start_cwd: runtimeStartCwd,
    mcp_scope: mcpScope,
    enable_native_shell: enableNativeShell,
    wt_args: wtArgs,
    smoke_command: smokeCommand,
    operator_projection_launch_binding: launchBindingPath
      ? {
          schema: 'narada.operator_projection_launch_binding_ref.v1',
          path: launchBindingPath,
          exact_attach_required: true,
        }
      : null,
    operator_projection_open_requests: operatorProjectionOpenRequests,
  };
}

export function normalizeCarrierList(value: string | undefined): string[] {
  const carriers = String(value ?? 'agent-cli')
    .split(',')
    .map((item) => nonEmpty(item))
    .filter((item): item is string => Boolean(item));
  return unique(carriers.length > 0 ? carriers : ['agent-cli']);
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
  const localAgentId = record.agent_identity_ref?.local_agent_id
    ?? record.agent.split('.').filter(Boolean).at(-1)
    ?? record.agent;
  const identityScope = record.agent_identity_ref?.identity_scope;
  const siteId = identityScope?.kind === 'narada_site' ? identityScope.site_id : record.site;
  return record.agent.includes('.') || !siteId ? record.agent : `${siteId}.${localAgentId}`;
}

function agentWebUiAttachWtArgs(record: WorkspaceLaunchRecord, naradaProper: string, cloudflareApiBaseUrl: string | null, launchBindingPath: string | null, onboarding: boolean): string[] {
  const agentDisplay = workspaceLaunchQualifiedAgentId(record);
  const attachCommand = [
    'pnpm',
    '--dir', naradaProper,
    'exec',
    'narada',
    'agent-web-ui',
    'attach',
    '--site-root', record.site_root,
    ...(launchBindingPath ? ['--launch-binding', launchBindingPath] : ['--agent', record.agent]),
    '--wait-for-session-ms', '60000',
    '--open',
  ];
  if (onboarding) attachCommand.push('--onboarding');
  if (cloudflareApiBaseUrl) attachCommand.push('--cloudflare-api-base-url', cloudflareApiBaseUrl);
  const prelude = `Write-Host ${quotePowerShellArgument(`agent-web-ui: waiting for ${agentDisplay} launch binding, then starting browser projection`)}`;
  return [
    'new-tab',
    '--title', `${agentDisplay} web ui`,
    '-d', record.workspace_root ?? record.narada_root,
    'pwsh',
    '-NoExit',
    '-Command',
    `${prelude}\n${toPowerShellCommand(attachCommand)}`,
  ];
}

function plannedAgentWebUiProjectionOpenRequest(record: WorkspaceLaunchRecord): Record<string, unknown> {
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

function toPowerShellCommand(args: string[]): string {
  return `& ${args.map(quotePowerShellArgument).join(' ')}`;
}

function quotePowerShellArgument(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function quoteShArgument(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
