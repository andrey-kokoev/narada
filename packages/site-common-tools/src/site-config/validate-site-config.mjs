#!/usr/bin/env node
/**
 * validate-site-config.mjs
 *
 * Validate a Narada Site config.json against narada.site.config.v0.schema.json.
 *
 * Checks:
 *   - Schema structure (static_config, structural_config, runtime_config present)
 *   - Runtime parameters have required metadata (current_value, default_value, authority, mutable_at_runtime)
 *   - Static/structural edits require explicit override flag
 *   - Drift detection: runtime values that differ from defaults are flagged
 *
 * Usage:
 *   node tools/site-config/validate-site-config.mjs <site-root> [--override-static] [--override-structural] [--json]
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateAgentExecutionPolicy } from './agent-execution-policy.mjs';

const SCHEMA_VERSION = 'narada.site.config.v0';
const SITE_IDENTITY_SCHEMA = 'narada.site.identity.v0';
const SITE_IDENTITY_STATUSES = new Set(['active', 'revoked', 'superseded', 'retired']);
const SITE_IDENTITY_KEY_ALGORITHMS = new Set(['Ed25519']);
const SITE_IDENTITY_KEY_PURPOSES = new Set(['site_identity', 'sign_declarations', 'sign_crossings', 'sign_probe_reports']);
const SITE_IDENTITY_KEY_STATUSES = new Set(['active', 'revoked', 'expired', 'superseded', 'retired']);
const SITE_TRUST_BASIS_VALUES = new Set(['operator_pinned', 'governed_crossing', 'manual_verification', 'signature_verified', 'revoked', 'expired']);
const SITE_VERIFICATION_STATES = new Set(['observed_unverified', 'operator_pinned', 'signature_verified', 'revoked', 'expired']);
const DISALLOWED_HIERARCHY_BASIS_PATTERN = /(^|[_\s:-])(parent|daughter|inherited|subordinate)([_\s:-]|$)/i;

function parseArgs(argv) {
  const args = { json: false, overrideStatic: false, overrideStructural: false };
  const positional = [];
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') { args.json = true; continue; }
    if (arg === '--override-static') { args.overrideStatic = true; continue; }
    if (arg === '--override-structural') { args.overrideStructural = true; continue; }
    if (!arg.startsWith('--')) { positional.push(arg); }
  }
  return { args, positional };
}

function loadConfig(siteRoot) {
  const configPath = join(resolve(siteRoot), 'config.json');
  if (!existsSync(configPath)) {
    throw new Error(`config.json_not_found: ${configPath}`);
  }
  try {
    return { config: JSON.parse(readFileSync(configPath, 'utf8')), configPath };
  } catch (err) {
    throw new Error(`config_parse_error: ${err.message}`);
  }
}

function validateSchemaStructure(config) {
  const errors = [];
  if (config.schema !== SCHEMA_VERSION) {
    errors.push(`schema_mismatch: expected '${SCHEMA_VERSION}', got '${config.schema ?? 'undefined'}'`);
  }
  for (const key of ['static_config', 'structural_config', 'runtime_config']) {
    if (!config[key] || typeof config[key] !== 'object') {
      errors.push(`missing_partition: ${key} is required`);
    }
  }
  return errors;
}

function validateRuntimeParameter(param, path) {
  const errors = [];
  if (!param || typeof param !== 'object') {
    errors.push(`runtime_param_not_object: ${path}`);
    return errors;
  }
  for (const key of ['current_value', 'default_value', 'authority', 'mutable_at_runtime']) {
    if (!(key in param)) {
      errors.push(`runtime_param_missing_field: ${path}.${key}`);
    }
  }
  if ('mutable_at_runtime' in param && typeof param.mutable_at_runtime !== 'boolean') {
    errors.push(`runtime_param_bad_type: ${path}.mutable_at_runtime must be boolean`);
  }
  if ('authority' in param && typeof param.authority !== 'string') {
    errors.push(`runtime_param_bad_type: ${path}.authority must be string`);
  }
  return errors;
}

function walkRuntimeConfig(obj, path, errors) {
  if (!obj || typeof obj !== 'object') return;
  // If this looks like a runtime parameter metadata object, validate it
  if ('current_value' in obj && 'default_value' in obj && 'authority' in obj) {
    errors.push(...validateRuntimeParameter(obj, path));
    // Check for drift
    if (JSON.stringify(obj.current_value) !== JSON.stringify(obj.default_value)) {
      // This is a warning, not an error
    }
    return;
  }
  for (const [key, value] of Object.entries(obj)) {
    walkRuntimeConfig(value, path ? `${path}.${key}` : key, errors);
  }
}

function validateStaticConfig(staticConfig, overrideFlag) {
  const errors = [];
  const required = ['site_id', 'variant', 'substrate', 'site_root', 'config_path', 'locus'];
  for (const key of required) {
    if (!(key in staticConfig)) {
      errors.push(`static_config_missing_field: ${key}`);
    }
  }
  if (!overrideFlag) {
    // In strict mode, we could compare against a baseline. For MVP, just check presence.
    errors.push(...validateNoExtraKeys(staticConfig, required.concat(['locus']), 'static_config'));
  }
  return errors;
}

function validateStructuralConfig(structConfig, overrideFlag, siteRoot = process.cwd(), config = null) {
  const errors = [];
  const required = ['sync', 'task_substrate', 'narada_cli', 'agent_execution_policy', 'linked_sites', 'site_awareness', 'message_intake', 'pc_locus'];
  for (const key of required) {
    if (!(key in structConfig)) {
      errors.push(`structural_config_missing_field: ${key}`);
    }
  }
  errors.push(...validateRegisteredSiteAwareness(structConfig.site_awareness));
  const policyResult = validateAgentExecutionPolicy(siteRoot, config ?? { structural_config: structConfig });
  errors.push(...policyResult.errors.map((error) => `agent_execution_policy_invalid: ${error}`));
  errors.push(...policyResult.residuals.map((residual) => `agent_execution_policy_residual: ${residual}`));
  if (!overrideFlag) {
    errors.push(...validateNoExtraKeys(structConfig, required, 'structural_config'));
  }
  return errors;
}

function validateRegisteredSiteAwareness(siteAwareness) {
  const errors = [];
  const knownSites = siteAwareness?.known_sites;
  if (!knownSites || typeof knownSites !== 'object') return errors;

  for (const [siteKey, site] of Object.entries(knownSites)) {
    const prefix = `structural_config.site_awareness.known_sites.${siteKey}`;
    if (!site || typeof site !== 'object') {
      errors.push(`registered_site_not_object: ${prefix}`);
      continue;
    }
    for (const field of ['site_id', 'locus_type', 'roots', 'authority_boundaries', 'capability_edges', 'capability_denials', 'sync_posture', 'capabilities', 'inbox_endpoint', 'freshness', 'health']) {
      if (!(field in site)) errors.push(`registered_site_missing_field: ${prefix}.${field}`);
    }
    if (typeof site.site_id !== 'string' || site.site_id.length === 0) {
      errors.push(`registered_site_bad_field: ${prefix}.site_id must be non-empty string`);
    } else if (site.site_id !== siteKey) {
      errors.push(`registered_site_id_mismatch: ${prefix}.site_id must equal known_sites key`);
    }
    if (typeof site.locus_type !== 'string' || site.locus_type.length === 0) {
      errors.push(`registered_site_bad_field: ${prefix}.locus_type must be non-empty string`);
    }
    if (!site.roots || typeof site.roots !== 'object' || Object.keys(site.roots).length === 0) {
      errors.push(`registered_site_bad_field: ${prefix}.roots must be non-empty object`);
    }
    const boundaries = site.authority_boundaries;
    if (!boundaries || typeof boundaries !== 'object') {
      errors.push(`registered_site_bad_field: ${prefix}.authority_boundaries must be object`);
    } else {
      for (const field of ['user_site', 'not_granted_by_awareness']) {
        if (!Array.isArray(boundaries[field]) || boundaries[field].length === 0) {
          errors.push(`registered_site_bad_boundary: ${prefix}.authority_boundaries.${field} must be non-empty array`);
        }
      }
      const targetBoundaryKeys = Object.keys(boundaries).filter((key) => !['user_site', 'not_granted_by_awareness'].includes(key));
      if (targetBoundaryKeys.length === 0) {
        errors.push(`registered_site_missing_target_boundary: ${prefix}.authority_boundaries must name target Site authority owner`);
      }
      for (const action of ['know', 'navigate', 'review', 'route_proposals']) {
        if (!boundaries.user_site?.includes(action)) {
          errors.push(`registered_site_missing_user_site_action: ${prefix}.authority_boundaries.user_site.${action}`);
        }
      }
      if (!boundaries.not_granted_by_awareness?.some((entry) => String(entry).includes('mutate'))) {
        errors.push(`registered_site_missing_mutation_denial: ${prefix}.authority_boundaries.not_granted_by_awareness`);
      }
    }
    if (!Array.isArray(site.capabilities) || site.capabilities.length === 0) {
      errors.push(`registered_site_bad_field: ${prefix}.capabilities must be non-empty array`);
    }
    validateCapabilityClaims(site.capability_edges, `${prefix}.capability_edges`, 'edge', errors);
    validateCapabilityClaims(site.capability_denials, `${prefix}.capability_denials`, 'denial', errors);
    if (!site.inbox_endpoint || typeof site.inbox_endpoint !== 'object' || typeof site.inbox_endpoint.status !== 'string') {
      errors.push(`registered_site_bad_field: ${prefix}.inbox_endpoint.status must be string`);
    }
    for (const field of ['task_lifecycle', 'mcp_access']) {
      if (!site[field] || typeof site[field] !== 'object' || typeof site[field].status !== 'string') {
        errors.push(`registered_site_bad_field: ${prefix}.${field}.status must be string`);
      }
    }
    if (!site.freshness || typeof site.freshness !== 'object' || Object.keys(site.freshness).length === 0) {
      errors.push(`registered_site_bad_field: ${prefix}.freshness must be non-empty object`);
    }
    if (!site.health || typeof site.health !== 'object' || typeof site.health.status !== 'string') {
      errors.push(`registered_site_bad_field: ${prefix}.health.status must be string`);
    }
    if ('blockers' in site && !Array.isArray(site.blockers)) {
      errors.push(`registered_site_bad_field: ${prefix}.blockers must be array when present`);
    }
    if ('evidence_refs' in site && !Array.isArray(site.evidence_refs)) {
      errors.push(`registered_site_bad_field: ${prefix}.evidence_refs must be array when present`);
    }
  }

  return errors;
}

function validateCapabilityClaims(claims, path, claimKind, errors) {
  if (!Array.isArray(claims) || claims.length === 0) {
    errors.push(`registered_site_bad_field: ${path} must be non-empty array`);
    return;
  }
  for (const [index, claim] of claims.entries()) {
    const prefix = `${path}[${index}]`;
    if (!claim || typeof claim !== 'object') {
      errors.push(`registered_site_bad_capability_claim: ${prefix} must be object`);
      continue;
    }
    for (const field of ['from', 'to', 'capability', 'status', 'basis']) {
      if (typeof claim[field] !== 'string' || claim[field].length === 0) {
        errors.push(`registered_site_bad_capability_claim: ${prefix}.${field} must be non-empty string`);
      }
    }
    if (claimKind === 'denial' && claim.status !== 'not_granted') {
      errors.push(`registered_site_bad_capability_denial: ${prefix}.status must be not_granted`);
    }
    errors.push(...validateCapabilityBasis(claim.basis, `${prefix}.basis`));
    if ('evidence_refs' in claim && !Array.isArray(claim.evidence_refs)) {
      errors.push(`registered_site_bad_capability_claim: ${prefix}.evidence_refs must be array when present`);
    }
  }
}

function validateCapabilityBasis(basis, path = 'basis') {
  if (basis === undefined || basis === null || basis === '') return [];
  if (typeof basis !== 'string') return [`registered_site_bad_capability_basis: ${path} must be string`];
  return DISALLOWED_HIERARCHY_BASIS_PATTERN.test(basis)
    ? [`registered_site_bad_capability_basis: ${path} must not encode hierarchy`]
    : [];
}

function validateSiteIdentityDocument(identity, path = 'site_identity') {
  const errors = [];
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) {
    return [`site_identity_bad_document: ${path} must be object`];
  }
  if (identity.schema !== SITE_IDENTITY_SCHEMA) {
    errors.push(`site_identity_schema_mismatch: ${path}.schema must be ${SITE_IDENTITY_SCHEMA}`);
  }
  requireNonEmptyString(identity, 'site_id', path, 'site_identity_missing_or_bad_field', errors);
  validateAuthorityLocus(identity.authority_locus, `${path}.authority_locus`, errors);
  if (!Array.isArray(identity.public_keys) || identity.public_keys.length === 0) {
    errors.push(`site_identity_missing_or_bad_field: ${path}.public_keys must be non-empty array`);
  } else {
    for (const [index, keyRecord] of identity.public_keys.entries()) {
      errors.push(...validateSiteIdentityKeyRecord(keyRecord, `${path}.public_keys[${index}]`));
    }
  }
  validateIsoTimestamp(identity.created_at, `${path}.created_at`, errors);
  if (!SITE_IDENTITY_STATUSES.has(identity.status)) {
    errors.push(`site_identity_bad_status: ${path}.status must be one of ${[...SITE_IDENTITY_STATUSES].join(', ')}`);
  }
  validateRotationPolicy(identity.rotation_policy, `${path}.rotation_policy`, errors);
  if (!Array.isArray(identity.evidence_refs)) {
    errors.push(`site_identity_missing_or_bad_field: ${path}.evidence_refs must be array`);
  }
  return errors;
}

function validateSiteIdentityKeyRecord(keyRecord, path = 'key_record') {
  const errors = [];
  if (!keyRecord || typeof keyRecord !== 'object' || Array.isArray(keyRecord)) {
    return [`site_identity_bad_key_record: ${path} must be object`];
  }
  requireNonEmptyString(keyRecord, 'key_id', path, 'site_identity_bad_key_record', errors);
  if (!SITE_IDENTITY_KEY_ALGORITHMS.has(keyRecord.algorithm)) {
    errors.push(`site_identity_bad_key_record: ${path}.algorithm must be Ed25519`);
  }
  requireNonEmptyString(keyRecord, 'public_key', path, 'site_identity_bad_key_record', errors);
  if (typeof keyRecord.fingerprint_sha256 !== 'string' || !/^[A-Za-z0-9_-]{32,}$|^[a-f0-9]{64}$/i.test(keyRecord.fingerprint_sha256)) {
    errors.push(`site_identity_bad_key_record: ${path}.fingerprint_sha256 must be present SHA-256 fingerprint text`);
  }
  if (!Array.isArray(keyRecord.purpose) || keyRecord.purpose.length === 0) {
    errors.push(`site_identity_bad_key_record: ${path}.purpose must be non-empty array`);
  } else {
    for (const purpose of keyRecord.purpose) {
      if (!SITE_IDENTITY_KEY_PURPOSES.has(purpose)) errors.push(`site_identity_bad_key_record: ${path}.purpose contains unsupported value ${purpose}`);
    }
  }
  validateIsoTimestamp(keyRecord.created_at, `${path}.created_at`, errors);
  if (keyRecord.expires_at !== null && keyRecord.expires_at !== undefined) validateIsoTimestamp(keyRecord.expires_at, `${path}.expires_at`, errors);
  if (!SITE_IDENTITY_KEY_STATUSES.has(keyRecord.status)) {
    errors.push(`site_identity_bad_key_record: ${path}.status must be one of ${[...SITE_IDENTITY_KEY_STATUSES].join(', ')}`);
  }
  return errors;
}

function validateSiteIdentityTrustRecord(trustRecord, path = 'site_identity_trust') {
  const errors = [];
  if (!trustRecord || typeof trustRecord !== 'object' || Array.isArray(trustRecord)) {
    return [`site_identity_bad_trust_record: ${path} must be object`];
  }
  for (const field of ['site_id', 'key_id', 'fingerprint_sha256', 'trust_basis', 'verification_state', 'pinned_at', 'status']) {
    requireNonEmptyString(trustRecord, field, path, 'site_identity_bad_trust_record', errors);
  }
  if (typeof trustRecord.fingerprint_sha256 === 'string' && !/^[A-Za-z0-9_-]{32,}$|^[a-f0-9]{64}$/i.test(trustRecord.fingerprint_sha256)) {
    errors.push(`site_identity_bad_trust_record: ${path}.fingerprint_sha256 must be SHA-256 fingerprint text`);
  }
  if (!SITE_TRUST_BASIS_VALUES.has(trustRecord.trust_basis)) {
    errors.push(`site_identity_bad_trust_record: ${path}.trust_basis must be one of ${[...SITE_TRUST_BASIS_VALUES].join(', ')}`);
  }
  if (!SITE_VERIFICATION_STATES.has(trustRecord.verification_state)) {
    errors.push(`site_identity_bad_trust_record: ${path}.verification_state must be one of ${[...SITE_VERIFICATION_STATES].join(', ')}`);
  }
  errors.push(...validateCapabilityBasis(trustRecord.trust_basis, `${path}.trust_basis`));
  validateIsoTimestamp(trustRecord.pinned_at, `${path}.pinned_at`, errors);
  if (!['active', 'revoked', 'expired', 'retired'].includes(trustRecord.status)) {
    errors.push(`site_identity_bad_trust_record: ${path}.status must be active, revoked, expired, or retired`);
  }
  if (!Array.isArray(trustRecord.evidence_refs)) {
    errors.push(`site_identity_bad_trust_record: ${path}.evidence_refs must be array`);
  }
  return errors;
}

function validateAuthorityLocus(authorityLocus, path, errors) {
  if (!authorityLocus || typeof authorityLocus !== 'object' || Array.isArray(authorityLocus)) {
    errors.push(`site_identity_missing_or_bad_field: ${path} must be object`);
    return;
  }
  requireNonEmptyString(authorityLocus, 'site_root', path, 'site_identity_missing_or_bad_field', errors);
  requireNonEmptyString(authorityLocus, 'locus_type', path, 'site_identity_missing_or_bad_field', errors);
}

function validateRotationPolicy(rotationPolicy, path, errors) {
  if (!rotationPolicy || typeof rotationPolicy !== 'object' || Array.isArray(rotationPolicy)) {
    errors.push(`site_identity_missing_or_bad_field: ${path} must be object`);
    return;
  }
  requireNonEmptyString(rotationPolicy, 'mode', path, 'site_identity_missing_or_bad_field', errors);
  if (typeof rotationPolicy.overlap_required !== 'boolean') errors.push(`site_identity_missing_or_bad_field: ${path}.overlap_required must be boolean`);
  if (typeof rotationPolicy.revocation_record_required !== 'boolean') errors.push(`site_identity_missing_or_bad_field: ${path}.revocation_record_required must be boolean`);
}

function requireNonEmptyString(record, field, path, errorCode, errors) {
  if (typeof record?.[field] !== 'string' || record[field].length === 0) {
    errors.push(`${errorCode}: ${path}.${field} must be non-empty string`);
  }
}

function validateIsoTimestamp(value, path, errors) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    errors.push(`site_identity_bad_timestamp: ${path} must be ISO timestamp string`);
  }
}

function validateNoExtraKeys(obj, allowedKeys, prefix) {
  const errors = [];
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.includes(key)) {
      errors.push(`${prefix}_unexpected_key: ${key}`);
    }
  }
  return errors;
}

function getRuntimeValue(config, path) {
  const parts = path.split('.');
  let current = config?.runtime_config;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  if (current && typeof current === 'object' && 'current_value' in current) {
    return current.current_value;
  }
  return undefined;
}

function main() {
  const { args, positional } = parseArgs(process.argv);
  const siteRoot = positional[0] || process.cwd();

  let result;
  try {
    const { config, configPath } = loadConfig(siteRoot);
    const errors = [];

    errors.push(...validateSchemaStructure(config));

    if (config.static_config) {
      errors.push(...validateStaticConfig(config.static_config, args.overrideStatic));
    }
    if (config.structural_config) {
  errors.push(...validateStructuralConfig(config.structural_config, args.overrideStructural, siteRoot, config));
    }
    if (config.runtime_config) {
      walkRuntimeConfig(config.runtime_config, '', errors);
    }

    const drift = [];
    function collectDrift(obj, path) {
      if (!obj || typeof obj !== 'object') return;
      if ('current_value' in obj && 'default_value' in obj) {
        if (JSON.stringify(obj.current_value) !== JSON.stringify(obj.default_value)) {
          drift.push({ path, current: obj.current_value, default: obj.default_value });
        }
        return;
      }
      for (const [key, value] of Object.entries(obj)) {
        collectDrift(value, path ? `${path}.${key}` : key);
      }
    }
    if (config.runtime_config) {
      collectDrift(config.runtime_config, '');
    }

    const status = errors.length === 0 ? 'valid' : 'invalid';
    result = {
      schema: 'narada.site.config.validation.v0',
      status,
      config_path: configPath,
      schema_version: config.schema || null,
      errors,
      drift_count: drift.length,
      drift: drift.slice(0, 20),
      flags: {
        override_static: args.overrideStatic,
        override_structural: args.overrideStructural,
      },
    };
  } catch (err) {
    result = {
      schema: 'narada.site.config.validation.v0',
      status: 'error',
      error: err.message,
    };
  }

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Site config validation: ${result.status}`);
    if (result.config_path) console.log(`Config: ${result.config_path}`);
    if (result.errors?.length > 0) {
      console.log(`\nErrors (${result.errors.length}):`);
      for (const err of result.errors) { console.log(`  - ${err}`); }
    }
    if (result.drift_count > 0) {
      console.log(`\nRuntime drift (${result.drift_count}):`);
      for (const d of result.drift) { console.log(`  - ${d.path}: current=${JSON.stringify(d.current)}, default=${JSON.stringify(d.default)}`); }
    }
    if (result.status === 'valid') {
      console.log('No errors found. Config is structurally valid.');
    }
  }

  process.exit(result.status === 'valid' ? 0 : 1);
}

export {
  getRuntimeValue,
  validateCapabilityBasis,
  validateRegisteredSiteAwareness,
  validateSiteIdentityDocument,
  validateSiteIdentityKeyRecord,
  validateSiteIdentityTrustRecord,
};

const isMain = process.argv[1] && import.meta.url.includes(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  main();
}
