import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { supportedGenericCommandSchemas } from '../src/generic-command-registry.js';

const DEFAULT_MAX_BYTES: any = 256 * 1024;
const DEFAULT_OUTPUT_MAX_BYTES: any = 10 * 1024 * 1024;
const DEFAULT_PAYLOAD_DIR: any = '.ai/tmp/mcp-payloads';
const DEFAULT_OUTPUT_DIR: any = '.ai/tmp/mcp-outputs';
const DEFAULT_COMMAND_DIR: any = '.ai/tmp/mcp-commands';
const DEFAULT_RESULT_DIR: any = '.ai/tmp/mcp-results';
const DEFAULT_WORKSPACE_DIR: any = 'workspace';
export const DEFAULT_INLINE_PAYLOAD_CHAR_LIMIT: any = 200;
export const DEFAULT_INLINE_OUTPUT_CHAR_LIMIT: any = 200;
export const DEFAULT_OUTPUT_SHOW_CHAR_LIMIT: any = 10_000;
const REF_PATTERN: any = /^mcp_payload:([A-Za-z0-9][A-Za-z0-9_-]{2,63})@v([1-9][0-9]*)$/;
const OUTPUT_REF_PATTERN: any = /^mcp_output:([A-Za-z0-9][A-Za-z0-9_-]{2,63})$/;
const COMMAND_REF_PATTERN: any = /^mcp_command:([A-Za-z0-9][A-Za-z0-9_-]{2,63})@v([1-9][0-9]*)$/;
const RESULT_REF_PATTERN: any = /^mcp_result:([A-Za-z0-9][A-Za-z0-9_-]{2,63})@v([1-9][0-9]*)$/;
const DEFAULT_INLINE_PAYLOAD_EXEMPT_FIELDS: any = new Set([
  'payload_ref',
  'payload_path',
  'payload_file',
  'ref',
  'source_ref',
  'workflow_ref',
  'operation_id',
  'task_id',
  'task_number',
  'agent_id',
  'identity',
  'identity_name',
  'surface_id',
  'hwnd',
  'target_site_root',
]);
const DEFAULT_INLINE_OBJECT_PAYLOAD_FIELDS: any = new Set([
  'payload',
  'content',
  'evidence',
  'verification',
  'self_certification',
  'recovery_truthfulness',
  'authority_basis',
  'active_task',
  'worktree_state',
  'scope',
]);
const SUBSTRATE_CREATED_BY_VALUES: any = new Set(['codex', 'kimi', 'claude', 'gpt', 'openai', 'shell', 'powershell', 'node']);

function normalizeCreatedBy(input: any) : any{
  const suppliedCreatedBy: any = stringOrNull(input.created_by);
  if (suppliedCreatedBy && SUBSTRATE_CREATED_BY_VALUES.has(suppliedCreatedBy.toLowerCase())) {
    throw new Error(`created_by_substrate_not_identity: ${suppliedCreatedBy} remediation=created_by must name the acting identity, not the substrate`);
  }
  const boundAgentId: any = stringOrNull(process.env.NARADA_AGENT_ID);
  if (boundAgentId && suppliedCreatedBy && suppliedCreatedBy !== boundAgentId) {
    throw new Error(`created_by_mismatch_bound_identity: supplied=${suppliedCreatedBy} bound=${boundAgentId} remediation=omit created_by in agent sessions`);
  }
  return boundAgentId ?? suppliedCreatedBy;
}

export function resolveToolPayloadArgs({
  siteRoot,
  toolName,
  args,
  allowedTools,
  maxBytes = DEFAULT_MAX_BYTES,
  payloadDir = DEFAULT_PAYLOAD_DIR,
  payloadRefMode = 'replace_args',
}: any) : any{
  const input: any = asRecord(args);
  const payloadPath: any = typeof input.payload_path === 'string' && input.payload_path.trim().length > 0
    ? input.payload_path.trim()
    : null;
  const payloadRef: any = typeof input.payload_ref === 'string' && input.payload_ref.trim().length > 0
    ? input.payload_ref.trim()
    : null;
  if (payloadPath && payloadRef) throw new Error('payload_transport_must_choose_one_of_payload_path_or_payload_ref');
  if (!payloadPath && !payloadRef) return { args: input, payloadSource: null };
  if (!allowedTools.includes(toolName)) {
    throw new Error(`${payloadPath ? 'payload_path' : 'payload_ref'}_not_supported_for_tool: ${toolName}`);
  }

  if (payloadRef) {
    const revision: any = readPayloadRevision({ siteRoot, ref: payloadRef, maxBytes, payloadDir });
    const resolvedArgs: any = payloadRefMode === 'payload_field' && hasPayloadRefCompanionArgs(input)
      ? { ...withoutPayloadTransport(input), payload: revision.payload }
      : revision.payload;
    return {
      args: resolvedArgs,
      payloadSource: {
        kind: 'ref',
        ref: revision.ref,
        payload_id: revision.payload_id,
        revision: revision.revision,
        byte_size: revision.byte_size,
        sha256: revision.sha256,
        max_bytes: maxBytes,
        transient_not_authority: true,
      },
    };
  }

  const root: any = resolve(siteRoot);
  const allowedRoot: any = resolve(root, payloadDir);
  const absolutePath: any = resolve(root, payloadPath);
  if (!isPathInside(absolutePath, allowedRoot)) {
    throw new Error(`payload_path_outside_allowed_staging: ${normalizePath(relative(root, absolutePath))}`);
  }

  let stat: any;
  try {
    stat = statSync(absolutePath);
  } catch {
    throw new Error(`payload_path_not_found: ${normalizePath(relative(root, absolutePath))}`);
  }
  if (!stat.isFile()) throw new Error(`payload_path_not_file: ${normalizePath(relative(root, absolutePath))}`);
  if (stat.size > maxBytes) throw new Error(`payload_path_too_large: ${stat.size} > ${maxBytes}`);

  let parsed: any;
  try {
    parsed = JSON.parse(readFileSync(absolutePath, 'utf8'));
  } catch (error: any) {
    throw new Error(`payload_path_invalid_json: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('payload_path_json_must_be_object');
  }

  return {
    args: parsed,
    payloadSource: {
      kind: 'file',
      path: normalizePath(relative(root, absolutePath)),
      byte_size: stat.size,
      max_bytes: maxBytes,
      transient_not_authority: true,
    },
  };
}

function hasPayloadRefCompanionArgs(input: any) : any{
  return Object.keys(withoutPayloadTransport(input)).length > 0;
}

function withoutPayloadTransport(input: any) : any{
  const { payload_ref, payload_path, payload, payload_file, ...rest }: any = input;
  return rest;
}

export function attachPayloadSource(result: any, payloadSource: any) : any{
  if (!payloadSource || !result || typeof result !== 'object' || Array.isArray(result)) return result;
  return { ...result, payload_source: payloadSource };
}

export function payloadRefFromEntry(entry: any) : any{
  if (typeof entry === 'string' && entry.trim().length > 0) return entry.trim();
  if (isPlainObject(entry)) {
    const ref: any = stringOrNull(entry.ref);
    if (ref) return ref;
  }
  return null;
}

export function payloadRefMetadataFromEntry(entry: any) : any{
  if (!isPlainObject(entry)) return {};
  const metadata: any = {};
  const role: any = stringOrNull(entry.role);
  const payloadSchema: any = stringOrNull(entry.payload_schema);
  if (role) metadata.role = role;
  if (payloadSchema) metadata.payload_schema = payloadSchema;
  return metadata;
}

export function enforceInlinePayloadLimit({
  toolName,
  args,
  limit = DEFAULT_INLINE_PAYLOAD_CHAR_LIMIT,
  exemptFields = DEFAULT_INLINE_PAYLOAD_EXEMPT_FIELDS,
  objectPayloadFields = DEFAULT_INLINE_OBJECT_PAYLOAD_FIELDS,
  allowPayloadCreation = false,
}: any = {}) : any{
  const input: any = asRecord(args);
  if (allowPayloadCreation && isPayloadWorkspaceTool(toolName)) return;
  const violations: any = [];
  visitInlinePayload(input, [], { limit, exemptFields, objectPayloadFields, violations });
  if (violations.length === 0) return;
  const first: any = violations[0];
  throw new Error(
    `inline_payload_too_long: field=${first.field} length=${first.length} threshold=${limit} remediation=use payload_ref`
  );
}

function visitInlinePayload(value: any, path: any, context: any) : any{
  if (typeof value === 'string') {
    const field: any = path[path.length - 1] ?? '<root>';
    if (!context.exemptFields.has(field) && value.length > context.limit) {
      context.violations.push({ field: pathToField(path), length: value.length, threshold: context.limit });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item: any, index: any) => visitInlinePayload(item, [...path, String(index)], context));
    return;
  }
  if (!isPlainObject(value)) return;

  const field: any = path[path.length - 1];
  if (field && context.objectPayloadFields.has(field)) {
    const length: any = stableJson(value).length;
    if (length > context.limit) {
      context.violations.push({ field: pathToField(path), length, threshold: context.limit });
    }
  }
  for (const [key, child] of Object.entries(value)) {
    visitInlinePayload(child, [...path, key], context);
  }
}

function pathToField(path: any) : any{
  return path.length > 0 ? path.join('.') : '<root>';
}

function isPayloadWorkspaceTool(toolName: any) : any{
  return ['mcp_payload_create', 'mcp_payload_derive'].includes(toolName);
}

export function payloadCreate({ siteRoot, args, maxBytes = DEFAULT_MAX_BYTES, payloadDir = DEFAULT_PAYLOAD_DIR }: any) : any{
  const input: any = asRecord(args);
  const payload: any = asPayloadObject(input.payload, 'payload_create_payload_must_be_object');
  if (Object.keys(payload).length === 0 && input.allow_empty !== true) {
    throw new Error('payload_create_empty_payload_requires_allow_empty: payload object is empty; pass allow_empty=true only when an empty immutable payload is intentional. Common mistake: put domain fields under payload, e.g. {"payload":{"summary":"..."}}, not alongside it.');
  }
  const payloadId: any = input.payload_id ? validatePayloadId(String(input.payload_id)) : randomPayloadId();
  const createdAt: any = new Date().toISOString();
  const ref: any = buildPayloadRef(payloadId, 1);
  const createdBy: any = normalizeCreatedBy(input);
  const revision: any = buildRevisionRecord({
    payloadId,
    revision: 1,
    payload,
    createdAt,
    createdBy,
    source: { kind: 'create' },
    maxBytes,
  });
  writeRevision({ siteRoot, payloadDir, record: revision, overwrite: false });
  return publicRevisionResult({ status: 'created', record: revision, ref });
}

export function payloadShow({ siteRoot, args, maxBytes = DEFAULT_MAX_BYTES, payloadDir = DEFAULT_PAYLOAD_DIR }: any) : any{
  const revision: any = readPayloadRevision({ siteRoot, ref: requireRef(args, 'payload_show_requires_ref'), maxBytes, payloadDir });
  return publicRevisionResult({ status: 'ok', record: revision.record, includePayload: true });
}

export function payloadValidate({ siteRoot, args, maxBytes = DEFAULT_MAX_BYTES, payloadDir = DEFAULT_PAYLOAD_DIR }: any) : any{
  const revision: any = readPayloadRevision({ siteRoot, ref: requireRef(args, 'payload_validate_requires_ref'), maxBytes, payloadDir });
  return publicRevisionResult({ status: 'valid', record: revision.record });
}

export function payloadDerive({ siteRoot, args, maxBytes = DEFAULT_MAX_BYTES, payloadDir = DEFAULT_PAYLOAD_DIR }: any) : any{
  const input: any = asRecord(args);
  const source: any = readPayloadRevision({ siteRoot, ref: requireRef(input, 'payload_derive_requires_source_ref', 'source_ref'), maxBytes, payloadDir });
  const overlay: any = asPayloadObject(input.overlay, 'payload_derive_overlay_must_be_object');
  const payload: any = overlayObject(source.payload, overlay);
  const revision: any = source.revision + 1;
  const ref: any = buildPayloadRef(source.payload_id, revision);
  const createdAt: any = new Date().toISOString();
  const createdBy: any = normalizeCreatedBy(input);
  const record: any = buildRevisionRecord({
    payloadId: source.payload_id,
    revision,
    payload,
    createdAt,
    createdBy,
    source: { kind: 'derive', source_ref: source.ref, overlay_sha256: sha256(stableJson(overlay)) },
    maxBytes,
  });
  writeRevision({ siteRoot, payloadDir, record, overwrite: false });
  return publicRevisionResult({ status: 'derived', record, ref, sourceRef: source.ref });
}

export function buildOutputRefToolContent({
  siteRoot,
  toolName,
  value,
  isError = false,
  limit = DEFAULT_INLINE_OUTPUT_CHAR_LIMIT,
  createdBy = process.env.NARADA_AGENT_ID || null,
}: any = {}) : any{
  if (isOutputLocator(value)) {
    return { content: [{ type: 'text', text: JSON.stringify(value) }], ...(isError ? { isError: true } : {}) };
  }
  if (isOutputShowResult(value)) {
    return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], ...(isError ? { isError: true } : {}) };
  }

  const fullText: any = JSON.stringify(value, null, 2);
  if (fullText.length <= limit) {
    return { content: [{ type: 'text', text: fullText }], ...(isError ? { isError: true } : {}) };
  }

  const stored: any = outputCreate({
    siteRoot,
    toolName,
    value,
    fullText,
    inlineLimit: limit,
    createdBy,
  });

  const envelope: any = {
    status: outputStatus(value, isError),
    truncated: true,
    output_ref: stored.ref,
    reader_tool: 'mcp_output_show',
    site_root: siteRoot,
    inline_limit: limit,
    full_output_char_length: stored.full_output_char_length,
  };
  return { content: [{ type: 'text', text: fitInlineJson(envelope, limit) }], ...(isError ? { isError: true } : {}) };
}

export function outputShow({ siteRoot, args, maxBytes = DEFAULT_OUTPUT_MAX_BYTES, outputDir = DEFAULT_OUTPUT_DIR }: any) : any{
  const input: any = asRecord(args);
  const effectiveSiteRoot: any = typeof input.target_site_root === 'string' && input.target_site_root.trim().length > 0
    ? resolve(input.target_site_root.trim())
    : siteRoot;
  const record: any = readOutputRecord({ siteRoot: effectiveSiteRoot, ref: requireOutputRef(input, 'output_show_requires_ref'), maxBytes, outputDir });
  return publicOutputShowRecord(record, {
    outputLimit: normalizeOutputShowLimit(input.output_limit),
    compact: input.compact === true,
  });
}

export function listOutputTools() : any{
  return [
    {
      name: 'mcp_output_show',
      description: 'Show an MCP output ref inline up to output_limit characters. Defaults to 10000 characters.',
      inputSchema: {
        type: 'object',
        properties: {
          ref: { type: 'string', description: 'Output ref, e.g. mcp_output:<id>.' },
          output_limit: { type: 'integer', description: 'Maximum characters of stored output to inline. Defaults to 10000.' },
          compact: { type: 'boolean', description: 'Return a compact lifecycle-oriented summary while preserving the output ref for full audit expansion.' },
          target_site_root: { type: 'string', description: 'Optional explicit target Site root where the output was written. Defaults to this MCP server site root.' },
        },
        required: ['ref'],
      },
    },
  ];
}

function outputCreate({ siteRoot, toolName, value, fullText, inlineLimit, createdBy, maxBytes = DEFAULT_OUTPUT_MAX_BYTES, outputDir = DEFAULT_OUTPUT_DIR }: any) : any{
  const outputId: any = randomOutputId();
  const createdAt: any = new Date().toISOString();
  const ref: any = buildOutputRef(outputId);
  const record: any = {
    schema: 'narada.mcp_output_ref.v1',
    ref,
    output_id: outputId,
    tool_name: typeof toolName === 'string' && toolName.trim().length > 0 ? toolName.trim() : null,
    created_at: createdAt,
    created_by: createdBy,
    content_type: 'application/json',
    inline_char_limit: inlineLimit,
    full_output_char_length: fullText.length,
    truncated: true,
    sha256: sha256(fullText),
    max_bytes: maxBytes,
    full_output: value,
  };
  const serialized: any = `${stableJson(record)}\n`;
  const byteSize: any = Buffer.byteLength(serialized, 'utf8');
  if (byteSize > maxBytes) throw new Error(`mcp_output_too_large: ${byteSize} > ${maxBytes}`);
  const path: any = outputPath({ siteRoot, outputDir, outputId });
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serialized, 'utf8');
  return { ...publicOutputRecord(record), byte_size: byteSize };
}

function readOutputRecord({ siteRoot, ref, maxBytes = DEFAULT_OUTPUT_MAX_BYTES, outputDir = DEFAULT_OUTPUT_DIR }: any) : any{
  const parsed: any = parseOutputRef(ref);
  const path: any = outputPath({ siteRoot, outputDir, outputId: parsed.outputId });
  let stat: any;
  try {
    stat = statSync(path);
  } catch {
    throw new Error(`output_ref_not_found: ${ref}`);
  }
  if (!stat.isFile()) throw new Error(`output_ref_not_file: ${ref}`);
  if (stat.size > maxBytes) throw new Error(`output_ref_too_large: ${stat.size} > ${maxBytes}`);
  let record: any;
  try {
    record = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error: any) {
    throw new Error(`output_ref_invalid_json: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error(`output_ref_record_must_be_object: ${ref}`);
  if (record.schema !== 'narada.mcp_output_ref.v1') throw new Error(`output_ref_schema_unsupported: ${record.schema}`);
  if (record.ref !== ref || record.output_id !== parsed.outputId) throw new Error(`output_ref_metadata_mismatch: ${ref}`);
  return { ...record, byte_size: stat.size, output_path: normalizePath(relative(resolve(siteRoot), path)) };
}

function publicOutputRecord(record: any) : any{
  return {
    schema: 'narada.mcp_output_locator.v1',
    status: 'ok',
    ref: record.ref,
    tool_name: record.tool_name ?? null,
    full_output_char_length: record.full_output_char_length ?? null,
    byte_size: record.byte_size ?? null,
    truncated: record.truncated === true,
    path: record.output_path ?? normalizePath(`${DEFAULT_OUTPUT_DIR}/${DEFAULT_WORKSPACE_DIR}/${record.output_id}.json`),
  };
}

function publicOutputShowRecord(record: any, { outputLimit = DEFAULT_OUTPUT_SHOW_CHAR_LIMIT, compact = false }: any = {}) : any{
  const outputText: any = JSON.stringify(record.full_output, null, 2);
  const outputTruncated: any = outputText.length > outputLimit;
  const result: any = {
    schema: 'narada.mcp_output_show.v1',
    status: 'ok',
    ref: record.ref,
    tool_name: record.tool_name ?? null,
    full_output_char_length: record.full_output_char_length ?? outputText.length,
    byte_size: record.byte_size ?? null,
    original_truncated: record.truncated === true,
    path: record.output_path ?? normalizePath(`${DEFAULT_OUTPUT_DIR}/${DEFAULT_WORKSPACE_DIR}/${record.output_id}.json`),
    output_limit: outputLimit,
    output_truncated: outputTruncated,
    output_text: outputTruncated ? outputText.slice(0, outputLimit) : outputText,
  };
  if (compact) {
    result.compact = true;
    result.compact_summary = buildCompactOutputSummary(record);
    delete result.output_text;
    result.output_truncated = true;
    result.omitted_sections = result.compact_summary.omitted_sections;
  }
  return result;
}

function buildCompactOutputSummary(record: any) : any{
  const value: any = asRecord(record.full_output);
  const taskLike: any = summarizeTaskLikeOutput(value);
  const workboardLike: any = summarizeWorkboardLikeOutput(value);
  const chapterLike: any = summarizeChapterLikeOutput(value);
  return {
    schema: 'narada.mcp_output.compact_summary.v1',
    status: 'ok',
    ref: record.ref,
    tool_name: record.tool_name ?? null,
    full_output_char_length: record.full_output_char_length ?? JSON.stringify(record.full_output, null, 2).length,
    summary_kind: taskLike ? 'task_lifecycle' : (workboardLike ? 'workboard' : (chapterLike ? 'chapter' : 'generic')),
    lifecycle: taskLike?.lifecycle ?? null,
    criteria_state: taskLike?.criteria_state ?? chapterLike?.criteria_state ?? null,
    evidence_refs: taskLike?.evidence_refs ?? chapterLike?.evidence_refs ?? [],
    residuals: taskLike?.residuals ?? chapterLike?.residuals ?? workboardLike?.residuals ?? [],
    workboard: workboardLike ?? null,
    chapter: chapterLike?.chapter ?? null,
    omitted_sections: summarizeOmittedSections(value),
  };
}

function summarizeTaskLikeOutput(value: any) : any{
  if (!value || typeof value !== 'object') return null;
  const taskNumber: any = value.task_number ?? value.spec?.task_number ?? value.lifecycle?.task_number ?? null;
  const taskId: any = value.task_id ?? value.spec?.task_id ?? value.lifecycle?.task_id ?? null;
  const lifecycle: any = value.lifecycle ?? null;
  if (!taskNumber && !taskId && !lifecycle) return null;
  return {
    lifecycle: {
      task_number: taskNumber,
      task_id: taskId,
      status: lifecycle?.status ?? value.status ?? null,
      closed_at: lifecycle?.closed_at ?? null,
      closed_by: lifecycle?.closed_by ?? null,
      assigned_agent: value.active_assignment?.agent_id ?? null,
    },
    criteria_state: summarizeCriteria(value),
    evidence_refs: collectEvidenceRefs(value),
    residuals: collectResiduals(value),
  };
}

function summarizeWorkboardLikeOutput(value: any) : any{
  if (!value || typeof value !== 'object') return null;
  if (!('recommendation' in value) && !('workloop_summary' in value) && !('counts' in value)) return null;
  return {
    agent_id: value.agent_id ?? null,
    agent_role: value.agent_role ?? null,
    recommendation: value.workloop_summary ?? value.recommendation ?? null,
    counts: value.counts ?? null,
    evidence_refs: collectEvidenceRefs(value),
    residuals: collectResiduals(value),
  };
}

function summarizeChapterLikeOutput(value: any) : any{
  if (!value || typeof value !== 'object') return null;
  const chapter: any = value.chapter ?? value;
  if (!chapter || typeof chapter !== 'object' || (!chapter.chapter_id && !chapter.status_projection)) return null;
  return {
    chapter: {
      chapter_id: chapter.chapter_id ?? null,
      title: chapter.title ?? null,
      status_projection: chapter.status_projection ?? null,
    },
    criteria_state: null,
    evidence_refs: collectEvidenceRefs(chapter),
    residuals: collectResiduals(chapter),
  };
}

function summarizeCriteria(value: any) : any{
  const rawCriteria: any = parseJsonMaybe(value.spec?.acceptance_criteria_json);
  const body: any = typeof value.body === 'string' ? value.body : '';
  const checked: any = (body.match(/^- \[x\]/gim) || []).length;
  const unchecked: any = (body.match(/^- \[ \]/gim) || []).length;
  const totalFromBody: any = checked + unchecked;
  return {
    total: Array.isArray(rawCriteria) && rawCriteria.length > 0 ? rawCriteria.length : totalFromBody,
    checked,
    unchecked,
    all_checked: totalFromBody > 0 ? unchecked === 0 : null,
  };
}

function collectEvidenceRefs(value: any) : any{
  const refs: any = [];
  for (const observation of Array.isArray(value?.observations) ? value.observations : []) {
    if (observation.artifact_uri) refs.push(observation.artifact_uri);
    if (observation.artifact_id) refs.push(`artifact:${observation.artifact_id}`);
  }
  for (const review of Array.isArray(value?.reviews) ? value.reviews : []) {
    if (review.review_id) refs.push(`review:${review.review_id}`);
  }
  if (value?.admission_id) refs.push(`evidence_admission:${value.admission_id}`);
  return [...new Set(refs)];
}

function collectResiduals(value: any) : any{
  const residuals: any = [];
  const projectionResiduals: any = value?.status_projection?.residuals ?? value?.chapter?.status_projection?.residuals;
  if (Array.isArray(projectionResiduals)) residuals.push(...projectionResiduals);
  if (value?.closure_posture?.residual_crossing) residuals.push(value.closure_posture.residual_crossing);
  if (value?.closure_claim?.residual_crossing) residuals.push(value.closure_claim.residual_crossing);
  if (Array.isArray(value?.follow_up_policy?.candidates)) {
    residuals.push(...value.follow_up_policy.candidates.map((candidate: any) => candidate.reason ?? candidate.kind ?? 'follow_up_candidate'));
  }
  return residuals;
}

function summarizeOmittedSections(value: any) : any{
  const output: any = [];
  for (const [key, inner] of Object.entries(asRecord(value))) {
    if (['status', 'schema', 'task_id', 'task_number', 'agent_id', 'agent_role', 'lifecycle', 'spec', 'chapter'].includes(key)) continue;
    if (Array.isArray(inner)) {
      output.push({ field: key, kind: 'array', count: inner.length });
    } else if (inner && typeof inner === 'object') {
      output.push({ field: key, kind: 'object', keys: Object.keys(inner).length });
    } else if (typeof inner === 'string' && inner.length > 240) {
      output.push({ field: key, kind: 'string', char_length: inner.length });
    }
  }
  return output;
}

function parseJsonMaybe(value: any) : any{
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isOutputLocator(value: any) : any{
  return Boolean(
    value
      && typeof value === 'object'
      && !Array.isArray(value)
      && value.schema === 'narada.mcp_output_locator.v1'
      && typeof value.ref === 'string'
  );
}

function isOutputShowResult(value: any) : any{
  return Boolean(
    value
      && typeof value === 'object'
      && !Array.isArray(value)
      && value.schema === 'narada.mcp_output_show.v1'
      && typeof value.ref === 'string'
      && typeof value.output_text === 'string'
  );
}

function normalizeOutputShowLimit(value: any) : any{
  if (value === undefined || value === null || value === '') return DEFAULT_OUTPUT_SHOW_CHAR_LIMIT;
  const numeric: any = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new Error('output_limit_must_be_non_negative_integer');
  }
  return Math.min(numeric, DEFAULT_OUTPUT_MAX_BYTES);
}

function parseOutputRef(ref: any) : any{
  const value: any = typeof ref === 'string' ? ref.trim() : '';
  if (REF_PATTERN.test(value)) {
    throw new Error('wrong_ref_family: got=mcp_payload expected=mcp_output reader_tool=mcp_payload_show remediation=use mcp_payload_show');
  }
  const match: any = value.match(OUTPUT_REF_PATTERN);
  if (!match) throw new Error(`output_ref_invalid: ${value}`);
  return { ref: value, outputId: match[1], output_id: match[1] };
}

function requireOutputRef(args: any, message: any, field: any = 'ref') : any{
  const value: any = asRecord(args)[field];
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(message);
  return value.trim();
}

function outputPath({ siteRoot, outputDir, outputId }: any) : any{
  return resolve(siteRoot, outputDir, DEFAULT_WORKSPACE_DIR, `${outputId}.json`);
}

function buildOutputRef(outputId: any) : any{
  return `mcp_output:${outputId}`;
}

function randomOutputId() : any{
  return `o_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function outputStatus(value: any, isError: any) : any{
  if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.status === 'string' && value.status.length <= 32) {
    return value.status;
  }
  return isError ? 'error' : 'ok';
}

function fitInlineJson(value: any, limit: any) : any{
  let text: any = JSON.stringify(value);
  if (text.length <= limit) return text;
  const minimal: any = {
    ...(typeof value.status === 'string' ? { status: value.status } : {}),
    truncated: true,
    output_ref: value.output_ref,
    reader_tool: value.reader_tool,
  };
  text = JSON.stringify(minimal);
  if (text.length <= limit) return text;
  return text.slice(0, limit);
}

export function listPayloadTools() : any{
  return [
    {
      name: 'mcp_payload_create',
      description: 'Create immutable transient MCP payload revision v1 under .ai/tmp/mcp-payloads/workspace.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          payload_id: { type: 'string', description: 'Optional stable id segment. Defaults to a generated id.' },
          payload: { type: 'object', description: 'Required nested domain object to store as v1. Put tool arguments inside this field, e.g. {"payload":{"summary":"..."}}. Empty objects require allow_empty=true.' },
          allow_empty: { type: 'boolean', description: 'Set true only when intentionally creating an empty payload object.' },
          created_by: { type: 'string', description: 'Optional acting identity for non-agent callers. Agent sessions use the bound NARADA_AGENT_ID and reject mismatches.' },
        },
        required: ['payload'],
      },
    },
    {
      name: 'mcp_payload_show',
      description: 'Show an immutable transient MCP payload revision by ref.',
      inputSchema: {
        type: 'object',
        properties: { ref: { type: 'string', description: 'Payload ref, e.g. mcp_payload:<id>@v1.' } },
        required: ['ref'],
      },
    },
    {
      name: 'mcp_payload_derive',
      description: 'Derive a new immutable payload revision by applying a constrained object overlay.',
      inputSchema: {
        type: 'object',
        properties: {
          source_ref: { type: 'string', description: 'Source payload ref, e.g. mcp_payload:<id>@v1.' },
          overlay: { type: 'object', description: 'Recursive object overlay. No deletion semantics.' },
          created_by: { type: 'string', description: 'Optional acting identity for non-agent callers. Agent sessions use the bound NARADA_AGENT_ID and reject mismatches.' },
        },
        required: ['source_ref', 'overlay'],
      },
    },
    {
      name: 'mcp_payload_validate',
      description: 'Validate that a payload ref exists, is well-formed, and is within size limits.',
      inputSchema: {
        type: 'object',
        properties: { ref: { type: 'string', description: 'Payload ref, e.g. mcp_payload:<id>@v1.' } },
        required: ['ref'],
      },
    },
  ];
}

export function listCommandTools() : any{
  return [
    {
      name: 'mcp_command_create',
      description: 'Create immutable transient MCP command revision v1 under .ai/tmp/mcp-commands/workspace.',
      inputSchema: {
        type: 'object',
        properties: {
          command_id: { type: 'string', description: 'Optional stable command id segment. Defaults to a generated id.' },
          command: { type: 'object', description: 'Command packet to store as v1.' },
          created_by: { type: 'string', description: 'Optional acting identity for non-agent callers. Agent sessions use the bound NARADA_AGENT_ID and reject mismatches.' },
          payload_ref: { type: 'string', description: 'Optional payload ref containing the command packet.' },
        },
      },
    },
    {
      name: 'mcp_command_show',
      description: 'Show an immutable transient MCP command revision by ref.',
      inputSchema: {
        type: 'object',
        properties: { ref: { type: 'string', description: 'Command ref, e.g. mcp_command:<id>@v1.' } },
        required: ['ref'],
      },
    },
    {
      name: 'mcp_command_validate',
      description: 'Validate a command ref for generic envelope shape, target, authority, payload refs, and typed command support.',
      inputSchema: {
        type: 'object',
        properties: { ref: { type: 'string', description: 'Command ref, e.g. mcp_command:<id>@v1.' } },
        required: ['ref'],
      },
    },
    {
      name: 'mcp_command_submit',
      description: 'Submit a command ref through generic command admission. Unsupported schemas are refused without domain mutation.',
      inputSchema: {
        type: 'object',
        properties: {
          ref: { type: 'string', description: 'Command ref, e.g. mcp_command:<id>@v1.' },
          dry_run: { type: 'boolean', description: 'Validate and return the planned result without writing a result packet.' },
        },
        required: ['ref'],
      },
    },
    {
      name: 'mcp_command_author_and_submit',
      description: 'Create optional payload, create a generic command packet, submit it, and return payload_ref, command_ref, and result_ref.',
      inputSchema: {
        type: 'object',
        properties: {
          command_schema: { type: 'string', description: 'Typed command schema, e.g. narada.command.task.finish.v1.' },
          target_locus: { type: 'string', description: 'Target locus for the command. Required for mutation commands.' },
          target_site_root: { type: 'string', description: 'Optional explicit target site root.' },
          authority_basis: { type: 'object', description: 'Authority basis object required for mutation commands.' },
          domain_args: { type: 'object', description: 'Compact domain arguments merged with payload material during admission.' },
          expected_consequence: { type: 'object', description: 'Expected consequence packet for validation and audit.' },
          payload: { type: 'object', description: 'Optional authored domain payload to materialize before command creation.' },
          payload_ref: { type: 'string', description: 'Optional existing payload ref to attach instead of creating one.' },
          payload_id: { type: 'string', description: 'Optional stable payload id when payload is provided.' },
          command_id: { type: 'string', description: 'Optional stable command id.' },
          created_by: { type: 'string', description: 'Optional acting identity for non-agent callers. Agent sessions use the bound NARADA_AGENT_ID and reject mismatches.' },
          dry_run: { type: 'boolean', description: 'Submit as dry run; command and optional payload packets are still materialized.' },
        },
        required: ['command_schema', 'expected_consequence'],
      },
    },
    {
      name: 'mcp_result_show',
      description: 'Show an immutable transient MCP command result revision by ref.',
      inputSchema: {
        type: 'object',
        properties: { ref: { type: 'string', description: 'Result ref, e.g. mcp_result:<id>@v1.' } },
        required: ['ref'],
      },
    },
  ];
}

export function commandCreate({
  siteRoot,
  args,
  maxBytes = DEFAULT_MAX_BYTES,
  commandDir = DEFAULT_COMMAND_DIR,
  payloadDir = DEFAULT_PAYLOAD_DIR,
}: any) : any{
  const input: any = asRecord(args);
  const command: any = input.payload_ref
    ? readPayloadRevision({ siteRoot, ref: requireRef(input, 'command_create_payload_ref_required_when_used', 'payload_ref'), maxBytes, payloadDir }).payload
    : asPayloadObject(input.command, 'command_create_command_must_be_object');
  const commandId: any = input.command_id ? validatePayloadId(String(input.command_id)) : randomCommandId();
  const createdAt: any = new Date().toISOString();
  const createdBy: any = normalizeCreatedBy(input);
  const record: any = buildCommandRecord({
    commandId,
    revision: 1,
    command,
    createdAt,
    createdBy,
    source: input.payload_ref ? { kind: 'payload_ref', payload_ref: input.payload_ref } : { kind: 'create' },
    maxBytes,
  });
  writeCommandRevision({ siteRoot, commandDir, record, overwrite: false });
  return publicCommandResult({ status: 'created', record });
}

export function commandShow({ siteRoot, args, maxBytes = DEFAULT_MAX_BYTES, commandDir = DEFAULT_COMMAND_DIR }: any) : any{
  const revision: any = readCommandRevision({ siteRoot, ref: requireRef(args, 'command_show_requires_ref'), maxBytes, commandDir });
  return publicCommandResult({ status: 'ok', record: revision.record, includeCommand: true });
}

export function commandValidate({
  siteRoot,
  args,
  maxBytes = DEFAULT_MAX_BYTES,
  commandDir = DEFAULT_COMMAND_DIR,
  payloadDir = DEFAULT_PAYLOAD_DIR,
}: any = {}) : any{
  const revision: any = readCommandRevision({ siteRoot, ref: requireRef(args, 'command_validate_requires_ref'), maxBytes, commandDir });
  const validation: any = validateCommandPacket({ siteRoot, command: revision.command, maxBytes, payloadDir });
  return {
    schema: 'narada.mcp_command.validation.v1',
    status: validation.status,
    command_ref: revision.ref,
    command_schema: revision.command.command_schema ?? null,
    errors: validation.errors,
    warnings: validation.warnings,
    supported: validation.supported,
    submit_posture: validation.submit_posture,
  };
}

export function commandSubmit({
  siteRoot,
  args,
  maxBytes = DEFAULT_MAX_BYTES,
  commandDir = DEFAULT_COMMAND_DIR,
  payloadDir = DEFAULT_PAYLOAD_DIR,
  resultDir = DEFAULT_RESULT_DIR,
  admitters = {},
}: any = {}) : any{
  const input: any = asRecord(args);
  const revision: any = readCommandRevision({ siteRoot, ref: requireRef(input, 'command_submit_requires_ref'), maxBytes, commandDir });
  const validation: any = validateCommandPacket({ siteRoot, command: revision.command, maxBytes, payloadDir });
  const planned: any = buildCommandSubmitResult({
    commandRef: revision.ref,
    command: revision.command,
    validation,
    admitter: admitters[revision.command.command_schema],
  });
  if (input.dry_run === true) return { ...planned, dry_run: true, transient_not_authority: true };
  const record: any = writeResultRevision({
    siteRoot,
    resultDir,
    result: planned,
    createdBy: process.env.NARADA_AGENT_ID || null,
    maxBytes,
  });
  return {
    schema: 'narada.mcp_command.submit.v1',
    status: planned.status,
    command_ref: revision.ref,
    result_ref: record.ref,
    result_status: planned.status,
    reason_code: planned.reason_code ?? null,
    remediation: planned.remediation ?? null,
    transient_not_authority: true,
  };
}

export async function commandSubmitAsync({
  siteRoot,
  args,
  maxBytes = DEFAULT_MAX_BYTES,
  commandDir = DEFAULT_COMMAND_DIR,
  payloadDir = DEFAULT_PAYLOAD_DIR,
  resultDir = DEFAULT_RESULT_DIR,
  admitters = {},
}: any = {}) : Promise<any>{
  const input: any = asRecord(args);
  const revision: any = readCommandRevision({ siteRoot, ref: requireRef(input, 'command_submit_requires_ref'), maxBytes, commandDir });
  const validation: any = validateCommandPacket({ siteRoot, command: revision.command, maxBytes, payloadDir });
  if (input.dry_run === true && validation.errors.length === 0) {
    return {
      schema: 'narada.command_result.v1',
      command_ref: revision.ref,
      command_schema: revision.command.command_schema,
      status: 'validated',
      warnings: validation.warnings,
      durable_state_changed: false,
      dry_run: true,
      transient_not_authority: true,
    };
  }
  const planned: any = await buildCommandSubmitResultAsync({
    commandRef: revision.ref,
    command: revision.command,
    validation,
    admitter: admitters[revision.command.command_schema],
  });
  if (input.dry_run === true) return { ...planned, dry_run: true, transient_not_authority: true };
  const record: any = writeResultRevision({
    siteRoot,
    resultDir,
    result: planned,
    createdBy: process.env.NARADA_AGENT_ID || null,
    maxBytes,
  });
  return {
    schema: 'narada.mcp_command.submit.v1',
    status: planned.status,
    command_ref: revision.ref,
    result_ref: record.ref,
    result_status: planned.status,
    reason_code: planned.reason_code ?? null,
    remediation: planned.remediation ?? null,
    transient_not_authority: true,
  };
}

export async function commandAuthorAndSubmitAsync({
  siteRoot,
  args,
  maxBytes = DEFAULT_MAX_BYTES,
  commandDir = DEFAULT_COMMAND_DIR,
  payloadDir = DEFAULT_PAYLOAD_DIR,
  resultDir = DEFAULT_RESULT_DIR,
  admitters = {},
}: any = {}) : Promise<any>{
  const input: any = asRecord(args);
  const createdBy: any = normalizeCreatedBy(input);
  let payloadRef: any = stringOrNull(input.payload_ref);
  let payloadCreateResult: any = null;
  if (input.payload !== undefined) {
    if (payloadRef) throw new Error('provide_payload_or_payload_ref_not_both');
    payloadCreateResult = payloadCreate({
      siteRoot,
      args: {
        payload_id: input.payload_id,
        payload: asPayloadObject(input.payload, 'author_helper_payload_must_be_object'),
        created_by: createdBy,
      },
      maxBytes,
      payloadDir,
    });
    payloadRef = payloadCreateResult.ref;
  }
  const payloadRefs: any = payloadRef ? [{ ref: payloadRef, role: 'domain_payload' }] : [];
  const command: any = {
    schema: 'narada.command.v1',
    command_schema: stringOrNull(input.command_schema),
    target_locus: stringOrNull(input.target_locus),
    target_site_root: stringOrNull(input.target_site_root),
    authority_basis: input.authority_basis,
    payload_refs: payloadRefs,
    domain_args: isPlainObject(input.domain_args) ? input.domain_args : {},
    expected_consequence: input.expected_consequence,
  };
  const commandCreateResult: any = commandCreate({
    siteRoot,
    args: {
      command_id: input.command_id,
      command,
      created_by: createdBy,
    },
    maxBytes,
    commandDir,
    payloadDir,
  });
  const submitResult: any = await commandSubmitAsync({
    siteRoot,
    args: { ref: commandCreateResult.ref, dry_run: input.dry_run === true },
    maxBytes,
    commandDir,
    payloadDir,
    resultDir,
    admitters,
  });
  return {
    schema: 'narada.mcp_command.author_and_submit.v1',
    status: submitResult.status,
    payload_ref: payloadRef,
    payload_created: Boolean(payloadCreateResult),
    command_ref: commandCreateResult.ref,
    result_ref: submitResult.result_ref ?? null,
    result_status: submitResult.result_status ?? submitResult.status,
    reason_code: submitResult.reason_code ?? null,
    remediation: submitResult.remediation ?? null,
    dry_run: input.dry_run === true,
    transient_not_authority: true,
  };
}

export function resultShow({ siteRoot, args, maxBytes = DEFAULT_MAX_BYTES, resultDir = DEFAULT_RESULT_DIR }: any) : any{
  const revision: any = readResultRevision({ siteRoot, ref: requireResultRef(args, 'result_show_requires_ref'), maxBytes, resultDir });
  return publicResultRecord({ status: 'ok', record: revision.record, includeResult: true });
}

function asRecord(value: any) : any{
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asPayloadObject(value: any, message: any) : any{
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value;
}

function readPayloadRevision({ siteRoot, ref, maxBytes = DEFAULT_MAX_BYTES, payloadDir = DEFAULT_PAYLOAD_DIR }: any) : any{
  const parsed: any = parsePayloadRef(ref);
  const path: any = revisionPath({ siteRoot, payloadDir, payloadId: parsed.payloadId, revision: parsed.revision });
  let stat: any;
  try {
    stat = statSync(path);
  } catch {
    throw new Error(`payload_ref_not_found: ${ref}`);
  }
  if (!stat.isFile()) throw new Error(`payload_ref_not_file: ${ref}`);
  if (stat.size > maxBytes) throw new Error(`payload_ref_too_large: ${stat.size} > ${maxBytes}`);
  let record: any;
  try {
    record = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error: any) {
    throw new Error(`payload_ref_invalid_json: ${error instanceof Error ? error.message : String(error)}`);
  }
  validateRevisionRecord(record, parsed, stat.size, maxBytes);
  return {
    ...parsed,
    ref,
    payload: record.payload,
    record,
    byte_size: stat.size,
    sha256: record.sha256,
  };
}

function writeRevision({ siteRoot, payloadDir, record, overwrite }: any) : any{
  const path: any = revisionPath({ siteRoot, payloadDir, payloadId: record.payload_id, revision: record.revision });
  if (!overwrite && existsSync(path)) throw new Error(`payload_revision_already_exists: ${record.ref}`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${stableJson(record)}\n`, 'utf8');
}

function buildRevisionRecord({ payloadId, revision, payload, createdAt, createdBy, source, maxBytes }: any) : any{
  const payloadJson: any = stableJson(payload);
  const byteSize: any = Buffer.byteLength(payloadJson, 'utf8');
  if (byteSize > maxBytes) throw new Error(`payload_too_large: ${byteSize} > ${maxBytes}`);
  return {
    schema: 'narada.mcp_payload.revision.v1',
    ref: buildPayloadRef(payloadId, revision),
    payload_id: payloadId,
    revision,
    created_at: createdAt,
    created_by: createdBy,
    source,
    sha256: sha256(payloadJson),
    byte_size: byteSize,
    max_bytes: maxBytes,
    transient_not_authority: true,
    immutable_revision: true,
    payload,
  };
}

function validateRevisionRecord(record: any, parsed: any, statSize: any, maxBytes: any) : any{
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error(`payload_ref_record_must_be_object: ${parsed.ref}`);
  if (record.schema !== 'narada.mcp_payload.revision.v1') throw new Error(`payload_ref_schema_unsupported: ${record.schema}`);
  if (record.ref !== parsed.ref || record.payload_id !== parsed.payloadId || record.revision !== parsed.revision) {
    throw new Error(`payload_ref_metadata_mismatch: ${parsed.ref}`);
  }
  asPayloadObject(record.payload, 'payload_ref_payload_must_be_object');
  if (statSize > maxBytes || record.byte_size > maxBytes) throw new Error(`payload_ref_too_large: ${statSize} > ${maxBytes}`);
  const payloadJson: any = stableJson(record.payload);
  if (sha256(payloadJson) !== record.sha256) throw new Error(`payload_ref_sha256_mismatch: ${parsed.ref}`);
}

function parsePayloadRef(ref: any) : any{
  const value: any = typeof ref === 'string' ? ref.trim() : '';
  if (OUTPUT_REF_PATTERN.test(value)) {
    throw new Error('wrong_ref_family: got=mcp_output expected=mcp_payload reader_tool=mcp_output_show remediation=use mcp_output_show');
  }
  const match: any = value.match(REF_PATTERN);
  if (!match) throw new Error(`payload_ref_invalid: ${value}`);
  return { ref: value, payloadId: match[1], payload_id: match[1], revision: Number(match[2]) };
}

function requireRef(args: any, message: any, field: any = 'ref') : any{
  const value: any = asRecord(args)[field];
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(message);
  return value.trim();
}

function revisionPath({ siteRoot, payloadDir, payloadId, revision }: any) : any{
  return resolve(siteRoot, payloadDir, DEFAULT_WORKSPACE_DIR, payloadId, `v${revision}.json`);
}

function buildPayloadRef(payloadId: any, revision: any) : any{
  return `mcp_payload:${payloadId}@v${revision}`;
}

function validatePayloadId(value: any) : any{
  const match: any = value.trim().match(/^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/);
  if (!match) throw new Error(`payload_id_invalid: ${value}`);
  return value.trim();
}

function randomPayloadId() : any{
  return `p_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function overlayObject(base: any, overlay: any) : any{
  const output: any = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = overlayObject(output[key], value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function isPlainObject(value: any) : any{
  return value && typeof value === 'object' && !Array.isArray(value);
}

function publicRevisionResult({ status, record, includePayload = false, ref = record.ref, sourceRef = null }: any) : any{
  return {
    status,
    ref,
    payload_id: record.payload_id,
    revision: record.revision,
    source_ref: sourceRef ?? record.source?.source_ref ?? null,
    byte_size: record.byte_size,
    sha256: record.sha256,
    created_at: record.created_at,
    created_by: record.created_by,
    transient_not_authority: true,
    immutable_revision: true,
    payload: includePayload ? record.payload : undefined,
  };
}

function buildCommandRecord({ commandId, revision, command, createdAt, createdBy, source, maxBytes }: any) : any{
  const commandJson: any = stableJson(command);
  const byteSize: any = Buffer.byteLength(commandJson, 'utf8');
  if (byteSize > maxBytes) throw new Error(`command_too_large: ${byteSize} > ${maxBytes}`);
  return {
    schema: 'narada.mcp_command.revision.v1',
    ref: buildCommandRef(commandId, revision),
    command_id: commandId,
    revision,
    created_at: createdAt,
    created_by: createdBy,
    source,
    sha256: sha256(commandJson),
    byte_size: byteSize,
    max_bytes: maxBytes,
    transient_not_authority: true,
    immutable_revision: true,
    command,
  };
}

function writeCommandRevision({ siteRoot, commandDir, record, overwrite }: any) : any{
  const path: any = commandPath({ siteRoot, commandDir, commandId: record.command_id, revision: record.revision });
  if (!overwrite && existsSync(path)) throw new Error(`command_revision_already_exists: ${record.ref}`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${stableJson(record)}\n`, 'utf8');
}

function readCommandRevision({ siteRoot, ref, maxBytes = DEFAULT_MAX_BYTES, commandDir = DEFAULT_COMMAND_DIR }: any) : any{
  const parsed: any = parseCommandRef(ref);
  const path: any = commandPath({ siteRoot, commandDir, commandId: parsed.commandId, revision: parsed.revision });
  let stat: any;
  try {
    stat = statSync(path);
  } catch {
    throw new Error(`command_ref_not_found: ${ref}`);
  }
  if (!stat.isFile()) throw new Error(`command_ref_not_file: ${ref}`);
  if (stat.size > maxBytes) throw new Error(`command_ref_too_large: ${stat.size} > ${maxBytes}`);
  let record: any;
  try {
    record = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error: any) {
    throw new Error(`command_ref_invalid_json: ${error instanceof Error ? error.message : String(error)}`);
  }
  validateCommandRevisionRecord(record, parsed, stat.size, maxBytes);
  return {
    ...parsed,
    ref,
    command: record.command,
    record,
    byte_size: stat.size,
    sha256: record.sha256,
  };
}

function validateCommandRevisionRecord(record: any, parsed: any, statSize: any, maxBytes: any) : any{
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error(`command_ref_record_must_be_object: ${parsed.ref}`);
  if (record.schema !== 'narada.mcp_command.revision.v1') throw new Error(`command_ref_schema_unsupported: ${record.schema}`);
  if (record.ref !== parsed.ref || record.command_id !== parsed.commandId || record.revision !== parsed.revision) {
    throw new Error(`command_ref_metadata_mismatch: ${parsed.ref}`);
  }
  asPayloadObject(record.command, 'command_ref_command_must_be_object');
  if (statSize > maxBytes || record.byte_size > maxBytes) throw new Error(`command_ref_too_large: ${statSize} > ${maxBytes}`);
  if (sha256(stableJson(record.command)) !== record.sha256) throw new Error(`command_ref_sha256_mismatch: ${parsed.ref}`);
}

function validateCommandPacket({ siteRoot, command, maxBytes, payloadDir }: any) : any{
  const errors: any = [];
  const warnings: any = [];
  const schema: any = stringOrNull(command.schema);
  const commandSchema: any = stringOrNull(command.command_schema);
  if (schema !== 'narada.command.v1') errors.push({ code: 'unsupported_generic_command_schema', field: 'schema', expected: 'narada.command.v1', actual: schema });
  if (!commandSchema) errors.push({ code: 'missing_command_schema', field: 'command_schema' });
  if (!stringOrNull(command.target_locus)) errors.push({ code: 'missing_target_locus', field: 'target_locus' });
  if (!isPlainObject(command.authority_basis)) errors.push({ code: 'missing_authority_basis', field: 'authority_basis' });
  if (!isPlainObject(command.expected_consequence)) errors.push({ code: 'missing_expected_consequence', field: 'expected_consequence' });
  const payloadRefs: any = Array.isArray(command.payload_refs) ? command.payload_refs : [];
  if (payloadRefs.length === 0) warnings.push({ code: 'no_payload_refs', field: 'payload_refs' });
  for (const [index, entry] of payloadRefs.entries()) {
    const ref: any = payloadRefFromEntry(entry);
    if (!ref) {
      errors.push({
        code: 'payload_ref_invalid',
        field: `payload_refs.${index}`,
        message: 'payload_ref_entry_must_be_string_or_object_with_ref',
      });
      continue;
    }
    try {
      readPayloadRevision({ siteRoot, ref, maxBytes, payloadDir });
    } catch (error: any) {
      errors.push({
        code: 'payload_ref_invalid',
        field: `payload_refs.${index}`,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const supportedSchemas: any = supportedCommandSchemas();
  const supported: any = Boolean(commandSchema && supportedSchemas.has(commandSchema));
  if (commandSchema && !supported) errors.push({ code: 'unsupported_command_schema', field: 'command_schema', value: commandSchema });
  const submitPosture: any = supported ? 'validator_present_admitter_not_implemented' : 'refuse_without_domain_mutation';
  if (supported) warnings.push({ code: 'domain_admitter_not_implemented', field: 'command_schema', value: commandSchema });
  return {
    status: errors.length > 0 ? 'refused' : 'valid',
    errors,
    warnings,
    supported,
    submit_posture: submitPosture,
  };
}

function buildCommandSubmitResult({ commandRef, command, validation, admitter }: any) : any{
  if (validation.errors.length > 0) {
    return {
      schema: 'narada.command_result.v1',
      command_ref: commandRef,
      status: 'refused',
      reason_code: validation.errors[0].code,
      errors: validation.errors,
      warnings: validation.warnings,
      remediation: commandRefRemediation(validation.errors[0]),
      durable_state_changed: false,
      transient_not_authority: true,
    };
  }
  if (typeof admitter === 'function') {
    try {
      const admitted: any = admitter(command);
      const domainStatus: any = admitted?.status ?? 'completed';
      const resultStatus: any = ['dry_run', 'planned'].includes(domainStatus)
        ? 'validated'
        : (['success', 'submitted', 'promoted', 'acknowledged', 'dismissed', 'completed', 'exported', 'created', 'sent'].includes(domainStatus) ? 'admitted' : domainStatus);
      return {
        schema: 'narada.command_result.v1',
        command_ref: commandRef,
        command_schema: command.command_schema,
        status: resultStatus,
        domain_result: admitted,
        durable_state_changed: resultStatus === 'admitted',
        transient_not_authority: resultStatus !== 'admitted',
      };
    } catch (error: any) {
      return {
        schema: 'narada.command_result.v1',
        command_ref: commandRef,
        command_schema: command.command_schema,
        status: 'refused',
        reason_code: 'domain_admitter_refused',
        errors: [{ code: 'domain_admitter_refused', message: error instanceof Error ? error.message : String(error) }],
        remediation: 'Inspect the domain error, repair the command or payload, and create a new command revision.',
        durable_state_changed: false,
        transient_not_authority: true,
      };
    }
  }
  return {
    schema: 'narada.command_result.v1',
    command_ref: commandRef,
    command_schema: command.command_schema,
    status: 'refused',
    reason_code: 'domain_admitter_not_implemented',
    errors: [],
    warnings: validation.warnings,
    remediation: 'Register a typed domain admitter before this command schema can mutate Site state.',
    durable_state_changed: false,
    transient_not_authority: true,
  };
}

async function buildCommandSubmitResultAsync({ commandRef, command, validation, admitter }: any) : Promise<any>{
  if (validation.errors.length > 0) {
    return {
      schema: 'narada.command_result.v1',
      command_ref: commandRef,
      status: 'refused',
      reason_code: validation.errors[0].code,
      errors: validation.errors,
      warnings: validation.warnings,
      remediation: commandRefRemediation(validation.errors[0]),
      durable_state_changed: false,
      transient_not_authority: true,
    };
  }
  if (typeof admitter === 'function') {
    try {
      const admitted: any = await admitter(command);
      const domainStatus: any = admitted?.status ?? 'completed';
      const resultStatus: any = ['dry_run', 'planned'].includes(domainStatus)
        ? 'validated'
        : (['success', 'submitted', 'promoted', 'acknowledged', 'dismissed', 'completed', 'exported', 'created', 'sent'].includes(domainStatus) ? 'admitted' : domainStatus);
      return {
        schema: 'narada.command_result.v1',
        command_ref: commandRef,
        command_schema: command.command_schema,
        status: resultStatus,
        domain_result: admitted,
        durable_state_changed: resultStatus === 'admitted',
        transient_not_authority: resultStatus !== 'admitted',
      };
    } catch (error: any) {
      return {
        schema: 'narada.command_result.v1',
        command_ref: commandRef,
        command_schema: command.command_schema,
        status: 'refused',
        reason_code: 'domain_admitter_refused',
        errors: [{ code: 'domain_admitter_refused', message: error instanceof Error ? error.message : String(error) }],
        remediation: 'Inspect the domain error, repair the command or payload, and create a new command revision.',
        durable_state_changed: false,
        transient_not_authority: true,
      };
    }
  }
  return {
    schema: 'narada.command_result.v1',
    command_ref: commandRef,
    command_schema: command.command_schema,
    status: 'refused',
    reason_code: 'domain_admitter_not_implemented',
    errors: [],
    warnings: validation.warnings,
    remediation: 'Register a typed domain admitter before this command schema can mutate Site state.',
    durable_state_changed: false,
    transient_not_authority: true,
  };
}

function commandRefRemediation(error: any) : any{
  if (error?.code === 'unsupported_command_schema') return 'Use a supported command_schema or install/register the domain admitter.';
  if (error?.code === 'payload_ref_invalid') return 'Create or repair the referenced payload and create a new command revision.';
  return 'Repair the command packet and create a new immutable command revision.';
}

function supportedCommandSchemas() : any{
  return supportedGenericCommandSchemas();
}

function writeResultRevision({ siteRoot, resultDir, result, createdBy, maxBytes }: any) : any{
  const resultId: any = randomResultId();
  const revision: any = 1;
  const ref: any = buildResultRef(resultId, revision);
  const createdAt: any = new Date().toISOString();
  const resultWithId: any = { ...result, result_id: resultId, created_at: createdAt };
  const resultJson: any = stableJson(resultWithId);
  const byteSize: any = Buffer.byteLength(resultJson, 'utf8');
  if (byteSize > maxBytes) throw new Error(`result_too_large: ${byteSize} > ${maxBytes}`);
  const record: any = {
    schema: 'narada.mcp_result.revision.v1',
    ref,
    result_id: resultId,
    revision,
    created_at: createdAt,
    created_by: createdBy,
    sha256: sha256(resultJson),
    byte_size: byteSize,
    max_bytes: maxBytes,
    transient_not_authority: true,
    immutable_revision: true,
    result: resultWithId,
  };
  const path: any = resultPath({ siteRoot, resultDir, resultId, revision });
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${stableJson(record)}\n`, 'utf8');
  return record;
}

function readResultRevision({ siteRoot, ref, maxBytes = DEFAULT_MAX_BYTES, resultDir = DEFAULT_RESULT_DIR }: any) : any{
  const parsed: any = parseResultRef(ref);
  const path: any = resultPath({ siteRoot, resultDir, resultId: parsed.resultId, revision: parsed.revision });
  let stat: any;
  try {
    stat = statSync(path);
  } catch {
    throw new Error(`result_ref_not_found: ${ref}`);
  }
  if (!stat.isFile()) throw new Error(`result_ref_not_file: ${ref}`);
  if (stat.size > maxBytes) throw new Error(`result_ref_too_large: ${stat.size} > ${maxBytes}`);
  let record: any;
  try {
    record = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error: any) {
    throw new Error(`result_ref_invalid_json: ${error instanceof Error ? error.message : String(error)}`);
  }
  validateResultRevisionRecord(record, parsed, stat.size, maxBytes);
  return { ...parsed, ref, result: record.result, record, byte_size: stat.size, sha256: record.sha256 };
}

function validateResultRevisionRecord(record: any, parsed: any, statSize: any, maxBytes: any) : any{
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error(`result_ref_record_must_be_object: ${parsed.ref}`);
  if (record.schema !== 'narada.mcp_result.revision.v1') throw new Error(`result_ref_schema_unsupported: ${record.schema}`);
  if (record.ref !== parsed.ref || record.result_id !== parsed.resultId || record.revision !== parsed.revision) {
    throw new Error(`result_ref_metadata_mismatch: ${parsed.ref}`);
  }
  asPayloadObject(record.result, 'result_ref_result_must_be_object');
  if (statSize > maxBytes || record.byte_size > maxBytes) throw new Error(`result_ref_too_large: ${statSize} > ${maxBytes}`);
  if (sha256(stableJson(record.result)) !== record.sha256) throw new Error(`result_ref_sha256_mismatch: ${parsed.ref}`);
}

function publicCommandResult({ status, record, includeCommand = false }: any) : any{
  return {
    status,
    ref: record.ref,
    command_id: record.command_id,
    revision: record.revision,
    byte_size: record.byte_size,
    sha256: record.sha256,
    created_at: record.created_at,
    created_by: record.created_by,
    transient_not_authority: true,
    immutable_revision: true,
    command: includeCommand ? record.command : undefined,
  };
}

function publicResultRecord({ status, record, includeResult = false }: any) : any{
  return {
    status,
    ref: record.ref,
    result_id: record.result_id,
    revision: record.revision,
    byte_size: record.byte_size,
    sha256: record.sha256,
    created_at: record.created_at,
    created_by: record.created_by,
    transient_not_authority: true,
    immutable_revision: true,
    result: includeResult ? record.result : undefined,
  };
}

function parseCommandRef(ref: any) : any{
  const value: any = typeof ref === 'string' ? ref.trim() : '';
  if (REF_PATTERN.test(value)) throw new Error('wrong_ref_family: got=mcp_payload expected=mcp_command reader_tool=mcp_payload_show remediation=use mcp_payload_show');
  if (OUTPUT_REF_PATTERN.test(value)) throw new Error('wrong_ref_family: got=mcp_output expected=mcp_command reader_tool=mcp_output_show remediation=use mcp_output_show');
  const match: any = value.match(COMMAND_REF_PATTERN);
  if (!match) throw new Error(`command_ref_invalid: ${value}`);
  return { ref: value, commandId: match[1], command_id: match[1], revision: Number(match[2]) };
}

function parseResultRef(ref: any) : any{
  const value: any = typeof ref === 'string' ? ref.trim() : '';
  const match: any = value.match(RESULT_REF_PATTERN);
  if (!match) throw new Error(`result_ref_invalid: ${value}`);
  return { ref: value, resultId: match[1], result_id: match[1], revision: Number(match[2]) };
}

function requireResultRef(args: any, message: any, field: any = 'ref') : any{
  const value: any = asRecord(args)[field];
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(message);
  return value.trim();
}

function commandPath({ siteRoot, commandDir, commandId, revision }: any) : any{
  return resolve(siteRoot, commandDir, DEFAULT_WORKSPACE_DIR, commandId, `v${revision}.json`);
}

function resultPath({ siteRoot, resultDir, resultId, revision }: any) : any{
  return resolve(siteRoot, resultDir, DEFAULT_WORKSPACE_DIR, resultId, `v${revision}.json`);
}

function buildCommandRef(commandId: any, revision: any) : any{
  return `mcp_command:${commandId}@v${revision}`;
}

function buildResultRef(resultId: any, revision: any) : any{
  return `mcp_result:${resultId}@v${revision}`;
}

function randomCommandId() : any{
  return `c_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function randomResultId() : any{
  return `r_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function stableJson(value: any) : any{
  return JSON.stringify(sortJson(value));
}

function sortJson(value: any) : any{
  if (Array.isArray(value)) return value.map(sortJson);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key: any) => [key, sortJson(value[key])]));
}

function sha256(value: any) : any{
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function stringOrNull(value: any) : any{
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isPathInside(candidate: any, root: any) : any{
  const rel: any = relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !/^[A-Za-z]:/.test(rel));
}

function normalizePath(value: any) : any{
  return value.replace(/\\/g, '/');
}
