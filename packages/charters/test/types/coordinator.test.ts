import { describe, it, expect } from "vitest";
import {
  validateMailboxCharterBinding,
  type MailboxCharterBinding,
} from "../../src/types/coordinator.js";

describe("validateMailboxCharterBinding", () => {
  it("accepts valid binding", () => {
    const binding: MailboxCharterBinding = {
      mailbox_id: "help@example.com",
      available_charters: ["support_steward", "obligation_keeper"],
      default_primary_charter: "support_steward",
      invocation_policies: [
        { charter_id: "support_steward", mode: "always" },
        {
          charter_id: "obligation_keeper",
          mode: "conditional",
          trigger_tags: ["commitment"],
        },
      ],
      knowledge_sources: {
        support_steward: [
          {
            id: "docs",
            type: "url",
            enabled: true,
            urls: ["https://example.com/docs"],
          },
        ],
        obligation_keeper: [],
      },
    };
    expect(validateMailboxCharterBinding(binding)).toBe(true);
  });

  it("rejects when default_primary_charter not in available_charters", () => {
    const binding = {
      mailbox_id: "help@example.com",
      available_charters: ["support_steward"],
      default_primary_charter: "obligation_keeper",
      invocation_policies: [],
      knowledge_sources: {},
    };
    expect(validateMailboxCharterBinding(binding)).toBe(false);
  });

  it("rejects invalid invocation mode", () => {
    const binding = {
      mailbox_id: "help@example.com",
      available_charters: ["support_steward"],
      default_primary_charter: "support_steward",
      invocation_policies: [
        { charter_id: "support_steward", mode: "invalid" },
      ],
      knowledge_sources: {},
    };
    expect(validateMailboxCharterBinding(binding)).toBe(false);
  });

  it("rejects missing knowledge_sources", () => {
    const binding = {
      mailbox_id: "help@example.com",
      available_charters: ["support_steward"],
      default_primary_charter: "support_steward",
      invocation_policies: [],
    };
    expect(validateMailboxCharterBinding(binding)).toBe(false);
  });
});
