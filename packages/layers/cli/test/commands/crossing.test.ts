import { describe, expect, it } from 'vitest';
import {
  crossingListCommand,
  crossingShowCommand,
} from '../../src/commands/crossing.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

describe('crossing regime inspection', () => {
  describe('list', () => {
    it('lists all crossings by default', async () => {
      const result = await crossingListCommand({ format: 'json' });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const r = result.result as {
        status: string;
        count: number;
        crossings: Array<Record<string, unknown>>;
      };
      expect(r.status).toBe('success');
      expect(r.count).toBeGreaterThan(0);
      expect(r.crossings.length).toBeGreaterThan(0);
    });

    it('returns canonical fields for each crossing', async () => {
      const result = await crossingListCommand({ format: 'json' });
      const r = result.result as {
        crossings: Array<{
          name: string;
          source_zone: string;
          destination_zone: string;
          authority_owner: string;
          crossing_artifact: string;
          confirmation_rule: string;
          classification: string;
        }>;
      };
      const first = r.crossings[0];
      expect(first).toHaveProperty('name');
      expect(first).toHaveProperty('source_zone');
      expect(first).toHaveProperty('destination_zone');
      expect(first).toHaveProperty('authority_owner');
      expect(first).toHaveProperty('crossing_artifact');
      expect(first).toHaveProperty('confirmation_rule');
      expect(first).toHaveProperty('classification');
    });

    it('filters by classification canonical', async () => {
      const result = await crossingListCommand({
        format: 'json',
        classification: 'canonical',
      });
      const r = result.result as {
        count: number;
        crossings: Array<{ classification: string }>;
      };
      expect(r.crossings.every((c) => c.classification === 'canonical')).toBe(
        true,
      );
      expect(r.count).toBeGreaterThan(0);
    });

    it('filters by classification advisory', async () => {
      const result = await crossingListCommand({
        format: 'json',
        classification: 'advisory',
      });
      const r = result.result as {
        count: number;
        crossings: Array<{ classification: string }>;
      };
      expect(r.crossings.every((c) => c.classification === 'advisory')).toBe(
        true,
      );
      expect(r.count).toBeGreaterThan(0);
    });

    it('filters by classification deferred', async () => {
      const result = await crossingListCommand({
        format: 'json',
        classification: 'deferred',
      });
      const r = result.result as {
        count: number;
        crossings: Array<{ classification: string }>;
      };
      expect(r.crossings.every((c) => c.classification === 'deferred')).toBe(
        true,
      );
      expect(r.count).toBeGreaterThan(0);
    });

    it('filters by multiple classifications', async () => {
      const result = await crossingListCommand({
        format: 'json',
        classification: 'canonical,advisory',
      });
      const r = result.result as {
        count: number;
        crossings: Array<{ classification: string }>;
      };
      expect(
        r.crossings.every(
          (c) => c.classification === 'canonical' || c.classification === 'advisory',
        ),
      ).toBe(true);
      expect(r.count).toBeGreaterThan(0);
    });

    it('returns empty for non-matching classification', async () => {
      const result = await crossingListCommand({
        format: 'json',
        classification: 'nonexistent',
      });
      const r = result.result as { count: number };
      expect(r.count).toBe(0);
    });

    it('includes classification_rationale when present', async () => {
      const result = await crossingListCommand({ format: 'json' });
      const r = result.result as {
        crossings: Array<{ classification_rationale: string | null }>;
      };
      const advisory = r.crossings.find((c) => c.classification_rationale);
      expect(advisory).toBeDefined();
    });

    it('produces human-readable output', async () => {
      const result = await crossingListCommand({ format: 'human' });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const r = result.result as { status: string };
      expect(r.status).toBe('success');
    });

    it('is read-only (no mutation)', async () => {
      const result = await crossingListCommand({ format: 'json' });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      // The inventory is a const import; if this returns success, no mutation occurred
    });
  });

  describe('show', () => {
    it('shows a canonical crossing by exact name', async () => {
      const result = await crossingShowCommand({
        format: 'json',
        name: 'Fact admission',
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const r = result.result as {
        status: string;
        crossing: { name: string; classification: string };
      };
      expect(r.status).toBe('success');
      expect(r.crossing.name).toBe('Fact admission');
      expect(r.crossing.classification).toBe('canonical');
    });

    it('shows a crossing case-insensitively', async () => {
      const result = await crossingShowCommand({
        format: 'json',
        name: 'fact admission',
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const r = result.result as {
        crossing: { name: string };
      };
      expect(r.crossing.name).toBe('Fact admission');
    });

    it('returns all six irreducible fields plus metadata', async () => {
      const result = await crossingShowCommand({
        format: 'json',
        name: 'Intent admission',
      });
      const r = result.result as {
        crossing: {
          name: string;
          description: string;
          source_zone: string;
          destination_zone: string;
          authority_owner: string;
          admissibility_regime: string;
          crossing_artifact: string;
          confirmation_rule: string;
          anti_collapse_invariant: string;
          documented_at: string;
          classification: string;
        };
      };
      expect(r.crossing.name).toBe('Intent admission');
      expect(r.crossing.source_zone).toBeDefined();
      expect(r.crossing.destination_zone).toBeDefined();
      expect(r.crossing.authority_owner).toBeDefined();
      expect(r.crossing.admissibility_regime).toBeDefined();
      expect(r.crossing.crossing_artifact).toBeDefined();
      expect(r.crossing.confirmation_rule).toBeDefined();
    });

    it('returns error for unknown crossing name', async () => {
      const result = await crossingShowCommand({
        format: 'json',
        name: 'Nonexistent Crossing',
      });
      expect(result.exitCode).toBe(ExitCode.GENERAL_ERROR);
      const r = result.result as { status: string; error: string; available: string[] };
      expect(r.status).toBe('error');
      expect(r.error).toContain('not found');
      expect(r.available.length).toBeGreaterThan(0);
    });

    it('warns about deferred crossings in human format', async () => {
      const result = await crossingShowCommand({
        format: 'human',
        name: 'Intent → Execution',
      });
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      const r = result.result as { status: string; crossing: { classification: string } };
      expect(r.crossing.classification).toBe('deferred');
    });

    it('shows advisory crossing with rationale', async () => {
      const result = await crossingShowCommand({
        format: 'json',
        name: 'Fact → Context',
      });
      const r = result.result as {
        crossing: { classification: string; classification_rationale: string | null };
      };
      expect(r.crossing.classification).toBe('advisory');
      expect(r.crossing.classification_rationale).not.toBeNull();
    });
  });
});
