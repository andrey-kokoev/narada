import { readFile } from 'node:fs/promises';
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

interface SiteMetadata {
  site_id: string;
  display_name: string;
  site_kind: OperatorSiteKind;
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

function siteJsonCandidates(siteRoot: string, workspaceRoot: string | null): string[] {
  const roots = [siteRoot, workspaceRoot].filter((value): value is string => Boolean(value));
  const candidates = roots.flatMap((root) => [
    join(root, 'site.json'),
    join(root, '.narada', 'site.json'),
    ...(basename(root).toLowerCase() === '.narada' ? [join(dirname(root), '.narada', 'site.json')] : []),
  ]);
  return [...new Set(candidates.map((candidate) => resolve(candidate)))];
}

async function defaultReadSiteMetadata(
  record: Pick<WorkspaceLaunchRecord, 'site' | 'site_root' | 'workspace_root'>,
): Promise<SiteMetadata> {
  for (const candidate of siteJsonCandidates(record.site_root, record.workspace_root)) {
    try {
      const parsed: unknown = JSON.parse(await readFile(candidate, 'utf8'));
      if (!isRecord(parsed)) continue;
      return {
        site_id: stringValue(parsed.site_id) ?? record.site,
        display_name: stringValue(parsed.display_name) ?? stringValue(parsed.site_id) ?? record.site,
        site_kind: siteKind(parsed.site_kind),
      };
    } catch {
      // Continue to the next canonical Site descriptor locus.
    }
  }
  return { site_id: record.site, display_name: record.site, site_kind: 'site' };
}

async function defaultReadPrincipalStates(
  record: Pick<WorkspaceLaunchRecord, 'site_root' | 'workspace_root'>,
): Promise<PrincipalRuntimeSnapshot[]> {
  const registry = new JsonPrincipalRuntimeRegistry({ rootDir: record.workspace_root ?? record.site_root });
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

function workState(principals: PrincipalRuntimeSnapshot[], record: WorkspaceLaunchRecord) {
  const matches = principals.filter((principal) => agentMatches(principal.principal_id, record));
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
          readSiteMetadata(first).catch(() => ({ site_id: first.site, display_name: first.site, site_kind: 'site' as const })),
          readPrincipalStates(first).catch(() => {
            refusals.push(`principal_runtime_read_failed:${first.site}`);
            return [];
          }),
        ]);
        const kind = metadata.site_kind;
        sites.push({
          site_id: first.site,
          display_name: metadata.display_name,
          site_kind: kind,
          group_id: groupId(kind),
          observation_status: registryBySite.get(key)?.observation_status ?? 'not_registered',
          agents: records
            .map((record) => projectAgent(record, sessionEnvelope?.sessions ?? [], principals))
            .sort((a, b) => a.agent_id.localeCompare(b.agent_id)),
        });
      }

      for (const registrySite of registrySites) {
        if (recordsBySite.has(registrySite.site_id.toLowerCase())) continue;
        sites.push({
          site_id: registrySite.site_id,
          display_name: registrySite.site_id,
          site_kind: 'site',
          group_id: 'sites',
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
