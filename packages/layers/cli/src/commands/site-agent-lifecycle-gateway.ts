import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { resolveNaradaSitePaths } from '@narada2/site-paths';
import type {
  OperatorSiteAgentDeleteWireResponse,
  OperatorSiteAgentOverviewWireResponse,
  OperatorSiteAgentStopWireResponse,
} from '@narada2/operator-console-contract';
import { silentCommandContext } from '../lib/command-wrapper.js';
import { operatorSurfaceIdentityRemoveCommand } from './operator-surface.js';
import {
  readWorkspaceLaunchRecords,
  type RawAgentRecord,
  type RawLaunchRegistry,
} from './workspace-launch-registry.js';
import type { WorkspaceLaunchRecord } from './workspace-launch-types.js';
import type { SiteAgentOverviewReadModel } from './site-agent-overview-read-model.js';

export interface SiteAgentLifecycleRequest {
  siteId: string;
  agentId: string;
}

export interface SiteAgentLifecycleGateway {
  stop(request: SiteAgentLifecycleRequest): Promise<OperatorSiteAgentStopWireResponse>;
  delete(request: SiteAgentLifecycleRequest): Promise<OperatorSiteAgentDeleteWireResponse>;
}

export interface SiteAgentLifecycleGatewayDependencies {
  overview: SiteAgentOverviewReadModel;
  readLaunchRecords?: typeof readWorkspaceLaunchRecords;
  appendControlRequest?: (controlPath: string, request: Record<string, unknown>) => Promise<void>;
  removeSurfaceIdentity?: typeof operatorSurfaceIdentityRemoveCommand;
  now?: () => Date;
  operatorPrincipal?: string;
}

interface RegistryMutation {
  rollback(): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function canonicalAgentId(record: WorkspaceLaunchRecord): string {
  return `${record.site}.${record.agent_identity_ref.local_agent_id}`;
}

function recordMatchesRequest(record: WorkspaceLaunchRecord, request: SiteAgentLifecycleRequest): boolean {
  const expected = request.agentId.trim().toLowerCase();
  return record.site.toLowerCase() === request.siteId.trim().toLowerCase()
    && (record.agent.toLowerCase() === expected || canonicalAgentId(record).toLowerCase() === expected);
}

function findOverviewAgent(
  overview: OperatorSiteAgentOverviewWireResponse,
  request: SiteAgentLifecycleRequest,
) {
  return overview.groups
    .flatMap((group) => group.sites)
    .filter((site) => site.site_id.toLowerCase() === request.siteId.trim().toLowerCase())
    .flatMap((site) => site.agents)
    .find((agent) => agent.agent_id.toLowerCase() === request.agentId.trim().toLowerCase()) ?? null;
}

function stopResponse(
  request: SiteAgentLifecycleRequest,
  requestId: string,
  status: OperatorSiteAgentStopWireResponse['status'],
  input: Partial<OperatorSiteAgentStopWireResponse> = {},
): OperatorSiteAgentStopWireResponse {
  return {
    schema: 'narada.operator_console.agent_stop.v1',
    status,
    site_id: request.siteId,
    agent_id: request.agentId,
    session_id: input.session_id ?? null,
    reason: input.reason ?? null,
    message: input.message ?? null,
    request_id: requestId,
  };
}

function deleteResponse(
  request: SiteAgentLifecycleRequest,
  requestId: string,
  status: OperatorSiteAgentDeleteWireResponse['status'],
  input: Partial<OperatorSiteAgentDeleteWireResponse> = {},
): OperatorSiteAgentDeleteWireResponse {
  return {
    schema: 'narada.operator_console.agent_delete.v1',
    status,
    site_id: request.siteId,
    agent_id: request.agentId,
    reason: input.reason ?? null,
    message: input.message ?? null,
    request_id: requestId,
  };
}

async function appendControlRequest(controlPath: string, request: Record<string, unknown>): Promise<void> {
  if (!existsSync(controlPath)) throw new Error(`session_control_path_missing:${controlPath}`);
  await appendFile(controlPath, `${JSON.stringify(request)}\n`, 'utf8');
}

async function atomicWriteText(path: string, value: string): Promise<void> {
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(temporary, value, 'utf8');
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

function rawAgents(raw: RawLaunchRegistry): RawAgentRecord[] {
  return Array.isArray(raw.Agents) ? raw.Agents : raw.Agents ? [raw.Agents] : [];
}

function rawAgentId(agent: RawAgentRecord): string | null {
  return stringValue(agent.Agent);
}

function rawAgentSite(raw: RawLaunchRegistry, agent: RawAgentRecord): string | null {
  return stringValue(agent.Site) ?? stringValue(raw.Site);
}

function removeJsonAgent(text: string, agentId: string, siteId: string): string {
  const parsed = JSON.parse(text) as RawLaunchRegistry;
  const agents = rawAgents(parsed);
  const matching = agents.filter((agent) =>
    rawAgentId(agent)?.toLowerCase() === agentId.toLowerCase()
      && rawAgentSite(parsed, agent)?.toLowerCase() === siteId.toLowerCase());
  if (matching.length !== 1) throw new Error(matching.length === 0 ? 'launch_record_not_found' : 'duplicate_agent_identity');
  const remaining = agents.filter((agent) => !(
    rawAgentId(agent)?.toLowerCase() === agentId.toLowerCase()
      && rawAgentSite(parsed, agent)?.toLowerCase() === siteId.toLowerCase()
  ));
  return `${JSON.stringify({ ...parsed, Agents: remaining }, null, 2)}\n`;
}

function psd1StringField(block: string, field: string): string | null {
  const match = new RegExp(`^[ \\t]*${field}[ \\t]*=[ \\t]*"((?:""|[^"])*)"`, 'm').exec(block);
  return match?.[1]?.replace(/""/g, '"') ?? null;
}

function removePsd1Agent(text: string, agentId: string, siteId: string): string {
  const open = /(^|\n)[ \\t]*Agents[ \\t]*=[ \\t]*@\([ \\t]*(?:\r?\n|$)/m.exec(text);
  if (!open) throw new Error('launch_registry_agents_array_not_found');
  const bodyStart = open.index + open[0].length;
  const close = /(^|\n)[ \\t]*\)[ \\t]*(?:\r?\n|$)/m.exec(text.slice(bodyStart));
  if (!close) throw new Error('launch_registry_agents_array_not_found');
  const body = text.slice(bodyStart, bodyStart + close.index + (close[1] ? close[1].length : 0));
  const blocks = /^[ \t]*@\{\r?\n[\s\S]*?^[ \t]*\}(?:\r?\n|$)/gm;
  let match: RegExpExecArray | null;
  let found: RegExpExecArray | null = null;
  while ((match = blocks.exec(body)) !== null) {
    const blockAgent = psd1StringField(match[0], 'Agent');
    const blockSite = psd1StringField(match[0], 'Site');
    if (blockAgent?.toLowerCase() === agentId.toLowerCase() && blockSite?.toLowerCase() === siteId.toLowerCase()) {
      if (found) throw new Error('duplicate_agent_identity');
      found = match;
    }
  }
  if (!found) throw new Error('launch_record_not_found');
  const nextBody = `${body.slice(0, found.index)}${body.slice(found.index + found[0].length)}`;
  return `${text.slice(0, bodyStart)}${nextBody}${text.slice(bodyStart + close.index + (close[1] ? close[1].length : 0))}`;
}

async function removeLaunchRegistryRecord(
  record: WorkspaceLaunchRecord,
  request: SiteAgentLifecycleRequest,
): Promise<RegistryMutation> {
  const path = record.config_path;
  const previous = await readFile(path, 'utf8');
  const next = path.toLowerCase().endsWith('.json')
    ? removeJsonAgent(previous, record.agent, request.siteId)
    : removePsd1Agent(previous, record.agent, request.siteId);
  await atomicWriteText(path, next);
  return { rollback: () => atomicWriteText(path, previous) };
}

async function readOverviewAgent(
  overview: SiteAgentOverviewReadModel,
  request: SiteAgentLifecycleRequest,
): Promise<{ agent: NonNullable<ReturnType<typeof findOverviewAgent>> } | { refusal: string }> {
  const result = await overview.read();
  if (result.status !== 'success') return { refusal: 'site_agent_overview_refused' };
  const agent = findOverviewAgent(result, request);
  return agent ? { agent } : { refusal: 'agent_not_admitted_to_site' };
}

export function createSiteAgentLifecycleGateway(
  dependencies: SiteAgentLifecycleGatewayDependencies,
): SiteAgentLifecycleGateway {
  const readLaunchRecords = dependencies.readLaunchRecords ?? readWorkspaceLaunchRecords;
  const appendControl = dependencies.appendControlRequest ?? appendControlRequest;
  const removeSurfaceIdentity = dependencies.removeSurfaceIdentity ?? operatorSurfaceIdentityRemoveCommand;
  const operatorPrincipal = dependencies.operatorPrincipal ?? 'operator-console';

  return {
    async stop(request): Promise<OperatorSiteAgentStopWireResponse> {
      const requestId = `stop_${randomUUID()}`;
      try {
        const lookup = await readOverviewAgent(dependencies.overview, request);
        if ('refusal' in lookup) return stopResponse(request, requestId, 'refused', { reason: lookup.refusal });
        const agent = lookup.agent;
        const sessionId = agent.runtime.selected_session_id ?? agent.runtime.healthy_session_ids[0] ?? null;
        if (agent.runtime.state === 'stopped') {
          return stopResponse(request, requestId, 'already_stopped', {
            session_id: sessionId,
            message: 'The agent is already stopped.',
          });
        }
        if (!sessionId) {
          return stopResponse(request, requestId, 'refused', {
            reason: `agent_runtime_${agent.runtime.state}`,
            message: 'No single runtime session is available to stop.',
          });
        }
        const loaded = await readLaunchRecords({ all: true });
        const record = loaded.records.find((candidate) => recordMatchesRequest(candidate, request));
        if (!record) return stopResponse(request, requestId, 'refused', { session_id: sessionId, reason: 'launch_record_not_found' });
        const controlPath = resolveNaradaSitePaths({ siteRoot: record.site_root, sessionId }).narsControlPath;
        if (!controlPath) throw new Error('session_control_path_unresolved');
        await appendControl(controlPath, {
          id: requestId,
          request_id: requestId,
          method: 'session.close',
          params: {
            source: operatorPrincipal,
            reason: 'operator_requested',
            site_id: request.siteId,
            agent_id: request.agentId,
          },
        });
        return stopResponse(request, requestId, 'requested', {
          session_id: sessionId,
          message: 'Session close requested through the NARS control sideband.',
        });
      } catch (error) {
        return stopResponse(request, requestId, 'failed', {
          reason: 'agent_stop_failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },

    async delete(request): Promise<OperatorSiteAgentDeleteWireResponse> {
      const requestId = `delete_${randomUUID()}`;
      let launchMutation: RegistryMutation | null = null;
      try {
        const lookup = await readOverviewAgent(dependencies.overview, request);
        if ('refusal' in lookup) return deleteResponse(request, requestId, 'refused', { reason: lookup.refusal });
        const agent = lookup.agent;
        if (agent.runtime.state !== 'stopped' || agent.runtime.healthy_session_ids.length > 0) {
          return deleteResponse(request, requestId, 'refused', {
            reason: 'agent_must_be_stopped',
            message: 'Stop the agent and wait for the runtime to become stopped before deleting its admission.',
          });
        }
        const loaded = await readLaunchRecords({ all: true });
        const record = loaded.records.find((candidate) => recordMatchesRequest(candidate, request));
        if (!record) return deleteResponse(request, requestId, 'refused', { reason: 'launch_record_not_found' });
        launchMutation = await removeLaunchRegistryRecord(record, request);
        const identityResult = await removeSurfaceIdentity({
          cwd: record.site_root,
          identityName: request.agentId,
          site: request.siteId,
          by: operatorPrincipal,
          format: 'json',
        }, silentCommandContext());
        if (identityResult.exitCode !== 0) {
          await launchMutation.rollback();
          launchMutation = null;
          const result = isRecord(identityResult.result) ? identityResult.result : {};
          return deleteResponse(request, requestId, 'refused', {
            reason: stringValue(result.reason) ?? 'operator_surface_identity_not_removed',
            message: 'The operator-surface identity was not removed; the launch registry was restored.',
          });
        }
        return deleteResponse(request, requestId, 'deleted', {
          message: 'Agent admission removed. Session evidence and artifacts were preserved.',
        });
      } catch (error) {
        if (launchMutation) await launchMutation.rollback().catch(() => undefined);
        return deleteResponse(request, requestId, 'failed', {
          reason: 'agent_delete_failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}

