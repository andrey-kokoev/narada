import { describe, it, expect } from "vitest";
import { MockCharterRunner } from "../../src/runtime/mock-runner.js";
import type { CharterInvocationEnvelope } from "../../src/runtime/envelope.js";

function makeInvocation(overrides?: Partial<CharterInvocationEnvelope>): CharterInvocationEnvelope {
  return {
    invocation_version: "2.0",
    execution_id: "ex-1",
    work_item_id: "wi-1",
    conversation_id: "conv-1",
    mailbox_id: "mb-1",
    charter_id: "support_steward",
    role: "primary",
    invoked_at: new Date().toISOString(),
    revision_id: "conv-1:rev:1",
    thread_context: {
      conversation_id: "conv-1",
      mailbox_id: "mb-1",
      revision_id: "conv-1:rev:1",
      messages: [
        {
          message_id: "msg-1",
          conversation_id: "conv-1",
          internet_message_id: "im-1",
          subject: "Hello",
          body_preview: "Hi there",
          from: [{ email: "a@example.com", name: "A" }],
          to: [{ email: "b@example.com", name: "B" }],
          cc: [],
          bcc: [],
          received_at: new Date().toISOString(),
          sent_at: null,
          is_draft: false,
          is_read: false,
          categories: [],
          parent_folder_id: "inbox",
          importance: "normal",
        },
      ],
    },
    allowed_actions: ["send_reply"],
    available_tools: [],
    coordinator_flags: [],
    prior_evaluations: [],
    max_prior_evaluations: 5,
    ...overrides,
  };
}

describe("MockCharterRunner", () => {
  it("returns a valid complete output for default inputs", async () => {
    const runner = new MockCharterRunner();
    const envelope = makeInvocation();
    const output = await runner.run(envelope);

    expect(output.output_version).toBe("2.0");
    expect(output.execution_id).toBe("ex-1");
    expect(output.charter_id).toBe("support_steward");
    expect(output.role).toBe("primary");
    expect(output.outcome).toBe("complete");
    expect(output.proposed_actions).toHaveLength(1);
    expect(output.proposed_actions[0]!.action_type).toBe("send_reply");
    expect(output.summary).toContain("conv-1");
  });

  it("returns no_op when allowed_actions is empty", async () => {
    const runner = new MockCharterRunner();
    const output = await runner.run(makeInvocation({ allowed_actions: [] }));
    expect(output.outcome).toBe("no_op");
    expect(output.proposed_actions).toHaveLength(0);
  });

  it("returns escalation when force_escalation flag is set", async () => {
    const runner = new MockCharterRunner();
    const output = await runner.run(
      makeInvocation({ coordinator_flags: ["force_escalation"] }),
    );
    expect(output.outcome).toBe("escalation");
    expect(output.escalations).toHaveLength(1);
  });

  it("returns clarification_needed when force_clarification flag is set", async () => {
    const runner = new MockCharterRunner();
    const output = await runner.run(
      makeInvocation({ coordinator_flags: ["force_clarification"] }),
    );
    expect(output.outcome).toBe("clarification_needed");
  });

  it("applies fixedOutcome override", async () => {
    const runner = new MockCharterRunner({ fixedOutcome: "escalation" });
    const output = await runner.run(makeInvocation());
    expect(output.outcome).toBe("escalation");
  });

  it("applies delayMs", async () => {
    const runner = new MockCharterRunner({ delayMs: 50 });
    const start = Date.now();
    await runner.run(makeInvocation());
    expect(Date.now() - start).toBeGreaterThanOrEqual(45);
  });

  it("throws on invalid invocation envelope", async () => {
    const runner = new MockCharterRunner();
    const envelope = makeInvocation();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (envelope as any).invocation_version = "1.0";
    await expect(runner.run(envelope)).rejects.toThrow();
  });
});
