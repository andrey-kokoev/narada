import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  postureShowCommand,
  postureUpdateCommand,
  postureCheckCommand,
  validatePosture,
} from '../../src/commands/posture.js';
import { ExitCode } from '../../src/lib/exit-codes.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function makeValidPosture(): Record<string, unknown> {
  return {
    posture_id: 'posture-test-001',
    created_at: '2026-04-20T00:00:00Z',
    updated_at: '2026-04-20T00:00:00Z',
    source: 'manual',
    coordinates: {
      semantic_resolution: { reading: 'stable', evidence: 'Contracts are clear' },
      invariant_preservation: { reading: 'strong', evidence: 'All boundaries hold' },
      constructive_executability: { reading: 'strong', evidence: 'Build is green' },
      grounded_universalization: { reading: 'healthy', evidence: 'Patterns generalize well' },
      authority_reviewability: { reading: 'strong', evidence: 'Review load is balanced' },
      teleological_pressure: { reading: 'focused', evidence: 'Targets are clear' },
    },
    counterweight_intent: 'Maintain current trajectory',
    recommended_next_slices: ['467'],
    expires_at: '2026-12-31T23:59:59Z',
  };
}

describe('posture commands', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-posture-test-'));
    mkdirSync(join(tempDir, '.ai', 'postures', 'archive'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('posture show', () => {
    it('displays current posture coordinates', async () => {
      writeFileSync(
        join(tempDir, '.ai', 'postures', 'current.json'),
        JSON.stringify(makeValidPosture()),
      );

      const result = await postureShowCommand({ cwd: tempDir, format: 'json' });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const rec = result.result as { posture: { coordinates: Record<string, unknown> } };
      expect(rec.posture.coordinates.semantic_resolution).toMatchObject({
        reading: 'stable',
        evidence: 'Contracts are clear',
      });
    });

    it('warns when posture is expired', async () => {
      const posture = makeValidPosture();
      posture.expires_at = '2020-01-01T00:00:00Z';
      writeFileSync(
        join(tempDir, '.ai', 'postures', 'current.json'),
        JSON.stringify(posture),
      );

      const result = await postureShowCommand({ cwd: tempDir, format: 'json' });

      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      const rec = result.result as { expired: boolean; warnings: string[] };
      expect(rec.expired).toBe(true);
      expect(rec.warnings).toContain('Posture has expired');
    });

    it('fails gracefully when no posture exists', async () => {
      const result = await postureShowCommand({ cwd: tempDir, format: 'json' });

      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      const rec = result.result as { error: string };
      expect(rec.error).toContain('No active CCC posture');
    });
  });

  describe('posture update', () => {
    it('writes valid posture atomically and archives previous', async () => {
      const oldPosture = makeValidPosture();
      oldPosture.posture_id = 'posture-old';
      writeFileSync(
        join(tempDir, '.ai', 'postures', 'current.json'),
        JSON.stringify(oldPosture),
      );

      const newPosture = makeValidPosture();
      newPosture.posture_id = 'posture-new';
      const filePath = join(tempDir, 'new-posture.json');
      writeFileSync(filePath, JSON.stringify(newPosture));

      const result = await postureUpdateCommand({
        from: 'manual',
        file: filePath,
        cwd: tempDir,
        format: 'json',
      });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);

      const current = JSON.parse(readFileSync(join(tempDir, '.ai', 'postures', 'current.json'), 'utf8'));
      expect(current.posture_id).toBe('posture-new');

      const archived = readFileSync(join(tempDir, '.ai', 'postures', 'archive', 'posture-old.json'), 'utf8');
      expect(archived).toContain('posture-old');
    });

    it('rejects invalid schema', async () => {
      const badPosture = makeValidPosture();
      delete (badPosture as Record<string, unknown>).coordinates;
      const filePath = join(tempDir, 'bad-posture.json');
      writeFileSync(filePath, JSON.stringify(badPosture));

      const result = await postureUpdateCommand({
        from: 'manual',
        file: filePath,
        cwd: tempDir,
        format: 'json',
      });

      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      const rec = result.result as { error: string; details: string[] };
      expect(rec.error).toContain('Invalid posture schema');
      expect(rec.details.length).toBeGreaterThan(0);
    });
  });

  describe('posture check', () => {
    it('passes valid unexpired posture', async () => {
      writeFileSync(
        join(tempDir, '.ai', 'postures', 'current.json'),
        JSON.stringify(makeValidPosture()),
      );

      const result = await postureCheckCommand({ cwd: tempDir, format: 'json' });

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const rec = result.result as { valid: boolean };
      expect(rec.valid).toBe(true);
    });

    it('fails invalid posture', async () => {
      const badPosture = makeValidPosture();
      delete (badPosture as Record<string, unknown>).coordinates;
      writeFileSync(
        join(tempDir, '.ai', 'postures', 'current.json'),
        JSON.stringify(badPosture),
      );

      const result = await postureCheckCommand({ cwd: tempDir, format: 'json' });

      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      const rec = result.result as { valid: boolean; errors: string[] };
      expect(rec.valid).toBe(false);
      expect(rec.errors.length).toBeGreaterThan(0);
    });

    it('fails expired posture', async () => {
      const posture = makeValidPosture();
      posture.expires_at = '2020-01-01T00:00:00Z';
      writeFileSync(
        join(tempDir, '.ai', 'postures', 'current.json'),
        JSON.stringify(posture),
      );

      const result = await postureCheckCommand({ cwd: tempDir, format: 'json' });

      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      const rec = result.result as { valid: boolean; warnings: string[] };
      expect(rec.valid).toBe(false);
      expect(rec.warnings).toContain('Posture has expired');
    });
  });

  describe('validatePosture', () => {
    it('accepts a valid posture', () => {
      const result = validatePosture(makeValidPosture());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects missing coordinates', () => {
      const p = makeValidPosture();
      delete (p as Record<string, unknown>).coordinates;
      const result = validatePosture(p);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('coordinates'))).toBe(true);
    });

    it('rejects invalid reading', () => {
      const p = makeValidPosture();
      (p.coordinates as Record<string, unknown>).semantic_resolution = {
        reading: 'banana',
        evidence: 'nope',
      };
      const result = validatePosture(p);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid reading'))).toBe(true);
    });
  });
});
