import { describe, it, expect } from "vitest";
import { computeHealthTransition } from "../../src/health-transition.js";

describe("computeHealthTransition", () => {
  it("success resets to healthy and zero consecutive failures", () => {
    const result = computeHealthTransition("critical", 5, "success");
    expect(result.status).toBe("healthy");
    expect(result.consecutiveFailures).toBe(0);
  });

  it("first failure from healthy → degraded", () => {
    const result = computeHealthTransition("healthy", 0, "failure");
    expect(result.status).toBe("degraded");
    expect(result.consecutiveFailures).toBe(1);
  });

  it("second failure stays degraded", () => {
    const result = computeHealthTransition("degraded", 1, "failure");
    expect(result.status).toBe("degraded");
    expect(result.consecutiveFailures).toBe(2);
  });

  it("third failure → critical", () => {
    const result = computeHealthTransition("degraded", 2, "failure");
    expect(result.status).toBe("critical");
    expect(result.consecutiveFailures).toBe(3);
  });

  it("fourth failure stays critical", () => {
    const result = computeHealthTransition("critical", 3, "failure");
    expect(result.status).toBe("critical");
    expect(result.consecutiveFailures).toBe(4);
  });

  it("auth failure → auth_failed", () => {
    const result = computeHealthTransition("healthy", 0, "auth_failure");
    expect(result.status).toBe("auth_failed");
    expect(result.consecutiveFailures).toBe(1);
  });

  it("stuck recovery → critical", () => {
    const result = computeHealthTransition("healthy", 0, "stuck_recovery");
    expect(result.status).toBe("critical");
    expect(result.consecutiveFailures).toBe(0);
  });

  it("success after auth_failure resets to healthy", () => {
    const result = computeHealthTransition("auth_failed", 3, "success");
    expect(result.status).toBe("healthy");
    expect(result.consecutiveFailures).toBe(0);
  });
});
