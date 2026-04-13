/**
 * Batch/Stream processing for memory-efficient sync
 * Processes messages in batches to avoid loading everything into memory
 */

import type { NormalizedEvent } from "../types/normalized.js";
import type { GraphAdapter, CursorStore, ApplyLogStore, Projector } from "../types/runtime.js";
import { getMemoryUsage, MemoryMonitor } from "../utils/memory.js";
import { sleep } from "../utils/timing.js";

/**
 * Progress information during sync
 */
export interface SyncProgress {
  /** Number of events fetched from API */
  eventsFetched: number;
  /** Number of events processed (applied or skipped) */
  eventsProcessed: number;
  /** Number of events successfully applied */
  eventsApplied: number;
  /** Number of events skipped (already applied) */
  eventsSkipped: number;
  /** Current batch number */
  currentBatch: number;
  /** Total batches (estimated, may change) */
  totalBatches?: number;
  /** Memory usage in MB */
  memoryUsedMB: number;
  /** Estimated time remaining in ms */
  etaMs?: number;
  /** Current phase */
  phase: "fetch" | "process" | "commit" | "cleanup";
  /** Any warning message */
  warning?: string;
}

/**
 * Options for batch sync
 */
export interface BatchSyncOptions {
  /** Number of events to process in each batch (default: 100) */
  batchSize?: number;
  /** Maximum concurrent batch processing (default: 1) */
  maxConcurrency?: number;
  /** Progress callback */
  onProgress?: (progress: SyncProgress) => void;
  /** Error callback - return true to continue, false to abort */
  onError?: (error: Error, event?: NormalizedEvent) => boolean;
  /** Enable memory monitoring (default: true) */
  enableMemoryMonitor?: boolean;
  /** Memory growth threshold in MB before warning (default: 500) */
  memoryThresholdMB?: number;
  /** Backpressure threshold - pause if this many batches are ahead (default: 3) */
  backpressureThreshold?: number;
  /** Delay between batches in ms (default: 0) */
  batchDelayMs?: number;
  /** Continue on recoverable errors (default: false) */
  continueOnError?: boolean;
}

/**
 * Result of batch sync operation
 */
export interface BatchSyncResult {
  success: boolean;
  eventsFetched: number;
  eventsProcessed: number;
  eventsApplied: number;
  eventsSkipped: number;
  durationMs: number;
  error?: Error;
  /** Final cursor position */
  finalCursor?: string | null;
  /** Memory stats */
  memoryStats: {
    initialMB: number;
    peakMB: number;
    finalMB: number;
  };
}

/**
 * Process events in batches with memory-efficient streaming
 */
export async function batchSync(
  adapter: GraphAdapter,
  cursorStore: CursorStore,
  applyLogStore: ApplyLogStore,
  projector: Projector,
  options: BatchSyncOptions = {},
): Promise<BatchSyncResult> {
  const startTime = Date.now();
  const batchSize = options.batchSize ?? 100;
  const backpressureThreshold = options.backpressureThreshold ?? 3;
  const batchDelayMs = options.batchDelayMs ?? 0;
  const enableMemoryMonitor = options.enableMemoryMonitor ?? true;

  // Memory monitoring
  const memoryMonitor = enableMemoryMonitor ? new MemoryMonitor() : null;
  const initialMemory = getMemoryUsage();
  let peakMemory = initialMemory.heapUsedMB;

  if (memoryMonitor) {
    memoryMonitor.start();
  }

  // Stats tracking
  let eventsFetched = 0;
  let eventsProcessed = 0;
  let eventsApplied = 0;
  let eventsSkipped = 0;
  let currentBatch = 0;
  let error: Error | undefined;

  // Read current cursor
  const priorCursor = await cursorStore.read();
  let finalCursor: string | null = priorCursor;

  // Fetch initial batch
  const reportProgress = (phase: SyncProgress["phase"], warning?: string) => {
    if (options.onProgress) {
      const memory = getMemoryUsage();
      peakMemory = Math.max(peakMemory, memory.heapUsedMB);

      const elapsed = Date.now() - startTime;
      const rate = eventsProcessed > 0 ? elapsed / eventsProcessed : 0;
      const remaining = eventsFetched - eventsProcessed;
      const etaMs = remaining > 0 && rate > 0 ? remaining * rate : undefined;

      options.onProgress({
        eventsFetched,
        eventsProcessed,
        eventsApplied,
        eventsSkipped,
        currentBatch,
        memoryUsedMB: memory.heapUsedMB,
        etaMs,
        phase,
        warning,
      });
    }
  };

  try {
    reportProgress("fetch");
    const batch = await adapter.fetch_since(priorCursor);

    eventsFetched = batch.events.length;
    finalCursor = batch.next_cursor ?? priorCursor;

    if (batch.events.length === 0) {
      return {
        success: true,
        eventsFetched: 0,
        eventsProcessed: 0,
        eventsApplied: 0,
        eventsSkipped: 0,
        durationMs: Date.now() - startTime,
        finalCursor,
        memoryStats: {
          initialMB: initialMemory.heapUsedMB,
          peakMB: initialMemory.heapUsedMB,
          finalMB: getMemoryUsage().heapUsedMB,
        },
      };
    }

    // Process events in batches
    for (let i = 0; i < batch.events.length; i += batchSize) {
      currentBatch++;
      const batchEvents = batch.events.slice(i, i + batchSize);

      reportProgress("process");

      // Check memory before processing
      if (memoryMonitor) {
        const memoryCheck = memoryMonitor.check();
        if (!memoryCheck.ok) {
          const warning = `Memory growth warning: ${memoryCheck.growthMB}MB since start`;
          reportProgress("process", warning);

          // Force garbage collection if available
          if (global.gc) {
            global.gc();
          }
        }
      }

      // Process batch
      for (const event of batchEvents) {
        try {
          const alreadyApplied = await applyLogStore.hasApplied(event.event_id);

          if (alreadyApplied) {
            eventsSkipped++;
            eventsProcessed++;
            continue;
          }

          const result = await projector.applyEvent(event);

          if (result.applied) {
            await applyLogStore.markApplied(event);
            eventsApplied++;
          }

          eventsProcessed++;
        } catch (eventError) {
          const shouldContinue = options.onError?.(
            eventError as Error,
            event,
          ) ?? options.continueOnError;

          if (!shouldContinue) {
            throw eventError;
          }

          eventsProcessed++;
        }
      }

      // Backpressure: pause if we're getting too far ahead
      const batchesAhead = currentBatch - Math.floor(eventsProcessed / batchSize);
      if (batchesAhead > backpressureThreshold) {
        await sleep(100);
      }

      // Optional delay between batches
      if (batchDelayMs > 0 && i + batchSize < batch.events.length) {
        await sleep(batchDelayMs);
      }
    }

    // Commit cursor
    reportProgress("commit");
    if (batch.next_cursor) {
      await cursorStore.commit(batch.next_cursor);
      finalCursor = batch.next_cursor;
    }

    reportProgress("cleanup");

    const finalMemory = getMemoryUsage();
    peakMemory = Math.max(peakMemory, finalMemory.heapUsedMB);

    return {
      success: true,
      eventsFetched,
      eventsProcessed,
      eventsApplied,
      eventsSkipped,
      durationMs: Date.now() - startTime,
      finalCursor,
      memoryStats: {
        initialMB: initialMemory.heapUsedMB,
        peakMB: peakMemory,
        finalMB: finalMemory.heapUsedMB,
      },
    };
  } catch (syncError) {
    error = syncError as Error;

    const finalMemory = getMemoryUsage();
    peakMemory = Math.max(peakMemory, finalMemory.heapUsedMB);

    return {
      success: false,
      eventsFetched,
      eventsProcessed,
      eventsApplied,
      eventsSkipped,
      durationMs: Date.now() - startTime,
      error,
      finalCursor,
      memoryStats: {
        initialMB: initialMemory.heapUsedMB,
        peakMB: peakMemory,
        finalMB: finalMemory.heapUsedMB,
      },
    };
  }
}

/**
 * Stream events from adapter in chunks
 * This is a generator that yields batches of events
 */
export async function* streamEvents(
  adapter: GraphAdapter,
  cursorStore: CursorStore,
  options: {
    /** Maximum events per fetch (default: 100) */
    pageSize?: number;
    /** Stop after this many events (default: unlimited) */
    maxEvents?: number;
  } = {},
): AsyncGenerator<NormalizedEvent[], void, unknown> {
  const pageSize = options.pageSize ?? 100;
  const maxEvents = options.maxEvents ?? Infinity;

  let cursor = await cursorStore.read();
  let totalFetched = 0;

  while (totalFetched < maxEvents) {
    const batch = await adapter.fetch_since(cursor);

    if (batch.events.length === 0) {
      break;
    }

    // Yield in chunks of pageSize
    for (let i = 0; i < batch.events.length; i += pageSize) {
      if (totalFetched >= maxEvents) break;

      const chunk = batch.events.slice(i, Math.min(i + pageSize, batch.events.length));
      yield chunk;
      totalFetched += chunk.length;
    }

    cursor = batch.next_cursor ?? null;

    if (!cursor) {
      break;
    }
  }
}

/**
 * Process events with concurrency control
 */
export async function processEventsConcurrently(
  events: NormalizedEvent[],
  processor: (event: NormalizedEvent) => Promise<void>,
  options: {
    /** Maximum concurrent operations (default: 5) */
    concurrency?: number;
    /** Delay between starting operations in ms (default: 0) */
    staggerMs?: number;
  } = {},
): Promise<{ processed: number; errors: Array<{ event: NormalizedEvent; error: Error }> }> {
  const concurrency = options.concurrency ?? 5;
  const staggerMs = options.staggerMs ?? 0;

  const errors: Array<{ event: NormalizedEvent; error: Error }> = [];
  let processed = 0;

  // Process in chunks with limited concurrency
  for (let i = 0; i < events.length; i += concurrency) {
    const chunk = events.slice(i, i + concurrency);

    const results = await Promise.allSettled(
      chunk.map(async (event, index) => {
        if (staggerMs > 0) {
          await sleep(index * staggerMs);
        }
        await processor(event);
      }),
    );

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        processed++;
      } else {
        errors.push({ event: chunk[index]!, error: result.reason as Error });
      }
    });
  }

  return { processed, errors };
}

/**
 * Create a throttled function that limits execution rate
 */
export function createThrottledFunction<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  options: {
    /** Maximum calls per interval (default: 10) */
    maxCalls?: number;
    /** Interval in ms (default: 1000) */
    intervalMs?: number;
  } = {},
): (...args: T) => Promise<R> {
  const maxCalls = options.maxCalls ?? 10;
  const intervalMs = options.intervalMs ?? 1000;

  const calls: number[] = [];

  return async (...args: T): Promise<R> => {
    const now = Date.now();

    // Remove old calls outside the interval
    while (calls.length > 0 && calls[0]! < now - intervalMs) {
      calls.shift();
    }

    // If at limit, wait
    if (calls.length >= maxCalls) {
      const waitTime = calls[0]! + intervalMs - now;
      await sleep(waitTime);
    }

    calls.push(Date.now());
    return fn(...args);
  };
}

// Re-export sleep for convenience
export { sleep };
