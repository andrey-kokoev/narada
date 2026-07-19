import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { JsonPrincipalRuntimeRegistry, type PrincipalRuntimeSnapshot } from '@narada2/control-plane';
import type {
  OperatorSessionWireRecord,
  OperatorSiteAgentGroupId,
  OperatorSiteAgentOverviewWireResponse,
  OperatorSiteAgentSiteWireRecord,
  OperatorSiteAgentWireRecord,
  OperatorSiteKind,
} from '@narada2/operator-console-contract';
import { readWorkspaceLaunchRecords } from './workspace-launch-registry.js';
import type { WorkspaceLaunchRecord } from './workspace-launch-types.js';
import type { AgentSessionReadModel } from './agent-session-read-model.js';
import type { SiteRegistryReadModel } from './site-registry-read-model.js';
import { siteAuthorityRootForRoot } from '../lib/site-authority-paths.js';

interface SiteMetadata {
  site_id: string;
  display_name: string;
  site_kind: OperatorSiteKind | null;
  metadata_unreadable?: boolean;
}

interface RegistrySiteRow {
  site_id: string;
  site_root: string;
  observation_status: string;
  authority_locus: string | null;
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
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function siteKind(value: unknown): OperatorSiteKind {
  if (value === 'user_site') return 'user_site';
  if (value === 'pc_site' || value === 'host_site' || value === 'host') return 'pc_site';
  return 'site';
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
  let sawUnreadable = false;
  for (const candidate of siteDescriptorCandidates(record.site_root, record.workspace_root)) {
    let raw: string;
    try {
      raw = await readFile(candidate, 'utf8');
    } catch {
      continue; // Missing candidate; try the next canonical Site descriptor locus.
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      sawUnreadable = true;
      continue;
    }
    if (!isRecord(parsed)) {
      sawUnreadable = true;
      continue;
    }
    const site = isRecord(parsed.site) ? parsed.site : null;
    const staticConfig = isRecord(parsed.static_config) ? parsed.static_config : null;
    const kindValue = parsed.site_kind ?? site?.site_kind ?? staticConfig?.site_kind;
    const siteId = stringValue(parsed.site_id) ?? stringValue(site?.site_id) ?? stringValue(staticConfig?.site_id);
    return {
      site_id: siteId ?? record.site,
      display_name: stringValue(parsed.display_name) ?? siteId ?? record.site,
      site_kind: kindValue === undefined || kindValue === null ? null : siteKind(kindValue),
      metadata_unreadable: sawUnreadable,
    };
  }
  return { site_id: record.site, display_name: record.site, site_kind: null, metadata_unreadable: sawUnreadable };
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
    let authorityLocus: string | null = null;
    if (typeof value.aim_json === 'string') {
      try {
        const aim: unknown = JSON.parse(value.aim_json);
        if (isRecord(aim)) authorityLocus = stringValue(aim.authority_locus);
      } catch {
        authorityLocus = null;
      }
    }
    return [{
      site_id: siteId,
      site_root: siteRoot,
      observation_status: stringValue(value.observation_status) ?? 'unknown',
      authority_locus: authorityLocus,
    }];
  });
}

function siteKindFromAuthorityLocus(locus: string | null): OperatorSiteKind | null {
  if (!locus) return null;
  const normalized = locus.toLowerCase();
  if (normalized === 'user') return 'user_site';
  if (normalized === 'pc' || normalized === 'host' || normalized === 'machine') return 'pc_site';
  return null;
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

function runtimeState(sessions: OperatorSessionWireRecord[]) {
  const healthy = sessions.filter((session) =>
    session.display_state === 'active'
    && session.heartbeat_fresh
    && session.health_status === 'healthy');
  const active = sessions.filter((session) =>
    session.display_state === 'active' || session.display_state === 'starting_or_degraded');
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

function matchingPrincipals(principals: PrincipalRuntimeSnapshot[], record: WorkspaceLaunchRecord): PrincipalRuntimeSnapshot[] {
  // The canonical site-qualified identity always wins; bare and legacy ids may
  // bind only inside this Site's own principal registry and only when the
  // canonical identity matches nothing, so a bare id never outranks a
  // site-qualified principal and never binds across Sites.
  const canonical = canonicalAgentId(record).toLowerCase();
  const canonicalMatches = principals.filter((principal) =>
    typeof principal.principal_id === 'string' && principal.principal_id.toLowerCase() === canonical);
  if (canonicalMatches.length > 0) return canonicalMatches;
  const bareIds = new Set([
    record.agent.toLowerCase(),
    record.agent_identity_ref.local_agent_id.toLowerCase(),
    record.agent_identity_ref.legacy_agent_id?.toLowerCase(),
  ].filter((value): value is string => Boolean(value)));
  return principals.filter((principal) =>
    typeof principal.principal_id === 'string' && bareIds.has(principal.principal_id.toLowerCase()));
}

function workState(principals: PrincipalRuntimeSnapshot[], record: WorkspaceLaunchRecord) {
  const matches = matchingPrincipals(principals, record);
  if (matches.length !== 1) {
    return {
      state: matches.length > 1 ? 'ambiguous' : 'unavailable',
      detail: matches.length > 1 ? 'Multiple principal runtime records match this admitted agent.' : null,
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

function projectAgent(
  record: WorkspaceLaunchRecord,
  sessions: OperatorSessionWireRecord[],
  principals: PrincipalRuntimeSnapshot[],
): OperatorSiteAgentWireRecord {
  const runtime = runtimeState(sessionsForAgent(sessions, record));
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
          readSiteMetadata(first).catch((): SiteMetadata => ({ site_id: first.site, display_name: first.site, site_kind: null })),
          readPrincipalStates(first).catch(() => {
            refusals.push(`principal_runtime_read_failed:${first.site}`);
            return [];
          }),
        ]);
        if (metadata.metadata_unreadable) refusals.push(`site_metadata_unreadable:${first.site}`);
        const registrySite = registryBySite.get(key);
        const locusKind = siteKindFromAuthorityLocus(registrySite?.authority_locus ?? null);
        const kind = metadata.site_kind ?? locusKind ?? 'site';
        const classificationSource = metadata.site_kind
          ? 'declared' as const
          : locusKind
            ? 'registry' as const
            : 'fallback' as const;
        const seenAgentIds = new Set<string>();
        const agents = records
          .map((record) => projectAgent(record, sessionEnvelope?.sessions ?? [], principals))
          .sort((a, b) => a.agent_id.localeCompare(b.agent_id))
          .filter((agent) => {
            const agentKey = agent.agent_id.toLowerCase();
            if (seenAgentIds.has(agentKey)) {
              refusals.push(`duplicate_agent_identity:${first.site}:${agent.agent_id}`);
              return false;
            }
            seenAgentIds.add(agentKey);
            return true;
          });
        sites.push({
          site_id: first.site,
          display_name: metadata.display_name,
          site_kind: kind,
          classification_source: classificationSource,
          group_id: groupId(kind),
          observation_status: registrySite?.observation_status ?? 'not_registered',
          agents,
        });
      }

      for (const registrySite of registrySites) {
        if (recordsBySite.has(registrySite.site_id.toLowerCase())) continue;
        const kind = siteKindFromAuthorityLocus(registrySite.authority_locus) ?? 'site';
        sites.push({
          site_id: registrySite.site_id,
          display_name: registrySite.site_id,
          site_kind: kind,
          classification_source: 'registry_only',
          group_id: groupId(kind),
          observation_status: registrySite.observation_status,
          agents: [],
        });
      }

      const ordered = sites.sort((a, b) => a.display_name.localeCompare(b.display_name));
      return {
        schema: 'narada.operator_console.site_agent_overview.v1',
        status: 'success',
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
