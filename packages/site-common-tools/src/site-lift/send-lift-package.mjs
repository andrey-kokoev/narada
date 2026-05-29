#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { admitEnvelope } from '../inbox/admission-log.mjs';
import { payloadCreate, payloadShow } from '../mcp-payload-file.mjs';

const SEND_PAYLOAD_SCHEMA = 'narada.payload.site_lift.send.v1';
const SEND_RECORD_SCHEMA = 'narada.site_lift.send_record.v0';
const RESULT_SCHEMA = 'narada.site_lift.send_result.v0';
const DEFAULT_SEND_RECORD_DIR = 'site-lift/sends';
const INLINE_PAYLOAD_THRESHOLD = 200;

export function parseArgs(argv) {
  const args = { siteRoot: process.cwd(), dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--payload-ref') args.payloadRef = argv[++index];
    else if (arg === '--site-root') args.siteRoot = argv[++index];
    else if (arg === '--target-site-root') args.targetSiteRoot = argv[++index];
    else if (arg === '--send-record-dir') args.sendRecordDir = argv[++index];
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help') args.help = true;
    else throw new Error(`unknown_argument: ${arg}`);
  }
  return args;
}

export function usage() {
  return [
    'Usage: node tools/site-lift/send-lift-package.mjs --payload-ref mcp_payload:<id>@v1 --target-site-root <path> [--dry-run]',
    '',
    'Builds a compact target inbox envelope and durable send record for a site lift package.',
  ].join('\n');
}

export function sendLiftPackageFromPayloadRef(options = {}) {
  return sendLiftPackage(options);
}

export function sendLiftPackage({
  siteRoot = process.cwd(),
  payloadRef,
  payload,
  targetSiteRoot,
  sendRecordDir = DEFAULT_SEND_RECORD_DIR,
  dryRun = false,
} = {}) {
  const root = resolve(siteRoot);
  const prepared = prepareSendPayload({ siteRoot: root, payloadRef, payload });
  const sendPayload = prepared.payload;
  const validation = validateSendPayload(sendPayload);
  const resolvedTargetSiteRoot = resolveTargetSiteRoot(targetSiteRoot ?? sendPayload.target_site_root);
  const createdAt = new Date().toISOString();
  const envelopeId = `env_${randomUUID()}`;
  const envelope = buildEnvelope({ payload: sendPayload, payloadRef: prepared.payloadRef, envelopeId, createdAt, targetSiteRoot: resolvedTargetSiteRoot });
  const recordRelPath = normalizePath(join(sendRecordDir, `${sendPayload.package_id}-${envelopeId}.json`));
  const recordPath = resolveInside(root, recordRelPath);
  const plannedRecord = buildSendRecord({
    payload: sendPayload,
    payloadRef: prepared.payloadRef,
    payloadStagedFromInline: prepared.payloadStagedFromInline,
    envelope,
    targetSiteRoot: resolvedTargetSiteRoot,
    recordRelPath,
    createdAt,
    admission: null,
  });

  const result = {
    schema: RESULT_SCHEMA,
    status: dryRun ? 'planned' : 'sent',
    dry_run: Boolean(dryRun),
    package_id: sendPayload.package_id,
    payload_ref: prepared.payloadRef,
    payload_staged_from_inline: prepared.payloadStagedFromInline,
    target_site_root: resolvedTargetSiteRoot,
    target_envelope_id: envelopeId,
    target_envelope: envelope,
    send_record_path: recordRelPath,
    evidence_refs: [prepared.payloadRef],
    commit_ready_paths: [recordRelPath],
    authority_posture: 'advisory_until_receiving_site_admits',
    receiving_site_must_admit: true,
  };

  if (dryRun) {
    return { ...result, send_record: plannedRecord, target_admission: null };
  }

  if (existsSync(recordPath)) throw new Error(`send_record_already_exists: ${recordRelPath}`);
  const admitted = admitEnvelope(resolvedTargetSiteRoot, envelope);
  const record = buildSendRecord({
    payload: sendPayload,
    payloadRef: prepared.payloadRef,
    payloadStagedFromInline: prepared.payloadStagedFromInline,
    envelope,
    targetSiteRoot: resolvedTargetSiteRoot,
    recordRelPath,
    createdAt,
    admission: admitted,
  });
  mkdirSync(dirname(recordPath), { recursive: true });
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');

  return {
    ...result,
    target_admission: {
      envelope_path: normalizePath(relative(resolvedTargetSiteRoot, admitted.envelopePath)),
      event_id: admitted.event.event_id,
      event_sequence: admitted.event.event_sequence,
    },
    send_record: record,
  };
}

function prepareSendPayload({ siteRoot, payloadRef, payload }) {
  if (payloadRef && payload) throw new Error('choose_payload_ref_or_inline_payload_not_both');
  if (payloadRef) {
    const shown = payloadShow({ siteRoot, args: { ref: payloadRef } });
    return { payloadRef, payload: shown.payload, payloadStagedFromInline: false };
  }
  if (!payload) throw new Error('payload_ref_required');
  const payloadText = JSON.stringify(payload);
  if (payloadText.length > INLINE_PAYLOAD_THRESHOLD) {
    const created = payloadCreate({
      siteRoot,
      args: {
        payload_id: `site_lift_send_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
        created_by: 'site-lift-send-workflow',
        payload,
      },
    });
    return { payloadRef: created.ref, payload, payloadStagedFromInline: true };
  }
  throw new Error('inline_payload_refused: use payload_ref');
}

function validateSendPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('send_payload_must_be_object');
  if (payload.schema !== SEND_PAYLOAD_SCHEMA) throw new Error(`send_payload_schema_unsupported: ${payload.schema ?? '<missing>'}`);
  requireSlug(payload.package_id, 'package_id');
  requireString(payload.package_markdown_path, 'package_markdown_path');
  requireString(payload.source_site, 'source_site');
  requireString(payload.target_site, 'target_site');
  requireString(payload.target_admission_guidance, 'target_admission_guidance');
  if (!payload.target_site_root) requireString(payload.target_site, 'target_site');
  assertNoSecretLikeMaterial(payload);
  return true;
}

function buildEnvelope({ payload, payloadRef, envelopeId, createdAt, targetSiteRoot }) {
  const principal = payload.requested_by ?? 'site-lift-send-workflow';
  return {
    schema: 'narada.inbox.envelope.v1',
    envelope_id: envelopeId,
    kind: 'proposal',
    target_locus: 'external_site',
    target_site_root: targetSiteRoot,
    received_at: createdAt,
    source: {
      kind: 'site_lift_package',
      principal,
      ref: payload.package_markdown_path,
    },
    authority: {
      level: 'agent_reported',
      principal,
    },
    payload: {
      title: payload.title ?? `Site lift package: ${payload.package_id}`,
      summary: payload.summary ?? `Review and admit site lift package ${payload.package_id} if appropriate for this Site.`,
      package: {
        package_id: payload.package_id,
        package_markdown_path: payload.package_markdown_path,
        metadata_path: payload.metadata_path ?? null,
        package_payload_ref: payload.package_payload_ref ?? null,
        send_payload_ref: payloadRef,
        source_site: payload.source_site,
        target_site: payload.target_site,
        source_commit: payload.source_commit ?? null,
        source_path: payload.source_path ?? payload.package_markdown_path,
      },
      authority_posture: 'advisory_until_receiving_site_admits',
      receiving_site_must_admit: true,
      target_admission_guidance: payload.target_admission_guidance,
      requested_action: 'review_and_admit_if_accepted',
    },
  };
}

function buildSendRecord({ payload, payloadRef, payloadStagedFromInline, envelope, targetSiteRoot, recordRelPath, createdAt, admission }) {
  return {
    schema: SEND_RECORD_SCHEMA,
    package_id: payload.package_id,
    created_at: createdAt,
    send_payload_ref: payloadRef,
    payload_staged_from_inline: Boolean(payloadStagedFromInline),
    source_artifact: {
      package_markdown_path: payload.package_markdown_path,
      metadata_path: payload.metadata_path ?? null,
      source_commit: payload.source_commit ?? null,
      source_site: payload.source_site,
    },
    target: {
      site: payload.target_site,
      site_root: targetSiteRoot,
      envelope_id: envelope.envelope_id,
      envelope_path: admission ? normalizePath(relative(targetSiteRoot, admission.envelopePath)) : null,
      admission_event_id: admission?.event?.event_id ?? null,
      admission_event_sequence: admission?.event?.event_sequence ?? null,
    },
    envelope,
    send_record_path: recordRelPath,
    authority_posture: 'advisory_until_receiving_site_admits',
    receiving_site_must_admit: true,
  };
}

function resolveTargetSiteRoot(value) {
  const text = requireString(value, 'target_site_root');
  return resolve(text);
}

function requireString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${field}_required`);
  return value.trim();
}

function requireSlug(value, field) {
  const text = requireString(value, field);
  if (!/^[a-z0-9][a-z0-9._-]{2,120}$/.test(text)) throw new Error(`${field}_must_be_slug`);
  return text;
}

function assertNoSecretLikeMaterial(value, path = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecretLikeMaterial(item, [...path, String(index)]));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const lowered = key.toLowerCase();
    if (/(secret|password|token|refresh_token|client_secret|private_key|credential_value)/.test(lowered)) {
      throw new Error(`secret_like_field_refused: ${[...path, key].join('.')}`);
    }
    assertNoSecretLikeMaterial(child, [...path, key]);
  }
}

function resolveInside(root, relPath) {
  const absolute = resolve(root, relPath);
  const relativePath = relative(root, absolute);
  if (relativePath.startsWith('..') || relativePath === '' || absolute === root) throw new Error(`path_outside_site_root: ${relPath}`);
  return absolute;
}

function normalizePath(path) {
  return path.replace(/\\/g, '/');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(usage());
      process.exit(0);
    }
    const result = sendLiftPackageFromPayloadRef(args);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ status: 'error', error: error.message }, null, 2));
    process.exit(1);
  }
}
