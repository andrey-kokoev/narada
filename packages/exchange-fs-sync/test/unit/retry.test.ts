import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  withRetry,
  CircuitBreaker,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  resetCircuitBreakers,
  globalCircuitBreakers,
  handleGraphError,
} from "../../src/retry.js";
import {
  ExchangeFSSyncError,
  ErrorCode,
  RateLimitError,
  NetworkError,
} from "../../src/errors.js";

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetCircuitBreakers();
  });

  it("returns result on successful operation", async () => {
    const operation = vi.fn().mockResolvedValue("success");
    const promise = withRetry(operation, { maxAttempts: 3 }, "test");

    const result = await promise;
    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("retries on retryable error and succeeds", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce("success");

    const promise = withRetry(
      operation,
      { maxAttempts: 3, baseDelayMs: 100, jitterFactor: 0 },
      "test",
    );

    // Fast-forward past the delay
    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;
    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("throws after max attempts exceeded", async () => {
    const error = new ExchangeFSSyncError("persistent error", {
      code: ErrorCode.GRAPH_SERVER_ERROR,
      recoverable: true,
      phase: "test",
    });

    const operation = vi.fn().mockRejectedValue(error);

    const promise = withRetry(
      operation,
      { maxAttempts: 3, baseDelayMs: 100, jitterFactor: 0 },
      "test",
    );
    const expectation = expect(promise).rejects.toThrow(ExchangeFSSyncError);

    // Fast-forward past all delays
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);

    await expectation;
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-recoverable errors", async () => {
    const error = new ExchangeFSSyncError("auth failed", {
      code: ErrorCode.GRAPH_AUTH_FAILED,
      recoverable: false,
      phase: "test",
    });

    const operation = vi.fn().mockRejectedValue(error);

    await expect(
      withRetry(operation, { maxAttempts: 3 }, "test"),
    ).rejects.toThrow();

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("uses custom retry delay for rate limit errors", async () => {
    const rateLimitError = new RateLimitError("rate limited", 5000, {
      phase: "test",
    });

    const operation = vi
      .fn()
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce("success");

    const onRetry = vi.fn();
    const promise = withRetry(
      operation,
      { maxAttempts: 3, baseDelayMs: 100 },
      "test",
      { onRetry },
    );

    // Should use the rate limit's retryAfterMs
    await vi.advanceTimersByTimeAsync(5000);

    await promise;
    expect(onRetry).toHaveBeenCalledWith(1, 5000, rateLimitError);
  });

  it("calls onRetry callback on each retry", async () => {
    const onRetry = vi.fn();
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("error1"))
      .mockRejectedValueOnce(new Error("error2"))
      .mockResolvedValueOnce("success");

    const promise = withRetry(
      operation,
      { maxAttempts: 3, baseDelayMs: 100, jitterFactor: 0 },
      "test",
      { onRetry },
    );

    await vi.advanceTimersByTimeAsync(100);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Number), expect.any(Error));

    await vi.advanceTimersByTimeAsync(200);
    expect(onRetry).toHaveBeenCalledTimes(2);

    await promise;
  });
});

describe("CircuitBreaker", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("starts in closed state", () => {
    const cb = new CircuitBreaker("test");
    expect(cb.getState()).toBe("closed");
    expect(cb.canExecute()).toBe(true);
  });

  it("opens after threshold failures", () => {
    const cb = new CircuitBreaker("test", { failureThreshold: 3 });

    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe("closed");

    cb.recordFailure();
    expect(cb.getState()).toBe("open");
    expect(cb.canExecute()).toBe(false);
  });

  it("resets to closed after success in half-open", async () => {
    const cb = new CircuitBreaker("test", {
      failureThreshold: 1,
      resetTimeoutMs: 50,
    });

    cb.recordFailure();
    expect(cb.getState()).toBe("open");

    // Wait for reset timeout
    await new Promise((r) => setTimeout(r, 60));

    // Now in half-open
    expect(cb.canExecute()).toBe(true);

    cb.recordSuccess();
    expect(cb.getState()).toBe("closed");
  });

  it("returns to open if half-open call fails", async () => {
    const cb = new CircuitBreaker("test", {
      failureThreshold: 1,
      resetTimeoutMs: 50,
    });

    cb.recordFailure();
    expect(cb.getState()).toBe("open");

    await new Promise((r) => setTimeout(r, 60));

    // In half-open, call fails
    cb.recordFailure();
    expect(cb.getState()).toBe("open");
  });

  it("limits calls in half-open state", async () => {
    const cb = new CircuitBreaker("test", {
      failureThreshold: 1,
      resetTimeoutMs: 50,
      halfOpenMaxCalls: 2,
    });

    cb.recordFailure();
    await new Promise((r) => setTimeout(r, 60));

    expect(cb.canExecute()).toBe(true);
    expect(cb.canExecute()).toBe(true);
    expect(cb.canExecute()).toBe(false); // Exceeded half-open limit
  });

  it("provides metrics", () => {
    const cb = new CircuitBreaker("test", { failureThreshold: 5 });

    cb.recordFailure();
    cb.recordFailure();

    const metrics = cb.getMetrics();
    expect(metrics.consecutiveFailures).toBe(2);
    expect(metrics.state).toBe("closed");
    expect(metrics.lastFailureTime).toBeGreaterThan(0);
  });
});

describe("handleGraphError", () => {
  it("throws RateLimitError for 429", () => {
    expect(() =>
      handleGraphError(429, "Too many requests", { phase: "fetch" }),
    ).toThrow(RateLimitError);
  });

  it("throws non-recoverable error for 401", () => {
    try {
      handleGraphError(401, "Unauthorized", { phase: "fetch" });
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ExchangeFSSyncError);
      if (e instanceof ExchangeFSSyncError) {
        expect(e.code).toBe(ErrorCode.GRAPH_AUTH_FAILED);
        expect(e.recoverable).toBe(false);
      }
    }
  });

  it("throws recoverable error for 5xx", () => {
    try {
      handleGraphError(503, "Service unavailable", { phase: "fetch" });
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ExchangeFSSyncError);
      if (e instanceof ExchangeFSSyncError) {
        expect(e.code).toBe(ErrorCode.GRAPH_SERVER_ERROR);
        expect(e.recoverable).toBe(true);
      }
    }
  });
});

describe("globalCircuitBreakers", () => {
  it("has separate breakers for different operations", () => {
    expect(globalCircuitBreakers.graphApi).toBeInstanceOf(CircuitBreaker);
    expect(globalCircuitBreakers.storage).toBeInstanceOf(CircuitBreaker);
    expect(globalCircuitBreakers.sync).toBeInstanceOf(CircuitBreaker);
  });

  it("resetCircuitBreakers creates new instances", () => {
    const oldGraphApi = globalCircuitBreakers.graphApi;
    resetCircuitBreakers();
    expect(globalCircuitBreakers.graphApi).not.toBe(oldGraphApi);
    expect(globalCircuitBreakers.graphApi).toBeInstanceOf(CircuitBreaker);
  });
});
