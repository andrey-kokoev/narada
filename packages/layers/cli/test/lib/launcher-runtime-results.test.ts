import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { readLaunchResults, reconcileLaunchResults } from '../../src/lib/launcher-runtime-results.js';
import { writeOperatorProjectionLaunchBinding } from '../../src/lib/launcher-runtime-projection.js';
import { sessionIdFromContract } from '../../src/lib/launcher-contracts.js';

describe('launcher runtime result discovery', () => {
  it('fails closed with the invalid artifact path', () => {
    const launchResultsDir = mkdtempSync(join(tmpdir(), 'launcher-runtime-results-'));
    const invalidPath = join(launchResultsDir, 'legacy.result.json');
    try {
      writeFileSync(
        invalidPath,
        JSON.stringify({
          schema: 'narada.agent_start.result.v0',
          status: 'materialized',
        }),
        'utf8',
      );

      expect(() => readLaunchResults(launchResultsDir)).toThrow(invalidPath);
    } finally {
      rmSync(launchResultsDir, { recursive: true, force: true });
    }
  });

  it('deletes invalid historical artifacts once and records a reconciliation receipt', () => {
    const launchResultsDir = mkdtempSync(join(tmpdir(), 'launcher-runtime-results-'));
    const invalidPath = join(launchResultsDir, 'legacy.result.json');
    const validPath = join(launchResultsDir, 'current.result.json');
    try {
      writeFileSync(invalidPath, JSON.stringify({
        schema: 'narada.agent_start.result.v0',
        status: 'launching',
      }), 'utf8');
      writeFileSync(validPath, JSON.stringify({
        schema: 'narada.agent_start.result.v0',
        status: 'materialized',
        identity: 'resident',
        handoff: { session_ref: { id: 'runtime_current', kind: 'runtime' } },
        nars_launch: { runtime_session_id: 'runtime_current' },
      }), 'utf8');

      const first = reconcileLaunchResults(launchResultsDir);
      expect(first.status).toBe('completed');
      expect(first.deleted_artifacts).toHaveLength(1);
      expect(first.deleted_artifacts[0]?.path).toBe(invalidPath);
      expect(existsSync(invalidPath)).toBe(false);
      expect(existsSync(validPath)).toBe(true);
      const summaries = readLaunchResults(launchResultsDir);
      expect(summaries).toHaveLength(1);
      expect(summaries[0]?.session_ref).toEqual({ id: 'runtime_current', kind: 'runtime' });
      expect(summaries[0]?.runtime_session_id).toBe('runtime_current');

      const receiptPath = join(launchResultsDir, '..', 'agent-start-reconciliation', 'v1.json');
      expect(JSON.parse(readFileSync(receiptPath, 'utf8')).status).toBe('completed');
      expect(reconcileLaunchResults(launchResultsDir)).toEqual(first);
    } finally {
      rmSync(launchResultsDir, { recursive: true, force: true });
    }
  });

  it('reconciles schema-valid materialized results with incoherent handoffs', () => {
    const launchResultsDir = mkdtempSync(join(tmpdir(), 'launcher-runtime-results-'));
    const invalidPath = join(launchResultsDir, 'incoherent.result.json');
    try {
      writeFileSync(invalidPath, JSON.stringify({
        schema: 'narada.agent_start.result.v0',
        status: 'materialized',
        handoff: { session_ref: { id: 'runtime_expected', kind: 'runtime' } },
        nars_launch: { runtime_session_id: 'runtime_actual' },
      }), 'utf8');

      const receipt = reconcileLaunchResults(launchResultsDir);
      expect(receipt.deleted_artifacts[0]?.reason_code).toBe('materialized_result_session_ref_conflict');
      expect(existsSync(invalidPath)).toBe(false);
      expect(readLaunchResults(launchResultsDir)).toEqual([]);
    } finally {
      rmSync(launchResultsDir, { recursive: true, force: true });
    }
  });

  it('fails closed when the reconciliation receipt is malformed', () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), 'launcher-runtime-root-'));
    const launchResultsDir = join(runtimeRoot, 'agent-start-results');
    const receiptDir = join(runtimeRoot, 'agent-start-reconciliation');
    const receiptPath = join(receiptDir, 'v1.json');
    try {
      mkdirSync(launchResultsDir, { recursive: true });
      mkdirSync(receiptDir, { recursive: true });
      writeFileSync(receiptPath, '{not-json', 'utf8');

      expect(() => reconcileLaunchResults(launchResultsDir)).toThrow(
        `agent_start_result_reconciliation_receipt_invalid: ${receiptPath}`,
      );
      expect(existsSync(join(receiptDir, 'v1.lock'))).toBe(false);
    } finally {
      rmSync(runtimeRoot, { recursive: true, force: true });
    }
  });

  it('rejects a completed receipt belonging to another result directory', () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), 'launcher-runtime-root-'));
    const launchResultsDir = join(runtimeRoot, 'agent-start-results');
    const receiptDir = join(runtimeRoot, 'agent-start-reconciliation');
    const receiptPath = join(receiptDir, 'v1.json');
    try {
      mkdirSync(launchResultsDir, { recursive: true });
      mkdirSync(receiptDir, { recursive: true });
      writeFileSync(receiptPath, JSON.stringify({
        schema: 'narada.agent_start_result_reconciliation.v1',
        status: 'completed',
        version: 1,
        launch_results_dir: join(runtimeRoot, 'other-results'),
        started_at: '2026-07-14T00:00:00.000Z',
        completed_at: '2026-07-14T00:00:01.000Z',
        deleted_artifacts: [],
      }), 'utf8');

      expect(() => reconcileLaunchResults(launchResultsDir)).toThrow(
        `agent_start_result_reconciliation_receipt_invalid: ${receiptPath}`,
      );
      expect(existsSync(join(receiptDir, 'v1.lock'))).toBe(false);
    } finally {
      rmSync(runtimeRoot, { recursive: true, force: true });
    }
  });

  it('persists the canonical session reference in operator launch bindings', () => {
    const root = mkdtempSync(join(tmpdir(), 'launcher-runtime-binding-'));
    const bindingPath = join(root, 'binding.json');
    try {
      writeOperatorProjectionLaunchBinding(bindingPath, {
        status: 'ready',
        siteRoot: root,
        workspaceRoot: root,
        agent: 'sonar.resident',
        runtimeHostKind: 'narada-agent-runtime-server',
        sessionRef: { id: 'runtime_binding', kind: 'runtime' },
      });

      const binding = JSON.parse(readFileSync(bindingPath, 'utf8')) as {
        session_ref: { id: string; kind: string };
      };
      expect(binding.session_ref).toEqual({ id: 'runtime_binding', kind: 'runtime' });
      expect(sessionIdFromContract(binding)).toBe('runtime_binding');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
