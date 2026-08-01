import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import {
  ADMITTED_RUNTIME_SUBSTRATE_KINDS,
  NARADA_AGENT_RUNTIME_SERVER_KIND,
  normalizeRuntimeAlias,
  operatorSurfaceKindsForRuntimeHost,
  resolveOperatorSurfaceRuntimeSelection,
} from '@narada-core/operator-surface-runtime-contract/operator-surface-runtime-selection';
import { loadIntelligenceLaunchContext } from '@narada-core/agent-start/intelligence-launch-context';
import { createIntelligenceSelectionAuthority } from '@narada-core/invokable-intelligence-contract';
import type {
  OperatorSiteAgentAdmissionChoice,
  OperatorSiteAgentAdmissionOptionsWireResponse,
  OperatorSiteAgentAdmissionWireRequest,
  OperatorSiteAgentAdmissionWireResponse,
  OperatorSiteAgentIntelligenceSelectionAuthority,
} from '@narada-core/operator-console-contract';
import { silentCommandContext } from '../lib/command-wrapper.js';
import { operatorSurfaceIdentityAddCommand } from './operator-surface.js';
import {
  readWorkspaceLaunchRecords,
  type RawAgentRecord,
} from './workspace-launch-registry.js';
import type { WorkspaceLaunchRecord } from './workspace-launch-types.js';

const ADMITTED_ROLES = Object.freeze(['architect', 'builder', 'observer']);
const ADMITTED_AGENT_KINDS = Object.freeze(['cli-coding-agent', 'codex_cli', 'named_agent']);
const ADMITTED_INTELLIGENCE_POLICIES = Object.freeze(['catalog-and-materialized-policy']);
const ADMITTED_OPERATOR_SURFACES = Object.freeze(
  operatorSurfaceKindsForRuntimeHost(NARADA_AGENT_RUNTIME_SERVER_KIND)
    .filter((kind) => kind === 'agent-web-ui' || kind === 'agent-cli' || kind === 'agent-tui'),
);

export interface SiteAgentAdmissionGateway {
  options(siteId: string): Promise<OperatorSiteAgentAdmissionOptionsWireResponse>;
  admit(request: OperatorSiteAgentAdmissionWireRequest): Promise<OperatorSiteAgentAdmissionWireResponse>;
}

interface LaunchRegistryWriteResult {
  rollback?: () => Promise<void>;
}

interface IntelligenceSelectionChoices {
  provider_choices: readonly string[];
  model_choices: readonly string[];
}

interface SiteAgentAdmissionLoad {
  siteId: string;
  template: WorkspaceLaunchRecord;
  records: WorkspaceLaunchRecord[];
  revision: string;
}

export interface SiteAgentAdmissionGatewayDependencies {
  readLaunchRecords?: typeof readWorkspaceLaunchRecords;
  writeLaunchRecord?: (configPath: string, record: RawAgentRecord) => Promise<LaunchRegistryWriteResult | void>;
  addSurfaceIdentity?: typeof operatorSurfaceIdentityAddCommand;
  readSelectionChoices?: (options: { siteRoot: string; registryDbPath?: string }) => Promise<IntelligenceSelectionChoices>;
  resolveRegistryDbPath?: (template: WorkspaceLaunchRecord) => string;
  now?: () => Date;
  operatorPrincipal?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function choice(value: string, label = value): OperatorSiteAgentAdmissionChoice {
  return { value, label };
}

function choices(values: readonly string[]): OperatorSiteAgentAdmissionChoice[] {
  return values.map((value) => choice(value));
}

function selectionAuthority(
  template: WorkspaceLaunchRecord,
  registryDbPath: string,
): OperatorSiteAgentIntelligenceSelectionAuthority {
  const authority = createIntelligenceSelectionAuthority({
    siteId: template.site,
    storeKind: 'node:sqlite',
    catalogLocator: registryDbPath,
  });
  return {
    ...authority,
    authoritative_inputs: [...authority.authoritative_inputs],
  };
}

function registryDbPathFromLaunchContext(template: WorkspaceLaunchRecord): string {
  const userSiteRoot = resolve(process.env.NARADA_USER_SITE_ROOT ?? join(homedir(), 'Narada'));
  const defaultRegistryDbPath = join(template.site_root, '.ai', 'intelligence-registry.db');
  const context = loadIntelligenceLaunchContext({
    targetSiteId: template.site,
    sessionSiteRoot: template.site_root,
    userSiteRoot,
    registryDbPath: defaultRegistryDbPath,
  });
  return context.registry_db_path;
}

function revisionFor(records: readonly WorkspaceLaunchRecord[]): string {
  const material = records.map((record) => ({
    agent: record.agent,
    role: record.role,
    site: record.site,
    config_path: record.config_path,
    launcher_path: record.launcher_path,
    operator_surface: record.operator_surface,
    runtime: record.runtime,
  }));
  return createHash('sha256').update(JSON.stringify(material)).digest('hex').slice(0, 24);
}

function matchingSite(record: WorkspaceLaunchRecord, siteId: string): boolean {
  const requested = siteId.trim().toLowerCase();
  return record.site.toLowerCase() === requested
    || record.legacy_site?.toLowerCase() === requested;
}

function refusedOptions(siteId: string, reason: string): OperatorSiteAgentAdmissionOptionsWireResponse {
  return {
    schema: 'narada.operator_console.site_agent_admission_options.v1',
    status: 'refused',
    generated_at: new Date().toISOString(),
    site_id: siteId,
    site_display_name: null,
    revision: null,
    roles: [],
    agent_kinds: [],
    runtimes: [],
    operator_surfaces: [],
    intelligence: {
      selection_authority: null,
      policy_choices: [],
      provider_choices: [],
      model_choices: [],
    },
    refusals: [reason],
  };
}

function admissionResponse(
  request: OperatorSiteAgentAdmissionWireRequest,
  input: Partial<OperatorSiteAgentAdmissionWireResponse> & {
    status: OperatorSiteAgentAdmissionWireResponse['status'];
    requestId: string;
  },
): OperatorSiteAgentAdmissionWireResponse {
  return {
    schema: 'narada.operator_console.site_agent_admission.v1',
    status: input.status,
    site_id: request.site_id,
    agent_id: input.agent_id ?? null,
    local_agent_id: input.local_agent_id ?? null,
    role: input.role ?? text(request.role),
    agent_kind: input.agent_kind ?? text(request.agent_kind),
    runtime: input.runtime ?? text(request.runtime),
    operator_surface: input.operator_surface ?? text(request.operator_surface),
    reason: input.reason ?? null,
    message: input.message ?? null,
    request_id: input.requestId,
    options_revision: input.options_revision ?? text(request.options_revision),
    intelligence: input.intelligence ?? {
      selection_authority: null,
      policy: text(request.intelligence_policy),
      provider: text(request.provider),
      model: text(request.model),
    },
  };
}

function normalizedRole(value: string): string | null {
  const role = value.trim().toLowerCase();
  return (ADMITTED_ROLES as readonly string[]).includes(role) ? role : null;
}

function normalizedAgentKind(value: string): string | null {
  const kind = value.trim();
  return (ADMITTED_AGENT_KINDS as readonly string[]).includes(kind) ? kind : null;
}

function identityFor(siteId: string, role: string): { agentId: string; localAgentId: string } {
  const localAgentId = role.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return { localAgentId, agentId: `${siteId}.${localAgentId}` };
}

function rawLaunchRegistryString(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

const LAUNCH_REGISTRY_FIELDS = [
  'Agent',
  'Title',
  'Role',
  'Site',
  'NaradaRoot',
  'SiteRoot',
  'WorkspaceRoot',
  'Launcher',
  'LauncherPath',
  'OperatorSurface',
  'Runtime',
  'Authority',
  'McpScope',
] as const;

function renderAgentBlock(agent: RawAgentRecord): string[] {
  const lines = ['    @{'];
  for (const field of LAUNCH_REGISTRY_FIELDS) {
    const value = agent[field];
    if (typeof value === 'string' && value.length > 0) {
      lines.push(`      ${field} = ${rawLaunchRegistryString(value)}`);
    }
  }
  lines.push(`      EnableNativeShell = ${agent.EnableNativeShell === true ? '$true' : '$false'}`);
  lines.push('    }');
  return lines;
}

function appendPsd1Agent(textValue: string, agent: RawAgentRecord): string {
  const openMatch = /(^|\n)[ \t]*Agents[ \t]*=[ \t]*@\([ \t]*(\r?\n|$)/.exec(textValue);
  if (!openMatch) throw new Error('launch_registry_agents_array_not_found');
  const searchFrom = openMatch.index + openMatch[0].length;
  const closeMatch = /(^|\n)([ \t]*\)[ \t]*(\r?\n|$))/.exec(textValue.slice(searchFrom));
  if (!closeMatch) throw new Error('launch_registry_agents_array_not_found');
  const lineEnding = textValue.includes('\r\n') ? '\r\n' : '\n';
  const insertAt = searchFrom + closeMatch.index + (closeMatch[1] ? closeMatch[1].length : 0);
  const insertion = `${renderAgentBlock(agent).join(lineEnding)}${lineEnding}`;
  return `${textValue.slice(0, insertAt)}${insertion}${textValue.slice(insertAt)}`;
}

function appendJsonAgent(textValue: string, agent: RawAgentRecord): string {
  const parsed = JSON.parse(textValue) as Record<string, unknown>;
  const existing = Array.isArray(parsed.Agents) ? parsed.Agents : parsed.Agents ? [parsed.Agents] : [];
  return `${JSON.stringify({ ...parsed, Agents: [...existing, agent] }, null, 2)}\n`;
}

async function atomicWriteText(path: string, value: string): Promise<void> {
  const temporary = `${path}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(temporary, value, 'utf8');
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function writeLaunchRecord(configPath: string, agent: RawAgentRecord): Promise<LaunchRegistryWriteResult> {
  if (!existsSync(configPath)) throw new Error(`launch_registry_missing: ${configPath}`);
  const previous = await readFile(configPath, 'utf8');
  const next = configPath.toLowerCase().endsWith('.json')
    ? appendJsonAgent(previous, agent)
    : appendPsd1Agent(previous, agent);
  await atomicWriteText(configPath, next);
  return { rollback: () => atomicWriteText(configPath, previous) };
}

function optionLabels(values: readonly string[]): OperatorSiteAgentAdmissionChoice[] {
  return values.map((value) => choice(value, value));
}

export function createSiteAgentAdmissionGateway(
  dependencies: SiteAgentAdmissionGatewayDependencies = {},
): SiteAgentAdmissionGateway {
  const readLaunchRecords = dependencies.readLaunchRecords ?? readWorkspaceLaunchRecords;
  const writeRecord = dependencies.writeLaunchRecord ?? writeLaunchRecord;
  const addSurfaceIdentity = dependencies.addSurfaceIdentity ?? operatorSurfaceIdentityAddCommand;
  const readSelectionChoices: NonNullable<SiteAgentAdmissionGatewayDependencies['readSelectionChoices']> = dependencies.readSelectionChoices ?? (async (input: { siteRoot: string; registryDbPath?: string }): Promise<IntelligenceSelectionChoices> => {
    const runtime = await import('@narada-core/agent-runtime-server/local-intelligence-runtime');
    const selection = await runtime.readLocalIntelligenceSelectionChoices(input);
    return {
      provider_choices: selection.provider_choices.map((value: unknown) => String(value)),
      model_choices: selection.model_choices.map((value: unknown) => String(value)),
    };
  });
  const resolveRegistryDbPath = dependencies.resolveRegistryDbPath ?? registryDbPathFromLaunchContext;
  const now = dependencies.now ?? (() => new Date());
  const operatorPrincipal = dependencies.operatorPrincipal ?? 'operator-console';

  async function load(siteIdInput: string): Promise<SiteAgentAdmissionLoad> {
    const siteId = siteIdInput.trim();
    if (!siteId) throw new Error('site_id_required');
    const launch = await readLaunchRecords({ all: true });
    const records = launch.records.filter((record) => matchingSite(record, siteId));
    const template = records[0];
    if (!template) throw new Error(`site_agent_admission_template_missing:${siteId}`);
    return {
      siteId: template.site,
      template,
      records,
      revision: revisionFor(records),
    };
  }

  async function options(siteId: string): Promise<OperatorSiteAgentAdmissionOptionsWireResponse> {
    try {
      const loaded = await load(siteId);
      const registryDbPath = resolveRegistryDbPath(loaded.template);
      const authority = selectionAuthority(loaded.template, registryDbPath);
      const selection = await readSelectionChoices({
        siteRoot: loaded.template.site_root,
        registryDbPath,
      });
      return {
        schema: 'narada.operator_console.site_agent_admission_options.v1',
        status: 'success',
        generated_at: now().toISOString(),
        site_id: loaded.siteId,
        site_display_name: loaded.siteId,
        revision: loaded.revision,
        roles: choices(ADMITTED_ROLES),
        agent_kinds: choices(ADMITTED_AGENT_KINDS),
        runtimes: optionLabels([normalizeRuntimeAlias(loaded.template.runtime)]),
        operator_surfaces: optionLabels(ADMITTED_OPERATOR_SURFACES),
        intelligence: {
          selection_authority: authority,
          policy_choices: optionLabels(ADMITTED_INTELLIGENCE_POLICIES),
          provider_choices: optionLabels(selection.provider_choices),
          model_choices: optionLabels(selection.model_choices),
        },
        refusals: [],
      };
    } catch (error) {
      return refusedOptions(siteId.trim(), error instanceof Error ? error.message : String(error));
    }
  }

  async function admit(request: OperatorSiteAgentAdmissionWireRequest): Promise<OperatorSiteAgentAdmissionWireResponse> {
    const requestId = `admit_${randomUUID()}`;
    const siteId = text(request.site_id);
    if (!siteId) {
      return admissionResponse(request, {
        status: 'refused',
        requestId,
        reason: 'site_id_required',
        message: 'A Site is required.',
      });
    }
    try {
      const offered = await options(siteId);
      if (offered.status !== 'success' || !offered.revision || !offered.intelligence.selection_authority) {
        return admissionResponse(request, {
          status: 'refused',
          requestId,
          reason: offered.refusals[0] ?? 'admission_options_unavailable',
          message: 'This Site does not currently have an authoritative admission catalog.',
        });
      }
      if (text(request.options_revision) !== offered.revision) {
        return admissionResponse(request, {
          status: 'refused',
          requestId,
          reason: text(request.options_revision) ? 'admission_options_stale' : 'admission_options_revision_required',
          message: 'Refresh the Site admission options before submitting this agent.',
        });
      }
      const loaded = await load(siteId);
      if (loaded.revision !== offered.revision) {
        return admissionResponse(request, {
          status: 'refused',
          requestId,
          reason: 'admission_options_stale',
          message: 'The Site changed while the admission request was being validated. Refresh and retry.',
        });
      }

      const role = normalizedRole(text(request.role) ?? '');
      const agentKind = normalizedAgentKind(text(request.agent_kind) ?? '');
      const runtime = text(request.runtime);
      const operatorSurface = text(request.operator_surface);
      const policy = text(request.intelligence_policy) ?? ADMITTED_INTELLIGENCE_POLICIES[0];
      const provider = text(request.provider) ?? offered.intelligence.provider_choices[0]?.value ?? null;
      const model = text(request.model) ?? offered.intelligence.model_choices[0]?.value ?? null;
      if (!role || !agentKind || !runtime || !operatorSurface) {
        return admissionResponse(request, {
          status: 'refused',
          requestId,
          reason: 'admission_field_required_or_unsupported',
          message: 'Role, agent kind, runtime, and operator surface must be selected from the authoritative options.',
        });
      }
      const runtimeSelection = resolveOperatorSurfaceRuntimeSelection({
        operatorSurfaceValue: operatorSurface,
        runtimeValue: runtime,
        admittedRuntimeSubstrateKinds: [...ADMITTED_RUNTIME_SUBSTRATE_KINDS],
        runtimeContractSchema: 'narada.runtime_substrate_kind.v1',
      });
      if (runtimeSelection.status === 'refused'
        || !offered.runtimes.some((candidate) => candidate.value === runtime)
        || !offered.operator_surfaces.some((candidate) => candidate.value === operatorSurface)
        || !operatorSurfaceKindsForRuntimeHost(runtimeSelection.runtime_host_kind).includes(operatorSurface)) {
        return admissionResponse(request, {
          status: 'refused',
          requestId,
          reason: 'admission_runtime_or_surface_not_admitted',
          message: 'The requested runtime and operator surface are not an admitted combination.',
        });
      }
      if (!offered.roles.some((candidate) => candidate.value === role)
        || !offered.agent_kinds.some((candidate) => candidate.value === agentKind)
        || !offered.intelligence.policy_choices.some((candidate) => candidate.value === policy)
        || (provider !== null && !offered.intelligence.provider_choices.some((candidate) => candidate.value === provider))
        || (model !== null && !offered.intelligence.model_choices.some((candidate) => candidate.value === model))) {
        return admissionResponse(request, {
          status: 'refused',
          requestId,
          reason: 'admission_choice_not_authoritative',
          message: 'One or more submitted choices are not present in the current Site admission catalog.',
        });
      }

      const identity = identityFor(loaded.siteId, role);
      if (loaded.records.some((record) => record.agent.toLowerCase() === identity.agentId.toLowerCase())) {
        return admissionResponse(request, {
          status: 'refused',
          requestId,
          reason: 'agent_identity_duplicate',
          message: `The ${role} identity is already admitted for this Site.`,
        });
      }

      const rawAgent: RawAgentRecord = {
        Agent: identity.agentId,
        Title: role[0].toUpperCase() + role.slice(1),
        Role: role,
        Site: loaded.siteId,
        NaradaRoot: loaded.template.narada_root,
        SiteRoot: loaded.template.site_root,
        ...(loaded.template.workspace_root ? { WorkspaceRoot: loaded.template.workspace_root } : {}),
        Launcher: basename(loaded.template.launcher_path),
        LauncherPath: loaded.template.launcher_path,
        OperatorSurface: operatorSurface,
        Runtime: runtime,
        ...(loaded.template.authority ? { Authority: loaded.template.authority } : {}),
        ...(loaded.template.mcp_scope ? { McpScope: loaded.template.mcp_scope } : {}),
        EnableNativeShell: loaded.template.enable_native_shell,
      };
      const written = await writeRecord(loaded.template.config_path, rawAgent);
      const identityResult = await addSurfaceIdentity({
        cwd: loaded.template.site_root,
        identityName: identity.agentId,
        role,
        agentKind,
        site: loaded.siteId,
        label: rawAgent.Title,
        by: operatorPrincipal,
        submitStrategy: 'type_only',
        format: 'json',
      }, silentCommandContext());
      if (identityResult.exitCode !== 0) {
        await written?.rollback?.();
        const result = isRecord(identityResult.result) ? identityResult.result : {};
        return admissionResponse(request, {
          status: 'failed',
          requestId,
          reason: 'operator_surface_identity_admission_failed',
          message: text(result.error) ?? 'The operator-surface identity could not be admitted.',
        });
      }
      return admissionResponse(request, {
        status: 'admitted',
        requestId,
        agent_id: identity.agentId,
        local_agent_id: identity.localAgentId,
        role,
        agent_kind: agentKind,
        runtime,
        operator_surface: operatorSurface,
        reason: null,
        message: 'Agent admitted to the Site. Launch remains a separate operator action.',
        intelligence: {
          selection_authority: offered.intelligence.selection_authority,
          policy,
          provider,
          model,
        },
      });
    } catch (error) {
      return admissionResponse(request, {
        status: 'failed',
        requestId,
        reason: 'agent_admission_failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { options, admit };
}

