/**
 * Health check file management
 *
 * Extended with control-plane dispatch visibility (Task 122).
 */

import { writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

export interface ScopeReadinessSnapshot {
  dispatchReady: boolean;
  outboundHealthy: boolean;
  workersRegistered: boolean;
  syncFresh: boolean;
}

export interface ScopeHealthSnapshot {
  scopeId: string;
  openWorkItems: number;
  leasedWorkItems: number;
  executingWorkItems: number;
  failedRetryableWorkItems: number;
  failedTerminalWorkItems: number;
  pendingOutboundHandoffs: number;
  recentDecisionsCount: number;
  readiness: ScopeReadinessSnapshot;
}

export interface HealthThresholds {
  maxStalenessMs: number;
  maxConsecutiveErrors: number;
}

export interface StuckItemHealthEntry {
  classification: string;
  count: number;
}

export interface HealthStatus {
  status: 'healthy' | 'stopped' | 'error';
  lastSyncAt?: string;
  lastDispatchAt?: string;
  cyclesCompleted: number;
  eventsApplied: number;
  errors: number;
  consecutiveErrors: number;
  pid: number;
  /** Control-plane fields */
  openWorkItems?: number;
  leasedWorkItems?: number;
  executingWorkItems?: number;
  failedRetryableWorkItems?: number;
  failedTerminalWorkItems?: number;
  pendingOutboundHandoffs?: number;
  /** Stuck-item detection (Task 235) */
  stuck_items?: {
    work_items: StuckItemHealthEntry[];
    outbound_handoffs: StuckItemHealthEntry[];
  };
  /** Readiness contract (Task 234) */
  readiness?: {
    dispatchReady: boolean;
    outboundHealthy: boolean;
    workersRegistered: boolean;
    syncFresh: boolean;
  };
  /** Staleness indicator */
  isStale?: boolean;
  /** Configured thresholds */
  thresholds?: HealthThresholds;
  /** Per-scope breakdown */
  scopes?: ScopeHealthSnapshot[];
  timestamp: string;
}

export interface HealthFileOptions {
  rootDir: string;
  filename?: string;
}

export class HealthFile {
  private readonly filepath: string;

  constructor(options: HealthFileOptions) {
    const filename = options.filename ?? '.health.json';
    this.filepath = join(options.rootDir, filename);
  }

  /**
   * Update health file with current status
   */
  async update(status: Omit<HealthStatus, 'timestamp'>): Promise<void> {
    const health: HealthStatus = {
      ...status,
      timestamp: new Date().toISOString(),
    };

    await writeFile(this.filepath, JSON.stringify(health, null, 2) + '\n', 'utf8');
  }

  /**
   * Mark as stopped and clean up
   */
  async markStopped(finalStatus: Omit<HealthStatus, 'status' | 'timestamp'>): Promise<void> {
    const health: HealthStatus = {
      ...finalStatus,
      status: 'stopped',
      timestamp: new Date().toISOString(),
    };

    await writeFile(this.filepath, JSON.stringify(health, null, 2) + '\n', 'utf8');
  }

  /**
   * Remove health file
   */
  async remove(): Promise<void> {
    try {
      await rm(this.filepath);
    } catch {
      // Ignore errors (file may not exist)
    }
  }

  /**
   * Get health file path
   */
  get path(): string {
    return this.filepath;
  }
}
