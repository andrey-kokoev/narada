import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import {
  McpSurfaceRuntimeEngine,
  type AdmittedSurfaceBinding,
  type SurfaceRuntimeHandle,
} from '@narada-core/mcp-surface-runtime';
import {
  SurfaceExecutionDeclarationSchema,
  type SurfaceAdmissionDecision,
  type SurfaceInvocationContext,
  type ToolContractV2,
} from '@narada-core/mcp-fabric-contracts';
import { createRuntimeObservationSink } from '@narada-core/mcp-runtime-observation';

type JsonRecord = Record<string, unknown>;
const MAX_REQUEST_BYTES = 1024 * 1024;

export interface PcSiteSurfaceServiceOptions {
  site_root: string;
  token: string;
  host?: string;
  port?: number;
  registry_path?: string;
  mcp_surfaces_root?: string;
  handle_idle_ms?: number;
  event_log_path?: string;
}

function parseReplacement(value: unknown): PcSiteSurfaceReplacement {
  const record = asRecord(value);
  const drainTimeout = record.drain_timeout_ms;
  if (drainTimeout !== undefined && (!Number.isInteger(drainTimeout) || Number(drainTimeout) < 1 || Number(drainTimeout) > 60_000)) {
    throw new PcSiteSurfaceServiceError('pc_site_surface_service_drain_timeout_invalid');
  }
  return {
    site_id: requiredString(record.site_id, 'site_id'),
    authority_ref: requiredString(record.authority_ref, 'authority_ref'),
    surface_id: requiredString(record.surface_id, 'surface_id'),
    projection_id: requiredString(record.projection_id, 'projection_id'),
    instance_id: requiredString(record.instance_id, 'instance_id'),
    expected_generation_id: requiredString(record.expected_generation_id, 'expected_generation_id'),
    request_id: requiredString(record.request_id, 'request_id'),
    reason: requiredString(record.reason, 'reason'),
    ...(drainTimeout !== undefined ? { drain_timeout_ms: Number(drainTimeout) } : {}),
  };
}

async function replaceGeneration(input: {
  request: PcSiteSurfaceReplacement;
  siteRoot: string;
  siteId: string;
  authorityRef: string;
  registryPath: string;
  mcpSurfacesRoot: string;
  engine: McpSurfaceRuntimeEngine;
  handles: Map<string, SurfaceHandleLease>;
  eventLogPath: string;
  replacementEvents: JsonRecord[];
}): Promise<JsonRecord> {
  const { request } = input;
  if (request.site_id !== input.siteId) throw new PcSiteSurfaceServiceError('pc_site_surface_service_site_mismatch');
  if (request.authority_ref !== input.authorityRef) throw new PcSiteSurfaceServiceError('pc_site_surface_service_authority_mismatch');
  const registry = await readRegistry(input.registryPath);
  if (registry.site_id !== input.siteId) throw new PcSiteSurfaceServiceError('pc_site_surface_service_registry_site_changed');
  const entry = registry.surfaces.find((candidate) => (
    candidate.surface_projection.surface_id === request.surface_id
    && candidate.surface_projection.projection_id === request.projection_id
  ));
  if (!entry) throw new PcSiteSurfaceServiceError('pc_site_surface_service_binding_not_found');
  const execution = SurfaceExecutionDeclarationSchema.parse(entry.surface_projection.execution);
  if (execution.adapter !== 'surface_factory' || execution.replacement !== 'generation_swap') {
    throw new PcSiteSurfaceServiceError('pc_site_surface_service_generation_swap_not_allowed');
  }
  const instance = input.engine.status().instances.find((candidate) => (
    candidate.instance_id === request.instance_id
    && candidate.site_id === input.siteId
    && candidate.authority_ref === input.authorityRef
    && candidate.surface_id === request.surface_id
    && candidate.projection_id === request.projection_id
  ));
  if (!instance) throw new PcSiteSurfaceServiceError('pc_site_surface_service_instance_not_found');
  const lease = [...input.handles.values()].find((candidate) => candidate.handle.instance_id === instance.instance_id);
  if (!lease) throw new PcSiteSurfaceServiceError('pc_site_surface_service_instance_handle_unavailable');
  const modulePath = resolveFactoryModule(entry.runtime_binding.entrypoint, input.mcpSurfacesRoot);
  const outcome = await input.engine.replace({
    handle_id: lease.handle.handle_id,
    expected_generation_id: request.expected_generation_id,
    adapter: { kind: 'surface_factory', module_path: modulePath },
    candidate_tool_contract_digest: entry.surface_projection.tool_contract_digest,
    ...(request.drain_timeout_ms !== undefined ? { drain_timeout_ms: request.drain_timeout_ms } : {}),
  });
  const event: JsonRecord = {
    schema: 'narada.pc_site_surface_service.generation_replacement_event.v1',
    observed_at: new Date().toISOString(),
    request_id: request.request_id,
    reason: request.reason,
    site_id: input.siteId,
    authority_ref: input.authorityRef,
    surface_id: request.surface_id,
    projection_id: request.projection_id,
    outcome,
  };
  input.replacementEvents.push(event);
  if (input.replacementEvents.length > 100) input.replacementEvents.splice(0, input.replacementEvents.length - 100);
  let evidenceWriteError: string | null = null;
  try {
    await appendFile(input.eventLogPath, `${JSON.stringify(event)}\n`, 'utf8');
  } catch (error) {
    evidenceWriteError = error instanceof Error ? error.message : String(error);
  }
  return {
    schema: 'narada.pc_site_surface_service.generation_replacement.v1',
    request_id: request.request_id,
    surface_id: request.surface_id,
    projection_id: request.projection_id,
    outcome,
    observability: {
      event_persisted: evidenceWriteError === null,
      event_log_path: input.eventLogPath,
      ...(evidenceWriteError ? { error: evidenceWriteError } : {}),
    },
  };
}

export interface PcSiteSurfaceReplacement {
  site_id: string;
  authority_ref: string;
  surface_id: string;
  projection_id: string;
  instance_id: string;
  expected_generation_id: string;
  request_id: string;
  reason: string;
  drain_timeout_ms?: number;
}

export interface PcSiteSurfaceService {
  readonly url: string;
  readonly site_id: string;
  readonly authority_ref: string;
  close(): Promise<void>;
}

export interface PcSiteSurfaceInvocation {
  site_id: string;
  authority_ref: string;
  carrier_session_id: string;
  carrier_id: string;
  agent_id: string;
  surface_id: string;
  projection_id: string;
  tool_name: string;
  arguments: JsonRecord;
  admission: SurfaceAdmissionDecision;
  request_id: string;
}

type RegistrySurface = {
  surface_id: string;
  surface_projection: {
    surface_id: string;
    projection_id: string;
    injection_scope: string;
    execution?: unknown;
    tool_contract_digest: string;
    surface_descriptor: { tools: ToolContractV2[] };
  };
  runtime_binding: {
    entrypoint: string;
  };
};

type SurfaceHandleLease = {
  handle: SurfaceRuntimeHandle;
  last_used_at: number;
  inflight: number;
};

type SiteRegistry = {
  site_id: string;
  surfaces: RegistrySurface[];
};

export class PcSiteSurfaceServiceError extends Error {
  constructor(readonly code: string, readonly details: JsonRecord = {}) {
    super(code);
    this.name = 'PcSiteSurfaceServiceError';
  }
}

export function pcSiteSurfaceAuthorityRef(siteId: string): string {
  return `site:${requiredString(siteId, 'site_id')}:mcp-surfaces`;
}

export async function createPcSiteSurfaceService(
  options: PcSiteSurfaceServiceOptions,
): Promise<PcSiteSurfaceService> {
  const siteRoot = resolve(requiredString(options.site_root, 'site_root'));
  const token = requiredString(options.token, 'token');
  const host = normalizeHost(options.host);
  const port = normalizePort(options.port);
  const registryPath = resolve(options.registry_path ?? join(siteRoot, '.narada', 'capabilities', 'mcp-surfaces.json'));
  const initialRegistry = await readRegistry(registryPath);
  const siteId = initialRegistry.site_id;
  const authorityRef = pcSiteSurfaceAuthorityRef(siteId);
  const mcpSurfacesRoot = resolve(options.mcp_surfaces_root ?? inferMcpSurfacesRoot(initialRegistry));
  const handleIdleMs = normalizeHandleIdleMs(options.handle_idle_ms);
  const eventLogPath = resolve(options.event_log_path ?? join(siteRoot, '.narada', 'runtime', 'mcp-surface-service', 'events.jsonl'));
  await mkdir(dirname(eventLogPath), { recursive: true });
  const observationSink = createRuntimeObservationSink({
    site_root: siteRoot,
    source_id: 'pc-site-surface-service',
  });
  const engine = new McpSurfaceRuntimeEngine({
    observation_sink: observationSink,
    observation_parent_owner_id: 'pc-site-surface-service',
  });
  void observationSink.emit({
    schema: 'narada.mcp_runtime.resource_owner.v1',
    owner_id: 'pc-site-surface-service',
    site_id: siteId,
    authority_ref: authorityRef,
    owner_kind: 'pc_site_service',
    pid: process.pid,
    process_started_at: null,
    parent_owner_id: null,
    surface_id: null,
    instance_id: null,
    generation_id: null,
    carrier_session_id: null,
    executable_name: process.execPath,
    observed_at: new Date().toISOString(),
  });
  void observationSink.emit({
    schema: 'narada.mcp_runtime.lifecycle_event.v1',
    event_id: `event-${randomUUID()}`,
    occurred_at: new Date().toISOString(),
    site_id: siteId,
    authority_ref: authorityRef,
    owner_id: 'pc-site-surface-service',
    event_type: 'process_started',
    surface_id: null,
    instance_id: null,
    generation_id: null,
    request_id: null,
    status: 'ok',
    inflight: 0,
  });
  const handles = new Map<string, SurfaceHandleLease>();
  const pendingHandles = new Map<string, Promise<SurfaceHandleLease>>();
  const replacementEvents: JsonRecord[] = [];
  let closing = false;
  let closePromise: Promise<void> | null = null;
  let sweepTimer: NodeJS.Timeout | null = null;

  const close = async (): Promise<void> => {
    if (closePromise) return closePromise;
    closing = true;
    if (sweepTimer) clearInterval(sweepTimer);
    sweepTimer = null;
    closePromise = (async () => {
      await closeServer(server);
      await engine.close();
      await observationSink.emit({
        schema: 'narada.mcp_runtime.lifecycle_event.v1',
        event_id: `event-${randomUUID()}`,
        occurred_at: new Date().toISOString(),
        site_id: siteId,
        authority_ref: authorityRef,
        owner_id: 'pc-site-surface-service',
        event_type: 'process_exited',
        surface_id: null,
        instance_id: null,
        generation_id: null,
        request_id: null,
        status: 'ok',
        inflight: 0,
      });
    })();
    return closePromise;
  };

  const server = createServer(async (request, response) => {
    try {
      if (request.method === 'GET' && request.url === '/healthz') {
        return sendJson(response, 200, {
          schema: 'narada.pc_site_surface_service.health.v1',
          status: closing ? 'closing' : 'ready',
          site_id: siteId,
          authority_ref: authorityRef,
          instance_count: engine.status().instances.length,
        });
      }
      authenticate(request, token);
      if (request.method === 'GET' && request.url === '/v1/status') {
        return sendJson(response, 200, {
          schema: 'narada.pc_site_surface_service.status.v1',
          site_id: siteId,
          authority_ref: authorityRef,
          runtime: engine.status(),
          replacement_events: replacementEvents.slice(-20),
          event_log_path: eventLogPath,
        });
      }
      if (request.method === 'GET' && request.url === '/v1/runtime-resources') {
        return sendJson(response, 200, {
          schema: 'narada.pc_site_surface_service.runtime_resources.v1',
          site_id: siteId,
          authority_ref: authorityRef,
          resources: await engine.resourceSnapshot(),
        });
      }
      if (request.method === 'POST' && request.url === '/v1/shutdown') {
        sendJson(response, 202, {
          schema: 'narada.pc_site_surface_service.shutdown.v1',
          status: 'accepted',
          site_id: siteId,
        });
        setImmediate(() => void close());
        return;
      }
      if (request.method === 'POST' && request.url === '/v1/session/release') {
        const body = asRecord(await readJsonBody(request));
        const carrierSessionId = requiredString(body.carrier_session_id, 'carrier_session_id');
        const released = await releaseCarrierSession(handles, engine, carrierSessionId);
        return sendJson(response, 200, {
          schema: 'narada.pc_site_surface_service.session_release.v1',
          status: 'released',
          carrier_session_id: carrierSessionId,
          released_handle_count: released,
        });
      }
      if (request.method === 'POST' && request.url === '/v1/invoke') {
        const input = parseInvocation(await readJsonBody(request));
        const result = await invoke({
          input,
          siteRoot,
          siteId,
          authorityRef,
          registryPath,
          mcpSurfacesRoot,
          engine,
          handles,
          pendingHandles,
        });
        return sendJson(response, 200, result);
      }
      if (request.method === 'POST' && request.url === '/v1/generations/replace') {
        const replacement = parseReplacement(await readJsonBody(request));
        const result = await replaceGeneration({
          request: replacement,
          siteRoot,
          siteId,
          authorityRef,
          registryPath,
          mcpSurfacesRoot,
          engine,
          handles,
          eventLogPath,
          replacementEvents,
        });
        return sendJson(response, 200, result);
      }
      if (request.method === 'POST' && request.url === '/v1/heap-snapshots') {
        const body = asRecord(await readJsonBody(request));
        const incidentId = safeIdentifier(body.incident_id, 'incident_id');
        const reason = requiredString(body.reason, 'reason');
        const target = requiredString(body.target, 'target');
        if (target !== 'service_parent' && target !== 'surface_generation') {
          throw new PcSiteSurfaceServiceError('pc_site_surface_service_heap_snapshot_target_invalid');
        }
        const maxBytes = body.max_bytes === undefined ? 512 * 1024 * 1024 : Number(body.max_bytes);
        const artifactRoot = join(siteRoot, '.narada', 'runtime', 'mcp-runtime-observer', 'artifacts', incidentId);
        await mkdir(artifactRoot, { recursive: true });
        const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
        const artifactPath = join(artifactRoot, `${stamp}-${target}.heapsnapshot`);
        const instanceId = target === 'surface_generation' ? requiredString(body.instance_id, 'instance_id') : null;
        const protectedLeases = instanceId
          ? [...handles.values()].filter((lease) => lease.handle.instance_id === instanceId)
          : [];
        for (const lease of protectedLeases) { lease.inflight += 1; lease.last_used_at = Date.now(); }
        let snapshot: Awaited<ReturnType<McpSurfaceRuntimeEngine['writeHeapSnapshot']>>;
        try {
          snapshot = await engine.writeHeapSnapshot({
            target,
            path: artifactPath,
            max_bytes: maxBytes,
            ...(target === 'surface_generation' ? {
              instance_id: instanceId ?? undefined,
              expected_generation_id: requiredString(body.expected_generation_id, 'expected_generation_id'),
            } : {}),
          });
        } finally {
          for (const lease of protectedLeases) { lease.inflight -= 1; lease.last_used_at = Date.now(); }
        }
        const evidence = {
          schema: 'narada.pc_site_surface_service.heap_snapshot.v1',
          incident_id: incidentId,
          reason,
          requested_at: new Date().toISOString(),
          target,
          ...snapshot,
        };
        const metadataPath = `${artifactPath}.json`;
        const temporary = `${metadataPath}.${process.pid}.tmp`;
        await writeFile(temporary, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
        await rename(temporary, metadataPath);
        return sendJson(response, 200, evidence);
      }
      sendJson(response, 404, { code: 'pc_site_surface_service_route_not_found' });
    } catch (error) {
      const status = error instanceof PcSiteSurfaceServiceError && error.code === 'pc_site_surface_service_unauthorized'
        ? 401
        : 400;
      sendJson(response, status, {
        schema: 'narada.pc_site_surface_service.error.v1',
        code: error instanceof PcSiteSurfaceServiceError ? error.code : 'pc_site_surface_service_error',
        message: error instanceof Error ? error.message : String(error),
        details: error instanceof PcSiteSurfaceServiceError ? error.details : {},
      });
    }
  });

  sweepTimer = setInterval(() => {
    void releaseIdleHandles(handles, engine, handleIdleMs).catch(() => undefined);
  }, Math.min(60_000, Math.max(10, Math.floor(handleIdleMs / 2))));
  sweepTimer.unref();
  await listen(server, host, port);
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  return {
    url: `http://${host}:${actualPort}`,
    site_id: siteId,
    authority_ref: authorityRef,
    close,
  };
}

async function invoke(input: {
  input: PcSiteSurfaceInvocation;
  siteRoot: string;
  siteId: string;
  authorityRef: string;
  registryPath: string;
  mcpSurfacesRoot: string;
  engine: McpSurfaceRuntimeEngine;
  handles: Map<string, SurfaceHandleLease>;
  pendingHandles: Map<string, Promise<SurfaceHandleLease>>;
}): Promise<JsonRecord> {
  const { input: request } = input;
  if (request.site_id !== input.siteId) throw new PcSiteSurfaceServiceError('pc_site_surface_service_site_mismatch');
  if (request.authority_ref !== input.authorityRef) throw new PcSiteSurfaceServiceError('pc_site_surface_service_authority_mismatch');
  if (request.admission.decision !== 'admitted') throw new PcSiteSurfaceServiceError('pc_site_surface_service_action_not_admitted');
  if (request.admission.authority_ref !== input.authorityRef
    || request.admission.surface_id !== request.surface_id
    || request.admission.tool_name !== request.tool_name) {
    throw new PcSiteSurfaceServiceError('pc_site_surface_service_admission_context_mismatch');
  }

  const registry = await readRegistry(input.registryPath);
  if (registry.site_id !== input.siteId) throw new PcSiteSurfaceServiceError('pc_site_surface_service_registry_site_changed');
  const entry = registry.surfaces.find((candidate) => (
    candidate.surface_projection.surface_id === request.surface_id
    && candidate.surface_projection.projection_id === request.projection_id
  ));
  if (!entry) throw new PcSiteSurfaceServiceError('pc_site_surface_service_binding_not_found');
  const execution = SurfaceExecutionDeclarationSchema.parse(entry.surface_projection.execution);
  if (execution.adapter !== 'surface_factory') {
    throw new PcSiteSurfaceServiceError('pc_site_surface_service_factory_binding_required');
  }
  const modulePath = resolveFactoryModule(entry.runtime_binding.entrypoint, input.mcpSurfacesRoot);
  const binding: AdmittedSurfaceBinding = {
    binding_id: entry.surface_id,
    site_id: input.siteId,
    authority_ref: input.authorityRef,
    surface_id: request.surface_id,
    projection_id: request.projection_id,
    tool_contract_digest: entry.surface_projection.tool_contract_digest,
    tools: entry.surface_projection.surface_descriptor.tools,
    execution,
    site_root: input.siteRoot,
    configuration: { site_root: input.siteRoot },
  };
  const session = {
    carrier_session_id: request.carrier_session_id,
    carrier_id: request.carrier_id,
    agent_id: request.agent_id,
  };
  const handleKey = [session.carrier_session_id, request.surface_id, request.projection_id].join('\0');
  let lease = input.handles.get(handleKey);
  if (!lease) {
    let pending = input.pendingHandles.get(handleKey);
    if (!pending) {
      pending = input.engine.acquire({
        binding,
        session,
        adapter: { kind: 'surface_factory', module_path: modulePath },
      }).then((handle) => {
        const acquired = { handle, last_used_at: Date.now(), inflight: 0 };
        input.handles.set(handleKey, acquired);
        return acquired;
      });
      input.pendingHandles.set(handleKey, pending);
    }
    try {
      lease = await pending;
    } finally {
      if (input.pendingHandles.get(handleKey) === pending) input.pendingHandles.delete(handleKey);
    }
  }
  const context: SurfaceInvocationContext = {
    request_id: request.request_id,
    carrier_session_id: session.carrier_session_id,
    carrier_id: session.carrier_id,
    agent_id: session.agent_id,
    site_id: input.siteId,
    authority_ref: input.authorityRef,
    admission: request.admission,
  };
  lease.last_used_at = Date.now();
  lease.inflight += 1;
  try {
    return await input.engine.invoke({
      handle_id: lease.handle.handle_id,
      request: { tool_name: request.tool_name, arguments: request.arguments },
      context,
    }) as unknown as JsonRecord;
  } finally {
    lease.inflight -= 1;
    lease.last_used_at = Date.now();
  }
}

async function releaseCarrierSession(
  handles: Map<string, SurfaceHandleLease>,
  engine: McpSurfaceRuntimeEngine,
  carrierSessionId: string,
): Promise<number> {
  const prefix = carrierSessionId + '\0';
  const matching = [...handles.entries()].filter(([key, lease]) => key.startsWith(prefix) && lease.inflight === 0);
  for (const [key, lease] of matching) {
    handles.delete(key);
    await engine.release(lease.handle.handle_id);
  }
  return matching.length;
}

async function releaseIdleHandles(
  handles: Map<string, SurfaceHandleLease>,
  engine: McpSurfaceRuntimeEngine,
  idleMs: number,
): Promise<void> {
  const cutoff = Date.now() - idleMs;
  const expired = [...handles.entries()].filter(([, lease]) => lease.inflight === 0 && lease.last_used_at <= cutoff);
  for (const [key, lease] of expired) {
    handles.delete(key);
    await engine.release(lease.handle.handle_id);
  }
}

function resolveFactoryModule(entrypoint: string, root: string): string {
  const resolved = resolve(requiredString(entrypoint, 'runtime_binding.entrypoint'));
  const fromRoot = relative(root, resolved);
  if (!isAbsolute(root) || fromRoot === '..' || fromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(fromRoot)) {
    throw new PcSiteSurfaceServiceError('pc_site_surface_service_factory_outside_allowed_root', { entrypoint: resolved, root });
  }
  return resolved;
}

function inferMcpSurfacesRoot(registry: SiteRegistry): string {
  const first = registry.surfaces.find((entry) => entry.runtime_binding?.entrypoint)?.runtime_binding.entrypoint;
  if (!first) throw new PcSiteSurfaceServiceError('pc_site_surface_service_mcp_root_unavailable');
  let current = dirname(resolve(first));
  while (dirname(current) !== current) {
    if (basename(current).toLowerCase() === 'packages') return dirname(current);
    current = dirname(current);
  }
  throw new PcSiteSurfaceServiceError('pc_site_surface_service_mcp_root_unavailable', { entrypoint: first });
}

async function readRegistry(path: string): Promise<SiteRegistry> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new PcSiteSurfaceServiceError('pc_site_surface_service_registry_unavailable', {
      path,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  const record = asRecord(value);
  const siteId = requiredString(record.site_id, 'registry.site_id');
  if (!Array.isArray(record.surfaces)) throw new PcSiteSurfaceServiceError('pc_site_surface_service_registry_invalid');
  return { site_id: siteId, surfaces: record.surfaces as RegistrySurface[] };
}

export class PcSiteSurfaceServiceClient {
  constructor(readonly options: { url: string; token: string; fetch_fn?: typeof fetch }) {}

  async invoke(input: PcSiteSurfaceInvocation, signal?: AbortSignal): Promise<JsonRecord> {
    const fetchFn = this.options.fetch_fn ?? fetch;
    const response = await fetchFn(`${this.options.url.replace(/\/$/, '')}/v1/invoke`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.options.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal,
    });
    const body = await response.json() as JsonRecord;
    if (!response.ok) {
      throw new PcSiteSurfaceServiceError(String(body.code ?? 'pc_site_surface_service_request_failed'), asRecord(body.details));
    }
    return body;
  }

  async runtimeResources(signal?: AbortSignal): Promise<JsonRecord> {
    const fetchFn = this.options.fetch_fn ?? fetch;
    const response = await fetchFn(this.options.url.replace(/\/$/, '') + '/v1/runtime-resources', {
      headers: { authorization: 'Bearer ' + this.options.token },
      signal,
    });
    const body = await response.json() as JsonRecord;
    if (!response.ok) {
      throw new PcSiteSurfaceServiceError(String(body.code ?? 'pc_site_surface_service_request_failed'), asRecord(body.details));
    }
    return body;
  }

  async writeHeapSnapshot(input: JsonRecord, signal?: AbortSignal): Promise<JsonRecord> {
    const fetchFn = this.options.fetch_fn ?? fetch;
    const response = await fetchFn(this.options.url.replace(/\/$/, '') + '/v1/heap-snapshots', {
      method: 'POST', headers: { authorization: 'Bearer ' + this.options.token, 'content-type': 'application/json' },
      body: JSON.stringify(input), signal,
    });
    const body = await response.json() as JsonRecord;
    if (!response.ok) throw new PcSiteSurfaceServiceError(String(body.code ?? 'pc_site_surface_service_request_failed'), asRecord(body.details));
    return body;
  }

  async releaseSession(carrierSessionId: string): Promise<JsonRecord> {
    const fetchFn = this.options.fetch_fn ?? fetch;
    const response = await fetchFn(this.options.url.replace(/\/$/, '') + '/v1/session/release', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + this.options.token, 'content-type': 'application/json' },
      body: JSON.stringify({ carrier_session_id: requiredString(carrierSessionId, 'carrier_session_id') }),
    });
    const body = await response.json() as JsonRecord;
    if (!response.ok) {
      throw new PcSiteSurfaceServiceError(String(body.code ?? 'pc_site_surface_service_request_failed'), asRecord(body.details));
    }
    return body;
  }

  async replaceGeneration(input: PcSiteSurfaceReplacement, signal?: AbortSignal): Promise<JsonRecord> {
    const fetchFn = this.options.fetch_fn ?? fetch;
    const response = await fetchFn(this.options.url.replace(/\/$/, '') + '/v1/generations/replace', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + this.options.token, 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal,
    });
    const body = await response.json() as JsonRecord;
    if (!response.ok) {
      throw new PcSiteSurfaceServiceError(String(body.code ?? 'pc_site_surface_service_request_failed'), asRecord(body.details));
    }
    return body;
  }
}

function parseInvocation(value: unknown): PcSiteSurfaceInvocation {
  const record = asRecord(value);
  const args = asRecord(record.arguments);
  const admission = asRecord(record.admission);
  return {
    site_id: requiredString(record.site_id, 'site_id'),
    authority_ref: requiredString(record.authority_ref, 'authority_ref'),
    carrier_session_id: requiredString(record.carrier_session_id, 'carrier_session_id'),
    carrier_id: requiredString(record.carrier_id, 'carrier_id'),
    agent_id: requiredString(record.agent_id, 'agent_id'),
    surface_id: requiredString(record.surface_id, 'surface_id'),
    projection_id: requiredString(record.projection_id, 'projection_id'),
    tool_name: requiredString(record.tool_name, 'tool_name'),
    arguments: args,
    request_id: requiredString(record.request_id, 'request_id'),
    admission: {
      decision: requiredString(admission.decision, 'admission.decision') as SurfaceAdmissionDecision['decision'],
      decision_ref: requiredString(admission.decision_ref, 'admission.decision_ref'),
      authority_ref: requiredString(admission.authority_ref, 'admission.authority_ref'),
      surface_id: requiredString(admission.surface_id, 'admission.surface_id'),
      tool_name: requiredString(admission.tool_name, 'admission.tool_name'),
      reason: requiredString(admission.reason, 'admission.reason'),
    },
  };
}

function authenticate(request: IncomingMessage, token: string): void {
  const authorization = String(request.headers.authorization ?? '');
  const provided = /^Bearer\s+(.+)$/i.exec(authorization)?.[1] ?? '';
  const left = Buffer.from(provided);
  const right = Buffer.from(token);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new PcSiteSurfaceServiceError('pc_site_surface_service_unauthorized');
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BYTES) throw new PcSiteSurfaceServiceError('pc_site_surface_service_request_too_large');
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new PcSiteSurfaceServiceError('pc_site_surface_service_json_invalid');
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  if (response.headersSent) return;
  const json = JSON.stringify(body);
  response.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(json) });
  response.end(json);
}

function listen(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolvePromise();
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
}

function normalizeHost(value: string | undefined): string {
  const host = (value ?? '127.0.0.1').trim().toLowerCase();
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
    throw new PcSiteSurfaceServiceError('pc_site_surface_service_host_not_loopback');
  }
  return host;
}

function normalizePort(value: number | undefined): number {
  const port = value ?? 61741;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new PcSiteSurfaceServiceError('pc_site_surface_service_port_invalid');
  return port;
}

function normalizeHandleIdleMs(value: number | undefined): number {
  const idleMs = value ?? 15 * 60_000;
  if (!Number.isInteger(idleMs) || idleMs < 50 || idleMs > 24 * 60 * 60_000) {
    throw new PcSiteSurfaceServiceError('pc_site_surface_service_handle_idle_ms_invalid');
  }
  return idleMs;
}

function requiredString(value: unknown, field: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new PcSiteSurfaceServiceError('pc_site_surface_service_field_required', { field });
  return text;
}

function safeIdentifier(value: unknown, field: string): string {
  const text = requiredString(value, field);
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(text)) throw new PcSiteSurfaceServiceError('pc_site_surface_service_identifier_invalid', { field });
  return text;
}

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
