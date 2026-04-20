/**
 * Verification State Model
 *
 * Reads `.ai/metrics/test-runtimes.json` and provides
 * freshness, outlier, and summary queries.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface VerificationRecord {
  command: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  exitStatus: number | null;
  classification:
    | 'success'
    | 'assertion-failure'
    | 'infrastructure-failure'
    | 'known-teardown-noise';
  summary?: string;
  freshness: 'fresh' | 'stale' | 'unknown';
}

interface TelemetryEntry {
  command: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  exitStatus: number | null;
  classification: VerificationRecord['classification'];
  summary?: string;
}

const FRESHNESS_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const OUTLIER_THRESHOLD_MULTIPLIER = 3;

function getMetricsPath(cwd: string): string {
  return join(cwd, '.ai', 'metrics', 'test-runtimes.json');
}

function loadTelemetry(cwd: string): TelemetryEntry[] {
  const path = getMetricsPath(cwd);
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, 'utf8');
    return JSON.parse(raw) as TelemetryEntry[];
  } catch {
    return [];
  }
}

function deriveFreshness(entry: TelemetryEntry): VerificationRecord['freshness'] {
  const finished = new Date(entry.finishedAt).getTime();
  if (Number.isNaN(finished)) return 'unknown';
  return Date.now() - finished < FRESHNESS_THRESHOLD_MS ? 'fresh' : 'stale';
}



export function loadVerificationHistory(cwd: string): VerificationRecord[] {
  const entries = loadTelemetry(cwd);
  return entries.map((e) => ({
    command: e.command,
    startedAt: e.startedAt,
    finishedAt: e.finishedAt,
    durationMs: e.durationMs,
    exitStatus: e.exitStatus,
    classification: e.classification,
    summary: e.summary,
    freshness: deriveFreshness(e),

  }));
}

export function getRecentRuns(
  cwd: string,
  limit = 10,
): VerificationRecord[] {
  return loadVerificationHistory(cwd).slice(-limit);
}

export function getFreshRuns(cwd: string): VerificationRecord[] {
  return loadVerificationHistory(cwd).filter((r) => r.freshness === 'fresh');
}

export function getStaleRuns(cwd: string): VerificationRecord[] {
  return loadVerificationHistory(cwd).filter((r) => r.freshness === 'stale');
}

export interface OutlierCommand {
  command: string;
  durationMs: number;
  medianDurationMs: number;
  multiplier: number;
}

export function getOutlierCommands(cwd: string): OutlierCommand[] {
  const history = loadVerificationHistory(cwd);
  if (history.length === 0) return [];

  const byCommand = new Map<string, number[]>();
  for (const entry of history) {
    const durations = byCommand.get(entry.command) ?? [];
    durations.push(entry.durationMs);
    byCommand.set(entry.command, durations);
  }

  const outliers: OutlierCommand[] = [];
  for (const [command, durations] of byCommand) {
    if (durations.length < 3) continue;
    const sorted = [...durations].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (median === 0) continue;
    const last = sorted[sorted.length - 1];
    const multiplier = last / median;
    if (multiplier >= OUTLIER_THRESHOLD_MULTIPLIER) {
      outliers.push({ command, durationMs: last, medianDurationMs: median, multiplier });
    }
  }

  return outliers.sort((a, b) => b.multiplier - a.multiplier);
}

export function getSlowestCommands(cwd: string, limit = 5): VerificationRecord[] {
  const history = loadVerificationHistory(cwd);
  return [...history].sort((a, b) => b.durationMs - a.durationMs).slice(0, limit);
}

export function getCommandHistory(
  cwd: string,
  command: string,
): VerificationRecord[] {
  return loadVerificationHistory(cwd).filter((r) => r.command === command);
}
