import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CodexCharterRunner } from "../../src/runtime/runner.js";
import type { CharterInvocationEnvelope } from "../../src/runtime/envelope.js";

function makeInvocation(overrides?: Partial<CharterInvocationEnvelope>): CharterInvocationEnvelope {
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

describe("CodexCharterRunner", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses a valid JSON response and persists trace hook", async () => {
    const traces: unknown[] = [];

    globalThis.fetch = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
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
                }),
              },
              finish_reason: "stop",
            },
          ],
        }),
      }) as Response;

    const runner = new CodexCharterRunner(
      { apiKey: "test-key" },
      {
        persistTrace: (t) => traces.push(t),
      },
    );

    const output = await runner.run(makeInvocation());
    expect(output.outcome).toBe("complete");
    expect(output.summary).toBe("All good");
    expect(output.proposed_actions).toHaveLength(1);

    expect(traces).toHaveLength(1);
    expect((traces[0] as { reasoning_log?: string }).reasoning_log).toBe("thinking...");
    expect((traces[0] as { execution_id: string }).execution_id).toBe("ex-1");
    expect((traces[0] as { context_id: string }).context_id).toBe("conv-1");
    expect((traces[0] as { work_item_id: string }).work_item_id).toBe("wi-1");
    expect((traces[0] as { charter_id: string }).charter_id).toBe("support_steward");
  });

  it("throws on API error", async () => {
    globalThis.fetch = async () =>
      ({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      }) as Response;

    const runner = new CodexCharterRunner({ apiKey: "bad-key" });
    await expect(runner.run(makeInvocation())).rejects.toThrow("Codex API error 401");
  });

  it("throws when response content is unparseable JSON", async () => {
    globalThis.fetch = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "not json" } }],
        }),
      }) as Response;

    const runner = new CodexCharterRunner({ apiKey: "test-key" });
    await expect(runner.run(makeInvocation())).rejects.toThrow("unparseable JSON");
  });

  it("throws when API returns empty content", async () => {
    globalThis.fetch = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "" } }] }),
      }) as Response;

    const runner = new CodexCharterRunner({ apiKey: "test-key" });
    await expect(runner.run(makeInvocation())).rejects.toThrow("empty content");
  });

  it("aborts on timeout", async () => {
    globalThis.fetch = async (_input, init) => {
      return new Promise((_, reject) => {
        const signal = init?.signal;
        if (signal) {
          const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
          if (signal.aborted) {
            onAbort();
            return;
          }
          signal.addEventListener("abort", onAbort);
        }
        // Never resolve
      }) as Promise<Response>;
    };

    const runner = new CodexCharterRunner({ apiKey: "test-key", timeoutMs: 10 });
    await expect(runner.run(makeInvocation())).rejects.toThrow("Abort");
  });

  it("patches missing identity fields from the invocation envelope", async () => {
    globalThis.fetch = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  // Missing execution_id, charter_id, role, analyzed_at
                  output_version: "2.0",
                  outcome: "no_op",
                  confidence: { overall: "high", uncertainty_flags: [] },
                  summary: "Fallback",
                  classifications: [],
                  facts: [],
                  proposed_actions: [],
                  tool_requests: [],
                  escalations: [],
                }),
              },
            },
          ],
        }),
      }) as Response;

    const runner = new CodexCharterRunner({ apiKey: "test-key" });
    const output = await runner.run(makeInvocation());
    expect(output.execution_id).toBe("ex-1");
    expect(output.charter_id).toBe("support_steward");
    expect(output.role).toBe("primary");
    expect(output.analyzed_at).toBeDefined();
  });

  it("patches missing schema fields with sensible defaults", async () => {
    globalThis.fetch = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  output_version: "2.0",
                  execution_id: "ex-1",
                  charter_id: "support_steward",
                  role: "primary",
                  outcome: "no_op",
                  summary: "Minimal response",
                  // Missing confidence, classifications, facts, proposed_actions, tool_requests, escalations
                }),
              },
            },
          ],
        }),
      }) as Response;

    const runner = new CodexCharterRunner({ apiKey: "test-key" });
    const output = await runner.run(makeInvocation());
    expect(output.confidence).toEqual({ overall: "low", uncertainty_flags: ["missing_confidence"] });
    expect(output.classifications).toEqual([]);
    expect(output.facts).toEqual([]);
    expect(output.proposed_actions).toEqual([]);
    expect(output.tool_requests).toEqual([]);
    expect(output.escalations).toEqual([]);
  });

  it("drops incomplete proposed_actions rather than fabricating fields", async () => {
    globalThis.fetch = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  output_version: "2.0",
                  execution_id: "ex-1",
                  charter_id: "support_steward",
                  role: "primary",
                  outcome: "complete",
                  summary: "Action with missing fields",
                  proposed_actions: [
                    {
                      action_type: "mark_read",
                      // Missing authority, payload_json, rationale
                    },
                  ],
                }),
              },
            },
          ],
        }),
      }) as Response;

    const runner = new CodexCharterRunner({ apiKey: "test-key" });
    const output = await runner.run(makeInvocation());
    // Incomplete actions are stripped; the runner does not fabricate authority,
    // payload_json, or rationale, because that would make an ungoverned action
    // appear executable.
    expect(output.proposed_actions).toHaveLength(0);
  });

  it("sanitizes payload_json with literal newlines so Rule 6 does not strip", async () => {
    globalThis.fetch = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  output_version: "2.0",
                  execution_id: "ex-1",
                  charter_id: "support_steward",
                  role: "primary",
                  outcome: "complete",
                  summary: "Reply with literal newline",
                  proposed_actions: [
                    {
                      action_type: "send_reply",
                      authority: "recommended",
                      payload_json: '{"body_text":"Line 1\nLine 2"}',
                      rationale: "reply",
                    },
                  ],
                }),
              },
            },
          ],
        }),
      }) as Response;

    const runner = new CodexCharterRunner({ apiKey: "test-key" });
    const output = await runner.run(makeInvocation());
    expect(output.proposed_actions).toHaveLength(1);
    expect(output.proposed_actions[0]!.action_type).toBe("send_reply");
    // The literal newline was escaped so JSON.parse succeeds
    expect(() => JSON.parse(output.proposed_actions[0]!.payload_json)).not.toThrow();
    const parsed = JSON.parse(output.proposed_actions[0]!.payload_json);
    expect(parsed.body_text).toBe("Line 1\nLine 2");
  });

  it("normalizes payload_json body to body_text for draft_reply", async () => {
    globalThis.fetch = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  output_version: "2.0",
                  execution_id: "ex-1",
                  charter_id: "support_steward",
                  role: "primary",
                  outcome: "complete",
                  summary: "Reply using body key",
                  proposed_actions: [
                    {
                      action_type: "draft_reply",
                      authority: "proposed",
                      payload_json: '{"body":"Hello there"}',
                      rationale: "reply",
                    },
                  ],
                }),
              },
            },
          ],
        }),
      }) as Response;

    const runner = new CodexCharterRunner({ apiKey: "test-key" });
    const output = await runner.run(makeInvocation());
    expect(output.proposed_actions).toHaveLength(1);
    const parsed = JSON.parse(output.proposed_actions[0]!.payload_json);
    expect(parsed.body_text).toBe("Hello there");
    expect(parsed.body).toBeUndefined();
  });

  it("normalizes facts value_json from object to string", async () => {
    globalThis.fetch = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  output_version: "2.0",
                  execution_id: "ex-1",
                  charter_id: "support_steward",
                  role: "primary",
                  outcome: "complete",
                  summary: "Fact with object value_json",
                  facts: [
                    {
                      kind: "customer_email",
                      value_json: { email: "test@example.com" },
                      source_record_ids: ["msg-1"],
                      confidence: "high",
                    },
                  ],
                }),
              },
            },
          ],
        }),
      }) as Response;

    const runner = new CodexCharterRunner({ apiKey: "test-key" });
    const output = await runner.run(makeInvocation());
    expect(output.facts).toHaveLength(1);
    expect(typeof output.facts[0]!.value_json).toBe("string");
    expect(JSON.parse(output.facts[0]!.value_json)).toEqual({ email: "test@example.com" });
  });

  it("enforces validation rules from 006 (action bounding)", async () => {
    globalThis.fetch = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  output_version: "2.0",
                  execution_id: "ex-1",
                  charter_id: "support_steward",
                  role: "primary",
                  analyzed_at: new Date().toISOString(),
                  outcome: "complete",
                  confidence: { overall: "high", uncertainty_flags: [] },
                  summary: "Bad action",
                  classifications: [],
                  facts: [],
                  proposed_actions: [
                    {
                      action_type: "move_message",
                      authority: "recommended",
                      payload_json: "{}",
                      rationale: "move",
                    },
                  ],
                  tool_requests: [],
                  escalations: [],
                }),
              },
            },
          ],
        }),
      }) as Response;

    const runner = new CodexCharterRunner({ apiKey: "test-key" });
    // The output is still returned; the foreman-side validation would strip it.
    // Our runner applies validation.corrected_outcome which may change outcome to no_op.
    const output = await runner.run(makeInvocation({ allowed_actions: ["send_reply"] }));
    // Runner applies outcome correction (Rule 10/4) but does not strip actions itself;
    // action stripping is the foreman's responsibility.
    expect(output.outcome).toBe("no_op");
    expect(output.proposed_actions[0]!.action_type).toBe("move_message");
  });
});
