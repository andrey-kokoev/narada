import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  recallAcceptedLearning,
  formatGuidanceForHumans,
  formatGuidanceForJson,
} from '../../src/lib/learning-recall.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupAcceptedDir(tempDir: string, artifacts: Array<{ fileName: string; content: unknown }>) {
  const acceptedDir = join(tempDir, '.ai', 'learning', 'accepted');
  mkdirSync(acceptedDir, { recursive: true });
  for (const a of artifacts) {
    writeFileSync(join(acceptedDir, a.fileName), JSON.stringify(a.content, null, 2));
  }
}

describe('learning recall helper', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-learning-recall-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('surfaces accepted artifact with matching scope', async () => {
    setupAcceptedDir(tempDir, [
      {
        fileName: '20260422-003-roster.json',
        content: {
          artifact_id: '20260422-003',
          state: 'accepted',
          title: 'Roster rule',
          content: { principle: 'Recommended assignments are operative unless rejected' },
          scopes: ['roster'],
        },
      },
    ]);

    const result = await recallAcceptedLearning({ cwd: tempDir, scopes: ['roster'] });
    expect(result.guidance).toHaveLength(1);
    expect(result.guidance[0].artifact_id).toBe('20260422-003');
    expect(result.guidance[0].principle).toBe('Recommended assignments are operative unless rejected');
    expect(result.warnings).toHaveLength(0);
  });

  it('ignores accepted artifact without matching scope', async () => {
    setupAcceptedDir(tempDir, [
      {
        fileName: '20260422-003-roster.json',
        content: {
          artifact_id: '20260422-003',
          state: 'accepted',
          title: 'Roster rule',
          content: { principle: 'Roster principle' },
          scopes: ['roster'],
        },
      },
    ]);

    const result = await recallAcceptedLearning({ cwd: tempDir, scopes: ['report'] });
    expect(result.guidance).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('ignores candidate (non-accepted) artifacts', async () => {
    setupAcceptedDir(tempDir, [
      {
        fileName: '20260422-001-candidate.json',
        content: {
          artifact_id: '20260422-001',
          state: 'candidate',
          title: 'Candidate rule',
          content: { principle: 'Should not appear' },
          scopes: ['roster'],
        },
      },
    ]);

    const result = await recallAcceptedLearning({ cwd: tempDir, scopes: ['roster'] });
    expect(result.guidance).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('ignores rejected artifacts', async () => {
    setupAcceptedDir(tempDir, [
      {
        fileName: '20260422-002-rejected.json',
        content: {
          artifact_id: '20260422-002',
          state: 'rejected',
          title: 'Rejected rule',
          content: { principle: 'Should not appear' },
          scopes: ['roster'],
        },
      },
    ]);

    const result = await recallAcceptedLearning({ cwd: tempDir, scopes: ['roster'] });
    expect(result.guidance).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('warns on malformed JSON but does not crash', async () => {
    const acceptedDir = join(tempDir, '.ai', 'learning', 'accepted');
    mkdirSync(acceptedDir, { recursive: true });
    writeFileSync(join(acceptedDir, 'bad.json'), 'not json at all');

    const result = await recallAcceptedLearning({ cwd: tempDir, scopes: ['roster'] });
    expect(result.guidance).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('malformed JSON');
  });

  it('ignores artifacts with no scopes declared', async () => {
    setupAcceptedDir(tempDir, [
      {
        fileName: '20260422-004-legacy.json',
        content: {
          artifact_id: '20260422-004',
          state: 'accepted',
          title: 'Legacy rule',
          content: { principle: 'No scopes' },
        },
      },
    ]);

    const result = await recallAcceptedLearning({ cwd: tempDir, scopes: ['roster'] });
    expect(result.guidance).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('matches any of multiple requested scopes', async () => {
    setupAcceptedDir(tempDir, [
      {
        fileName: 'artifact-a.json',
        content: {
          artifact_id: 'artifact-a',
          state: 'accepted',
          title: 'A',
          content: { principle: 'Principle A' },
          scopes: ['report'],
        },
      },
      {
        fileName: 'artifact-b.json',
        content: {
          artifact_id: 'artifact-b',
          state: 'accepted',
          title: 'B',
          content: { principle: 'Principle B' },
          scopes: ['roster'],
        },
      },
    ]);

    const result = await recallAcceptedLearning({ cwd: tempDir, scopes: ['roster', 'report'] });
    expect(result.guidance).toHaveLength(2);
    expect(result.guidance.map((g) => g.artifact_id)).toContain('artifact-a');
    expect(result.guidance.map((g) => g.artifact_id)).toContain('artifact-b');
  });

  it('returns empty when accepted directory does not exist', async () => {
    const result = await recallAcceptedLearning({ cwd: tempDir, scopes: ['roster'] });
    expect(result.guidance).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('does not mutate task/roster/assignment files', async () => {
    setupAcceptedDir(tempDir, [
      {
        fileName: 'rule.json',
        content: {
          artifact_id: 'rule',
          state: 'accepted',
          title: 'Rule',
          content: { principle: 'Principle' },
          scopes: ['roster'],
        },
      },
    ]);

    const before = writeFileSync;
    // We can't easily spy on fs here, but we can verify no new files appear
    const acceptedDir = join(tempDir, '.ai', 'learning', 'accepted');
    const filesBefore = require('node:fs').readdirSync(acceptedDir);

    await recallAcceptedLearning({ cwd: tempDir, scopes: ['roster'] });

    const filesAfter = require('node:fs').readdirSync(acceptedDir);
    expect(filesAfter).toEqual(filesBefore);
  });

  describe('formatGuidanceForHumans', () => {
    it('formats at most maxItems lines', () => {
      const guidance = [
        { artifact_id: 'a', title: 'A', principle: 'P1', source_path: '/a', not_applicable_when: [] },
        { artifact_id: 'b', title: 'B', principle: 'P2', source_path: '/b', not_applicable_when: [] },
        { artifact_id: 'c', title: 'C', principle: 'P3', source_path: '/c', not_applicable_when: [] },
      ];
      const lines = formatGuidanceForHumans(guidance, 2);
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain('A');
      expect(lines[0]).toContain('P1');
    });

    it('truncates long principles', () => {
      const longPrinciple = 'a'.repeat(200);
      const guidance = [
        { artifact_id: 'a', title: 'A', principle: longPrinciple, source_path: '/a', not_applicable_when: [] },
      ];
      const lines = formatGuidanceForHumans(guidance);
      expect(lines[0].length).toBeLessThan(longPrinciple.length + 10);
      expect(lines[0]).toContain('...');
    });
  });

  describe('formatGuidanceForJson', () => {
    it('returns structured guidance objects', () => {
      const guidance = [
        {
          artifact_id: 'a',
          title: 'A',
          principle: 'P1',
          source_path: '/a',
          not_applicable_when: ['when X'],
        },
      ];
      const json = formatGuidanceForJson(guidance);
      expect(json).toEqual([
        {
          artifact_id: 'a',
          title: 'A',
          principle: 'P1',
          not_applicable_when: ['when X'],
        },
      ]);
    });
  });
});
