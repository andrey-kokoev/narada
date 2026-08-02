import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { HostFleetCredentialRef } from './config.js';

export const HOST_FLEET_KEY_ID_HEADER = 'x-narada-host-fleet-key-id';
export const HOST_FLEET_TIMESTAMP_HEADER = 'x-narada-host-fleet-timestamp';
export const HOST_FLEET_NONCE_HEADER = 'x-narada-host-fleet-nonce';
export const HOST_FLEET_SIGNATURE_HEADER = 'x-narada-host-fleet-signature';
export const HOST_FLEET_SIGNED_METHOD = 'POST';
export const HOST_FLEET_SIGNED_PATH = '/v1/observations';

export interface HostFleetSigningHeaders {
  key_id: string;
  timestamp: string;
  nonce: string;
  signature: string;
}

export interface LoadedHostFleetCredential {
  key_id: string;
  secret: string;
  accept_until: string | null;
}

function digestBody(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex');
}

function canonical(timestamp: string, nonce: string, body: Buffer): string {
  return ['narada.host_fleet.hmac.v1', HOST_FLEET_SIGNED_METHOD, HOST_FLEET_SIGNED_PATH, timestamp, nonce, digestBody(body)].join('\n');
}

function signature(secret: string, timestamp: string, nonce: string, body: Buffer): string {
  return createHmac('sha256', secret).update(canonical(timestamp, nonce, body), 'utf8').digest('hex');
}

export async function loadHostFleetCredential(ref: HostFleetCredentialRef): Promise<LoadedHostFleetCredential> {
  let secret: string;
  try { secret = (await readFile(ref.file, 'utf8')).trim(); }
  catch { throw new Error('host_fleet_credential_unavailable'); }
  if (secret.length < 32 || secret.length > 4_096) throw new Error('host_fleet_credential_invalid');
  return { key_id: ref.key_id, secret, accept_until: ref.accept_until };
}

export function signHostFleetBody(
  body: Buffer,
  credential: LoadedHostFleetCredential,
  timestamp = new Date().toISOString(),
  nonce = randomBytes(18).toString('base64url'),
): HostFleetSigningHeaders {
  return {
    key_id: credential.key_id,
    timestamp,
    nonce,
    signature: signature(credential.secret, timestamp, nonce, body),
  };
}

export function hostFleetSigningRequestHeaders(headers: HostFleetSigningHeaders): Record<string, string> {
  return {
    [HOST_FLEET_KEY_ID_HEADER]: headers.key_id,
    [HOST_FLEET_TIMESTAMP_HEADER]: headers.timestamp,
    [HOST_FLEET_NONCE_HEADER]: headers.nonce,
    [HOST_FLEET_SIGNATURE_HEADER]: headers.signature,
  };
}

export function verifyHostFleetBody(input: {
  body: Buffer;
  headers: HostFleetSigningHeaders;
  credentials: readonly LoadedHostFleetCredential[];
  now_ms: number;
  max_clock_skew_ms: number;
}): LoadedHostFleetCredential {
  const timestampMs = Date.parse(input.headers.timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(input.now_ms - timestampMs) > input.max_clock_skew_ms) {
    throw new Error('host_fleet_signature_timestamp_invalid');
  }
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(input.headers.nonce)) throw new Error('host_fleet_signature_nonce_invalid');
  if (!/^[a-f0-9]{64}$/.test(input.headers.signature)) throw new Error('host_fleet_signature_invalid');
  const credential = input.credentials.find((candidate) => candidate.key_id === input.headers.key_id);
  if (!credential) throw new Error('host_fleet_signature_key_unknown');
  if (credential.accept_until !== null && input.now_ms > Date.parse(credential.accept_until)) {
    throw new Error('host_fleet_signature_key_expired');
  }
  const expected = Buffer.from(signature(credential.secret, input.headers.timestamp, input.headers.nonce, input.body), 'hex');
  const presented = Buffer.from(input.headers.signature, 'hex');
  if (expected.length !== presented.length || !timingSafeEqual(expected, presented)) throw new Error('host_fleet_signature_invalid');
  return credential;
}
