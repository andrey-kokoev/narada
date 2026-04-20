/**
 * narada verify status
 *
 * Summarizes recent verification runs and flags slow/outlier commands.
 */

import { ExitCode } from '../lib/exit-codes.js';
import type { CommandContext } from '../lib/command-wrapper.js';
import {
  getRecentRuns,
  getFreshRuns,
  getStaleRuns,
  getOutlierCommands,
  getSlowestCommands,
} from '../lib/verification-state.js';

export interface VerifyStatusOptions {
  format?: string;
  cwd?: string;
}

export async function verifyStatusCommand(
  options: VerifyStatusOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? options.cwd : process.cwd();
  const recent = getRecentRuns(cwd, 10);
  const fresh = getFreshRuns(cwd);
  const stale = getStaleRuns(cwd);
  const outliers = getOutlierCommands(cwd);
  const slowest = getSlowestCommands(cwd, 5);

  const result = {
    status: 'ok',
    summary: {
      total_recorded: recent.length,
      fresh_runs: fresh.length,
      stale_runs: stale.length,
      outlier_commands: outliers.length,
    },
    recent_runs: recent.map((r) => ({
      command: r.command,
      duration_sec: (r.durationMs / 1000).toFixed(1),
      classification: r.classification,
      freshness: r.freshness,
      finished_at: r.finishedAt,
    })),
    slowest_commands: slowest.map((r) => ({
      command: r.command,
      duration_sec: (r.durationMs / 1000).toFixed(1),
      classification: r.classification,
    })),
    outliers: outliers.map((o) => ({
      command: o.command,
      last_duration_sec: (o.durationMs / 1000).toFixed(1),
      median_duration_sec: (o.medianDurationMs / 1000).toFixed(1),
      multiplier: o.multiplier.toFixed(1),
    })),
  };

  return { exitCode: ExitCode.SUCCESS, result };
}
