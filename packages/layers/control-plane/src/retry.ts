/**
 * Retry layer with exponential backoff, jitter, and circuit breaker
 */

import {
  ErrorCode,
  ExchangeFSSyncError,
  RateLimitError,
  classifyGraphError,
  wrapError,
} from "./errors.js";

export interface RetryConfig {
  maxAttempts: number; // default: 3
  baseDelayMs: number; // default: 1000
  maxDelayMs: number; // default: 30000
  backoffMultiplier: number; // default: 2
  retryableErrors: ErrorCode[]; // error codes that trigger retry
  jitterFactor: number; // default: 0.1 (10% randomization)
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: [
    ErrorCode.GRAPH_RATE_LIMIT,
    ErrorCode.GRAPH_SERVER_ERROR,
    ErrorCode.GRAPH_NETWORK_ERROR,
    ErrorCode.STORAGE_WRITE_FAILED,
    ErrorCode.STORAGE_READ_FAILED,
    ErrorCode.UNKNOWN,
  ],
  jitterFactor: 0.1,
};

export interface CircuitBreakerConfig {
  failureThreshold: number; // consecutive failures before opening
  resetTimeoutMs: number; // time before attempting half-open
  halfOpenMaxCalls: number; // max calls in half-open state
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  halfOpenMaxCalls: 3,
};

type CircuitState = "closed" | "open" | "half-open";

interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  lastFailureTime: number;
  halfOpenCalls: number;
}

/**
 * Circuit breaker for fail-fast after consecutive failures
 */
export class CircuitBreaker {
  private state: CircuitBreakerState;
  private readonly config: CircuitBreakerConfig;

  constructor(_name: string, config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
    this.state = {
      state: "closed",
      failures: 0,
      lastFailureTime: 0,
      halfOpenCalls: 0,
    };
  }

  private shouldAttemptReset(): boolean {
    return Date.now() - this.state.lastFailureTime >= this.config.resetTimeoutMs;
  }

  private transitionTo(newState: CircuitState): void {
    this.state.state = newState;

    if (newState === "closed") {
      this.state.failures = 0;
      this.state.halfOpenCalls = 0;
    } else if (newState === "half-open") {
      this.state.halfOpenCalls = 0;
    }
  }

  /**
   * Check if the circuit allows requests through
   */
  canExecute(): boolean {
    if (this.state.state === "closed") {
      return true;
    }

    if (this.state.state === "open") {
      if (this.shouldAttemptReset()) {
        this.transitionTo("half-open");
        this.state.halfOpenCalls++;
        return true;
      }
      return false;
    }

    // half-open
    if (this.state.halfOpenCalls >= this.config.halfOpenMaxCalls) {
      return false;
    }
    this.state.halfOpenCalls++;
    return true;
  }

  /**
   * Record a successful call
   */
  recordSuccess(): void {
    if (this.state.state === "half-open") {
      this.transitionTo("closed");
    } else if (this.state.state === "closed") {
      this.state.failures = 0;
    }
  }

  /**
   * Record a failed call
   */
  recordFailure(): void {
    this.state.failures++;
    this.state.lastFailureTime = Date.now();

    if (this.state.state === "half-open") {
      this.transitionTo("open");
    } else if (
      this.state.state === "closed" &&
      this.state.failures >= this.config.failureThreshold
    ) {
      this.transitionTo("open");
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    if (this.state.state === "open" && this.shouldAttemptReset()) {
      return "half-open";
    }
    return this.state.state;
  }

  /**
   * Get circuit breaker metrics
   */
  getMetrics(): {
    state: CircuitState;
    consecutiveFailures: number;
    lastFailureTime: number;
  } {
    return {
      state: this.getState(),
      consecutiveFailures: this.state.failures,
      lastFailureTime: this.state.lastFailureTime,
    };
  }
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  backoffMultiplier: number,
  jitterFactor: number,
): number {
  // Exponential backoff
  const exponentialDelay = baseDelayMs * Math.pow(backoffMultiplier, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  // Add jitter (±jitterFactor)
  const jitter = cappedDelay * jitterFactor * (Math.random() * 2 - 1);

  return Math.max(0, Math.floor(cappedDelay + jitter));
}

/**
 * Check if an error is retryable based on configuration
 */
function isRetryableError(
  error: unknown,
  retryableCodes: ErrorCode[],
): { retryable: boolean; retryAfterMs?: number } {
  if (error instanceof RateLimitError) {
    return { retryable: true, retryAfterMs: error.retryAfterMs };
  }

  if (error instanceof ExchangeFSSyncError) {
    return {
      retryable:
        error.recoverable && retryableCodes.includes(error.code),
      retryAfterMs:
        error.code === ErrorCode.GRAPH_RATE_LIMIT
          ? (error.metadata.retryAfterMs as number | undefined) ?? 60000
          : undefined,
    };
  }

  // Network errors are generally retryable
  if (error instanceof Error) {
    const networkErrors = [
      "ETIMEDOUT",
      "ECONNRESET",
      "ECONNREFUSED",
      "ENOTFOUND",
      "EAI_AGAIN",
    ];
    if (
      "code" in error &&
      networkErrors.includes((error as NodeJS.ErrnoException).code ?? "")
    ) {
      return { retryable: true };
    }

    return { retryable: true };
  }

  return { retryable: false };
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: ExchangeFSSyncError;
  attempts: number;
  totalDelayMs: number;
}

export interface RetryContext {
  circuitBreaker?: CircuitBreaker;
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
  onCircuitOpen?: () => void;
}

/**
 * Execute an operation with retry logic
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config?: Partial<RetryConfig>,
  context?: string,
  retryContext?: RetryContext,
): Promise<T> {
  const mergedConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const circuitBreaker = retryContext?.circuitBreaker;

  // Check circuit breaker
  if (circuitBreaker && !circuitBreaker.canExecute()) {
    const metrics = circuitBreaker.getMetrics();
    const error = new ExchangeFSSyncError(
      `Circuit breaker open for ${context}: too many consecutive failures`,
      {
        code: ErrorCode.SYNC_PHASE_FAILED,
        recoverable: true,
        phase: context ?? "unknown",
        metadata: { circuitState: metrics.state, consecutiveFailures: metrics.consecutiveFailures },
      },
    );
    retryContext?.onCircuitOpen?.();
    throw error;
  }

  let lastError: unknown;
  let totalDelayMs = 0;

  for (let attempt = 1; attempt <= mergedConfig.maxAttempts; attempt++) {
    try {
      const result = await operation();

      // Record success in circuit breaker
      if (circuitBreaker) {
        circuitBreaker.recordSuccess();
      }

      return result;
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      const { retryable, retryAfterMs } = isRetryableError(
        error,
        mergedConfig.retryableErrors,
      );

      if (!retryable || attempt === mergedConfig.maxAttempts) {
        // Record failure in circuit breaker
        if (circuitBreaker) {
          circuitBreaker.recordFailure();
        }

        // Wrap and throw
        throw wrapError(error, {
          phase: context ?? "unknown",
          operation: "withRetry",
        });
      }

      // Calculate delay
      const delayMs =
        retryAfterMs ??
        calculateDelay(
          attempt,
          mergedConfig.baseDelayMs,
          mergedConfig.maxDelayMs,
          mergedConfig.backoffMultiplier,
          mergedConfig.jitterFactor,
        );

      totalDelayMs += delayMs;

      // Wait before retrying
      await sleep(delayMs);

      // Notify retry callback after the scheduled delay has elapsed.
      retryContext?.onRetry?.(attempt, delayMs, error);
    }
  }

  // Should never reach here, but TypeScript needs it
  throw wrapError(lastError, {
    phase: context ?? "unknown",
    operation: "withRetry",
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a wrapped version of a function with retry behavior
 */
export function withRetryFn<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  config?: Partial<RetryConfig>,
  context?: string,
  circuitBreaker?: CircuitBreaker,
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs) => {
    return withRetry(
      () => fn(...args),
      config,
      context,
      circuitBreaker ? { circuitBreaker } : undefined,
    );
  };
}

/**
 * Classify and wrap Graph API errors
 */
export function handleGraphError(
  status: number,
  responseText: string,
  context: { phase: string; operation?: string },
): never {
  const classified = classifyGraphError(status, responseText);

  if (classified.code === ErrorCode.GRAPH_RATE_LIMIT) {
    throw new RateLimitError(
      `Graph API rate limited (${status}): ${responseText.slice(0, 200)}`,
      classified.retryAfterMs ?? 60000,
      { phase: context.phase, metadata: { operation: context.operation, status } },
    );
  }

  const error = new ExchangeFSSyncError(
    `Graph API error (${status}): ${responseText.slice(0, 200)}`,
    {
      code: classified.code,
      recoverable: classified.recoverable,
      phase: context.phase,
      metadata: { operation: context.operation, status, response: responseText.slice(0, 500) },
    },
  );

  throw error;
}

/**
 * Global circuit breakers for different operations
 */
export const globalCircuitBreakers = {
  graphApi: new CircuitBreaker("graph-api", { failureThreshold: 5, resetTimeoutMs: 60000 }),
  storage: new CircuitBreaker("storage", { failureThreshold: 3, resetTimeoutMs: 30000 }),
  sync: new CircuitBreaker("sync", { failureThreshold: 3, resetTimeoutMs: 60000 }),
};

/**
 * Reset all global circuit breakers (useful for testing)
 */
export function resetCircuitBreakers(): void {
  globalCircuitBreakers.graphApi = new CircuitBreaker("graph-api");
  globalCircuitBreakers.storage = new CircuitBreaker("storage");
  globalCircuitBreakers.sync = new CircuitBreaker("sync");
}
