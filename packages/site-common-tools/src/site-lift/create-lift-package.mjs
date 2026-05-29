#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { payloadShow } from '../mcp-payload-file.mjs';

const PACKAGE_PAYLOAD_SCHEMA = 'narada.payload.site_lift.package.v1';
const METADATA_SCHEMA = 'narada.site_lift.package_metadata.v0';
const RESULT_SCHEMA = 'narada.site_lift.package_create_result.v0';
const DEFAULT_PACKAGE_DIR = 'kb/site-lift';
const DEFAULT_METADATA_DIR = 'site-lift/packages';

export function parseArgs(argv) {
  const args = { siteRoot: process.cwd(), dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--payload-ref') args.payloadRef = argv[++index];
    else if (arg === '--site-root') args.siteRoot = argv[++index];
    else if (arg === '--package-dir') args.packageDir = argv[++index];
    else if (arg === '--metadata-dir') args.metadataDir = argv[++index];
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help') args.help = true;
    else throw new Error(`unknown_argument: ${arg}`);
  }
  return args;
}

export function usage() {
  return [
    'Usage: node tools/site-lift/create-lift-package.mjs --payload-ref mcp_payload:<id>@v1 [--dry-run]',
    '',
    'Creates a site lift package markdown file and metadata sidecar from one typed payload ref.',
  ].join('\n');
}

export function createLiftPackageFromPayloadRef({
  siteRoot = process.cwd(),
  payloadRef,
  packageDir = DEFAULT_PACKAGE_DIR,
  metadataDir = DEFAULT_METADATA_DIR,
  dryRun = false,
} = {}) {
  if (!payloadRef) throw new Error('payload_ref_required');
  const shown = payloadShow({ siteRoot, args: { ref: payloadRef } });
  const payload = shown.payload;
  const validation = validatePackagePayload(payload);
  const root = resolve(siteRoot);
  const packageId = validation.package_id;
  const packageRelPath = normalizePath(join(packageDir, `${packageId}.md`));
  const metadataRelPath = normalizePath(join(metadataDir, `${packageId}.json`));
  const packagePath = resolveInside(root, packageRelPath);
  const metadataPath = resolveInside(root, metadataRelPath);
  const createdAt = new Date().toISOString();
  const markdown = renderPackageMarkdown({ payload, payloadRef, createdAt });
  const metadata = buildMetadata({ payload, payloadRef, packageRelPath, metadataRelPath, createdAt, payloadSha256: shown.sha256 });

  const result = {
    schema: RESULT_SCHEMA,
    status: dryRun ? 'planned' : 'created',
    dry_run: Boolean(dryRun),
    package_id: packageId,
    payload_ref: payloadRef,
    payload_schema: payload.schema,
    paths: {
      package_markdown: packageRelPath,
      metadata_sidecar: metadataRelPath,
    },
    commit_ready_paths: [packageRelPath, metadataRelPath],
    evidence_refs: [payloadRef],
    authority_posture: 'advisory_until_receiving_site_admits',
    receiving_site_must_admit: true,
    writes: [],
  };

  if (dryRun) return result;

  if (existsSync(packagePath)) throw new Error(`package_markdown_already_exists: ${packageRelPath}`);
  if (existsSync(metadataPath)) throw new Error(`package_metadata_already_exists: ${metadataRelPath}`);
  mkdirSync(dirname(packagePath), { recursive: true });
  mkdirSync(dirname(metadataPath), { recursive: true });
  writeFileSync(packagePath, markdown, 'utf8');
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  result.writes = [packageRelPath, metadataRelPath];
  return result;
}

function validatePackagePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('package_payload_must_be_object');
  if (payload.schema !== PACKAGE_PAYLOAD_SCHEMA) throw new Error(`package_payload_schema_unsupported: ${payload.schema ?? '<missing>'}`);
  const packageId = requireSlug(payload.package_id, 'package_id');
  requireString(payload.title, 'title');
  requireString(payload.purpose, 'purpose');
  requireString(payload.source_site, 'source_site');
  requireString(payload.target_site, 'target_site');
  if (!Array.isArray(payload.sections) || payload.sections.length === 0) throw new Error('sections_required');
  for (const [index, section] of payload.sections.entries()) {
    if (!section || typeof section !== 'object' || Array.isArray(section)) throw new Error(`section_${index}_must_be_object`);
    requireString(section.heading, `sections.${index}.heading`);
    requireString(section.body, `sections.${index}.body`);
  }
  assertNoSecretLikeMaterial(payload);
  return { package_id: packageId };
}

function renderPackageMarkdown({ payload, payloadRef, createdAt }) {
  const lines = [
    `# ${payload.title}`,
    '',
    `Status: ${payload.status ?? 'advisory lift package for receiving Site admission'}`,
    `Created: ${payload.created_at ?? createdAt.slice(0, 10)}`,
    `Source Site: ${payload.source_site}`,
    `Target Site: ${payload.target_site}`,
    `Payload Ref: \`${payloadRef}\``,
    '',
    '## Purpose',
    '',
    payload.purpose.trim(),
    '',
    '## Authority Boundary',
    '',
    payload.authority_boundary?.trim() || 'This package is advisory until admitted by the receiving Site. It does not grant adoption authority, move credentials, or copy runtime state.',
    '',
  ];
  for (const section of payload.sections) {
    lines.push(`## ${section.heading.trim()}`, '', section.body.trim(), '');
  }
  lines.push('## Commit And Admission Notes', '', '- Commit package markdown and metadata sidecar together.', '- Receiving Site must admit the package through its own authority surface before implementation.', '- Runtime data, credentials, tokens, local databases, and machine evidence are non-portable unless separately admitted.', '');
  return `${lines.join('\n')}\n`;
}

function buildMetadata({ payload, payloadRef, packageRelPath, metadataRelPath, createdAt, payloadSha256 }) {
  return {
    schema: METADATA_SCHEMA,
    package_id: payload.package_id,
    title: payload.title,
    status: payload.status ?? 'advisory_package',
    source_site: payload.source_site,
    target_site: payload.target_site,
    created_at: createdAt,
    payload_ref: payloadRef,
    payload_sha256: payloadSha256,
    package_markdown_path: packageRelPath,
    metadata_path: metadataRelPath,
    authority_posture: 'advisory_until_receiving_site_admits',
    receiving_site_must_admit: true,
    non_portable_boundaries: payload.non_portable_boundaries ?? [
      'credentials',
      'runtime_state',
      'local_databases',
      'machine_evidence',
    ],
    catalog_entry: payload.catalog_entry ?? null,
    evidence_refs: [payloadRef, ...(Array.isArray(payload.evidence_refs) ? payload.evidence_refs : [])],
  };
}

function requireString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${field}_required`);
  return value.trim();
}

function requireSlug(value, field) {
  const text = requireString(value, field);
  if (!/^[a-z0-9][a-z0-9._-]{2,120}$/.test(text)) throw new Error(`${field}_must_be_slug`);
  if (basename(text) !== text) throw new Error(`${field}_must_not_contain_path_separator`);
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
    const result = createLiftPackageFromPayloadRef(args);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ status: 'error', error: error.message }, null, 2));
    process.exit(1);
  }
}
