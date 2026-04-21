import { describe, it, expect } from "vitest";
import { runSandbox, cycleSmokePayload } from "../src/sandbox/runner.js";
import type { SandboxInvocation } from "../src/sandbox/types.js";
import type { SandboxPayload } from "../src/sandbox/runner.js";

describe("sandbox spike", () => {
  const baseInvocation: SandboxInvocation = {
    charter_id: "support_steward",
    envelope_json: JSON.stringify({ test: "fixture", content: "x".repeat(500) }),
    timeout_ms: 1000,
    max_memory_mb: 64,
  };

  it("runs a cycle-smoke payload to completion", async () => {
    const result = await runSandbox(baseInvocation, cycleSmokePayload);

    expect(result.status).toBe("success");
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    expect(result.output_json).toBeDefined();

    const output = JSON.parse(result.output_json!);
    expect(output.phases_run).toContain("startup");
    expect(output.phases_run).toContain("parse_input");
    expect(output.phases_run).toContain("execute");
    expect(output.phases_run).toContain("capture_output");
    expect(output.memory_peak_mb).toBeGreaterThan(0);
  });

  it("returns timeout when payload exceeds timeout_ms", async () => {
    const slowPayload: SandboxPayload = {
      async run() {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return {
          status: "success",
          phases_run: ["startup"],
          duration_ms: 200,
          memory_peak_mb: 10,
        };
      },
    };

    const result = await runSandbox(
      { ...baseInvocation, timeout_ms: 50 },
      slowPayload,
    );

    expect(result.status).toBe("timeout");
    expect(result.error_message).toContain("timed out");
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("returns oom when payload reports memory above max_memory_mb", async () => {
    const hungryPayload: SandboxPayload = {
      async run() {
        return {
          status: "success",
          phases_run: ["startup", "allocate"],
          duration_ms: 10,
          memory_peak_mb: 128,
        };
      },
    };

    const result = await runSandbox(
      { ...baseInvocation, max_memory_mb: 64 },
      hungryPayload,
    );

    expect(result.status).toBe("oom");
    expect(result.error_message).toContain("Memory limit exceeded");
  });

  it("returns error when payload throws", async () => {
    const throwingPayload: SandboxPayload = {
      async run() {
        throw new Error("simulated charter crash");
      },
    };

    const result = await runSandbox(baseInvocation, throwingPayload);

    expect(result.status).toBe("error");
    expect(result.error_message).toBe("simulated charter crash");
  });

  it("returns error for non-Error throws", async () => {
    const throwingPayload: SandboxPayload = {
      async run() {
        throw "string error";
      },
    };

    const result = await runSandbox(baseInvocation, throwingPayload);

    expect(result.status).toBe("error");
    expect(result.error_message).toBe("string error");
  });
});
