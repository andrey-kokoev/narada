import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SIGNED_DECLARATION_SCHEMA = 'narada.site.signed_declaration.v0';
const CANONICALIZATION = 'deterministic-json-v0';
const TRUSTED_STATES = new Set(['operator_pinned', 'signature_verified']);

export function canonicalizeJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function payloadHashSha256(payload) {
  return createHash('sha256').update(canonicalizeJson(payload), 'utf8').digest('hex');
}

export function signSiteDeclaration(rawOptions) {
  const options = normalizeSignOptions(rawOptions);
  const identity = options.identityDocument ?? readIdentityDocument(options.siteRoot);
  if (identity.schema !== 'narada.site.identity.v0') throw new Error('site_identity_schema_mismatch');
  if (identity.site_id !== options.siteId) throw new Error('site_identity_site_id_mismatch');
  const keyRecord = selectSigningKey(identity, options.keyId);
  const secretPath = privateKeyPath({ secretRoot: options.secretRoot, siteId: options.siteId, keyId: keyRecord.key_id });
  const privateMaterial = readPrivateKeyMaterial(secretPath, options.siteId, keyRecord.key_id);
  const privateKey = createPrivateKey({ key: privateMaterial.private_key_jwk, format: 'jwk' });
  const publicDer = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  const fingerprint = createHash('sha256').update(publicDer).digest('hex');
  if (fingerprint !== keyRecord.fingerprint_sha256) throw new Error('private_key_public_identity_mismatch');

  const signedAt = options.signedAt ?? new Date().toISOString();
  const payloadHash = payloadHashSha256(options.payload);
  const envelopeUnsigned = {
    schema: SIGNED_DECLARATION_SCHEMA,
    site_id: options.siteId,
    payload_schema: options.payloadSchema,
    payload_ref: 'embedded:payload',
    payload_hash_sha256: payloadHash,
    canonicalization: CANONICALIZATION,
    signing_preimage: 'deterministic-json-v0:signed-declaration-metadata-v0',
    key_id: keyRecord.key_id,
    signed_at: signedAt,
    verification_status: 'observed_unverified',
    evidence_refs: options.evidenceRefs,
    payload: options.payload,
  };
  const signature = sign(null, Buffer.from(signingPreimage(envelopeUnsigned), 'utf8'), privateKey).toString('base64url');
  return {
    ...envelopeUnsigned,
    signature,
  };
}

export function verifySiteDeclaration(rawOptions) {
  const options = normalizeVerifyOptions(rawOptions);
  const declaration = options.declaration;
  const shapeErrors = validateDeclarationShape(declaration);
  if (shapeErrors.length > 0) return verificationResult('invalid_declaration', false, { errors: shapeErrors });
  if (declaration.canonicalization !== CANONICALIZATION) {
    return verificationResult('unsupported_canonicalization', false, { canonicalization: declaration.canonicalization });
  }

  const actualHash = payloadHashSha256(declaration.payload);
  if (actualHash !== declaration.payload_hash_sha256) {
    return verificationResult('payload_hash_mismatch', false, { expected: declaration.payload_hash_sha256, actual: actualHash });
  }

  const identity = options.identityDocument ?? readIdentityDocument(options.siteRoot);
  if (identity.schema !== 'narada.site.identity.v0') return verificationResult('identity_invalid', false, { reason: 'site_identity_schema_mismatch' });
  if (identity.site_id !== declaration.site_id) {
    return verificationResult('identity_site_id_mismatch', false, { identity_site_id: identity.site_id, declaration_site_id: declaration.site_id });
  }
  const keyRecord = Array.isArray(identity.public_keys)
    ? identity.public_keys.find((key) => key?.key_id === declaration.key_id)
    : null;
  if (!keyRecord) return verificationResult('unknown_key', false, { key_id: declaration.key_id });
  if (keyRecord.algorithm !== 'Ed25519' || keyRecord.status !== 'active') {
    return verificationResult('key_not_active_ed25519', false, { key_status: keyRecord.status, algorithm: keyRecord.algorithm });
  }
  if (!Array.isArray(keyRecord.purpose) || !keyRecord.purpose.includes('sign_declarations')) {
    return verificationResult('key_not_authorized_for_declarations', false, { key_id: keyRecord.key_id });
  }

  const publicDer = Buffer.from(keyRecord.public_key, 'base64url');
  const fingerprint = createHash('sha256').update(publicDer).digest('hex');
  if (fingerprint !== keyRecord.fingerprint_sha256) {
    return verificationResult('identity_fingerprint_mismatch', false, { expected: keyRecord.fingerprint_sha256, actual: fingerprint });
  }
  const publicKey = createPublicKey({ key: publicDer, type: 'spki', format: 'der' });
  const signatureOk = verify(
    null,
    Buffer.from(signingPreimage(declaration), 'utf8'),
    publicKey,
    Buffer.from(declaration.signature, 'base64url')
  );
  if (!signatureOk) return verificationResult('invalid_signature', false, { key_id: declaration.key_id });

  const trustRecord = matchingTrustRecord(options.identityTrust, declaration.site_id, keyRecord);
  const trusted = Boolean(trustRecord && trustRecord.status === 'active' && TRUSTED_STATES.has(trustRecord.verification_state));
  if (!trusted) {
    return verificationResult('valid_signature_untrusted_key', false, {
      signature_valid: true,
      key_id: keyRecord.key_id,
      fingerprint_sha256: keyRecord.fingerprint_sha256,
      trust_record: trustRecord ?? null,
      authority_note: authorityNote(),
    });
  }

  return verificationResult('verified_trusted', true, {
    signature_valid: true,
    site_id: declaration.site_id,
    key_id: keyRecord.key_id,
    fingerprint_sha256: keyRecord.fingerprint_sha256,
    trust_record: trustRecord,
    verification_status: trustRecord.verification_state,
    authority_note: authorityNote(),
  });
}

export function loadIdentityTrustFromConfig(siteRoot) {
  const configPath = resolve(siteRoot, 'config.json');
  if (!existsSync(configPath)) return [];
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const trust = config?.structural_config?.site_awareness?.identity_trust;
  return Array.isArray(trust) ? trust : [];
}

function signingPreimage(envelope) {
  return canonicalizeJson({
    schema: envelope.schema,
    site_id: envelope.site_id,
    payload_schema: envelope.payload_schema,
    payload_ref: envelope.payload_ref,
    payload_hash_sha256: envelope.payload_hash_sha256,
    canonicalization: envelope.canonicalization,
    signing_preimage: 'deterministic-json-v0:signed-declaration-metadata-v0',
    key_id: envelope.key_id,
    signed_at: envelope.signed_at,
  });
}

function normalizeSignOptions(rawOptions) {
  const siteRoot = resolve(rawOptions?.siteRoot ?? process.cwd());
  const siteId = stringValue(rawOptions?.siteId) ?? readConfigSiteId(siteRoot);
  if (!siteId) throw new Error('site_id_required');
  if (!rawOptions?.payload || typeof rawOptions.payload !== 'object' || Array.isArray(rawOptions.payload)) throw new Error('payload_object_required');
  const payloadSchema = stringValue(rawOptions.payloadSchema) ?? stringValue(rawOptions.payload.schema);
  if (!payloadSchema) throw new Error('payload_schema_required');
  if (rawOptions?.signedAt && Number.isNaN(Date.parse(rawOptions.signedAt))) throw new Error('signed_at_must_be_iso_timestamp');
  return {
    siteRoot,
    siteId,
    keyId: stringValue(rawOptions?.keyId),
    secretRoot: resolveSecretRoot(rawOptions?.secretRoot),
    signedAt: stringValue(rawOptions?.signedAt),
    payloadSchema,
    payload: rawOptions.payload,
    identityDocument: rawOptions?.identityDocument,
    evidenceRefs: Array.isArray(rawOptions?.evidenceRefs) ? rawOptions.evidenceRefs : [],
  };
}

function normalizeVerifyOptions(rawOptions) {
  if (!rawOptions?.declaration || typeof rawOptions.declaration !== 'object' || Array.isArray(rawOptions.declaration)) {
    throw new Error('declaration_object_required');
  }
  const siteRoot = resolve(rawOptions?.siteRoot ?? process.cwd());
  return {
    siteRoot,
    declaration: rawOptions.declaration,
    identityDocument: rawOptions.identityDocument ?? (rawOptions.identityPath ? readJson(rawOptions.identityPath) : null),
    identityTrust: Array.isArray(rawOptions.identityTrust) ? rawOptions.identityTrust : loadIdentityTrustFromConfig(siteRoot),
  };
}

function validateDeclarationShape(declaration) {
  const errors = [];
  for (const field of ['schema', 'site_id', 'payload_schema', 'payload_ref', 'payload_hash_sha256', 'canonicalization', 'key_id', 'signed_at', 'signature']) {
    if (!stringValue(declaration[field])) errors.push(`${field}_required`);
  }
  if (declaration.schema !== SIGNED_DECLARATION_SCHEMA) errors.push('schema_mismatch');
  if (!declaration.payload || typeof declaration.payload !== 'object' || Array.isArray(declaration.payload)) errors.push('payload_object_required');
  if (declaration.signed_at && Number.isNaN(Date.parse(declaration.signed_at))) errors.push('signed_at_must_be_iso_timestamp');
  return errors;
}

function canonicalValue(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalValue);
  const result = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] !== undefined) result[key] = canonicalValue(value[key]);
  }
  return result;
}

function selectSigningKey(identity, keyId) {
  const keys = Array.isArray(identity.public_keys) ? identity.public_keys : [];
  const key = keyId
    ? keys.find((entry) => entry?.key_id === keyId)
    : keys.find((entry) => entry?.status === 'active' && Array.isArray(entry.purpose) && entry.purpose.includes('sign_declarations'));
  if (!key) throw new Error(keyId ? `signing_key_not_found: ${keyId}` : 'signing_key_not_found');
  if (key.algorithm !== 'Ed25519') throw new Error('signing_key_algorithm_must_be_ed25519');
  if (key.status !== 'active') throw new Error('signing_key_must_be_active');
  if (!Array.isArray(key.purpose) || !key.purpose.includes('sign_declarations')) throw new Error('signing_key_missing_sign_declarations_purpose');
  return key;
}

function readPrivateKeyMaterial(secretPath, siteId, keyId) {
  const parsed = readJson(secretPath);
  if (parsed.schema !== 'narada.site_identity.private_key.v0') throw new Error(`private_key_schema_mismatch: ${secretPath}`);
  if (parsed.site_id !== siteId || parsed.key_id !== keyId) throw new Error(`private_key_identity_mismatch: ${secretPath}`);
  if (!parsed.private_key_jwk || parsed.private_key_jwk.kty !== 'OKP' || parsed.private_key_jwk.crv !== 'Ed25519' || typeof parsed.private_key_jwk.d !== 'string') {
    throw new Error(`private_key_invalid_ed25519_jwk: ${secretPath}`);
  }
  return parsed;
}

function readIdentityDocument(siteRoot) {
  return readJson(resolveIdentityDocumentPath(siteRoot));
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

function readConfigSiteId(siteRoot) {
  const configPath = resolve(siteRoot, 'config.json');
  if (!existsSync(configPath)) return null;
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  return stringValue(config?.static_config?.site_id);
}

function privateKeyPath({ secretRoot, siteId, keyId }) {
  return join(resolve(secretRoot), siteId, `${keyId}.private.jwk.json`);
}

function resolveSecretRoot(secretRoot) {
  if (secretRoot) return resolve(secretRoot);
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) throw new Error('LOCALAPPDATA_required_for_default_secret_root');
  return join(localAppData, 'Narada', 'site-identities');
}

function resolveIdentityDocumentPath(root) {
  const normalized = root.split('\\').join('/').toLowerCase();
  return normalized.endsWith('/.narada') ? join(root, 'site.identity.json') : join(root, '.narada', 'site.identity.json');
}

function matchingTrustRecord(trustRecords, siteId, keyRecord) {
  return trustRecords.find((record) => (
    record?.site_id === siteId
    && record?.key_id === keyRecord.key_id
    && record?.fingerprint_sha256 === keyRecord.fingerprint_sha256
  )) ?? null;
}

function verificationResult(status, trusted, extra = {}) {
  return {
    schema: 'narada.site.signed_declaration.verification.v0',
    status,
    trusted,
    ...extra,
  };
}

function authorityNote() {
  return 'Signature verification improves evidence quality only; it does not grant capabilities or mutation authority.';
}

function stringValue(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}
