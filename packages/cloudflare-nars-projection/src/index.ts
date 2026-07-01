export const CLOUDFLARE_NARS_PROJECTION_INTENT_SCHEMA = 'narada.cloudflare_nars_projection.intent.v1';
export const CLOUDFLARE_NARS_PROJECTION_ACCESS_SCHEMA = 'narada.cloudflare_nars_projection.remote_access.v1';
export const CLOUDFLARE_NARS_PROJECTION_EVENT_SCHEMA = 'narada.cloudflare_nars_projection.event.v1';
export const CLOUDFLARE_NARS_PROJECTION_CACHE_SCHEMA = 'narada.cloudflare_nars_projection.cache.v1';
export const CLOUDFLARE_NARS_BRIDGE_STATE_SCHEMA = 'narada.cloudflare_nars_projection.bridge_state.v1';
export const CLOUDFLARE_NARS_INPUT_RELAY_SCHEMA = 'narada.cloudflare_nars_projection.input_relay.v1';
export const CLOUDFLARE_NARS_ARTIFACT_METADATA_SCHEMA = 'narada.cloudflare_nars_projection.artifact_metadata.v1';
export const CLOUDFLARE_NARS_ARTIFACT_CONTENT_SCHEMA = 'narada.cloudflare_nars_projection.artifact_content.v1';
export const CLOUDFLARE_NARS_ARTIFACT_CACHE_SCHEMA = 'narada.cloudflare_nars_projection.artifact_cache.v1';

export const CLOUDFLARE_NARS_INPUT_METHODS = [
  'conversation.send',
  'conversation.enqueue',
  'conversation.steer',
] as const;

export type CloudflareNarsInputMethod = typeof CLOUDFLARE_NARS_INPUT_METHODS[number];
export type ProjectionLifecycleState = 'active' | 'suspended' | 'revoked' | 'expired';
export type CredentialKind = 'bridge' | 'browser';
export type ProjectionCachePolicy = 'short_bounded' | 'durable_archive';
export type ProjectionEventPolicyMode = 'conversation' | 'operator' | 'diagnostic' | 'raw';
export type ArtifactKind = 'html' | 'markdown' | 'image' | 'json' | 'text';
export type ArtifactProjectionContentMode = 'none' | 'metadata_only' | 'selected_kinds' | 'explicit_artifacts';

export interface ArtifactProjectionPolicy {
  metadata: 'none' | 'public_records';
  content: ArtifactProjectionContentMode;
  allowed_kinds: ArtifactKind[];
  explicit_artifact_ids: string[];
  max_content_bytes: number;
  html: { mode: ArtifactProjectionContentMode; sandbox: 'nars_default_strict' | 'strengthen' };
  image: { mode: ArtifactProjectionContentMode };
  cache_ttl_seconds: number;
  redact_local_paths: boolean;
}

function normalizeArtifactProjectionPolicy(value: Partial<ArtifactProjectionPolicy> | null | undefined): ArtifactProjectionPolicy {
  const input = value ?? {};
  return {
    metadata: input.metadata === 'none' ? 'none' : 'public_records',
    content: normalizeArtifactContentMode(input.content, DEFAULT_ARTIFACT_POLICY.content),
    allowed_kinds: normalizeArtifactKinds(input.allowed_kinds, DEFAULT_ARTIFACT_POLICY.allowed_kinds),
    explicit_artifact_ids: Array.isArray(input.explicit_artifact_ids) ? input.explicit_artifact_ids.map(String).filter(Boolean) : [],
    max_content_bytes: Number.isFinite(Number(input.max_content_bytes)) ? Math.max(0, Math.floor(Number(input.max_content_bytes))) : DEFAULT_ARTIFACT_POLICY.max_content_bytes,
    html: {
      mode: normalizeArtifactContentMode(input.html?.mode, DEFAULT_ARTIFACT_POLICY.html.mode),
      sandbox: input.html?.sandbox === 'strengthen' ? 'strengthen' : 'nars_default_strict',
    },
    image: { mode: normalizeArtifactContentMode(input.image?.mode, DEFAULT_ARTIFACT_POLICY.image.mode) },
    cache_ttl_seconds: Number.isFinite(Number(input.cache_ttl_seconds)) ? Math.max(0, Math.floor(Number(input.cache_ttl_seconds))) : DEFAULT_ARTIFACT_POLICY.cache_ttl_seconds,
    redact_local_paths: input.redact_local_paths !== false,
  };
}

function isSameProjectedEvent(entry: BoundedProjectionCacheEntry, event: ProjectedEvent): boolean {
  if (entry.projection_id !== event.projection_id) return false;
  if (entry.event_sequence != null && event.event_sequence != null) return entry.event_sequence === event.event_sequence;
  if (entry.event_id && event.event_id) return entry.event_id === event.event_id;
  return false;
}

function normalizeArtifactContentMode(value: unknown, fallback: ArtifactProjectionContentMode): ArtifactProjectionContentMode {
  if (value === 'none' || value === 'metadata_only' || value === 'selected_kinds' || value === 'explicit_artifacts') return value;
  return fallback;
}

function normalizeArtifactKind(value: unknown): ArtifactKind | null {
  if (value === 'html' || value === 'markdown' || value === 'image' || value === 'json' || value === 'text') return value;
  return null;
}

function normalizeArtifactKinds(value: unknown, fallback: ArtifactKind[]): ArtifactKind[] {
  if (!Array.isArray(value)) return [...fallback];
  const kinds = value.flatMap((entry) => {
    const kind = normalizeArtifactKind(entry);
    return kind ? [kind] : [];
  });
  return kinds.length ? [...new Set(kinds)] : [...fallback];
}

function artifactContentAllowed(policy: ArtifactProjectionPolicy, artifactId: string, kind: ArtifactKind): boolean {
  if (kind === 'html') return policy.html.mode === 'explicit_artifacts' && policy.explicit_artifact_ids.includes(artifactId);
  if (kind === 'image') return policy.image.mode === 'explicit_artifacts' && policy.explicit_artifact_ids.includes(artifactId);
  if (policy.content === 'none' || policy.content === 'metadata_only') return false;
  if (policy.content === 'explicit_artifacts') return policy.explicit_artifact_ids.includes(artifactId);
  return policy.allowed_kinds.includes(kind);
}

function contentTypeForArtifactKind(kind: ArtifactKind): string {
  if (kind === 'html') return 'text/html; charset=utf-8';
  if (kind === 'markdown') return 'text/markdown; charset=utf-8';
  if (kind === 'json') return 'application/json; charset=utf-8';
  if (kind === 'text') return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

function objectField(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function strengthenArtifactHeaders(kind: ArtifactKind, headers: Record<string, string>, metadata: ProjectedArtifactMetadata): Record<string, string> {
  const next = { ...headers };
  next['x-narada-artifact-id'] = metadata.artifact_id;
  next['x-narada-artifact-kind'] = kind;
  if (kind === 'html' && !next['content-security-policy']) {
    next['content-security-policy'] = "sandbox allow-scripts allow-forms; default-src 'self' data: blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'";
  }
  return next;
}

function bytesToBase64(bytes: Uint8Array): string {
  const bufferCtor = (globalThis as typeof globalThis & { Buffer?: { from(value: Uint8Array): { toString(encoding: 'base64'): string } } }).Buffer;
  if (bufferCtor) return bufferCtor.from(bytes).toString('base64');
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function refusedArtifactMetadataRead(projectionId: string, code: string): CloudflareNarsArtifactMetadataReadResult {
  return { schema: CLOUDFLARE_NARS_ARTIFACT_CACHE_SCHEMA, status: 'refused', code, projection_id: projectionId, artifacts: [], artifact_count: 0 };
}

function refusedArtifactContentRead(projectionId: string, artifactId: string, code: string): CloudflareNarsArtifactContentReadResult {
  return { schema: CLOUDFLARE_NARS_ARTIFACT_CACHE_SCHEMA, status: 'refused', code, projection_id: projectionId, artifact_id: artifactId };
}

export function createArtifactProjectionCache() {
  const metadata = new Map<string, ProjectedArtifactMetadata[]>();
  const content = new Map<string, ProjectedArtifactContent>();
  return {
    putMetadata(record: ProjectedArtifactMetadata) {
      const current = metadata.get(record.projection_id) ?? [];
      const next = [...current.filter((entry) => entry.artifact_id !== record.artifact_id), record];
      metadata.set(record.projection_id, next);
      return { status: 'cached', projection_id: record.projection_id, artifact_id: record.artifact_id };
    },
    putContent(record: ProjectedArtifactContent) {
      content.set(`${record.projection_id}:${record.artifact_id}`, record);
      return { status: 'cached', projection_id: record.projection_id, artifact_id: record.artifact_id };
    },
    readMetadata(projectionId: string, artifactId: string | null): Omit<CloudflareNarsArtifactMetadataReadResult, 'status' | 'code'> {
      const all = metadata.get(projectionId) ?? [];
      const artifacts = artifactId ? all.filter((entry) => entry.artifact_id === artifactId) : all;
      return { schema: CLOUDFLARE_NARS_ARTIFACT_CACHE_SCHEMA, projection_id: projectionId, artifacts, artifact_count: artifacts.length };
    },
    readContent(projectionId: string, artifactId: string): CloudflareNarsArtifactContentReadResult {
      const cached = content.get(`${projectionId}:${artifactId}`);
      if (!cached) return refusedArtifactContentRead(projectionId, artifactId, 'artifact_content_cache_miss');
      return { schema: CLOUDFLARE_NARS_ARTIFACT_CACHE_SCHEMA, status: 'ok', projection_id: projectionId, artifact_id: artifactId, content: cached };
    },
  };
}

export interface CloudflareNarsArtifactPublishResult {
  status: 'published' | 'refused';
  code?: string;
  projection_id: string;
  metadata?: ProjectedArtifactMetadata;
}

export interface CloudflareNarsArtifactContentPublishResult {
  status: 'published' | 'refused';
  code?: string;
  projection_id: string;
  content?: ProjectedArtifactContent;
}

export interface CloudflareNarsArtifactMetadataReadResult {
  schema: typeof CLOUDFLARE_NARS_ARTIFACT_CACHE_SCHEMA;
  status: 'ok' | 'refused';
  code?: string;
  projection_id: string;
  artifacts: ProjectedArtifactMetadata[];
  artifact_count: number;
}

export interface CloudflareNarsArtifactContentReadResult {
  schema: typeof CLOUDFLARE_NARS_ARTIFACT_CACHE_SCHEMA;
  status: 'ok' | 'refused';
  code?: string;
  projection_id: string;
  artifact_id: string;
  content?: ProjectedArtifactContent;
}

export interface ProjectionLaneStatus {
  status: 'disabled' | 'connected' | 'degraded' | 'refused' | 'stale';
  last_projected_at: string | null;
  projected_count: number;
  refused_count: number;
  last_error_code: string | null;
}

export interface CloudflareNarsProjectionIntentInput {
  projection_id?: string;
  site_id: string;
  site_root?: string | null;
  nars_session_id: string;
  local_bridge_id?: string;
  target?: 'cloudflare';
  event_stream_policy?: ProjectionEventPolicyMode;
  artifact_projection_policy?: Partial<ArtifactProjectionPolicy> | null;
  operator_input_policy?: CloudflareNarsInputMethod[];
  replica_cache_policy?: ProjectionCachePolicy;
  created_by?: string;
  created_at?: string;
  expires_at?: string | null;
  remote_registration?: Record<string, unknown> | null;
}

export function createCloudflareNarsProjectionWorkerService(options: {
  max_events?: number;
  nars_input_relay?: (input: { projection_id: string; method: CloudflareNarsInputMethod; payload: Record<string, unknown> }) => unknown | Promise<unknown>;
} = {}) {
  const accessRecords = new Map<string, CloudflareNarsRemoteAccessRecord>();
  const cache = createBoundedProjectionCache(options.max_events ?? 200);
  const artifactCache = createArtifactProjectionCache();
  const pendingInputs = new Map<string, CloudflareNarsPendingInput[]>();
  return {
    register(record: CloudflareNarsRemoteAccessRecord) {
      accessRecords.set(record.projection_id, record);
      return { status: 'registered', projection_id: record.projection_id, remote_access: record };
    },
    registerIntent(intent: CloudflareNarsProjectionIntent, createdAt = new Date().toISOString()) {
      const record = createCloudflareNarsRemoteAccessRecord({ intent, created_at: createdAt });
      accessRecords.set(record.projection_id, record);
      return { status: 'registered', projection_id: record.projection_id, remote_access: record };
    },
    revokeProjection(projectionId: string, revokedAt = new Date().toISOString()) {
      const record = accessRecords.get(projectionId);
      if (!record) return { status: 'refused', code: 'projection_not_found', projection_id: projectionId };
      const next = revokeProjection(record, revokedAt);
      accessRecords.set(projectionId, next);
      return { status: 'revoked', projection_id: projectionId };
    },
    publishEvent(args: {
      projection_id: string;
      bridge_token_fingerprint: string;
      site_id?: string;
      nars_session_id?: string;
      event: Record<string, unknown>;
      now?: string;
    }): CloudflareNarsProjectionBridgePublishResult {
      const record = accessRecords.get(args.projection_id);
      if (!record) return { status: 'refused', code: 'projection_not_found', projection_id: args.projection_id };
      const access = validateProjectionCredential(record, {
        credential_kind: 'bridge',
        token_fingerprint: args.bridge_token_fingerprint,
        action: 'publish_event',
        now: args.now,
      });
      if (!access.ok) return { status: 'refused', code: access.code, projection_id: args.projection_id };
      const projected = projectNarsEventForCloudflare({
        projection_id: record.projection_id,
        site_id: args.site_id ?? record.site_id,
        nars_session_id: args.nars_session_id ?? record.nars_session_id,
        policy: record.event_stream_policy,
        event: args.event,
        projected_at: args.now,
      });
      if (!projected) return { status: 'suppressed', code: 'event_policy_suppressed', projection_id: args.projection_id };
      cache.push(projected);
      return { status: 'published', projection_id: args.projection_id, event: projected };
    },
    publishArtifactMetadata(args: {
      projection_id: string;
      bridge_token_fingerprint: string;
      artifact: Record<string, unknown>;
      now?: string;
    }): CloudflareNarsArtifactPublishResult {
      const record = accessRecords.get(args.projection_id);
      if (!record) return { status: 'refused', code: 'projection_not_found', projection_id: args.projection_id };
      const access = validateProjectionCredential(record, {
        credential_kind: 'bridge',
        token_fingerprint: args.bridge_token_fingerprint,
        action: 'publish_artifact',
        now: args.now,
      });
      if (!access.ok) return { status: 'refused', code: access.code, projection_id: args.projection_id };
      const projected = projectNarsArtifactMetadataForCloudflare({
        projection_id: record.projection_id,
        site_id: record.site_id,
        nars_session_id: record.nars_session_id,
        policy: record.artifact_projection_policy,
        artifact: args.artifact,
        projected_at: args.now,
      });
      if (!projected.ok) return { status: 'refused', code: projected.code, projection_id: args.projection_id };
      artifactCache.putMetadata(projected.metadata);
      return { status: 'published', projection_id: args.projection_id, metadata: projected.metadata };
    },
    publishArtifactContent(args: {
      projection_id: string;
      bridge_token_fingerprint: string;
      artifact: Record<string, unknown>;
      content: string | Uint8Array;
      headers?: Record<string, string>;
      now?: string;
    }): CloudflareNarsArtifactContentPublishResult {
      const record = accessRecords.get(args.projection_id);
      if (!record) return { status: 'refused', code: 'projection_not_found', projection_id: args.projection_id };
      const access = validateProjectionCredential(record, {
        credential_kind: 'bridge',
        token_fingerprint: args.bridge_token_fingerprint,
        action: 'publish_artifact',
        now: args.now,
      });
      if (!access.ok) return { status: 'refused', code: access.code, projection_id: args.projection_id };
      const projected = projectNarsArtifactContentForCloudflare({
        projection_id: record.projection_id,
        site_id: record.site_id,
        nars_session_id: record.nars_session_id,
        policy: record.artifact_projection_policy,
        artifact: args.artifact,
        content: args.content,
        headers: args.headers,
        projected_at: args.now,
      });
      if (!projected.ok) return { status: 'refused', code: projected.code, projection_id: args.projection_id };
      artifactCache.putContent(projected.content);
      return { status: 'published', projection_id: args.projection_id, content: projected.content };
    },
    readEvents(args: {
      projection_id: string;
      browser_token_fingerprint: string;
      since_sequence?: number | null;
      max_events?: number;
      now?: string;
    }): CloudflareNarsProjectionWorkerReadResult {
      const record = accessRecords.get(args.projection_id);
      if (!record) return refusedCacheRead(args.projection_id, 'projection_not_found', args.since_sequence ?? null);
      const access = validateProjectionCredential(record, {
        credential_kind: 'browser',
        token_fingerprint: args.browser_token_fingerprint,
        action: 'subscribe_events',
        now: args.now,
      });
      if (!access.ok) return refusedCacheRead(args.projection_id, access.code ?? 'access_refused', args.since_sequence ?? null);
      return { status: 'ok', ...cache.read(args.projection_id, { since_sequence: args.since_sequence ?? null, max_events: args.max_events }) };
    },
    readArtifactMetadata(args: {
      projection_id: string;
      browser_token_fingerprint: string;
      artifact_id?: string | null;
      now?: string;
    }): CloudflareNarsArtifactMetadataReadResult {
      const record = accessRecords.get(args.projection_id);
      if (!record) return refusedArtifactMetadataRead(args.projection_id, 'projection_not_found');
      const access = validateProjectionCredential(record, {
        credential_kind: 'browser',
        token_fingerprint: args.browser_token_fingerprint,
        action: 'read_artifact',
        now: args.now,
      });
      if (!access.ok) return refusedArtifactMetadataRead(args.projection_id, access.code ?? 'access_refused');
      return { status: 'ok', ...artifactCache.readMetadata(args.projection_id, args.artifact_id ?? null) };
    },
    readArtifactContent(args: {
      projection_id: string;
      browser_token_fingerprint: string;
      artifact_id: string;
      now?: string;
    }): CloudflareNarsArtifactContentReadResult {
      const record = accessRecords.get(args.projection_id);
      if (!record) return refusedArtifactContentRead(args.projection_id, args.artifact_id, 'projection_not_found');
      const access = validateProjectionCredential(record, {
        credential_kind: 'browser',
        token_fingerprint: args.browser_token_fingerprint,
        action: 'read_artifact',
        now: args.now,
      });
      if (!access.ok) return refusedArtifactContentRead(args.projection_id, args.artifact_id, access.code ?? 'access_refused');
      return artifactCache.readContent(args.projection_id, args.artifact_id);
    },
    async submitInput(args: {
      projection_id: string;
      browser_token_fingerprint: string;
      method: string;
      payload?: Record<string, unknown>;
      now?: string;
    }): Promise<CloudflareNarsProjectionInputRelayResult> {
      const record = accessRecords.get(args.projection_id);
      if (!record) {
        return { schema: CLOUDFLARE_NARS_INPUT_RELAY_SCHEMA, ok: false, code: 'projection_not_found', method: args.method, acknowledgement: 'refused_before_cloudflare_relay' };
      }
      const classified = classifyCloudflareInputRelay(record, {
        token_fingerprint: args.browser_token_fingerprint,
        method: args.method,
        now: args.now,
      }) as CloudflareNarsProjectionInputRelayResult;
      if (!classified.ok) return classified;
      const method = args.method as CloudflareNarsInputMethod;
      const narsAdmission = options.nars_input_relay
        ? await options.nars_input_relay({ projection_id: args.projection_id, method, payload: args.payload ?? {} })
        : null;
      if (narsAdmission) return { ...classified, nars_admission: narsAdmission };
      const now = args.now ?? new Date().toISOString();
      const input: CloudflareNarsPendingInput = {
        schema: CLOUDFLARE_NARS_INPUT_RELAY_SCHEMA,
        input_id: `input_${now.replace(/[^0-9A-Za-z]+/g, '')}_${Math.random().toString(36).slice(2, 8)}`,
        projection_id: args.projection_id,
        method,
        payload: args.payload ?? {},
        status: 'pending_bridge_delivery',
        submitted_at: now,
        updated_at: now,
      };
      pendingInputs.set(args.projection_id, [...(pendingInputs.get(args.projection_id) ?? []), input]);
      return { ...classified, input_id: input.input_id, acknowledgement: 'pending_bridge_delivery' };
    },
    claimPendingInputs(args: { projection_id: string; bridge_token_fingerprint: string; max_inputs?: number; now?: string }) {
      const record = accessRecords.get(args.projection_id);
      if (!record) return { schema: CLOUDFLARE_NARS_INPUT_RELAY_SCHEMA, status: 'refused', code: 'projection_not_found', projection_id: args.projection_id, inputs: [] };
      const access = validateProjectionCredential(record, { credential_kind: 'bridge', token_fingerprint: args.bridge_token_fingerprint, action: 'deliver_input', now: args.now });
      if (!access.ok) return { schema: CLOUDFLARE_NARS_INPUT_RELAY_SCHEMA, status: 'refused', code: access.code, projection_id: args.projection_id, inputs: [] };
      const now = args.now ?? new Date().toISOString();
      const limit = Math.max(0, Math.floor(args.max_inputs ?? 20));
      const all = pendingInputs.get(args.projection_id) ?? [];
      const claimed = all.filter((input) => input.status === 'pending_bridge_delivery').slice(0, limit).map((input) => ({ ...input, status: 'delivered_to_bridge' as const, updated_at: now }));
      pendingInputs.set(args.projection_id, all.map((input) => claimed.find((next) => next.input_id === input.input_id) ?? input));
      return { schema: CLOUDFLARE_NARS_INPUT_RELAY_SCHEMA, status: 'ok', projection_id: args.projection_id, inputs: claimed, input_count: claimed.length };
    },
    acknowledgeInput(args: { projection_id: string; bridge_token_fingerprint: string; input_id: string; nars_admission: unknown; ok?: boolean; now?: string }) {
      const record = accessRecords.get(args.projection_id);
      if (!record) return { schema: CLOUDFLARE_NARS_INPUT_RELAY_SCHEMA, status: 'refused', code: 'projection_not_found', projection_id: args.projection_id, input_id: args.input_id };
      const access = validateProjectionCredential(record, { credential_kind: 'bridge', token_fingerprint: args.bridge_token_fingerprint, action: 'deliver_input', now: args.now });
      if (!access.ok) return { schema: CLOUDFLARE_NARS_INPUT_RELAY_SCHEMA, status: 'refused', code: access.code, projection_id: args.projection_id, input_id: args.input_id };
      const now = args.now ?? new Date().toISOString();
      const all = pendingInputs.get(args.projection_id) ?? [];
      let found = false;
      const next = all.map((input) => {
        if (input.input_id !== args.input_id) return input;
        found = true;
        return { ...input, status: args.ok === false ? 'refused_by_nars' as const : 'admitted_by_nars' as const, nars_admission: args.nars_admission, updated_at: now };
      });
      pendingInputs.set(args.projection_id, next);
      return found
        ? { schema: CLOUDFLARE_NARS_INPUT_RELAY_SCHEMA, status: 'acknowledged', projection_id: args.projection_id, input_id: args.input_id }
        : { schema: CLOUDFLARE_NARS_INPUT_RELAY_SCHEMA, status: 'refused', code: 'input_not_found', projection_id: args.projection_id, input_id: args.input_id };
    },
  };
}

export function projectNarsArtifactMetadataForCloudflare(input: {
  projection_id: string;
  site_id: string;
  nars_session_id: string;
  artifact: Record<string, unknown>;
  policy?: ArtifactProjectionPolicy;
  projected_at?: string;
}): { ok: true; metadata: ProjectedArtifactMetadata } | { ok: false; code: string } {
  const policy = normalizeArtifactProjectionPolicy(input.policy);
  if (policy.metadata !== 'public_records') return { ok: false, code: 'artifact_metadata_policy_refused' };
  const artifactId = stringField(input.artifact.artifact_id);
  if (!artifactId) return { ok: false, code: 'artifact_id_required' };
  const kind = normalizeArtifactKind(input.artifact.kind);
  if (!kind) return { ok: false, code: 'artifact_kind_unsupported' };
  const lifecycle = objectField(input.artifact.lifecycle) ?? { state: 'active', owner: 'nars-session' };
  if (stringField(lifecycle.state) && lifecycle.state !== 'active') return { ok: false, code: 'artifact_not_active' };
  const publicRecord = { ...input.artifact };
  delete publicRecord.source_path;
  delete publicRecord.sourcePath;
  const redactions = policy.redact_local_paths ? ['source_path'] : [];
  return {
    ok: true,
    metadata: {
      schema: CLOUDFLARE_NARS_ARTIFACT_METADATA_SCHEMA,
      projection_id: input.projection_id,
      site_id: input.site_id,
      nars_session_id: input.nars_session_id,
      artifact_id: artifactId,
      kind,
      title: stringField(publicRecord.title),
      content_type: stringField(publicRecord.content_type) ?? contentTypeForArtifactKind(kind),
      created_at: stringField(publicRecord.created_at),
      access: objectField(publicRecord.access) ?? { scope: 'session', token_required: false },
      render: objectField(publicRecord.render) ?? { preferred: 'inline' },
      lifecycle,
      projected_at: input.projected_at ?? new Date().toISOString(),
      redactions,
    },
  };
}

export function projectNarsArtifactContentForCloudflare(input: {
  projection_id: string;
  site_id: string;
  nars_session_id: string;
  artifact: Record<string, unknown>;
  content: string | Uint8Array;
  headers?: Record<string, string>;
  policy?: ArtifactProjectionPolicy;
  projected_at?: string;
}): { ok: true; content: ProjectedArtifactContent } | { ok: false; code: string } {
  const metadata = projectNarsArtifactMetadataForCloudflare(input);
  if (!metadata.ok) return metadata;
  const policy = normalizeArtifactProjectionPolicy(input.policy);
  const kind = metadata.metadata.kind;
  if (!artifactContentAllowed(policy, metadata.metadata.artifact_id, kind)) return { ok: false, code: 'artifact_content_policy_refused' };
  const bytes = typeof input.content === 'string' ? new TextEncoder().encode(input.content) : input.content;
  if (bytes.byteLength > policy.max_content_bytes) return { ok: false, code: 'artifact_content_too_large' };
  const headers = strengthenArtifactHeaders(kind, input.headers ?? {}, metadata.metadata);
  return {
    ok: true,
    content: {
      schema: CLOUDFLARE_NARS_ARTIFACT_CONTENT_SCHEMA,
      projection_id: input.projection_id,
      site_id: input.site_id,
      nars_session_id: input.nars_session_id,
      artifact_id: metadata.metadata.artifact_id,
      kind,
      content_type: metadata.metadata.content_type,
      content_base64: bytesToBase64(bytes),
      byte_length: bytes.byteLength,
      headers,
      projected_at: input.projected_at ?? new Date().toISOString(),
    },
  };
}

export function projectionDegradedLaunchResult(args: {
  projection_id: string;
  reason: string;
  local_nars_status?: 'started' | 'already_running' | 'unknown';
  local_nars_healthy?: boolean | null;
  retry_after_ms?: number | null;
}) {
  return {
    schema: 'narada.cloudflare_nars_projection.degraded_launch.v1',
    status: 'local_only_projection_degraded',
    projection_id: args.projection_id,
    reason: args.reason,
    local_nars_status: args.local_nars_status ?? 'unknown',
    retry_after_ms: args.retry_after_ms ?? null,
    local_nars_healthy: args.local_nars_healthy ?? null,
  };
}

function refusedCacheRead(projectionId: string, code: string, sinceSequence: number | null): CloudflareNarsProjectionWorkerReadResult {
  return {
    schema: CLOUDFLARE_NARS_PROJECTION_CACHE_SCHEMA,
    status: 'refused',
    code,
    projection_id: projectionId,
    source: 'cloudflare_projection_cache',
    events: [],
    event_count: 0,
    has_more: false,
    truncated: false,
    cursor: { since_sequence: sinceSequence, last_sequence: null, next_sequence: null },
  };
}

export interface CloudflareNarsProjectionIntent {
  schema: typeof CLOUDFLARE_NARS_PROJECTION_INTENT_SCHEMA;
  projection_id: string;
  site_id: string;
  site_root: string | null;
  nars_session_id: string;
  local_bridge_id: string;
  target: 'cloudflare';
  event_stream_policy: ProjectionEventPolicyMode;
  artifact_projection_policy: ArtifactProjectionPolicy;
  operator_input_policy: CloudflareNarsInputMethod[];
  replica_cache_policy: ProjectionCachePolicy;
  lifecycle_state: ProjectionLifecycleState;
  created_by: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  remote_registration: Record<string, unknown> | null;
}

export interface ProjectionCredentialRecord {
  credential_id: string;
  kind: CredentialKind;
  status: 'active' | 'revoked' | 'expired';
  token_fingerprint: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
}

export interface CloudflareNarsRemoteAccessRecord {
  schema: typeof CLOUDFLARE_NARS_PROJECTION_ACCESS_SCHEMA;
  projection_id: string;
  site_id: string;
  nars_session_id: string;
  lifecycle_state: ProjectionLifecycleState;
  event_stream_policy: ProjectionEventPolicyMode;
  artifact_projection_policy: ArtifactProjectionPolicy;
  operator_input_policy: CloudflareNarsInputMethod[];
  replica_cache_policy: ProjectionCachePolicy;
  bridge_credential: ProjectionCredentialRecord;
  browser_access_tokens: ProjectionCredentialRecord[];
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
}

export interface ProjectionAccessValidation {
  ok: boolean;
  code?: string;
  credential_kind?: CredentialKind;
  action?: ProjectionCredentialAction;
  projection_id?: string;
}

export interface ProjectedEvent {
  schema: typeof CLOUDFLARE_NARS_PROJECTION_EVENT_SCHEMA;
  projection_id: string;
  site_id: string;
  nars_session_id: string;
  event_sequence: number | null;
  event_id: string | null;
  event_class: string;
  projected_at: string;
  payload: Record<string, unknown>;
  redactions: string[];
}

export interface ProjectedArtifactMetadata {
  schema: typeof CLOUDFLARE_NARS_ARTIFACT_METADATA_SCHEMA;
  projection_id: string;
  site_id: string;
  nars_session_id: string;
  artifact_id: string;
  kind: ArtifactKind;
  title: string | null;
  content_type: string;
  created_at: string | null;
  access: Record<string, unknown>;
  render: Record<string, unknown>;
  lifecycle: Record<string, unknown>;
  projected_at: string;
  redactions: string[];
}

export interface ProjectedArtifactContent {
  schema: typeof CLOUDFLARE_NARS_ARTIFACT_CONTENT_SCHEMA;
  projection_id: string;
  site_id: string;
  nars_session_id: string;
  artifact_id: string;
  kind: ArtifactKind;
  content_type: string;
  content_base64: string;
  byte_length: number;
  headers: Record<string, string>;
  projected_at: string;
}

export interface BoundedProjectionCacheEntry {
  projection_id: string;
  event_sequence: number | null;
  event_id: string | null;
  event: ProjectedEvent;
}

export interface BoundedProjectionCacheRead {
  schema: typeof CLOUDFLARE_NARS_PROJECTION_CACHE_SCHEMA;
  projection_id: string;
  source: 'cloudflare_projection_cache';
  events: ProjectedEvent[];
  event_count: number;
  has_more: boolean;
  truncated: boolean;
  cursor: {
    since_sequence: number | null;
    last_sequence: number | null;
    next_sequence: number | null;
  };
}

export interface BridgeStateInput {
  projection_id: string;
  site_id: string;
  nars_session_id: string;
  status?: 'created' | 'connected' | 'degraded' | 'retrying' | 'stopped';
  last_replicated_sequence?: number | null;
  artifact_metadata_status?: ProjectionLaneStatus | null;
  artifact_content_status?: ProjectionLaneStatus | null;
  degraded_reason?: string | null;
  retry_after_ms?: number | null;
  updated_at?: string;
}

export interface BridgeState {
  schema: typeof CLOUDFLARE_NARS_BRIDGE_STATE_SCHEMA;
  projection_id: string;
  site_id: string;
  nars_session_id: string;
  status: 'created' | 'connected' | 'degraded' | 'retrying' | 'stopped';
  last_replicated_sequence: number | null;
  artifact_metadata_status: ProjectionLaneStatus | null;
  artifact_content_status: ProjectionLaneStatus | null;
  degraded_reason: string | null;
  retry_after_ms: number | null;
  updated_at: string;
}

export interface BackfillPlan {
  projection_id: string;
  source: 'local_nars_events_log';
  from_sequence: number;
  mode: 'resume' | 'initial';
}

export interface CloudflareNarsProjectionBridgePublishResult {
  status: 'published' | 'refused' | 'suppressed';
  code?: string;
  projection_id: string;
  event?: ProjectedEvent;
}

export interface CloudflareNarsProjectionWorkerReadResult extends BoundedProjectionCacheRead {
  status: 'ok' | 'refused';
  code?: string;
}

export interface CloudflareNarsProjectionInputRelayResult {
  schema: typeof CLOUDFLARE_NARS_INPUT_RELAY_SCHEMA;
  ok: boolean;
  code: string | undefined;
  method: string;
  acknowledgement: string;
  input_id?: string;
  semantic_success_point?: 'nars_admission';
  nars_admission?: unknown;
}

export interface CloudflareNarsPendingInput {
  schema: typeof CLOUDFLARE_NARS_INPUT_RELAY_SCHEMA;
  input_id: string;
  projection_id: string;
  method: CloudflareNarsInputMethod;
  payload: Record<string, unknown>;
  status: 'pending_bridge_delivery' | 'delivered_to_bridge' | 'admitted_by_nars' | 'refused_by_nars';
  submitted_at: string;
  updated_at: string;
  nars_admission?: unknown;
}

export interface AgentWebUiCloudflareProjectionConfig {
  mode: 'cloudflare_projection';
  projection_id: string;
  api_base_url: string;
  event_endpoint: string;
  health_endpoint: string;
  input_endpoint: string;
  cache_endpoint: string;
  artifact_base_path: string;
  artifact_metadata_endpoint: string;
}

const DEFAULT_EVENT_POLICY: ProjectionEventPolicyMode = 'operator';
const DEFAULT_ARTIFACT_POLICY: ArtifactProjectionPolicy = {
  metadata: 'public_records',
  content: 'selected_kinds',
  allowed_kinds: ['markdown', 'json', 'text'],
  explicit_artifact_ids: [],
  max_content_bytes: 1048576,
  html: { mode: 'metadata_only', sandbox: 'nars_default_strict' },
  image: { mode: 'metadata_only' },
  cache_ttl_seconds: 3600,
  redact_local_paths: true,
};
type ProjectionCredentialAction = 'publish_event' | 'subscribe_events' | 'submit_input' | 'serve_cache' | 'publish_artifact' | 'read_artifact' | 'deliver_input';

export function createCloudflareNarsProjectionIntent(input: CloudflareNarsProjectionIntentInput, now = new Date().toISOString()): CloudflareNarsProjectionIntent {
  const siteId = requireNonEmpty(input.site_id, 'site_id');
  const sessionId = requireNonEmpty(input.nars_session_id, 'nars_session_id');
  const projectionId = input.projection_id?.trim() || `proj_${safeToken(siteId)}_${safeToken(sessionId)}`;
  return {
    schema: CLOUDFLARE_NARS_PROJECTION_INTENT_SCHEMA,
    projection_id: projectionId,
    site_id: siteId,
    site_root: input.site_root ?? null,
    nars_session_id: sessionId,
    local_bridge_id: input.local_bridge_id?.trim() || `bridge_${safeToken(projectionId)}`,
    target: 'cloudflare',
    event_stream_policy: normalizeEventPolicy(input.event_stream_policy),
    artifact_projection_policy: normalizeArtifactProjectionPolicy(input.artifact_projection_policy),
    operator_input_policy: normalizeInputPolicy(input.operator_input_policy),
    replica_cache_policy: input.replica_cache_policy === 'durable_archive' ? 'durable_archive' : 'short_bounded',
    lifecycle_state: 'active',
    created_by: input.created_by?.trim() || 'operator',
    created_at: input.created_at ?? now,
    expires_at: input.expires_at ?? null,
    revoked_at: null,
    remote_registration: input.remote_registration ?? null,
  };
}

export function createCloudflareNarsRemoteAccessRecord(input: {
  intent: CloudflareNarsProjectionIntent;
  bridge_token_fingerprint?: string;
  browser_token_fingerprints?: string[];
  created_at?: string;
}): CloudflareNarsRemoteAccessRecord {
  const now = input.created_at ?? new Date().toISOString();
  const bridgeFingerprint = input.bridge_token_fingerprint?.trim() || `fingerprint:${input.intent.projection_id}:bridge`;
  const browserFingerprints = input.browser_token_fingerprints?.length ? input.browser_token_fingerprints : [`fingerprint:${input.intent.projection_id}:browser`];
  return {
    schema: CLOUDFLARE_NARS_PROJECTION_ACCESS_SCHEMA,
    projection_id: input.intent.projection_id,
    site_id: input.intent.site_id,
    nars_session_id: input.intent.nars_session_id,
    lifecycle_state: input.intent.lifecycle_state,
    event_stream_policy: input.intent.event_stream_policy,
    artifact_projection_policy: input.intent.artifact_projection_policy,
    operator_input_policy: [...input.intent.operator_input_policy],
    replica_cache_policy: input.intent.replica_cache_policy,
    bridge_credential: createCredentialRecord('bridge', bridgeFingerprint, now),
    browser_access_tokens: browserFingerprints.map((fingerprint, index) => createCredentialRecord('browser', fingerprint, now, index)),
    created_at: now,
    expires_at: input.intent.expires_at,
    revoked_at: input.intent.revoked_at,
  };
}

export function validateProjectionCredential(record: CloudflareNarsRemoteAccessRecord, args: {
  credential_kind: CredentialKind;
  token_fingerprint: string;
  action: ProjectionCredentialAction;
  method?: CloudflareNarsInputMethod;
  now?: string;
}): ProjectionAccessValidation {
  const projectionStatus = projectionLifecycleStatus(record, args.now);
  if (projectionStatus !== 'active') {
    return { ok: false, code: `projection_${projectionStatus}`, credential_kind: args.credential_kind, action: args.action, projection_id: record.projection_id };
  }
  const credential = findCredential(record, args.credential_kind, args.token_fingerprint);
  if (!credential) {
    return { ok: false, code: 'credential_not_found_for_kind', credential_kind: args.credential_kind, action: args.action, projection_id: record.projection_id };
  }
  if (credential.status !== 'active') {
    return { ok: false, code: `credential_${credential.status}`, credential_kind: args.credential_kind, action: args.action, projection_id: record.projection_id };
  }
  if (credential.expires_at && args.now && credential.expires_at <= args.now) {
    return { ok: false, code: 'credential_expired', credential_kind: args.credential_kind, action: args.action, projection_id: record.projection_id };
  }
  if ((args.action === 'publish_event' || args.action === 'publish_artifact' || args.action === 'deliver_input') !== (args.credential_kind === 'bridge')) {
    return { ok: false, code: 'credential_kind_not_authorized_for_action', credential_kind: args.credential_kind, action: args.action, projection_id: record.projection_id };
  }
  if ((args.action === 'subscribe_events' || args.action === 'submit_input' || args.action === 'serve_cache' || args.action === 'read_artifact') && args.credential_kind !== 'browser') {
    return { ok: false, code: 'credential_kind_not_authorized_for_action', credential_kind: args.credential_kind, action: args.action, projection_id: record.projection_id };
  }
  if (args.action === 'submit_input') {
    if (!args.method || !record.operator_input_policy.includes(args.method)) {
      return { ok: false, code: 'operator_input_method_not_admitted', credential_kind: args.credential_kind, action: args.action, projection_id: record.projection_id };
    }
  }
  return { ok: true, credential_kind: args.credential_kind, action: args.action, projection_id: record.projection_id };
}

export function revokeProjection(record: CloudflareNarsRemoteAccessRecord, revokedAt = new Date().toISOString()): CloudflareNarsRemoteAccessRecord {
  return {
    ...record,
    lifecycle_state: 'revoked',
    revoked_at: revokedAt,
    bridge_credential: { ...record.bridge_credential, status: 'revoked', revoked_at: revokedAt },
    browser_access_tokens: record.browser_access_tokens.map((token) => ({ ...token, status: 'revoked', revoked_at: revokedAt })),
  };
}

export function revokeCredential(record: CloudflareNarsRemoteAccessRecord, credentialId: string, revokedAt = new Date().toISOString()): CloudflareNarsRemoteAccessRecord {
  if (record.bridge_credential.credential_id === credentialId) {
    return { ...record, bridge_credential: { ...record.bridge_credential, status: 'revoked', revoked_at: revokedAt } };
  }
  return {
    ...record,
    browser_access_tokens: record.browser_access_tokens.map((token) => token.credential_id === credentialId ? { ...token, status: 'revoked', revoked_at: revokedAt } : token),
  };
}

export function projectNarsEventForCloudflare(input: {
  projection_id: string;
  site_id: string;
  nars_session_id: string;
  event: Record<string, unknown>;
  policy?: ProjectionEventPolicyMode;
  projected_at?: string;
}): ProjectedEvent | null {
  const policy = normalizeEventPolicy(input.policy);
  const eventClass = classifyNarsEvent(input.event);
  if (!eventClassAllowed(eventClass, policy)) return null;
  const { payload, redactions } = redactProjectedEventPayload(input.event, policy);
  return {
    schema: CLOUDFLARE_NARS_PROJECTION_EVENT_SCHEMA,
    projection_id: input.projection_id,
    site_id: input.site_id,
    nars_session_id: input.nars_session_id,
    event_sequence: normalizeSequence(input.event.event_sequence ?? input.event.sequence),
    event_id: typeof input.event.event_id === 'string' ? input.event.event_id : null,
    event_class: eventClass,
    projected_at: input.projected_at ?? new Date().toISOString(),
    payload,
    redactions,
  };
}

export function createBoundedProjectionCache(maxEvents = 200) {
  const entries = new Map<string, BoundedProjectionCacheEntry[]>();
  const limit = Math.max(1, Math.floor(maxEvents));
  return {
    push(event: ProjectedEvent) {
      const current = entries.get(event.projection_id) ?? [];
      const duplicateIndex = current.findIndex((entry) => isSameProjectedEvent(entry, event));
      if (duplicateIndex >= 0) current.splice(duplicateIndex, 1);
      current.push({ projection_id: event.projection_id, event_sequence: event.event_sequence, event_id: event.event_id, event });
      while (current.length > limit) current.shift();
      entries.set(event.projection_id, current);
      return { status: duplicateIndex >= 0 ? 'deduplicated' : 'cached', projection_id: event.projection_id, retained: current.length, max_events: limit };
    },
    read(projectionId: string, { since_sequence = null, max_events = limit }: { since_sequence?: number | null; max_events?: number } = {}): BoundedProjectionCacheRead {
      const current = entries.get(projectionId) ?? [];
      const filtered = since_sequence == null ? current : current.filter((entry) => entry.event_sequence == null || entry.event_sequence > since_sequence);
      const selected = filtered.slice(0, Math.max(0, Math.min(max_events, limit)));
      const lastSequence = selected.reduce<number | null>((max, entry) => {
        if (entry.event_sequence == null) return max;
        return max == null ? entry.event_sequence : Math.max(max, entry.event_sequence);
      }, null);
      return {
        schema: CLOUDFLARE_NARS_PROJECTION_CACHE_SCHEMA,
        projection_id: projectionId,
        source: 'cloudflare_projection_cache',
        events: selected.map((entry) => entry.event),
        event_count: selected.length,
        has_more: filtered.length > selected.length,
        truncated: current.length === limit && (since_sequence == null || current[0]?.event_sequence != null && current[0].event_sequence > since_sequence + 1),
        cursor: {
          since_sequence,
          last_sequence: lastSequence,
          next_sequence: lastSequence == null ? null : lastSequence + 1,
        },
      };
    },
  };
}

export function createBridgeState(input: BridgeStateInput, now = new Date().toISOString()): BridgeState {
  return {
    schema: CLOUDFLARE_NARS_BRIDGE_STATE_SCHEMA,
    projection_id: requireNonEmpty(input.projection_id, 'projection_id'),
    site_id: requireNonEmpty(input.site_id, 'site_id'),
    nars_session_id: requireNonEmpty(input.nars_session_id, 'nars_session_id'),
    status: input.status ?? 'created',
    last_replicated_sequence: input.last_replicated_sequence ?? null,
    artifact_metadata_status: input.artifact_metadata_status ?? null,
    artifact_content_status: input.artifact_content_status ?? null,
    degraded_reason: input.degraded_reason ?? null,
    retry_after_ms: input.retry_after_ms ?? null,
    updated_at: input.updated_at ?? now,
  };
}

export function planBridgeBackfill(state: BridgeState): BackfillPlan {
  const from = state.last_replicated_sequence == null ? 1 : state.last_replicated_sequence + 1;
  return {
    projection_id: state.projection_id,
    source: 'local_nars_events_log',
    from_sequence: from,
    mode: state.last_replicated_sequence == null ? 'initial' : 'resume',
  };
}

export function classifyCloudflareInputRelay(record: CloudflareNarsRemoteAccessRecord, args: {
  token_fingerprint: string;
  method: string;
  now?: string;
}) {
  const method = args.method as CloudflareNarsInputMethod;
  if (!isCloudflareNarsInputMethod(method)) {
    return { schema: CLOUDFLARE_NARS_INPUT_RELAY_SCHEMA, ok: false, code: 'unsupported_operator_input_method', method: args.method, acknowledgement: 'refused_before_cloudflare_relay' };
  }
  const access = validateProjectionCredential(record, {
    credential_kind: 'browser',
    token_fingerprint: args.token_fingerprint,
    action: 'submit_input',
    method,
    now: args.now,
  });
  if (!access.ok) {
    return { schema: CLOUDFLARE_NARS_INPUT_RELAY_SCHEMA, ok: false, code: access.code, method, acknowledgement: 'refused_before_cloudflare_relay' };
  }
  return {
    schema: CLOUDFLARE_NARS_INPUT_RELAY_SCHEMA,
    ok: true,
    code: 'relay_admitted_to_bridge_pending_nars_admission',
    method,
    acknowledgement: 'requires_nars_admission',
    semantic_success_point: 'nars_admission',
  };
}

export function buildAgentWebUiCloudflareProjectionConfig(args: {
  projection_id: string;
  api_base_url: string;
}): AgentWebUiCloudflareProjectionConfig {
  const projectionId = encodeURIComponent(requireNonEmpty(args.projection_id, 'projection_id'));
  const base = requireNonEmpty(args.api_base_url, 'api_base_url').replace(/\/+$/, '');
  return {
    mode: 'cloudflare_projection',
    projection_id: args.projection_id,
    api_base_url: base,
    event_endpoint: `${base}/api/nars/projections/${projectionId}/events`,
    health_endpoint: `${base}/api/nars/projections/${projectionId}/health`,
    input_endpoint: `${base}/api/nars/projections/${projectionId}/input`,
    cache_endpoint: `${base}/api/nars/projections/${projectionId}/events/cache`,
    artifact_base_path: `${base}/api/nars/projections/${projectionId}/artifacts`,
    artifact_metadata_endpoint: `${base}/api/nars/projections/${projectionId}/artifacts`,
  };
}

export function buildProjectionRegistrationPlan(input: CloudflareNarsProjectionIntentInput & {
  bridge_token_fingerprint?: string;
  browser_token_fingerprints?: string[];
  dry_run?: boolean;
}) {
  const intent = createCloudflareNarsProjectionIntent(input);
  const remote_access = createCloudflareNarsRemoteAccessRecord({
    intent,
    bridge_token_fingerprint: input.bridge_token_fingerprint,
    browser_token_fingerprints: input.browser_token_fingerprints,
    created_at: intent.created_at,
  });
  return {
    schema: 'narada.cloudflare_nars_projection.registration_plan.v1',
    status: input.dry_run ? 'planned' : 'registered_locally_pending_cloudflare_write',
    dry_run: Boolean(input.dry_run),
    projection_id: intent.projection_id,
    local_intent: intent,
    remote_access,
    bridge_launch: {
      command: 'narada',
      args: [
        'nars',
        'projection',
        'bridge-start',
        ...(intent.site_root ? ['--site-root', intent.site_root] : []),
        '--projection-id',
        intent.projection_id,
      ],
    },
    agent_web_ui_cloudflare_config: buildAgentWebUiCloudflareProjectionConfig({
      projection_id: intent.projection_id,
      api_base_url: 'https://<cloudflare-projection-host>',
    }),
  };
}

export function isCloudflareNarsInputMethod(method: string): method is CloudflareNarsInputMethod {
  return (CLOUDFLARE_NARS_INPUT_METHODS as readonly string[]).includes(method);
}

function createCredentialRecord(kind: CredentialKind, fingerprint: string, now: string, index = 0): ProjectionCredentialRecord {
  return {
    credential_id: `cred_${kind}_${safeToken(fingerprint)}_${index}`,
    kind,
    status: 'active',
    token_fingerprint: fingerprint,
    created_at: now,
    expires_at: null,
    revoked_at: null,
  };
}

function projectionLifecycleStatus(record: CloudflareNarsRemoteAccessRecord, now?: string): ProjectionLifecycleState {
  if (record.lifecycle_state === 'revoked' || record.revoked_at) return 'revoked';
  if (record.expires_at && now && record.expires_at <= now) return 'expired';
  return record.lifecycle_state;
}

function findCredential(record: CloudflareNarsRemoteAccessRecord, kind: CredentialKind, fingerprint: string): ProjectionCredentialRecord | null {
  if (kind === 'bridge') {
    return record.bridge_credential.token_fingerprint === fingerprint ? record.bridge_credential : null;
  }
  return record.browser_access_tokens.find((token) => token.token_fingerprint === fingerprint) ?? null;
}

function normalizeInputPolicy(value: CloudflareNarsInputMethod[] | undefined): CloudflareNarsInputMethod[] {
  const source = value?.length ? value : ['conversation.send', 'conversation.enqueue'];
  return [...new Set(source.filter(isCloudflareNarsInputMethod))];
}

function normalizeEventPolicy(value: unknown): ProjectionEventPolicyMode {
  if (value === 'conversation' || value === 'operator' || value === 'diagnostic' || value === 'raw') return value;
  return DEFAULT_EVENT_POLICY;
}

function classifyNarsEvent(event: Record<string, unknown>): string {
  const type = String(event.event ?? event.type ?? event.kind ?? 'unknown');
  if (/assistant_message|user_message|operator_input|message/i.test(type)) return 'conversation';
  if (/queue|directive|turn|input|admission/i.test(type)) return 'operator';
  if (/health|diagnostic|error|fault|mcp/i.test(type)) return 'diagnostic';
  if (/tool/i.test(type)) return 'tool';
  return 'raw';
}

function eventClassAllowed(eventClass: string, policy: ProjectionEventPolicyMode): boolean {
  if (policy === 'raw') return true;
  if (policy === 'diagnostic') return ['conversation', 'operator', 'diagnostic', 'tool'].includes(eventClass);
  if (policy === 'operator') return ['conversation', 'operator', 'tool'].includes(eventClass);
  return eventClass === 'conversation';
}

function redactProjectedEventPayload(event: Record<string, unknown>, policy: ProjectionEventPolicyMode): { payload: Record<string, unknown>; redactions: string[] } {
  if (policy === 'raw') return { payload: { ...event }, redactions: [] };
  const redactions: string[] = [];
  const payload = JSON.parse(JSON.stringify(event)) as Record<string, unknown>;
  redactKeys(payload, redactions, ['api_key', 'token', 'secret', 'authorization', 'password']);
  if (policy !== 'diagnostic') {
    redactKeys(payload, redactions, ['arguments', 'result', 'raw', 'trace', 'local_path', 'path']);
  }
  return { payload, redactions };
}

function redactKeys(value: unknown, redactions: string[], names: string[], path = ''): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => redactKeys(item, redactions, names, `${path}[${index}]`));
    return;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const childPath = path ? `${path}.${key}` : key;
    if (names.some((name) => key.toLowerCase().includes(name))) {
      record[key] = '<redacted>';
      redactions.push(childPath);
      continue;
    }
    redactKeys(record[key], redactions, names, childPath);
  }
}

function normalizeSequence(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function requireNonEmpty(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${name}_required`);
  return normalized;
}

function safeToken(value: string): string {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'x';
}
