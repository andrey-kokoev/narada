import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  createNarsArtifactLifecycle,
  normalizeNarsArtifactLifecycle,
  transitionNarsArtifactRecord,
} from './artifact-lifecycle-state.mjs';

export const NARS_ARTIFACT_RECORD_SCHEMA = 'narada.nars.artifact_record.v1';
export const NARS_ARTIFACT_INDEX_SCHEMA = 'narada.nars.artifact_index.v1';
export const NARS_ARTIFACT_PUBLIC_SCHEMA = 'narada.nars.artifact_public.v1';

const SUPPORTED_KINDS = new Set(['html', 'markdown', 'image', 'json', 'text', 'audio']);
const CONTENT_TYPES = new Map([
  ['html', 'text/html; charset=utf-8'],
  ['markdown', 'text/markdown; charset=utf-8'],
  ['json', 'application/json; charset=utf-8'],
  ['text', 'text/plain; charset=utf-8'],
  ['audio', 'audio/wav'],
]);
const AUDIO_CONTENT_TYPES = new Map([
  ['.wav', 'audio/wav'],
  ['.mp3', 'audio/mpeg'],
  ['.ogg', 'audio/ogg'],
  ['.m4a', 'audio/mp4'],
]);
const EXTENSION_KIND = new Map([
  ['.html', 'html'],
  ['.htm', 'html'],
  ['.md', 'markdown'],
  ['.markdown', 'markdown'],
  ['.json', 'json'],
  ['.txt', 'text'],
  ['.wav', 'audio'],
  ['.mp3', 'audio'],
  ['.ogg', 'audio'],
  ['.m4a', 'audio'],
]);

export function narsArtifactsRootFromSessionPath(sessionPath) {
  if (!sessionPath) throw new Error('session_path_required');
  return join(dirname(String(sessionPath)), 'artifacts');
}

function normalizeNarsArtifactRecord(record) {
  return {
    ...record,
    lifecycle: normalizeNarsArtifactLifecycle(record.lifecycle),
  };
}

function audioContentTypeForPath(path) {
  const lower = String(path ?? '').toLowerCase();
  const extension = lower.match(/\.[^.\\/]+$/)?.[0] ?? '';
  return AUDIO_CONTENT_TYPES.get(extension) ?? contentTypeForKind('audio');
}

export function registerNarsArtifact({
  sessionPath,
  sessionId,
  agentId,
  siteRoot,
  sourcePath,
  kind = null,
  title = null,
  contentType = null,
  renderHint = 'inline',
  accessScope = 'session',
  now = new Date(),
} = {}) {
  if (!sessionPath) throw artifactError('session_path_required', 'sessionPath is required to register a NARS artifact.');
  if (!sourcePath) throw artifactError('source_path_required', 'sourcePath is required to register a NARS artifact.');
  const artifactsRoot = narsArtifactsRootFromSessionPath(sessionPath);
  const resolvedSourcePath = resolve(String(sourcePath));
  const admittedRoots = admittedArtifactRoots({ sessionPath, siteRoot });
  if (!pathIsWithinAnyRoot(resolvedSourcePath, admittedRoots)) {
    throw artifactError('artifact_path_outside_admitted_roots', 'Artifact source path is outside admitted NARS roots.', { admitted_roots: admittedRoots });
  }
  if (!existsSync(resolvedSourcePath) || !statSync(resolvedSourcePath).isFile()) {
    throw artifactError('artifact_source_not_found', 'Artifact source path does not exist or is not a file.');
  }
  const artifactKind = normalizeArtifactKind(kind ?? inferKindFromPath(resolvedSourcePath));
  if (!SUPPORTED_KINDS.has(artifactKind)) throw artifactError('artifact_kind_unsupported', `Unsupported artifact kind: ${artifactKind}`);
  const effectiveContentType = validateArtifactContentType({ kind: artifactKind, contentType, sourcePath: resolvedSourcePath });
  const record = {
    schema: NARS_ARTIFACT_RECORD_SCHEMA,
    artifact_id: `art_${compactTimestamp(now)}_${randomUUID().replace(/-/g, '').slice(0, 10)}`,
    session_id: sessionId ?? null,
    agent_id: agentId ?? null,
    kind: artifactKind,
    title: title ? String(title) : defaultTitleForPath(resolvedSourcePath),
    source_path: resolvedSourcePath,
    content_type: effectiveContentType,
    created_at: new Date(now).toISOString(),
    access: {
      scope: accessScope === 'site' ? 'site' : 'session',
      token_required: false,
    },
    render: {
      preferred: renderHint === 'link' ? 'link' : 'inline',
      sandbox: artifactKind === 'html' ? defaultHtmlSandboxPolicy() : null,
      ...(artifactKind === 'audio' ? { media_controls: true } : {}),
    },
    lifecycle: {
      ...createNarsArtifactLifecycle({
        owner: 'nars-session',
        createdAt: new Date(now).toISOString(),
        now: new Date(now).toISOString(),
      }),
    },
  };
  const index = readNarsArtifactIndex({ sessionPath });
  const next = {
    ...index,
    session_id: sessionId ?? index.session_id ?? null,
    agent_id: agentId ?? index.agent_id ?? null,
    generated_at: new Date(now).toISOString(),
    artifacts: [...index.artifacts.filter((entry) => entry.artifact_id !== record.artifact_id), record],
  };
  writeNarsArtifactIndex({ artifactsRoot, index: next });
  return { record, public_record: publicNarsArtifactRecord(record), index: publicNarsArtifactIndex(next) };
}

export function readNarsArtifactIndex({ sessionPath } = {}) {
  const artifactsRoot = narsArtifactsRootFromSessionPath(sessionPath);
  const indexPath = join(artifactsRoot, 'index.json');
  const parsed = readJson(indexPath);
  if (parsed?.schema === NARS_ARTIFACT_INDEX_SCHEMA && Array.isArray(parsed.artifacts)) {
    return {
      ...parsed,
      artifacts: parsed.artifacts.map(normalizeNarsArtifactRecord),
    };
  }
  return {
    schema: NARS_ARTIFACT_INDEX_SCHEMA,
    session_id: null,
    agent_id: null,
    generated_at: new Date().toISOString(),
    artifacts: [],
  };
}

export function readNarsArtifact({ sessionPath, artifactId } = {}) {
  if (!artifactId) throw artifactError('artifact_id_required', 'artifactId is required.');
  const index = readNarsArtifactIndex({ sessionPath });
  const record = index.artifacts.find((entry) => entry?.artifact_id === artifactId) ?? null;
  if (!record) throw artifactError('artifact_not_found', `Artifact not found: ${artifactId}`);
  return normalizeNarsArtifactRecord(record);
}

export function transitionNarsArtifact({ sessionPath, artifactId, nextState, evidence = {}, now = new Date() } = {}) {
  if (!sessionPath) throw artifactError('session_path_required', 'sessionPath is required to transition a NARS artifact.');
  if (!artifactId) throw artifactError('artifact_id_required', 'artifactId is required.');
  const index = readNarsArtifactIndex({ sessionPath });
  const current = index.artifacts.find((entry) => entry?.artifact_id === artifactId) ?? null;
  if (!current) throw artifactError('artifact_not_found', `Artifact not found: ${artifactId}`);
  const transitionedAt = evidence.transitioned_at ?? evidence.updated_at ?? new Date(now).toISOString();
  const next = transitionNarsArtifactRecord(current, nextState, { ...evidence, transitioned_at: transitionedAt });
  const changed = next.lifecycle.state !== current.lifecycle.state;
  if (changed) {
    writeNarsArtifactIndex({
      artifactsRoot: narsArtifactsRootFromSessionPath(sessionPath),
      index: {
        ...index,
        generated_at: transitionedAt,
        artifacts: index.artifacts.map((entry) => entry.artifact_id === artifactId ? next : entry),
      },
    });
  }
  return {
    changed,
    previous_record: current,
    record: next,
    public_record: publicNarsArtifactRecord(next),
    index: publicNarsArtifactIndex({
      ...index,
      generated_at: changed ? transitionedAt : index.generated_at,
      artifacts: index.artifacts.map((entry) => entry.artifact_id === artifactId ? next : entry),
    }),
  };
}

export function revokeNarsArtifact(options = {}) {
  return transitionNarsArtifact({ ...options, nextState: 'revoked' });
}

export function expireNarsArtifact(options = {}) {
  return transitionNarsArtifact({ ...options, nextState: 'expired' });
}

export function archiveNarsArtifact(options = {}) {
  return transitionNarsArtifact({ ...options, nextState: 'archived' });
}

export function readNarsArtifactContent({ sessionPath, artifactId } = {}) {
  const record = readNarsArtifact({ sessionPath, artifactId });
  if (record.lifecycle?.state && record.lifecycle.state !== 'active') {
    throw artifactError('artifact_not_active', `Artifact is ${record.lifecycle.state}.`, { lifecycle_state: record.lifecycle.state });
  }
  const sourcePath = resolve(String(record.source_path ?? ''));
  if (!sourcePath || !existsSync(sourcePath) || !statSync(sourcePath).isFile()) {
    throw artifactError('artifact_content_missing', 'Artifact content is missing.');
  }
  return {
    record,
    content: readFileSync(sourcePath),
    content_type: contentTypeForRecord(record),
    headers: artifactContentHeaders(record),
  };
}

export function publicNarsArtifactRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const lifecycle = normalizeNarsArtifactLifecycle(record.lifecycle);
  return {
    schema: NARS_ARTIFACT_PUBLIC_SCHEMA,
    artifact_id: record.artifact_id,
    session_id: record.session_id ?? null,
    agent_id: record.agent_id ?? null,
    kind: record.kind,
    title: record.title ?? null,
    content_type: contentTypeForRecord(record),
    created_at: record.created_at ?? null,
    access: record.access ?? { scope: 'session', token_required: false },
    render: record.render ?? { preferred: 'inline' },
    lifecycle,
  };
}

export function publicNarsArtifactIndex(index) {
  return {
    schema: NARS_ARTIFACT_INDEX_SCHEMA,
    session_id: index?.session_id ?? null,
    agent_id: index?.agent_id ?? null,
    generated_at: index?.generated_at ?? new Date().toISOString(),
    artifacts: Array.isArray(index?.artifacts) ? index.artifacts.map(publicNarsArtifactRecord).filter(Boolean) : [],
  };
}

export function artifactContentHeaders(record) {
  if (record?.kind !== 'html' && !isHtmlContentType(record?.content_type)) return {};
  return {
    'content-security-policy': "sandbox allow-scripts allow-forms; default-src 'self' data: blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'",
    'x-narada-artifact-id': record.artifact_id,
    'x-narada-artifact-kind': record.kind,
  };
}

export function artifactError(code, message, extra = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = extra;
  return error;
}

function writeNarsArtifactIndex({ artifactsRoot, index }) {
  mkdirSync(artifactsRoot, { recursive: true });
  const path = join(artifactsRoot, 'index.json');
  const tmpPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  renameSync(tmpPath, path);
}

function readJson(path) {
  try {
    if (!path || !existsSync(path) || !statSync(path).isFile()) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function admittedArtifactRoots({ sessionPath, siteRoot }) {
  return [siteRoot, sessionPath ? dirname(String(sessionPath)) : null].filter(Boolean).map((value) => resolve(String(value)));
}

function pathIsWithinAnyRoot(path, roots) {
  const normalizedPath = resolve(path).toLowerCase();
  return roots.some((root) => {
    const normalizedRoot = resolve(root).toLowerCase();
    return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}\\`) || normalizedPath.startsWith(`${normalizedRoot}/`);
  });
}

function normalizeArtifactKind(kind) {
  return String(kind ?? '').trim().toLowerCase().replace(/^text\/html$/, 'html');
}

function inferKindFromPath(path) {
  const lower = String(path).toLowerCase();
  const extension = lower.match(/\.[^.\\/]+$/)?.[0] ?? '';
  return EXTENSION_KIND.get(extension) ?? 'text';
}

function contentTypeForKind(kind) {
  return CONTENT_TYPES.get(kind) ?? 'application/octet-stream';
}

function contentTypeForRecord(record) {
  if (record?.content_type) return String(record.content_type);
  if (record?.kind === 'audio') return audioContentTypeForPath(record.source_path);
  return contentTypeForKind(record?.kind);
}

function validateArtifactContentType({ kind, contentType, sourcePath }) {
  const expected = kind === 'audio' ? audioContentTypeForPath(sourcePath) : contentTypeForKind(kind);
  if (!contentType) return expected;
  const supplied = String(contentType).trim().toLowerCase();
  if (supplied !== expected.toLowerCase()) {
    throw artifactError('artifact_content_type_mismatch', `Artifact content_type ${contentType} does not match kind ${kind}.`, { expected_content_type: expected });
  }
  return expected;
}

function isHtmlContentType(contentType) {
  return String(contentType ?? '').toLowerCase().split(';')[0].trim() === 'text/html';
}

function defaultTitleForPath(path) {
  return String(path).split(/[\\/]/).filter(Boolean).at(-1) ?? 'Artifact';
}

function defaultHtmlSandboxPolicy() {
  return {
    allow_scripts: true,
    allow_forms: true,
    allow_same_origin: false,
    allow_top_navigation: false,
  };
}

function compactTimestamp(value) {
  return new Date(value).toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
}
