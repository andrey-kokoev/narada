#!/usr/bin/env node
import { createHash, generateKeyPairSync, createPrivateKey, createPublicKey } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_IDENTITY_SCHEMA = 'narada.site.identity.v0';
const DEFAULT_PURPOSES = ['site_identity', 'sign_declarations', 'sign_crossings', 'sign_probe_reports'];

export function materializeSiteIdentity(rawOptions) {
  const options = normalizeOptions(rawOptions);
  const siteRoot = resolve(options.siteRoot);
  const secretRoot = resolveSecretRoot(options.secretRoot);
  const keyId = options.keyId ?? defaultKeyId(new Date());
  const secretDir = join(secretRoot, options.siteId);
  const secretPath = join(secretDir, `${keyId}.private.jwk.json`);
  const identityPath = resolveIdentityDocumentPath(siteRoot);

  mkdirSync(secretDir, { recursive: true });
  mkdirSync(dirname(identityPath), { recursive: true });

  if (existsSync(identityPath) && !options.force) {
    throw new Error(`identity_document_exists_use_force: ${identityPath}`);
  }

  const keyMaterial = loadOrCreatePrivateKey({ secretPath, siteId: options.siteId, keyId, createdAt: options.createdAt });
  const privateKey = createPrivateKey({ key: keyMaterial.private_key_jwk, format: 'jwk' });
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('private_key_not_ed25519');
  const publicKeyObject = createPublicKey(privateKey);
  const publicKeyDer = publicKeyObject.export({ type: 'spki', format: 'der' });
  const fingerprint = createHash('sha256').update(publicKeyDer).digest('hex');
  const createdAt = keyMaterial.created_at;

  const identity = {
    schema: SITE_IDENTITY_SCHEMA,
    site_id: options.siteId,
    authority_locus: {
      site_root: relativeSiteRootForIdentity(siteRoot),
      locus_type: options.locusType,
    },
    public_keys: [
      {
        key_id: keyId,
        algorithm: 'Ed25519',
        public_key: base64url(publicKeyDer),
        public_key_encoding: 'spki_der_base64url',
        fingerprint_sha256: fingerprint,
        fingerprint_preimage: 'spki_der',
        purpose: options.purposes,
        created_at: createdAt,
        expires_at: null,
        status: 'active',
      },
    ],
    created_at: createdAt,
    status: 'active',
    rotation_policy: {
      mode: 'operator_governed_local_secret_storage',
      overlap_required: true,
      revocation_record_required: true,
    },
    evidence_refs: [
      'task:#502',
      'tool:tools/site-identity/materialize-site-identity.mjs',
    ],
  };

  writeFileSync(identityPath, `${JSON.stringify(identity, null, 2)}\n`, 'utf8');

  return {
    schema: 'narada.site_identity.materialization_result.v0',
    status: 'ok',
    site_id: options.siteId,
    key_id: keyId,
    identity_path: identityPath,
    private_key_storage: {
      status: keyMaterial.created ? 'created' : 'reused',
      path: secretPath,
      outside_site_root: !isPathInside(secretPath, siteRoot),
      storage_policy: 'local_app_data_not_git_tracked',
    },
    public_key: {
      algorithm: 'Ed25519',
      encoding: 'spki_der_base64url',
      fingerprint_sha256: fingerprint,
    },
  };
}

function normalizeOptions(rawOptions) {
  const options = {
    siteRoot: rawOptions?.siteRoot ?? process.cwd(),
    siteId: rawOptions?.siteId,
    locusType: rawOptions?.locusType ?? 'user',
    keyId: rawOptions?.keyId,
    secretRoot: rawOptions?.secretRoot,
    createdAt: rawOptions?.createdAt,
    purposes: Array.isArray(rawOptions?.purposes) && rawOptions.purposes.length > 0 ? rawOptions.purposes : DEFAULT_PURPOSES,
    force: rawOptions?.force === true,
  };
  if (!options.siteId) throw new Error('site_id_required');
  if (typeof options.siteId !== 'string' || options.siteId.trim().length === 0) throw new Error('site_id_must_be_non_empty_string');
  if (typeof options.locusType !== 'string' || options.locusType.trim().length === 0) throw new Error('locus_type_must_be_non_empty_string');
  if (options.createdAt && Number.isNaN(Date.parse(options.createdAt))) throw new Error('created_at_must_be_iso_timestamp');
  return options;
}

function parseArgs(argv) {
  const options = { siteRoot: process.cwd(), locusType: 'user', purposes: DEFAULT_PURPOSES, force: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--site-root') { options.siteRoot = argv[++i]; continue; }
    if (arg === '--site-id') { options.siteId = argv[++i]; continue; }
    if (arg === '--locus-type') { options.locusType = argv[++i]; continue; }
    if (arg === '--key-id') { options.keyId = argv[++i]; continue; }
    if (arg === '--secret-root') { options.secretRoot = argv[++i]; continue; }
    if (arg === '--created-at') { options.createdAt = argv[++i]; continue; }
    if (arg === '--purpose') { options.purposes = argv[++i].split(',').map((item) => item.trim()).filter(Boolean); continue; }
    if (arg === '--force') { options.force = true; continue; }
    if (arg === '--json') { options.json = true; continue; }
    if (arg === '--help') { options.help = true; continue; }
    throw new Error(`unknown_arg: ${arg}`);
  }
  return options;
}

function usage() {
  return [
    'Usage: node tools/site-identity/materialize-site-identity.mjs --site-id <site-id> [options]',
    '',
    'Creates or refreshes root/.narada/site.identity.json and stores the Ed25519 private JWK outside the Site.',
    '',
    'Options:',
    '  --site-root <path>       Site root. Defaults to cwd.',
    '  --site-id <id>          Required stable Site id.',
    '  --locus-type <type>     authority_locus.locus_type. Defaults to user.',
    '  --key-id <id>           Defaults to site-ed25519-YYYY-MM.',
    '  --secret-root <path>    Defaults to %LOCALAPPDATA%/Narada/site-identities.',
    '  --created-at <iso>      Defaults to current time for newly generated keys.',
    '  --force                 Overwrite an existing public identity document.',
    '  --json                  Print machine-readable result.',
  ].join('\n');
}

function loadOrCreatePrivateKey({ secretPath, siteId, keyId, createdAt }) {
  if (existsSync(secretPath)) {
    const parsed = JSON.parse(readFileSync(secretPath, 'utf8'));
    if (parsed.schema !== 'narada.site_identity.private_key.v0') throw new Error(`private_key_schema_mismatch: ${secretPath}`);
    if (parsed.site_id !== siteId || parsed.key_id !== keyId) throw new Error(`private_key_identity_mismatch: ${secretPath}`);
    if (!parsed.private_key_jwk || parsed.private_key_jwk.kty !== 'OKP' || parsed.private_key_jwk.crv !== 'Ed25519' || typeof parsed.private_key_jwk.d !== 'string') {
      throw new Error(`private_key_invalid_ed25519_jwk: ${secretPath}`);
    }
    return { ...parsed, created: false };
  }

  const { privateKey } = generateKeyPairSync('ed25519');
  const privateJwk = privateKey.export({ format: 'jwk' });
  const materializedAt = createdAt ?? new Date().toISOString();
  const payload = {
    schema: 'narada.site_identity.private_key.v0',
    site_id: siteId,
    key_id: keyId,
    algorithm: 'Ed25519',
    private_key_jwk: privateJwk,
    created_at: materializedAt,
    storage_policy: 'local_app_data_not_git_tracked',
  };
  writeFileSync(secretPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return { ...payload, created: true };
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

function relativeSiteRootForIdentity(siteRoot) {
  const normalized = siteRoot.split('\\').join('/').toLowerCase();
  return normalized.endsWith('/.narada') ? '.narada' : '.';
}

function defaultKeyId(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `site-ed25519-${year}-${month}`;
}

function base64url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function isPathInside(child, parent) {
  const childResolved = resolve(child).toLowerCase();
  const parentResolved = resolve(parent).toLowerCase();
  return childResolved === parentResolved || childResolved.startsWith(`${parentResolved}\\`);
}

function humanResult(result) {
  return [
    `materialized ${result.site_id} ${result.key_id}`,
    `identity: ${result.identity_path}`,
    `private key: ${result.private_key_storage.path}`,
    `fingerprint_sha256: ${result.public_key.fingerprint_sha256}`,
    '',
  ].join('\n');
}

function isMain() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${usage()}\n`);
    } else {
      const result = materializeSiteIdentity(options);
      process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : humanResult(result));
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
