import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { KimiCliCharterRunner } from "../../src/runtime/kimi-cli-runner.js";
import type { CharterInvocationEnvelope } from "../../src/runtime/envelope.js";

function makeInvocation(
  overrides?: Partial<CharterInvocationEnvelope>,
): CharterInvocationEnvelope {
  return {
    invocation_version: "2.0",
    execution_id: "ex-1",
    work_item_id: "wi-1",
    context_id: "conv-1",
    scope_id: "mb-1",
    charter_id: "support_steward",
    role: "primary",
    invoked_at: new Date().toISOString(),
    revision_id: "conv-1:rev:1",
    context_materialization: { messages: [] },
    vertical_hints: { vertical: "mail" },
    allowed_actions: ["send_reply"],
    available_tools: [],
    coordinator_flags: [],
    prior_evaluations: [],
    max_prior_evaluations: 5,
    ...overrides,
  };
}

// Mock child_process so tests never invoke a real CLI
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

// Mock fs and os for probeHealth
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

import * as os from "node:os";

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

function mockSpawn(
  stdout: string,
  stderr: string,
  exitCode: number | null,
  error?: Error,
) {
  return vi.fn().mockImplementation(() => {
    const events: Record<string, Array<(...args: unknown[]) => void>> = {};
    const stdin = { write: vi.fn(), end: vi.fn() };
    const stdoutStream = {
      on: vi.fn((event: string, cb: (data: Buffer) => void) => {
        if (event === "data") {
          cb(Buffer.from(stdout));
        }
      }),
    };
    const stderrStream = {
      on: vi.fn((event: string, cb: (data: Buffer) => void) => {
        if (event === "data") {
          cb(Buffer.from(stderr));
        }
      }),
    };

    const child = {
      stdin,
      stdout: stdoutStream,
      stderr: stderrStream,
      kill: vi.fn(),
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        if (!events[event]) events[event] = [];
        events[event]!.push(cb);
      }),
      _emit: (event: string, ...args: unknown[]) => {
        events[event]?.forEach((cb) => cb(...args));
      },
    };

    // Defer emission so callers can attach listeners
    setTimeout(() => {
      if (error) {
        child._emit("error", error);
      } else {
        child._emit("close", exitCode);
      }
    }, 0);

    return child;
  });
}

describe("KimiCliCharterRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("probeHealth", () => {
    it("returns unconfigured when CLI is missing", async () => {
      const mockedSpawn = mockSpawn("", "not found", null, new Error("ENOENT"));
      vi.mocked(spawn).mockImplementation(mockedSpawn);
      vi.mocked(existsSync).mockReturnValue(false);

      const runner = new KimiCliCharterRunner({});
      const health = await runner.probeHealth();
      expect(health.class).toBe("unconfigured");
      expect(health.details).toContain("not found");
    });

    it("returns interactive_auth_required when CLI exists but no session", async () => {
      const mockedSpawn = mockSpawn("kimi, version 1.37.0", "", 0);
      vi.mocked(spawn).mockImplementation(mockedSpawn);
      vi.mocked(existsSync).mockReturnValue(false);

      const runner = new KimiCliCharterRunner({});
      const health = await runner.probeHealth();
      expect(health.class).toBe("interactive_auth_required");
      expect(health.details).toContain("Run `kimi login`");
    });

    it("returns healthy when CLI exists and session is present", async () => {
      const mockedSpawn = mockSpawn("kimi, version 1.37.0", "", 0);
      vi.mocked(spawn).mockImplementation(mockedSpawn);
      vi.mocked(existsSync).mockReturnValue(true);

      const runner = new KimiCliCharterRunner({});
      const health = await runner.probeHealth();
      expect(health.class).toBe("healthy");
      expect(health.details).toContain("1.37.0");
    });

    it("returns degraded_draft_only when configured", async () => {
      const runner = new KimiCliCharterRunner({ degradedMode: "draft_only" });
      const health = await runner.probeHealth();
      expect(health.class).toBe("degraded_draft_only");
    });
  });

  describe("run", () => {
    it("parses valid JSON output into CharterOutputEnvelope", async () => {
      const validOutput = {
        output_version: "2.0",
        execution_id: "ex-1",
        charter_id: "support_steward",
        role: "primary",
        analyzed_at: new Date().toISOString(),
        outcome: "complete",
        confidence: { overall: "high", uncertainty_flags: [] },
        summary: "All good",
        classifications: [],
        facts: [],
        proposed_actions: [
          {
            action_type: "send_reply",
            authority: "recommended",
            payload_json: "{}",
            rationale: "reply",
          },
        ],
        tool_requests: [],
        escalations: [],
        reasoning_log: "thinking...",
      };

      const mockedSpawn = mockSpawn(JSON.stringify(validOutput), "", 0);
      vi.mocked(spawn).mockImplementation(mockedSpawn);

      const traces: unknown[] = [];
      const runner = new KimiCliCharterRunner(
        {},
        {
          persistTrace: (t) => traces.push(t),
        },
      );

      const output = await runner.run(makeInvocation());
      expect(output.outcome).toBe("complete");
      expect(output.summary).toBe("All good");
      expect(output.proposed_actions).toHaveLength(1);
      expect(traces).toHaveLength(1);
    });

    it("extracts JSON from markdown code fences", async () => {
      const validOutput = {
        output_version: "2.0",
        execution_id: "ex-1",
        charter_id: "support_steward",
        role: "primary",
        analyzed_at: new Date().toISOString(),
        outcome: "no_op",
        confidence: { overall: "high", uncertainty_flags: [] },
        summary: "Nothing to do",
        classifications: [],
        facts: [],
        proposed_actions: [],
        tool_requests: [],
        escalations: [],
      };

      const stdout = `\nSome preamble\n\`\`\`json\n${JSON.stringify(validOutput)}\n\`\`\`\n`;
      const mockedSpawn = mockSpawn(stdout, "", 0);
      vi.mocked(spawn).mockImplementation(mockedSpawn);

      const runner = new KimiCliCharterRunner({});
      const output = await runner.run(makeInvocation());
      expect(output.outcome).toBe("no_op");
      expect(output.summary).toBe("Nothing to do");
    });

    it("rejects invalid JSON", async () => {
      const mockedSpawn = mockSpawn("not json", "", 0);
      vi.mocked(spawn).mockImplementation(mockedSpawn);

      const runner = new KimiCliCharterRunner({});
      await expect(runner.run(makeInvocation())).rejects.toThrow(
        "no parseable JSON",
      );
    });

    it("rejects auth-required stderr", async () => {
      const mockedSpawn = mockSpawn("", "Error: login required", 1);
      vi.mocked(spawn).mockImplementation(mockedSpawn);

      const runner = new KimiCliCharterRunner({});
      await expect(runner.run(makeInvocation())).rejects.toThrow(
        "authentication required",
      );
    });

    it("rejects on timeout", async () => {
      // Simulate a spawn that never emits close but gets killed
      vi.mocked(spawn).mockImplementation(() => {
        const events: Record<string, Array<(...args: unknown[]) => void>> = {};
        const child = {
          stdin: { write: vi.fn(), end: vi.fn() },
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          kill: vi.fn((signal: string) => {
            // Simulate the process exiting after being killed
            setTimeout(() => {
              events["close"]?.forEach((cb) => cb(null));
            }, 50);
          }),
          on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
            if (!events[event]) events[event] = [];
            events[event]!.push(cb);
          }),
        };
        return child;
      });

      const runner = new KimiCliCharterRunner({ timeoutMs: 10 });
      await expect(runner.run(makeInvocation())).rejects.toThrow("timed out");
    });

    it("patches missing identity fields from the invocation envelope", async () => {
      const partialOutput = {
        output_version: "2.0",
        outcome: "no_op",
        confidence: { overall: "high", uncertainty_flags: [] },
        summary: "Minimal",
        classifications: [],
        facts: [],
        proposed_actions: [],
        tool_requests: [],
        escalations: [],
      };

      const mockedSpawn = mockSpawn(JSON.stringify(partialOutput), "", 0);
      vi.mocked(spawn).mockImplementation(mockedSpawn);

      const runner = new KimiCliCharterRunner({});
      const output = await runner.run(makeInvocation());
      expect(output.execution_id).toBe("ex-1");
      expect(output.charter_id).toBe("support_steward");
      expect(output.role).toBe("primary");
      expect(output.analyzed_at).toBeDefined();
    });

    it("normalizes malformed analyzed_at to valid ISO 8601", async () => {
      const mockedSpawn = mockSpawn(
        JSON.stringify({
          output_version: "2.0",
          execution_id: "ex-1",
          charter_id: "support_steward",
          role: "primary",
          analyzed_at: "2026-04-20T12:00:00Z", // missing milliseconds
          outcome: "no_op",
          confidence: { overall: "high", uncertainty_flags: [] },
          summary: "Test",
          classifications: [],
          facts: [],
          proposed_actions: [],
          tool_requests: [],
          escalations: [],
        }),
        "",
        0,
      );
      vi.mocked(spawn).mockImplementation(mockedSpawn);

      const runner = new KimiCliCharterRunner({});
      const output = await runner.run(makeInvocation());

      expect(output.analyzed_at).toBe("2026-04-20T12:00:00.000Z");
    });

    it("passes through CLI options as spawn args", async () => {
      const mockedSpawn = mockSpawn(
        JSON.stringify({
          output_version: "2.0",
          execution_id: "ex-1",
          charter_id: "support_steward",
          role: "primary",
          analyzed_at: new Date().toISOString(),
          outcome: "no_op",
          confidence: { overall: "high", uncertainty_flags: [] },
          summary: "Test",
          classifications: [],
          facts: [],
          proposed_actions: [],
          tool_requests: [],
          escalations: [],
        }),
        "",
        0,
      );
      vi.mocked(spawn).mockImplementation(mockedSpawn);

      const runner = new KimiCliCharterRunner({
        cliPath: "/custom/kimi",
        model: "moonshot-v1-8k",
        sessionId: "sess-123",
        continueSession: true,
        workDir: "/tmp/wd",
      });

      await runner.run(makeInvocation());

      expect(mockedSpawn).toHaveBeenCalledWith(
        "/custom/kimi",
        [
          "--work-dir",
          "/tmp/wd",
          "--session",
          "sess-123",
          "--continue",
          "--model",
          "moonshot-v1-8k",
          "--print",
          "--final-message-only",
          "--prompt",
          expect.stringContaining("single JSON object"),
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
    });
  });
});
