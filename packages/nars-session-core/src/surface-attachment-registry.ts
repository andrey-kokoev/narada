import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  createNarsSurfaceAttachment,
  normalizeNarsSurfaceAttachment,
  transitionNarsSurfaceAttachment,
  type NarsSurfaceAttachment,
  type NarsSurfaceAttachmentCreateOptions,
  type NarsSurfaceAttachmentState,
  type NarsSurfaceAttachmentTransitionEvidence,
  type NarsSurfaceAttachmentTransitionResult,
} from './surface-attachment.js';

export const NARS_SURFACE_ATTACHMENT_REGISTRY_SCHEMA = 'narada.nars.surface_attachment_registry.v1' as const;
export const NARS_SURFACE_ATTACHMENT_REGISTRY_FILE = 'surface-attachments.json' as const;

export interface NarsSurfaceAttachmentRegistry {
  schema: typeof NARS_SURFACE_ATTACHMENT_REGISTRY_SCHEMA;
  session_id: string;
  generated_at: string;
  attachments: NarsSurfaceAttachment[];
}

export class NarsSurfaceAttachmentRegistryError extends Error {
  readonly code: string;
  readonly path: string;

  constructor(code: string, path: string, message: string) {
    super(message);
    this.name = 'NarsSurfaceAttachmentRegistryError';
    this.code = code;
    this.path = path;
  }
}

function requiredSessionPath(sessionPath: string | null | undefined): string {
  const normalized = typeof sessionPath === 'string' ? sessionPath.trim() : '';
  if (!normalized) throw new Error('surface_attachment_session_path_required');
  return normalized;
}

function requiredSessionId(sessionId: string | null | undefined): string {
  const normalized = typeof sessionId === 'string' ? sessionId.trim() : '';
  if (!normalized) throw new Error('surface_attachment_session_id_required');
  return normalized;
}

function registryPath(sessionPath: string): string {
  return join(dirname(sessionPath), NARS_SURFACE_ATTACHMENT_REGISTRY_FILE);
}

function nowIso(value: string | undefined): string {
  const candidate = value?.trim() || new Date().toISOString();
  if (!Number.isFinite(Date.parse(candidate))) throw new Error('surface_attachment_registry_timestamp_invalid');
  return candidate;
}

function emptyRegistry(sessionId: string, generatedAt: string): NarsSurfaceAttachmentRegistry {
  return {
    schema: NARS_SURFACE_ATTACHMENT_REGISTRY_SCHEMA,
    session_id: sessionId,
    generated_at: generatedAt,
    attachments: [],
  };
}

export function narsSurfaceAttachmentRegistryPathFromSessionPath(sessionPath: string | null | undefined): string {
  return registryPath(requiredSessionPath(sessionPath));
}

export function readNarsSurfaceAttachmentRegistry({
  sessionPath,
  sessionId,
  now,
}: {
  sessionPath: string;
  sessionId: string;
  now?: string;
}): NarsSurfaceAttachmentRegistry {
  const normalizedSessionPath = requiredSessionPath(sessionPath);
  const normalizedSessionId = requiredSessionId(sessionId);
  const path = registryPath(normalizedSessionPath);
  const generatedAt = nowIso(now);
  if (!existsSync(path)) return emptyRegistry(normalizedSessionId, generatedAt);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new NarsSurfaceAttachmentRegistryError('surface_attachment_registry_corrupt', path, `Unable to read ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new NarsSurfaceAttachmentRegistryError('surface_attachment_registry_invalid', path, `Invalid registry object: ${path}`);
  }
  const record = parsed as Record<string, unknown>;
  if (record.schema !== NARS_SURFACE_ATTACHMENT_REGISTRY_SCHEMA) {
    throw new NarsSurfaceAttachmentRegistryError('surface_attachment_registry_schema_invalid', path, `Unsupported registry schema: ${String(record.schema)}`);
  }
  if (record.session_id !== normalizedSessionId) {
    throw new NarsSurfaceAttachmentRegistryError('surface_attachment_registry_session_mismatch', path, `Registry session does not match ${normalizedSessionId}`);
  }
  if (!Array.isArray(record.attachments)) {
    throw new NarsSurfaceAttachmentRegistryError('surface_attachment_registry_attachments_invalid', path, `Registry attachments are not an array: ${path}`);
  }
  try {
    return {
      schema: NARS_SURFACE_ATTACHMENT_REGISTRY_SCHEMA,
      session_id: normalizedSessionId,
      generated_at: nowIso(typeof record.generated_at === 'string' ? record.generated_at : generatedAt),
      attachments: record.attachments.map((attachment) => normalizeNarsSurfaceAttachment(attachment)),
    };
  } catch (error) {
    throw new NarsSurfaceAttachmentRegistryError('surface_attachment_registry_attachment_invalid', path, `Invalid attachment in ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function writeNarsSurfaceAttachmentRegistry({
  sessionPath,
  registry,
}: {
  sessionPath: string;
  registry: NarsSurfaceAttachmentRegistry;
}): NarsSurfaceAttachmentRegistry {
  const normalizedSessionPath = requiredSessionPath(sessionPath);
  const normalizedSessionId = requiredSessionId(registry.session_id);
  const normalized: NarsSurfaceAttachmentRegistry = {
    schema: NARS_SURFACE_ATTACHMENT_REGISTRY_SCHEMA,
    session_id: normalizedSessionId,
    generated_at: nowIso(registry.generated_at),
    attachments: registry.attachments.map((attachment) => {
      const normalizedAttachment = normalizeNarsSurfaceAttachment(attachment);
      if (normalizedAttachment.session_id !== normalizedSessionId) throw new Error('surface_attachment_session_mismatch');
      return normalizedAttachment;
    }),
  };
  const path = registryPath(normalizedSessionPath);
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    renameSync(temporaryPath, path);
  } catch (error) {
    try { rmSync(temporaryPath, { force: true }); } catch { /* preserve the original failure */ }
    throw new NarsSurfaceAttachmentRegistryError('surface_attachment_registry_write_failed', path, `Unable to write ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return normalized;
}

export function registerNarsSurfaceAttachment({
  sessionPath,
  sessionId,
  attachment,
  now,
}: {
  sessionPath: string;
  sessionId: string;
  attachment: NarsSurfaceAttachment | NarsSurfaceAttachmentCreateOptions;
  now?: string;
}): NarsSurfaceAttachment {
  const registry = readNarsSurfaceAttachmentRegistry({ sessionPath, sessionId, now });
  const normalized = 'schema' in attachment
    ? normalizeNarsSurfaceAttachment(attachment)
    : createNarsSurfaceAttachment({ ...attachment, session_id: sessionId, now: nowIso(now) });
  if (normalized.session_id !== sessionId) throw new Error('surface_attachment_session_mismatch');
  const attachments = registry.attachments.filter((entry) => entry.attachment_id !== normalized.attachment_id);
  attachments.push(normalized);
  writeNarsSurfaceAttachmentRegistry({
    sessionPath,
    registry: { ...registry, generated_at: nowIso(now), attachments },
  });
  return normalized;
}

export function transitionNarsSurfaceAttachmentInRegistry({
  sessionPath,
  sessionId,
  attachmentId,
  nextState,
  evidence = {},
}: {
  sessionPath: string;
  sessionId: string;
  attachmentId: string;
  nextState: NarsSurfaceAttachmentState;
  evidence?: NarsSurfaceAttachmentTransitionEvidence;
}): NarsSurfaceAttachmentTransitionResult {
  const registry = readNarsSurfaceAttachmentRegistry({ sessionPath, sessionId, now: evidence.now });
  const index = registry.attachments.findIndex((entry) => entry.attachment_id === attachmentId);
  if (index < 0) throw new NarsSurfaceAttachmentRegistryError('surface_attachment_not_found', registryPath(requiredSessionPath(sessionPath)), `Attachment not found: ${attachmentId}`);
  const result = transitionNarsSurfaceAttachment(registry.attachments[index], nextState, evidence);
  if (result.changed) {
    const attachments = [...registry.attachments];
    attachments[index] = result.record;
    writeNarsSurfaceAttachmentRegistry({
      sessionPath,
      registry: { ...registry, generated_at: nowIso(evidence.now), attachments },
    });
  }
  return result;
}

export function listNarsSurfaceAttachments({ sessionPath, sessionId, now }: { sessionPath: string; sessionId: string; now?: string }): NarsSurfaceAttachment[] {
  return readNarsSurfaceAttachmentRegistry({ sessionPath, sessionId, now }).attachments.map((attachment) => normalizeNarsSurfaceAttachment(attachment));
}
