import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { InKernelReactor } from "../../../src/reactor/evaluator.js";
import { governReactorOutput } from "../../../src/reactor/governance.js";
import { materializeProposal } from "../../../src/reactor/proposals.js";
import { persistReactorOutput, buildReactorOutputRow } from "../../../src/reactor/persist.js";
import { NodeSqliteReactorOutputStore } from "../../../src/reactor/store-node-sqlite.js";
import type { ReactorCharter, ReactorInput } from "../../../src/reactor/types.js";
import type { PolicyContext } from "../../../src/foreman/context.js";
import type { Fact } from "../../../src/facts/types.js";
import type { RuntimePolicy } from "../../../src/config/types.js";

function makePolicyContext(overrides?: Partial<PolicyContext>): PolicyContext {
  return {
    context_id: "mail:conv-1",
    scope_id: "mb-1",
    revision_id: "mail:conv-1:rev:1",
    previous_revision_ordinal: null,
    current_revision_ordinal: 1,
    change_kinds: ["new_message"],
    facts: [],
    synced_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeMailFact(bodyPreview: string): Fact {
  return {
    fact_id: "fact_1",
    fact_type: "mail.message.discovered",
    provenance: {
      source_id: "src-1",
      source_record_id: "rec-1",
      observed_at: new Date().toISOString(),
    },
    payload_json: JSON.stringify({
      event: {
        conversation_id: "conv-1",
        body_preview: bodyPreview,
        subject: "Test subject",
      },
    }),
    created_at: new Date().toISOString(),
  };
}

function makeInput(context: PolicyContext, charter: ReactorCharter): ReactorInput {
  return {
    reactor_id: charter.charter_id,
    charter,
    context,
    facts: context.facts,
    prior_outputs: [],
    policy: {
      allowed_actions: ["draft_reply", "send_reply", "mark_read"],
      require_human_approval: false,
    } as RuntimePolicy,
    evaluated_at: new Date().toISOString(),
  };
}

describe("InKernelReactor", () => {
  it("returns no_op when no rules match", async () => {
    const reactor = new InKernelReactor({ reactor_id: "test-reactor" });
    const charter: ReactorCharter = {
      charter_id: "test-reactor",
      version: "1.0",
      runtime: "in_kernel",
      description: "Test reactor",
      triggers: [],
      rules: [
        {
          rule_id: "r1",
          condition: { kind: "fact_type_is", value: "timer.tick" },
          consequence: { kind: "propose_inbox_envelope", envelope_kind: "observation" },
        },
      ],
      allowed_proposal_kinds: ["inbox_envelope"],
    };
    const context = makePolicyContext({ facts: [makeMailFact("hello")] });
    const output = await reactor.evaluate(makeInput(context, charter));

    expect(output.outcome).toBe("no_op");
    expect(output.proposals).toHaveLength(0);
  });

  it("proposes an inbox envelope when a rule matches", async () => {
    const reactor = new InKernelReactor({ reactor_id: "test-reactor" });
    const charter: ReactorCharter = {
      charter_id: "test-reactor",
      version: "1.0",
      runtime: "in_kernel",
      description: "Test reactor",
      triggers: [],
      rules: [
        {
          rule_id: "r1",
          condition: { kind: "fact_type_is", value: "mail.message.discovered" },
          consequence: {
            kind: "propose_inbox_envelope",
            envelope_kind: "observation",
            authority_level: "agent_reported",
            rationale_template: "Matched mail discovery",
          },
        },
      ],
      allowed_proposal_kinds: ["inbox_envelope"],
    };
    const context = makePolicyContext({ facts: [makeMailFact("hello")] });
    const output = await reactor.evaluate(makeInput(context, charter));

    expect(output.outcome).toBe("propose");
    expect(output.proposals).toHaveLength(1);
    expect(output.proposals[0]!.envelope_kind).toBe("observation");
    expect(output.proposals[0]!.rationale).toBe("Matched mail discovery");
  });

  it("escalates when confidence is below floor", async () => {
    const reactor = new InKernelReactor({ reactor_id: "test-reactor" });
    const charter: ReactorCharter = {
      charter_id: "test-reactor",
      version: "1.0",
      runtime: "in_kernel",
      description: "Test reactor",
      triggers: [],
      rules: [
        {
          rule_id: "r1",
          condition: { kind: "always" },
          consequence: { kind: "escalate" },
        },
      ],
      allowed_proposal_kinds: ["inbox_envelope"],
      confidence_floor: "high",
    };
    const context = makePolicyContext();
    const output = await reactor.evaluate(makeInput(context, charter));

    expect(output.outcome).toBe("escalate");
    expect(output.proposals).toHaveLength(0);
  });
});

describe("governReactorOutput", () => {
  it("rejects proposals with invalid JSON payload", async () => {
    const reactor = new InKernelReactor({ reactor_id: "test-reactor" });
    const charter: ReactorCharter = {
      charter_id: "test-reactor",
      version: "1.0",
      runtime: "in_kernel",
      description: "Test reactor",
      triggers: [],
      rules: [
        {
          rule_id: "r1",
          condition: { kind: "always" },
          consequence: {
            kind: "propose_inbox_envelope",
            envelope_kind: "observation",
            payload_json: "not valid json",
          },
        },
      ],
      allowed_proposal_kinds: ["inbox_envelope"],
    };
    const context = makePolicyContext();
    const output = await reactor.evaluate(makeInput(context, charter));
    const result = governReactorOutput(output, {
      allowed_actions: ["draft_reply"],
      require_human_approval: false,
    } as RuntimePolicy);

    expect(result.allowed).toBe(false);
    expect(result.governance_errors.some((e) => e.includes("not valid JSON"))).toBe(true);
  });

  it("approves valid proposals", async () => {
    const reactor = new InKernelReactor({ reactor_id: "test-reactor" });
    const charter: ReactorCharter = {
      charter_id: "test-reactor",
      version: "1.0",
      runtime: "in_kernel",
      description: "Test reactor",
      triggers: [],
      rules: [
        {
          rule_id: "r1",
          condition: { kind: "always" },
          consequence: {
            kind: "propose_inbox_envelope",
            envelope_kind: "observation",
            payload_json: JSON.stringify({ note: "hello" }),
          },
        },
      ],
      allowed_proposal_kinds: ["inbox_envelope"],
    };
    const context = makePolicyContext();
    const output = await reactor.evaluate(makeInput(context, charter));
    const result = governReactorOutput(output, {
      allowed_actions: ["draft_reply"],
      require_human_approval: false,
    } as RuntimePolicy);

    expect(result.allowed).toBe(true);
    expect(result.approved_proposals).toHaveLength(1);
  });
});

describe("materializeProposal", () => {
  it("creates a received inbox envelope from a proposal", async () => {
    const reactor = new InKernelReactor({ reactor_id: "test-reactor" });
    const charter: ReactorCharter = {
      charter_id: "test-reactor",
      version: "1.0",
      runtime: "in_kernel",
      description: "Test reactor",
      triggers: [],
      rules: [
        {
          rule_id: "r1",
          condition: { kind: "always" },
          consequence: {
            kind: "propose_inbox_envelope",
            envelope_kind: "observation",
            payload_json: JSON.stringify({ note: "hello" }),
          },
        },
      ],
      allowed_proposal_kinds: ["inbox_envelope"],
    };
    const context = makePolicyContext();
    const output = await reactor.evaluate(makeInput(context, charter));
    const envelope = materializeProposal(output, output.proposals[0]!);

    expect(envelope.status).toBe("received");
    expect(envelope.kind).toBe("observation");
    expect(envelope.authority.principal).toBe("test-reactor");
  });
});


describe("persistReactorOutput", () => {
  let db: DatabaseSync;
  let store: NodeSqliteReactorOutputStore;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    store = new NodeSqliteReactorOutputStore(db);
  });

  afterEach(() => {
    db.close();
  });

  it("persists a reactor output and reads it back", async () => {
    const reactor = new InKernelReactor({ reactor_id: "test-reactor" });
    const charter: ReactorCharter = {
      charter_id: "test-reactor",
      version: "1.0",
      runtime: "in_kernel",
      description: "Test reactor",
      triggers: [],
      rules: [
        {
          rule_id: "r1",
          condition: { kind: "always" },
          consequence: {
            kind: "propose_inbox_envelope",
            envelope_kind: "observation",
            payload_json: JSON.stringify({ note: "hello" }),
          },
        },
      ],
      allowed_proposal_kinds: ["inbox_envelope"],
    };
    const context = makePolicyContext();
    const output = await reactor.evaluate(makeInput(context, charter));

    const row = persistReactorOutput(output, store);
    const retrieved = store.getReactorOutputById(output.output_id);

    expect(retrieved).toBeDefined();
    expect(retrieved!.output_id).toBe(output.output_id);
    expect(retrieved!.reactor_id).toBe("test-reactor");
    expect(retrieved!.context_id).toBe("mail:conv-1");
    expect(retrieved!.outcome).toBe("propose");
    expect(JSON.parse(retrieved!.proposals_json)).toHaveLength(1);
  });

  it("builds a ReactorOutputRow from output", async () => {
    const reactor = new InKernelReactor({ reactor_id: "test-reactor" });
    const charter: ReactorCharter = {
      charter_id: "test-reactor",
      version: "1.0",
      runtime: "in_kernel",
      description: "Test reactor",
      triggers: [],
      rules: [
        {
          rule_id: "r1",
          condition: { kind: "always" },
          consequence: {
            kind: "propose_inbox_envelope",
            envelope_kind: "observation",
            payload_json: JSON.stringify({ note: "hello" }),
          },
        },
      ],
      allowed_proposal_kinds: ["inbox_envelope"],
    };
    const context = makePolicyContext();
    const output = await reactor.evaluate(makeInput(context, charter));

    const row = buildReactorOutputRow(output);

    expect(row.output_id).toBe(output.output_id);
    expect(row.reactor_id).toBe(output.reactor_id);
    expect(row.proposals_json).toBe(JSON.stringify(output.proposals));
    expect(row.confidence_json).toBe(JSON.stringify(output.confidence));
  });

  it("returns existing row when output is persisted again", async () => {
    const reactor = new InKernelReactor({ reactor_id: "test-reactor" });
    const charter: ReactorCharter = {
      charter_id: "test-reactor",
      version: "1.0",
      runtime: "in_kernel",
      description: "Test reactor",
      triggers: [],
      rules: [
        {
          rule_id: "r1",
          condition: { kind: "always" },
          consequence: {
            kind: "propose_inbox_envelope",
            envelope_kind: "observation",
            payload_json: JSON.stringify({ note: "hello" }),
          },
        },
      ],
      allowed_proposal_kinds: ["inbox_envelope"],
    };
    const context = makePolicyContext();
    const output = await reactor.evaluate(makeInput(context, charter));

    persistReactorOutput(output, store);
    persistReactorOutput(output, store);
    const rows = store.getReactorOutputsByContext("mail:conv-1", "mb-1");

    expect(rows).toHaveLength(1);
  });
});
