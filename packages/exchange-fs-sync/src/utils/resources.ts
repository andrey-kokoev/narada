/**
 * Resource management for multi-mailbox sync
 * 
 * Tracks resource usage and prevents overload by throttling sync operations.
 */

import { getMemoryUsage } from "./memory.js";

/** Resource usage for a single sync operation */
export interface ResourceUsage {
  /** Memory usage in MB */
  memoryMB: number;
  /** Disk I/O operations per second */
  diskIOps: number;
  /** Network requests per second */
  networkRequestsPerSec: number;
}

/** Resource limits configuration */
export interface ResourceLimits {
  /** Maximum memory per sync in MB */
  maxMemoryMB: number;
  /** Maximum disk I/O per second */
  maxDiskIOPerSecond: number;
  /** Maximum network requests per second */
  maxNetworkRequestsPerSecond: number;
}

/** Default resource limits */
export const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  maxMemoryMB: 512,
  maxDiskIOPerSecond: 100,
  maxNetworkRequestsPerSecond: 50,
};

/** Resource manager for tracking and limiting resource usage */
export class ResourceManager {
  private readonly limits: ResourceLimits;
  private readonly activeSyncs: Map<string, ResourceUsage>;
  private readonly syncStartTimes: Map<string, number>;
  private readonly networkRequestTimestamps: Map<string, number[]>;
  private readonly diskIOTimestamps: Map<string, number[]>;

  constructor(limits: Partial<ResourceLimits> = {}) {
    this.limits = {
      ...DEFAULT_RESOURCE_LIMITS,
      ...limits,
    };
    this.activeSyncs = new Map();
    this.syncStartTimes = new Map();
    this.networkRequestTimestamps = new Map();
    this.diskIOTimestamps = new Map();
  }

  /**
   * Check if a new sync can be started
   * Returns true if resources are available
   */
  canStartSync(_scopeId: string): boolean {
    const currentMemory = this.getTotalMemoryUsage();
    const estimatedNewSyncMemory = this.limits.maxMemoryMB * 0.8; // Estimate 80% of limit for new sync

    // Check if adding a new sync would exceed memory limit
    if (currentMemory + estimatedNewSyncMemory > this.limits.maxMemoryMB * 2) {
      return false;
    }

    // Check network rate limit
    const totalNetworkRate = this.getTotalNetworkRate();
    if (totalNetworkRate > this.limits.maxNetworkRequestsPerSecond * 0.8) {
      return false;
    }

    // Check disk I/O rate limit
    const totalDiskRate = this.getTotalDiskRate();
    if (totalDiskRate > this.limits.maxDiskIOPerSecond * 0.8) {
      return false;
    }

    return true;
  }

  /**
   * Start tracking a new sync
   */
  trackSync(scopeId: string, initialUsage?: Partial<ResourceUsage>): void {
    const memory = getMemoryUsage();
    const usage: ResourceUsage = {
      memoryMB: initialUsage?.memoryMB ?? memory.heapUsedMB,
      diskIOps: initialUsage?.diskIOps ?? 0,
      networkRequestsPerSec: initialUsage?.networkRequestsPerSec ?? 0,
    };

    this.activeSyncs.set(scopeId, usage);
    this.syncStartTimes.set(scopeId, Date.now());
    this.networkRequestTimestamps.set(scopeId, []);
    this.diskIOTimestamps.set(scopeId, []);
  }

  /**
   * End tracking a sync
   */
  endSync(scopeId: string): ResourceUsage | undefined {
    const usage = this.activeSyncs.get(scopeId);
    
    this.activeSyncs.delete(scopeId);
    this.syncStartTimes.delete(scopeId);
    this.networkRequestTimestamps.delete(scopeId);
    this.diskIOTimestamps.delete(scopeId);

    return usage;
  }

  /**
   * Update resource usage for a sync
   */
  updateUsage(scopeId: string, usage: Partial<ResourceUsage>): void {
    const current = this.activeSyncs.get(scopeId);
    if (current) {
      this.activeSyncs.set(scopeId, {
        ...current,
        ...usage,
      });
    }
  }

  /**
   * Record a network request for rate tracking
   */
  recordNetworkRequest(scopeId: string): void {
    const timestamps = this.networkRequestTimestamps.get(scopeId);
    if (timestamps) {
      const now = Date.now();
      timestamps.push(now);
      // Clean up old timestamps (> 1 second)
      while (timestamps.length > 0 && timestamps[0] < now - 1000) {
        timestamps.shift();
      }
    }
  }

  /**
   * Record a disk I/O operation for rate tracking
   */
  recordDiskIO(scopeId: string): void {
    const timestamps = this.diskIOTimestamps.get(scopeId);
    if (timestamps) {
      const now = Date.now();
      timestamps.push(now);
      // Clean up old timestamps (> 1 second)
      while (timestamps.length > 0 && timestamps[0] < now - 1000) {
        timestamps.shift();
      }
    }
  }

  /**
   * Get current resource usage for a sync
   */
  getUsage(scopeId: string): ResourceUsage | undefined {
    return this.activeSyncs.get(scopeId);
  }

  /**
   * Get total memory usage across all active syncs
   */
  getTotalMemoryUsage(): number {
    let total = 0;
    for (const usage of this.activeSyncs.values()) {
      total += usage.memoryMB;
    }
    return total;
  }

  /**
   * Get total network requests per second across all syncs
   */
  getTotalNetworkRate(): number {
    let total = 0;
    for (const timestamps of this.networkRequestTimestamps.values()) {
      const now = Date.now();
      // Count requests in last second
      const recent = timestamps.filter(t => now - t < 1000);
      total += recent.length;
    }
    return total;
  }

  /**
   * Get total disk I/O per second across all syncs
   */
  getTotalDiskRate(): number {
    let total = 0;
    for (const timestamps of this.diskIOTimestamps.values()) {
      const now = Date.now();
      // Count I/O in last second
      const recent = timestamps.filter(t => now - t < 1000);
      total += recent.length;
    }
    return total;
  }

  /**
   * Get throttling delay in ms based on current resource pressure
   * Returns 0 if no throttling needed
   */
  getThrottlingDelay(): number {
    const memoryPressure = this.getMemoryPressure();
    const networkPressure = this.getNetworkPressure();
    const diskPressure = this.getDiskPressure();

    const maxPressure = Math.max(memoryPressure, networkPressure, diskPressure);

    if (maxPressure < 0.5) {
      return 0; // No throttling needed
    } else if (maxPressure < 0.7) {
      return 50; // Light throttling
    } else if (maxPressure < 0.85) {
      return 200; // Moderate throttling
    } else {
      return 500; // Heavy throttling
    }
  }

  /**
   * Get memory pressure as a ratio (0-1+)
   */
  getMemoryPressure(): number {
    const totalMemory = this.getTotalMemoryUsage();
    return totalMemory / (this.limits.maxMemoryMB * 2); // Assume 2 concurrent syncs as baseline
  }

  /**
   * Get network pressure as a ratio (0-1+)
   */
  getNetworkPressure(): number {
    const totalRate = this.getTotalNetworkRate();
    return totalRate / this.limits.maxNetworkRequestsPerSecond;
  }

  /**
   * Get disk I/O pressure as a ratio (0-1+)
   */
  getDiskPressure(): number {
    const totalRate = this.getTotalDiskRate();
    return totalRate / this.limits.maxDiskIOPerSecond;
  }

  /**
   * Get number of active syncs
   */
  getActiveSyncCount(): number {
    return this.activeSyncs.size;
  }

  /**
   * Get list of active mailbox IDs
   */
  getActiveScopeIds(): string[] {
    return Array.from(this.activeSyncs.keys());
  }

  /**
   * Get sync duration for a mailbox
   */
  getSyncDurationMs(scopeId: string): number | undefined {
    const startTime = this.syncStartTimes.get(scopeId);
    if (startTime) {
      return Date.now() - startTime;
    }
    return undefined;
  }

  /**
   * Get average resource usage per sync
   */
  getAverageUsage(): ResourceUsage {
    const count = this.activeSyncs.size;
    if (count === 0) {
      return {
        memoryMB: 0,
        diskIOps: 0,
        networkRequestsPerSec: 0,
      };
    }

    let totalMemory = 0;
    let totalDiskIO = 0;
    let totalNetwork = 0;

    for (const usage of this.activeSyncs.values()) {
      totalMemory += usage.memoryMB;
      totalDiskIO += usage.diskIOps;
      totalNetwork += usage.networkRequestsPerSec;
    }

    return {
      memoryMB: Math.round(totalMemory / count),
      diskIOps: Math.round(totalDiskIO / count),
      networkRequestsPerSec: Math.round(totalNetwork / count),
    };
  }

  /**
   * Get a summary of current resource state
   */
  getSummary(): {
    activeSyncs: number;
    totalMemoryMB: number;
    networkRate: number;
    diskRate: number;
    memoryPressure: number;
    networkPressure: number;
    diskPressure: number;
    throttlingDelayMs: number;
  } {
    return {
      activeSyncs: this.getActiveSyncCount(),
      totalMemoryMB: this.getTotalMemoryUsage(),
      networkRate: this.getTotalNetworkRate(),
      diskRate: this.getTotalDiskRate(),
      memoryPressure: this.getMemoryPressure(),
      networkPressure: this.getNetworkPressure(),
      diskPressure: this.getDiskPressure(),
      throttlingDelayMs: this.getThrottlingDelay(),
    };
  }
}

/** Global resource manager instance */
let globalResourceManager: ResourceManager | undefined;

/**
 * Get or create the global resource manager
 */
export function getGlobalResourceManager(limits?: Partial<ResourceLimits>): ResourceManager {
  if (!globalResourceManager) {
    globalResourceManager = new ResourceManager(limits);
  }
  return globalResourceManager;
}

/**
 * Reset the global resource manager (for testing)
 */
export function resetGlobalResourceManager(): void {
  globalResourceManager = undefined;
}
