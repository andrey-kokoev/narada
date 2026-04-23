/**
 * CCC Posture commands.
 *
 * Advisory read/write operators for coherence posture management.
 * Posture is never authoritative; all commands degrade gracefully when
 * posture is missing, expired, or invalid.
 */

import { readFile, writeFile, mkdir, rename, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';

// ── Types ──

export interface CCCCoordinate {
  reading: string;
  evidence: string;
}

export interface CCCCoordinates {
  semantic_resolution: CCCCoordinate;
  invariant_preservation: CCCCoordinate;
  constructive_executability: CCCCoordinate;
  grounded_universalization: CCCCoordinate;
  authority_reviewability: CCCCoordinate;
  teleological_pressure: CCCCoordinate;
}

export interface CCCPosture {
  posture_id: string;
  created_at: string;
  updated_at: string;
  source: string;
  coordinates: CCCCoordinates;
  counterweight_intent: string;
  recommended_next_slices: string[];
  expires_at: string;
}

export interface PostureShowOptions {
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
}

export interface PostureUpdateOptions {
  from: string;
  file?: string;
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
}

export interface PostureCheckOptions {
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
}

// ── Constants ──

const COORDINATE_KEYS = [
  'semantic_resolution',
  'invariant_preservation',
  'constructive_executability',
  'grounded_universalization',
  'authority_reviewability',
  'teleological_pressure',
] as const;

const VALID_READINGS: Record<string, string[]> = {
  semantic_resolution: ['stable', 'improving', 'degraded'],
  invariant_preservation: ['strong', 'adequate', 'weak'],
  constructive_executability: ['strong', 'improved', 'stalled', 'weak'],
  grounded_universalization: ['healthy', 'premature', 'deferred'],
  authority_reviewability: ['strong', 'overweighted', 'underweighted'],
  teleological_pressure: ['focused', 'diffuse', 'needs_target'],
};

// ── Path helpers ──

function postureDir(cwd: string): string {
  return join(resolve(cwd), '.ai', 'postures');
}

function currentPath(cwd: string): string {
  return join(postureDir(cwd), 'current.json');
}

function archiveDir(cwd: string): string {
  return join(postureDir(cwd), 'archive');
}

// ── I/O ──

export async function loadPosture(cwd: string): Promise<CCCPosture | null> {
  try {
    const raw = await readFile(currentPath(cwd), 'utf8');
    return JSON.parse(raw) as CCCPosture;
  } catch {
    return null;
  }
}

function isExpired(posture: CCCPosture): boolean {
  return new Date(posture.expires_at) < new Date();
}

// ── Validation ──

export function validatePosture(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    errors.push('Posture must be an object');
    return { valid: false, errors };
  }

  const p = data as Record<string, unknown>;

  for (const key of ['posture_id', 'created_at', 'updated_at', 'source', 'counterweight_intent', 'expires_at']) {
    if (typeof p[key] !== 'string') {
      errors.push(`Missing or invalid field: ${key}`);
    }
  }

  if (!Array.isArray(p.recommended_next_slices)) {
    errors.push('Missing or invalid field: recommended_next_slices (must be an array)');
  }

  const coords = p.coordinates as Record<string, unknown> | undefined;
  if (!coords || typeof coords !== 'object') {
    errors.push('Missing or invalid field: coordinates');
    return { valid: false, errors };
  }

  for (const key of COORDINATE_KEYS) {
    const coord = coords[key] as Record<string, unknown> | undefined;
    if (!coord || typeof coord !== 'object') {
      errors.push(`Missing coordinate: ${key}`);
      continue;
    }
    if (typeof coord.reading !== 'string') {
      errors.push(`Missing reading for coordinate: ${key}`);
    } else if (!VALID_READINGS[key].includes(coord.reading)) {
      errors.push(`Invalid reading for ${key}: "${coord.reading}" (must be one of ${VALID_READINGS[key].join(', ')})`);
    }
    if (typeof coord.evidence !== 'string') {
      errors.push(`Missing evidence for coordinate: ${key}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Commands ──

export async function postureShowCommand(
  options: PostureShowOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto' });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();

  const posture = await loadPosture(cwd);

  if (!posture) {
    const result = { error: 'No active CCC posture found' };
    if (fmt.getFormat() === 'json') {
      return { exitCode: ExitCode.GENERAL_ERROR, result };
    }
    fmt.message('No active CCC posture found.', 'warning');
    return { exitCode: ExitCode.GENERAL_ERROR, result };
  }

  const expired = isExpired(posture);

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: expired ? ExitCode.GENERAL_ERROR : ExitCode.SUCCESS,
      result: {
        posture,
        expired,
        warnings: expired ? ['Posture has expired'] : [],
      },
    };
  }

  fmt.section('CCC Posture');
  fmt.kv('Posture ID', posture.posture_id);
  fmt.kv('Source', posture.source);
  fmt.kv('Created', posture.created_at);
  fmt.kv('Updated', posture.updated_at);
  fmt.kv('Expires', posture.expires_at);
  if (expired) {
    fmt.message('⚠ Posture has expired', 'warning');
  }

  fmt.section('Coordinates');
  for (const key of COORDINATE_KEYS) {
    const coord = posture.coordinates[key];
    fmt.kv(key, `${coord.reading} — ${coord.evidence}`);
  }

  fmt.section('Counterweight Intent');
  console.log(`  ${posture.counterweight_intent}`);

  if (posture.recommended_next_slices.length > 0) {
    fmt.section('Recommended Next Slices');
    fmt.list(posture.recommended_next_slices);
  }

  return {
    exitCode: expired ? ExitCode.GENERAL_ERROR : ExitCode.SUCCESS,
    result: { posture, expired },
  };
}

export async function postureUpdateCommand(
  options: PostureUpdateOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto' });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();

  // Load input posture
  let input: unknown;
  if (options.file) {
    try {
      const raw = await readFile(resolve(options.file), 'utf8');
      input = JSON.parse(raw);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { exitCode: ExitCode.GENERAL_ERROR, result: { error: `Failed to read input file: ${message}` } };
    }
  } else {
    // Read from stdin or construct minimal posture from --from
    input = {
      posture_id: `posture-${Date.now()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      source: options.from,
      coordinates: {},
      counterweight_intent: '',
      recommended_next_slices: [],
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
    return { exitCode: ExitCode.GENERAL_ERROR, result: { error: 'posture update requires --file <path> or full stdin JSON' } };
  }

  // Validate
  const validation = validatePosture(input);
  if (!validation.valid) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { error: 'Invalid posture schema', details: validation.errors },
    };
  }

  const posture = input as CCCPosture;
  posture.updated_at = new Date().toISOString();
  posture.source = options.from;

  const dir = postureDir(cwd);
  const current = currentPath(cwd);
  const archive = archiveDir(cwd);

  // Ensure directories exist
  await mkdir(archive, { recursive: true });

  // Archive existing posture if present
  try {
    await access(current);
    const existing = await readFile(current, 'utf8');
    const existingPosture = JSON.parse(existing) as CCCPosture;
    const archivePath = join(archive, `${existingPosture.posture_id}.json`);
    await writeFile(archivePath, existing, 'utf8');
  } catch {
    // No existing posture to archive
  }

  // Atomic write
  const tmpPath = `${current}.tmp.${Date.now()}`;
  await writeFile(tmpPath, JSON.stringify(posture, null, 2) + '\n', 'utf8');
  await rename(tmpPath, current);

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: { posture, archived: true, message: 'Posture updated' },
    };
  }

  fmt.message('Posture updated.', 'success');
  fmt.kv('Posture ID', posture.posture_id);
  fmt.kv('Source', posture.source);
  fmt.kv('Expires', posture.expires_at);

  return {
    exitCode: ExitCode.SUCCESS,
    result: { posture, archived: true },
  };
}

export async function postureCheckCommand(
  options: PostureCheckOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto' });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();

  const posture = await loadPosture(cwd);

  if (!posture) {
    const result = { valid: false, errors: ['No active CCC posture found'] };
    if (fmt.getFormat() === 'json') {
      return { exitCode: ExitCode.GENERAL_ERROR, result };
    }
    fmt.message('No active CCC posture found.', 'warning');
    return { exitCode: ExitCode.GENERAL_ERROR, result };
  }

  const validation = validatePosture(posture);
  const expired = isExpired(posture);
  const staleEvidence = posture.coordinates
    ? Object.values(posture.coordinates).some(
        (c) => !c || !c.evidence || c.evidence.length < 10,
      )
    : false;

  const warnings: string[] = [];
  if (expired) warnings.push('Posture has expired');
  if (staleEvidence) warnings.push('Some coordinates have brief or missing evidence');

  const valid = validation.valid && !expired && warnings.length === 0;

  const result = {
    valid,
    posture_id: posture.posture_id,
    errors: validation.errors,
    warnings,
    expired,
  };

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: valid ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
      result,
    };
  }

  if (valid) {
    fmt.message('Posture is valid and current.', 'success');
  } else {
    if (!validation.valid) {
      fmt.message('Schema validation failed:', 'error');
      for (const err of validation.errors) {
        fmt.message(`  ${err}`, 'error');
      }
    }
    if (expired) {
      fmt.message('Posture has expired.', 'warning');
    }
    if (staleEvidence) {
      fmt.message('Some coordinates have brief or missing evidence.', 'warning');
    }
  }

  return {
    exitCode: valid ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR,
    result,
  };
}
