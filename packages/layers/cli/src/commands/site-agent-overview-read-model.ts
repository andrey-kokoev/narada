import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { JsonPrincipalRuntimeRegistry, type PrincipalRuntimeSnapshot } from '@narada2/control-plane';
import {
  defaultSessionAuthorityDbPath,
  normalizeSessionPrincipal,
  openLocalSessionAuthority,
} from '@narada2/nars-session-authority';
import type {
  OperatorSessionWireRecord,
  OperatorSiteAgentGroupId,
  OperatorSiteAgentOverviewWireResponse,
  OperatorSiteAgentSiteWireRecord,
  OperatorSiteAgentWireRecord,
  OperatorSiteAgentRuntimeWireState,
  OperatorSiteKind,
} from '@narada2/operator-console-contract';
import {
  NARADA_AGENT_RUNTIME_SERVER_KIND,
  normalizeRuntimeAlias,
  operatorSurfaceKindsForRuntimeHost,
} from '@narada2/operator-surface-runtime-contract/operator-surface-runtime-selection';
import { readWorkspaceLaunchRecords } from './workspace-launch-registry.js';
import type { WorkspaceLaunchRecord } from './workspace-launch-types.js';
import type { AgentSessionReadModel } from './agent-session-read-model.js';
import type { SiteRegistryReadModel } from './site-registry-read-model.js';
import { siteAuthorityRootForRoot } from '../lib/site-authority-paths.js';

interface SiteMetadata {
  site_id: string;
  display_name: string;
  site_kind: OperatorSiteKind | null;
  metadata_status?: 'available' | 'missing' | 'invalid' | 'unreadable';
}

async function defaultReadSessionAuthority(
  record: Pick<WorkspaceLaunchRecord, 'site' | 'site_root' | 'agent_identity_ref'>,
): Promise<SessionAuthoritySnapshot | null> {
  const dbPath = defaultSessionAuthorityDbPath(record.site_root);
  if (!existsSync(dbPath)) return null;
  const authority = openLocalSessionAuthority({ dbPath });
  try {
    const principal = normalizeSessionPrincipal({
      siteId: record.site,
      localAgentId: record.agent_identity_ref.local_agent_id,
    });
    return authority.inspectSession({ principal }) as SessionAuthoritySnapshot | null;
  } finally {
    authority.close();
  }
}

interface SessionAuthoritySnapshot {
  state?: string;
  session_id?: string | null;
  authority_epoch?: number;
  updated_at?: string | null;
}

interface RegistrySiteRow {
  site_id: string;
  site_root: string;
  observation_status: string;
}

export interface SiteAgentOverviewReadModel {
  read(): Promise<OperatorSiteAgentOverviewWireResponse>;
}

export interface SiteAgentOverviewReadModelDependencies {
  registryReadModel: SiteRegistryReadModel;
  agentSessions: AgentSessionReadModel;
  readLaunchRecords?: typeof readWorkspaceLaunchRecords;
  readSiteMetadata?: (record: Pick<WorkspaceLaunchRecord, 'site' | 'site_root' | 'workspace_root'>) => Promise<SiteMetadata>;
  readPrincipalStates?: (record: Pick<WorkspaceLaunchRecord, 'site_root' | 'workspace_root'>) => Promise<PrincipalRuntimeSnapshot[]>;
  readSessionAuthority?: (record: Pick<WorkspaceLaunchRecord, 'site' | 'site_root' | 'agent_identity_ref'>) => Promise<SessionAuthoritySnapshot | null>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function siteKind(value: unknown): OperatorSiteKind | null {
  if (value === 'user_site') return 'user_site';
  if (value === 'pc_site' || value === 'host_site' || value === 'host') return 'pc_site';
  if (value === 'site') return 'site';
  if (value === 'narada_proper') return 'site';
  if (typeof value === 'string' && value.trim().length > 0) return 'site';
  return null;
}

function siteDescriptorCandidates(siteRoot: string, workspaceRoot: string | null): string[] {
  const roots = [siteRoot, workspaceRoot].filter((value): value is string => Boolean(value));
  const candidates = roots.flatMap((root) => [
    join(root, 'site.json'),
    join(root, '.narada', 'site.json'),
    join(root, 'config.json'),
    join(root, '.narada', 'config.json'),
    ...(basename(root).toLowerCase() === '.narada'
      ? [join(dirname(root), '.narada', 'site.json'), join(dirname(root), '.narada', 'config.json')]
      : []),
  ]);
  return [...new Set(candidates.map((candidate) => resolve(candidate)))];
}

async function defaultReadSiteMetadata(
  record: Pick<WorkspaceLaunchRecord, 'site' | 'site_root' | 'workspace_root'>,
): Promise<SiteMetadata> {
  let failureStatus: SiteMetadata['metadata_status'] = 'missing';
  let firstValid: SiteMetadata | undefined;
  for (const candidate of siteDescriptorCandidates(record.site_root, record.workspace_root)) {
    let raw: string;
    try {
      raw = await readFile(candidate, 'utf8');
    } catch (error) {
      if (isRecord(error) && error.code === 'ENOENT') continue;
      failureStatus = 'unreadable';
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      if (failureStatus !== 'unreadable') failureStatus = 'invalid';
      continue;
    }
    if (!isRecord(parsed)) {
      if (failureStatus !== 'unreadable') failureStatus = 'invalid';
      continue;
    }
    const site = isRecord(parsed.site) ? parsed.site : null;
    const staticConfig = isRecord(parsed.static_config) ? parsed.static_config : null;
    const kindValue = parsed.site_kind ?? site?.site_kind ?? staticConfig?.site_kind;
    const siteId = stringValue(parsed.site_id) ?? stringValue(site?.site_id) ?? stringValue(staticConfig?.site_id);
    const kind = siteKind(kindValue);
    if (!siteId || !kind) {
      if (failureStatus !== 'unreadable') failureStatus = 'invalid';
      continue;
    }
    const metadata: SiteMetadata = {
      site_id: siteId,
      display_name: stringValue(parsed.display_name) ?? siteId,
      site_kind: kind,
      metadata_status: 'available',
    };
    if (siteId.toLowerCase() === record.site.toLowerCase()) return metadata;
    if (!firstValid) firstValid = metadata;
  }
  if (firstValid) return firstValid;
  return { site_id: record.site, display_name: record.site, site_kind: null, metadata_status: failureStatus };
}

async function defaultReadPrincipalStates(
  record: Pick<WorkspaceLaunchRecord, 'site_root' | 'workspace_root'>,
): Promise<PrincipalRuntimeSnapshot[]> {
  // Principal runtime state is Site authority-locus state, never workspace state:
  // resolve the canonical authority root and honor both state conventions
  // (principal-bridge `<root>/.principal-runtimes.json`, construction `.ai/principal-runtimes.json`).
  const authorityRoot = siteAuthorityRootForRoot(record.site_root);
  const candidates = [
    { rootDir: authorityRoot, filename: '.principal-runtimes.json' },
    { rootDir: join(authorityRoot, '.ai'), filename: 'principal-runtimes.json' },
  ];
  const selected = candidates.find((candidate) => existsSync(join(candidate.rootDir, candidate.filename)))
    ?? candidates[0];
  const registry = new JsonPrincipalRuntimeRegistry({ rootDir: selected.rootDir, filename: selected.filename });
  await registry.init();
  return registry.snapshot();
}

function registrySiteRows(result: unknown): RegistrySiteRow[] {
  if (!isRecord(result) || !Array.isArray(result.sites)) return [];
  return result.sites.flatMap((value): RegistrySiteRow[] => {
    if (!isRecord(value)) return [];
    const siteId = stringValue(value.site_id);
    const siteRoot = stringValue(value.site_root);
    if (!siteId || !siteRoot) return [];
    return [{
      site_id: siteId,
      site_root: siteRoot,
      observation_status: stringValue(value.observation_status) ?? 'unknown',
    }];
  });
}

function canonicalAgentId(record: WorkspaceLaunchRecord): string {
  return `${record.site}.${record.agent_identity_ref.local_agent_id}`;
}

function agentMatches(candidate: string | null, record: WorkspaceLaunchRecord): boolean {
  if (!candidate) return false;
  const values = new Set([
    canonicalAgentId(record).toLowerCase(),
    record.agent.toLowerCase(),
    record.agent_identity_ref.local_agent_id.toLowerCase(),
    record.agent_identity_ref.legacy_agent_id?.toLowerCase(),
  ].filter((value): value is string => Boolean(value)));
  return values.has(candidate.toLowerCase());
}

function sessionsForAgent(sessions: OperatorSessionWireRecord[], record: WorkspaceLaunchRecord): OperatorSessionWireRecord[] {
  return sessions.filter((session) =>
    session.site_id?.toLowerCase() === record.site.toLowerCase()
    && agentMatches(session.agent_id, record));
}

function runtimeState(
  sessions: OperatorSessionWireRecord[],
  authority: SessionAuthoritySnapshot | null = null,
): OperatorSiteAgentRuntimeWireState {
  const healthy = sessions.filter((session) =>
    session.display_state === 'active'
    && session.heartbeat_fresh
    && session.health_status === 'healthy');
  const active = sessions.filter((session) =>
    session.display_state === 'active' || session.display_state === 'starting_or_degraded');
  // Once the Site has an authority record, it is the operational selector.
  // The session index remains an inventory and can contain legacy/stale
  // duplicates; those must not turn the Site-agent projection ambiguous.
  if (authority) {
    const authoritySessionId = stringValue(authority.session_id);
    const authorityIsLive = authority.state === 'starting'
      || authority.state === 'active'
      || authority.state === 'stopping';
    const selected = authorityIsLive && authoritySessionId
      ? healthy.find((session) => session.session_id === authoritySessionId)
      : undefined;
    if (selected) {
      return {
        state: 'running',
        session_count: 1,
        healthy_session_ids: [selected.session_id],
        selected_session_id: selected.session_id,
      };
    }
    if (active.length > 0 || authorityIsLive) {
      return {
        state: 'degraded',
        // The Site authority is the canonical runtime inventory. During the
        // short authority-to-session-index handoff window the authority may
        // already be live while the session index still has no row. Count
        // that authoritative live runtime so the wire shape remains valid
        // and the console can show a truthful degraded/starting state rather
        // than refusing the whole overview.
        session_count: Math.max(active.length, authorityIsLive ? 1 : 0),
        healthy_session_ids: [],
        selected_session_id: null,
      };
    }
  }
  const state = healthy.length > 1
    ? 'ambiguous'
    : healthy.length === 1
      ? 'running'
      : active.length > 0
        ? 'degraded'
        : 'stopped';
  return {
    state,
    session_count: active.length,
    healthy_session_ids: healthy.map((session) => session.session_id),
    selected_session_id: healthy.length === 1 ? healthy[0]!.session_id : null,
  } as const;
}

function principalIdentityMatches(principal: PrincipalRuntimeSnapshot, record: WorkspaceLaunchRecord): boolean {
  if (typeof principal.principal_id !== 'string') return false;
  const candidate = principal.principal_id.toLowerCase();
  return candidate === canonicalAgentId(record).toLowerCase()
    || candidate === record.agent.toLowerCase()
    || candidate === record.agent_identity_ref.local_agent_id.toLowerCase()
    || candidate === record.agent_identity_ref.legacy_agent_id?.toLowerCase();
}

function principalScopeMatchesSite(principal: PrincipalRuntimeSnapshot, record: WorkspaceLaunchRecord): boolean {
  if (typeof principal.scope_id !== 'string') return false;
  const scope = principal.scope_id.toLowerCase();
  const site = record.site.toLowerCase();
  return scope === site || scope === `site:${site}`;
}

function matchingPrincipals(principals: PrincipalRuntimeSnapshot[], record: WorkspaceLaunchRecord): PrincipalRuntimeSnapshot[] {
  const scoped = principals.filter((principal) =>
    principalIdentityMatches(principal, record) && principalScopeMatchesSite(principal, record));
  // The canonical site-qualified identity always wins; bare and legacy ids may
  // bind only inside this Site's own principal registry and only when the
  // canonical identity matches nothing, so a bare id never outranks a
  // site-qualified principal and never binds across Sites.
  const canonical = canonicalAgentId(record).toLowerCase();
  const canonicalMatches = scoped.filter((principal) =>
    typeof principal.principal_id === 'string' && principal.principal_id.toLowerCase() === canonical);
  if (canonicalMatches.length > 0) return canonicalMatches;
  const bareIds = new Set([
    record.agent.toLowerCase(),
    record.agent_identity_ref.local_agent_id.toLowerCase(),
    record.agent_identity_ref.legacy_agent_id?.toLowerCase(),
  ].filter((value): value is string => Boolean(value)));
  return scoped.filter((principal) =>
    typeof principal.principal_id === 'string' && bareIds.has(principal.principal_id.toLowerCase()));
}

function workState(principals: PrincipalRuntimeSnapshot[], record: WorkspaceLaunchRecord) {
  const matches = matchingPrincipals(principals, record);
  if (matches.length !== 1) {
    const identityMatches = principals.filter((principal) => principalIdentityMatches(principal, record));
    return {
      state: matches.length > 1 ? 'ambiguous' : 'unavailable',
      detail: matches.length > 1
        ? 'Multiple Site-scoped principal runtime records match this admitted agent.'
        : identityMatches.length > 0
          ? 'Principal runtime scope does not match the admitted Site.'
          : null,
      source: 'unavailable' as const,
    };
  }
  const principal = matches[0]!;
  return {
    state: principal.state,
    detail: principal.active_work_item_id ?? principal.detail ?? null,
    source: 'principal-runtime' as const,
  };
}

const COMPACT_OPERATOR_SURFACE_KINDS = ['agent-web-ui', 'agent-cli', 'agent-tui'] as const;
const COMPACT_OPERATOR_SURFACE_LABELS: Record<(typeof COMPACT_OPERATOR_SURFACE_KINDS)[number], string> = {
  'agent-web-ui': 'Web UI',
  'agent-cli': 'CLI',
  'agent-tui': 'TUI',
};

function operatorSurfaces(
  record: WorkspaceLaunchRecord,
  runtime: OperatorSiteAgentRuntimeWireState,
): {
  default_kind: string;
  choices: Array<{
    kind: (typeof COMPACT_OPERATOR_SURFACE_KINDS)[number];
    label: string;
    status: 'available' | 'unavailable';
    reason: string | null;
  }>;
} {
  const runtimeHost = normalizeRuntimeAlias(record.runtime);
  const runtimeSupports = new Set(operatorSurfaceKindsForRuntimeHost(NARADA_AGENT_RUNTIME_SERVER_KIND));
  return {
    default_kind: record.operator_surface,
    choices: COMPACT_OPERATOR_SURFACE_KINDS.map((kind) => {
      const admitted = runtimeHost === NARADA_AGENT_RUNTIME_SERVER_KIND && runtimeSupports.has(kind);
      const attachable = runtime.state === 'stopped'
        || (runtime.state === 'running' && kind === 'agent-web-ui');
      const available = admitted && attachable;
      return {
        kind,
        label: COMPACT_OPERATOR_SURFACE_LABELS[kind],
        status: available ? 'available' : 'unavailable',
        reason: available
          ? null
          : !admitted
          ? 'This runtime host does not admit this operator surface.'
          : runtime.state === 'running'
            ? 'An existing session can only be attached from the Web UI here.'
            : 'The agent does not have a single healthy session to attach.',
      };
    }),
  };
}

function projectAgent(
  record: WorkspaceLaunchRecord,
  sessions: OperatorSessionWireRecord[],
  principals: PrincipalRuntimeSnapshot[],
  authority: SessionAuthoritySnapshot | null,
): OperatorSiteAgentWireRecord {
  const runtime = runtimeState(sessionsForAgent(sessions, record), authority);
  const inspectReason = runtime.state === 'ambiguous'
    ? 'Choose a session from Agent Sessions.'
    : runtime.state !== 'running'
      ? 'No single healthy NARS session is available.'
      : null;
  return {
    agent_id: canonicalAgentId(record),
    local_agent_id: record.agent_identity_ref.local_agent_id,
    title: record.title,
    role: record.role,
    admission_status: 'admitted',
    runtime,
    work: workState(principals, record),
    operator_surfaces: operatorSurfaces(record, runtime),
    actions: {
      start: runtime.state === 'stopped',
      inspect: runtime.state === 'running',
      inspect_reason: inspectReason,
    },
  };
}

function groupId(kind: OperatorSiteKind): OperatorSiteAgentGroupId {
  return kind === 'user_site' || kind === 'pc_site' ? 'personal-infrastructure' : 'sites';
}

export function createSiteAgentOverviewReadModel(
  dependencies: SiteAgentOverviewReadModelDependencies,
): SiteAgentOverviewReadModel {
  const readLaunchRecords = dependencies.readLaunchRecords ?? readWorkspaceLaunchRecords;
  const readSiteMetadata = dependencies.readSiteMetadata ?? defaultReadSiteMetadata;
  const readPrincipalStates = dependencies.readPrincipalStates ?? defaultReadPrincipalStates;
  const readSessionAuthority = dependencies.readSessionAuthority ?? defaultReadSessionAuthority;
  return {
    async read(): Promise<OperatorSiteAgentOverviewWireResponse> {
      const refusals: string[] = [];
      const [registryEnvelope, sessionEnvelope, launchLoad] = await Promise.all([
        dependencies.registryReadModel.list().catch(() => ({ exitCode: 1, result: null })),
        dependencies.agentSessions.list().catch(() => null),
        readLaunchRecords({ all: true }).catch(() => null),
      ]);
      if (!launchLoad) {
        return {
          schema: 'narada.operator_console.site_agent_overview.v1',
          status: 'refused',
          generated_at: new Date().toISOString(),
          groups: [],
          refusals: ['launch_registry_read_failed'],
        };
      }

      const duplicateIdentities = [...launchLoad.records.reduce((counts, record) => {
        const id = canonicalAgentId(record).toLowerCase();
        counts.set(id, (counts.get(id) ?? 0) + 1);
        return counts;
      }, new Map<string, number>())]
        .filter(([, count]) => count > 1)
        .map(([id]) => id)
        .sort();
      if (duplicateIdentities.length > 0) {
        return {
          schema: 'narada.operator_console.site_agent_overview.v1',
          status: 'refused',
          generated_at: new Date().toISOString(),
          groups: [],
          refusals: duplicateIdentities.map((id) => `duplicate_agent_identity:${id}`),
        };
      }
      if (registryEnvelope.exitCode !== 0) refusals.push('site_registry_read_refused');
      if (!sessionEnvelope) refusals.push('agent_session_read_failed');
      else refusals.push(...sessionEnvelope.refusals);

      const registrySites = registrySiteRows(registryEnvelope.result);
      const registryBySite = new Map(registrySites.map((site) => [site.site_id.toLowerCase(), site]));
      const recordsBySite = new Map<string, WorkspaceLaunchRecord[]>();
      for (const record of launchLoad.records) {
        const records = recordsBySite.get(record.site.toLowerCase()) ?? [];
        records.push(record);
        recordsBySite.set(record.site.toLowerCase(), records);
      }

      const sites: OperatorSiteAgentSiteWireRecord[] = [];
      for (const [key, records] of recordsBySite) {
        const first = records[0]!;
        const [metadata, principals] = await Promise.all([
          readSiteMetadata(first).catch((): SiteMetadata => ({
            site_id: first.site,
            display_name: first.site,
            site_kind: null,
            metadata_status: 'unreadable',
          })),
          readPrincipalStates(first).catch(() => {
            refusals.push(`principal_runtime_read_failed:${first.site}`);
            return [];
          }),
        ]);
        const registrySite = registryBySite.get(key);
        let kind: OperatorSiteKind;
        let displayName: string;
        let classificationSource: OperatorSiteAgentSiteWireRecord['classification_source'];
        if (!metadata.site_kind || metadata.metadata_status === 'missing' || metadata.metadata_status === 'invalid' || metadata.metadata_status === 'unreadable') {
          refusals.push(`site_metadata_fallback_${metadata.metadata_status ?? 'invalid'}:${first.site}`);
          kind = 'site';
          displayName = first.site;
          classificationSource = 'fallback';
        } else if (metadata.site_id.toLowerCase() !== first.site.toLowerCase()) {
          refusals.push(`site_metadata_fallback_identity_mismatch:${first.site}:${metadata.site_id}`);
          kind = siteKind(metadata.site_kind) ?? 'site';
          displayName = metadata.display_name;
          classificationSource = 'fallback';
        } else {
          kind = siteKind(metadata.site_kind) ?? 'site';
          displayName = metadata.display_name;
          classificationSource = 'declared';
        }
        const agents = (await Promise.all(records.map(async (record) => {
          const authority = await readSessionAuthority(record).catch(() => {
            refusals.push(`session_authority_read_failed:${record.site}:${record.agent_identity_ref.local_agent_id}`);
            return null;
          });
          return projectAgent(record, sessionEnvelope?.sessions ?? [], principals, authority);
        }))).sort((a, b) => a.agent_id.localeCompare(b.agent_id));
        sites.push({
          site_id: first.site,
          display_name: displayName,
          site_kind: kind,
          classification_source: classificationSource,
          group_id: groupId(kind),
          observation_status: registrySite?.observation_status ?? 'not_registered',
          agents,
        });
      }

      for (const registrySite of registrySites) {
        if (recordsBySite.has(registrySite.site_id.toLowerCase())) continue;
        const metadata = await readSiteMetadata({
          site: registrySite.site_id,
          site_root: registrySite.site_root,
          workspace_root: registrySite.site_root,
        }).catch((): SiteMetadata => ({
          site_id: registrySite.site_id,
          display_name: registrySite.site_id,
          site_kind: null,
          metadata_status: 'unreadable',
        }));
        let kind: OperatorSiteKind;
        let displayName: string;
        let classificationSource: OperatorSiteAgentSiteWireRecord['classification_source'];
        if (!metadata.site_kind || metadata.metadata_status === 'missing' || metadata.metadata_status === 'invalid' || metadata.metadata_status === 'unreadable') {
          refusals.push(`site_metadata_fallback_${metadata.metadata_status ?? 'invalid'}:${registrySite.site_id}`);
          kind = 'site';
          displayName = registrySite.site_id;
          classificationSource = 'registry_only';
        } else if (metadata.site_id.toLowerCase() !== registrySite.site_id.toLowerCase()) {
          refusals.push(`site_metadata_fallback_identity_mismatch:${registrySite.site_id}:${metadata.site_id}`);
          kind = siteKind(metadata.site_kind) ?? 'site';
          displayName = metadata.display_name;
          classificationSource = 'registry_only';
        } else {
          kind = siteKind(metadata.site_kind) ?? 'site';
          displayName = metadata.display_name;
          classificationSource = 'registry_only';
        }
        sites.push({
          site_id: registrySite.site_id,
          display_name: displayName,
          site_kind: kind,
          classification_source: classificationSource,
          group_id: groupId(kind),
          observation_status: registrySite.observation_status,
          agents: [],
        });
      }

      const ordered = sites.sort((a, b) => a.display_name.localeCompare(b.display_name));
      const fatalMetadataRefusal = (reason: string) =>
        reason.startsWith('site_metadata_') && !reason.startsWith('site_metadata_fallback_');
      return {
        schema: 'narada.operator_console.site_agent_overview.v1',
        status: refusals.some(fatalMetadataRefusal) ? 'refused' : 'success',
        generated_at: new Date().toISOString(),
        groups: [
          {
            id: 'personal-infrastructure',
            label: 'User and Host',
            sites: ordered.filter((site) => site.group_id === 'personal-infrastructure'),
          },
          {
            id: 'sites',
            label: 'Sites',
            sites: ordered.filter((site) => site.group_id === 'sites'),
          },
        ],
        refusals,
      };
    },
  };
}
