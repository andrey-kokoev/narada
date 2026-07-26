import { NarsKernelContractError } from '@narada2/nars-intelligence-kernel-contract';

const ARTIFACT_CONTAINER_KEYS: any = new Set(['artifact', 'artifacts', 'artifact_ref', 'artifact_refs', 'narada_artifact', 'narada_artifacts']);
const FORBIDDEN_PATH_KEYS: any = new Set(['path', 'sourcepath', 'filepath', 'filesystempath', 'sessiondir']);

function normalizedKey(key: any) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function nonEmpty(value: any) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isObject(value: any) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function looksLikeArtifactReference(value: any) {
  return isObject(value) && (
    nonEmpty(value.artifact_id)
    || value.type === 'artifact_ref'
    || value.type === 'artifact'
  );
}

function looksLikeArtifactCandidate(value: any) {
  return looksLikeArtifactReference(value)
    || ['kind', 'title', 'content', 'content_type', 'contentType', 'digest', 'sha256', 'source_path']
      .some((key: any) => Object.prototype.hasOwnProperty.call(value, key));
}

function collectCandidates(value: any, candidates: any, refs: any, seen: any, path: any = '$', explicit: any = false) {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      collectCandidates(value[index], candidates, refs, seen, `${path}[${index}]`, explicit);
    }
    return;
  }
  const explicitReference: any = value.type === 'artifact_ref' || value.type === 'artifact';
  const candidate: any = looksLikeArtifactCandidate(value);
  if (candidate && (explicit || explicitReference)) {
    if (nonEmpty(value.artifact_id)) refs.push({ artifact_id: nonEmpty(value.artifact_id), source_path: path });
    candidates.push({ value, source_path: path });
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    collectCandidates(
      nested,
      candidates,
      refs,
      seen,
      `${path}.${key}`,
      explicit || ARTIFACT_CONTAINER_KEYS.has(key),
    );
  }
}

function sanitizeCandidate(value: any, sourcePath: any) {
  if (!isObject(value)) throw new NarsKernelContractError('pi_artifact_candidate_invalid', 'Artifact candidate must be an object.', { source_path: sourcePath });
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_PATH_KEYS.has(normalizedKey(key)) && nested != null && String(nested).trim()) {
      throw new NarsKernelContractError(
        'pi_artifact_path_forbidden',
        `Pi artifact candidate contains an arbitrary filesystem path at ${sourcePath}.${key}.`,
        { source_path: sourcePath, key },
      );
    }
  }
  const artifactId: any = nonEmpty(value.artifact_id);
  const kind: any = nonEmpty(value.kind);
  const title: any = nonEmpty(value.title);
  const contentType: any = nonEmpty(value.content_type ?? value.contentType);
  const digest: any = nonEmpty(value.digest ?? value.sha256);
  const size: any = Number.isFinite(Number(value.size_bytes ?? value.size))
    ? Math.max(0, Math.trunc(Number(value.size_bytes ?? value.size)))
    : null;
  return {
    ...(artifactId ? { artifact_id: artifactId } : {}),
    ...(kind ? { kind } : {}),
    ...(title ? { title } : {}),
    ...(contentType ? { content_type: contentType } : {}),
    ...(digest ? { digest } : {}),
    ...(size != null ? { size_bytes: size } : {}),
    ...(value.render_hint ? { render_hint: String(value.render_hint) } : {}),
    ...(value.content !== undefined ? { content: value.content } : {}),
  };
}

/** Find only explicitly marked artifact payloads/references; arbitrary text is not scanned. */
export function findNarsArtifactCandidates(value: any) {
  const candidates: any = [];
  const refs: any = [];
  collectCandidates(value, candidates, refs, new Set());
  return Object.freeze({
    candidates: Object.freeze(candidates.map(({ value: candidate, source_path: sourcePath }: any) => sanitizeCandidate(candidate, sourcePath))),
    references: Object.freeze(refs.map(({ artifact_id: artifactId }: any) => ({ artifact_id: artifactId }))),
  });
}

/**
 * Artifact ownership stays in NARS. The registrar is injected by the NARS
 * runtime; Pi can only submit an explicit candidate or refer to an existing
 * NARS artifact. No Pi path is ever promoted to an artifact identity.
 */
export function createNarsArtifactAdapter({
  registerArtifact = null,
  eventSink = async () => {},
  now = () => new Date().toISOString(),
}: any = {}) {
  return Object.freeze({
    async observe(value: any, context: any = {}) {
      const found: any = findNarsArtifactCandidates(value);
      const records: any = [];
      for (const candidate of found.candidates) {
        const safeCandidate: any = { ...candidate };
        delete safeCandidate.content;
        if (candidate.artifact_id) {
          const evidence: any = {
            kind: 'pi_artifact_reference_observed',
            schema: 'narada.nars.pi.artifact.reference.v1',
            artifact_id: candidate.artifact_id,
            turn_id: context.turn_id ?? null,
            input_id: context.input_id ?? null,
            timestamp: now(),
          };
          await eventSink(evidence);
          records.push(evidence);
          continue;
        }
        if (typeof registerArtifact !== 'function') {
          const evidence: any = {
            kind: 'pi_artifact_registration_required',
            schema: 'narada.nars.pi.artifact.registration_required.v1',
            candidate: safeCandidate,
            turn_id: context.turn_id ?? null,
            input_id: context.input_id ?? null,
            timestamp: now(),
          };
          await eventSink(evidence);
          records.push(evidence);
          continue;
        }
        const registered: any = await registerArtifact({
          ...candidate,
          session_id: context.session_id ?? null,
          agent_id: context.agent_id ?? null,
          turn_id: context.turn_id ?? null,
          input_id: context.input_id ?? null,
        });
        const publicRecord: any = registered?.public_record ?? registered?.artifact ?? registered;
        const evidence: any = {
          kind: 'pi_artifact_registered',
          schema: 'narada.nars.pi.artifact.registered.v1',
          artifact: publicRecord && typeof publicRecord === 'object' ? publicRecord : safeCandidate,
          turn_id: context.turn_id ?? null,
          input_id: context.input_id ?? null,
          timestamp: now(),
        };
        await eventSink(evidence);
        records.push(evidence);
      }
      return Object.freeze({
        references: found.references,
        records: Object.freeze(records),
      });
    },
  });
}
