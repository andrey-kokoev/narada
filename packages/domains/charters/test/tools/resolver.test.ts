import { describe, it, expect } from "vitest";
import { resolveToolCatalog } from "../../src/tools/resolver.js";
import type { CoordinatorConfig } from "../../src/types/coordinator.js";

function makeConfig(overrides?: Partial<CoordinatorConfig>): CoordinatorConfig {
  return {
    foreman_id: "fm-test",
    mailbox_bindings: {},
    global_escalation_precedence: [],
    tool_definitions: {},
    ...overrides,
  };
}

describe("resolveToolCatalog", () => {
  it("returns empty envelope for missing mailbox binding", () => {
    const config = makeConfig();
    const envelope = resolveToolCatalog("mb-1", "support_steward", config);
    expect(envelope.available_tools).toHaveLength(0);
    expect(envelope.side_effect_budget.max_tool_calls).toBe(0);
  });

  it("resolves available tools for mailbox + charter", () => {
    const config = makeConfig({
      mailbox_bindings: {
        "mb-1": {
          mailbox_id: "mb-1",
          available_charters: ["support_steward"],
          default_primary_charter: "support_steward",
          invocation_policies: [],
          knowledge_sources: {},
          charter_tools: {
            support_steward: [
              {
                tool_id: "lookup_customer",
                enabled: true,
                purpose: "Look up customer record",
                read_only: true,
                timeout_ms: 5000,
                requires_approval: false,
              },
              {
                tool_id: "send_notification",
                enabled: true,
                purpose: "Send external notification",
                read_only: false,
                timeout_ms: 10000,
                requires_approval: true,
              },
            ],
          },
        },
      },
      tool_definitions: {
        lookup_customer: {
          id: "lookup_customer",
          source_type: "http_endpoint",
          url: "http://example.com/customer",
          schema_args: [{ name: "email", type: "string", required: true, description: "Customer email" }],
        },
      },
    });

    const envelope = resolveToolCatalog("mb-1", "support_steward", config);
    expect(envelope.available_tools).toHaveLength(2);
    const lookup = envelope.available_tools.find((t) => t.tool_id === "lookup_customer")!;
    expect(lookup.read_only).toBe(true);
    expect(lookup.requires_approval).toBe(false);
    expect(lookup.schema_args).toHaveLength(1);

    const notify = envelope.available_tools.find((t) => t.tool_id === "send_notification")!;
    expect(notify.read_only).toBe(false);
    expect(notify.requires_approval).toBe(true);

    expect(envelope.side_effect_budget.max_write_tool_calls).toBe(3);
    expect(envelope.side_effect_budget.total_timeout_ms).toBe(15000);
  });

  it("omits disabled tools", () => {
    const config = makeConfig({
      mailbox_bindings: {
        "mb-1": {
          mailbox_id: "mb-1",
          available_charters: ["support_steward"],
          default_primary_charter: "support_steward",
          invocation_policies: [],
          knowledge_sources: {},
          charter_tools: {
            support_steward: [
              {
                tool_id: "t1",
                enabled: false,
                purpose: "Disabled tool",
                read_only: true,
                timeout_ms: 1000,
                requires_approval: false,
              },
            ],
          },
        },
      },
    });

    const envelope = resolveToolCatalog("mb-1", "support_steward", config);
    expect(envelope.available_tools).toHaveLength(0);
  });

  it("applies dynamic foreman overrides", () => {
    const config = makeConfig({
      mailbox_bindings: {
        "mb-1": {
          mailbox_id: "mb-1",
          available_charters: ["support_steward"],
          default_primary_charter: "support_steward",
          invocation_policies: [],
          knowledge_sources: {},
          charter_tools: {
            support_steward: [
              {
                tool_id: "t1",
                enabled: true,
                purpose: "Tool 1",
                read_only: true,
                timeout_ms: 1000,
                requires_approval: false,
              },
              {
                tool_id: "t2",
                enabled: true,
                purpose: "Tool 2",
                read_only: true,
                timeout_ms: 2000,
                requires_approval: false,
              },
            ],
          },
        },
      },
    });

    const envelope = resolveToolCatalog("mb-1", "support_steward", config, {
      removed_tool_ids: ["t1"],
      force_approval_tool_ids: ["t2"],
    });

    expect(envelope.available_tools.map((t) => t.tool_id)).toEqual(["t2"]);
    expect(envelope.available_tools[0]!.requires_approval).toBe(true);
  });

  it("omits disabled knowledge sources", () => {
    const config = makeConfig({
      mailbox_bindings: {
        "mb-1": {
          mailbox_id: "mb-1",
          available_charters: ["support_steward"],
          default_primary_charter: "support_steward",
          invocation_policies: [],
          knowledge_sources: {
            support_steward: [
              { id: "ks-1", type: "url", enabled: true, purpose: "Docs" },
              { id: "ks-2", type: "local_path", enabled: false, purpose: "Playbook" },
            ],
          },
          charter_tools: {},
        },
      },
    });

    const envelope = resolveToolCatalog("mb-1", "support_steward", config);
    expect(envelope.available_knowledge_sources).toHaveLength(1);
    expect(envelope.available_knowledge_sources[0]!.source_id).toBe("ks-1");
  });
});
