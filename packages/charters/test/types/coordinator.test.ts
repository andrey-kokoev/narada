import { describe, it, expect } from "vitest";
import {
  collectOperationalRequirements,
  validateMailboxCharterBinding,
  type CoordinatorConfig,
  type MailboxCharterBinding,
} from "../../src/types/coordinator.js";

function makeCoordinatorConfig(overrides?: Partial<CoordinatorConfig>): CoordinatorConfig {
  return {
    foreman_id: "fm-test",
    mailbox_bindings: {},
    global_escalation_precedence: [],
    tool_definitions: {},
    ...overrides,
  };
}

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
      charter_tools: {
        support_steward: [],
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
      charter_tools: {},
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
      charter_tools: {},
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

  it("rejects missing charter_tools", () => {
    const binding = {
      mailbox_id: "help@example.com",
      available_charters: ["support_steward"],
      default_primary_charter: "support_steward",
      invocation_policies: [],
      knowledge_sources: {},
    };
    expect(validateMailboxCharterBinding(binding)).toBe(false);
  });
});

describe("collectOperationalRequirements", () => {
  it("collects explicit and implicit requirements for enabled tools", () => {
    const config = makeCoordinatorConfig({
      mailbox_bindings: {
        "mb-1": {
          mailbox_id: "mb-1",
          available_charters: ["support_steward", "obligation_keeper"],
          default_primary_charter: "support_steward",
          invocation_policies: [],
          knowledge_sources: { support_steward: [], obligation_keeper: [] },
          charter_tools: {
            support_steward: [
              {
                tool_id: "check_pg",
                enabled: true,
                purpose: "Check Postgres health",
                read_only: true,
                timeout_ms: 5000,
                requires_approval: false,
              },
            ],
            obligation_keeper: [
              {
                tool_id: "notify_api",
                enabled: true,
                purpose: "Notify endpoint",
                read_only: false,
                timeout_ms: 5000,
                requires_approval: true,
              },
            ],
          },
        },
      },
      tool_definitions: {
        check_pg: {
          id: "check_pg",
          source_type: "local_executable",
          executable_path: "/home/andrey/src/sonar.cloud/scripts/check-postgres-health.sh",
          setup_requirements: [
            {
              kind: "directory",
              path: "/home/andrey/src/sonar.cloud",
              description: "sonar.cloud repo checkout",
              create_if_missing: false,
            },
          ],
        },
        notify_api: {
          id: "notify_api",
          source_type: "http_endpoint",
          url: "https://ops.example.com/notify",
          setup_requirements: [
            {
              kind: "env_var",
              name: "OPS_NOTIFY_TOKEN",
              description: "Auth token for notify endpoint",
            },
          ],
        },
      },
    });

    expect(collectOperationalRequirements(config, "mb-1")).toEqual([
      {
        kind: "directory",
        path: "/home/andrey/src/sonar.cloud",
        description: "sonar.cloud repo checkout",
        create_if_missing: false,
      },
      {
        kind: "local_executable",
        command: "/home/andrey/src/sonar.cloud/scripts/check-postgres-health.sh",
        description: "Executable for tool check_pg",
        working_directory: undefined,
      },
      {
        kind: "env_var",
        name: "OPS_NOTIFY_TOKEN",
        description: "Auth token for notify endpoint",
      },
      {
        kind: "http_endpoint",
        url: "https://ops.example.com/notify",
        description: "HTTP endpoint for tool notify_api",
      },
    ]);
  });

  it("deduplicates shared requirements and ignores disabled tools", () => {
    const config = makeCoordinatorConfig({
      mailbox_bindings: {
        "mb-1": {
          mailbox_id: "mb-1",
          available_charters: ["support_steward", "obligation_keeper"],
          default_primary_charter: "support_steward",
          invocation_policies: [],
          knowledge_sources: { support_steward: [], obligation_keeper: [] },
          charter_tools: {
            support_steward: [
              {
                tool_id: "shared",
                enabled: true,
                purpose: "Shared tool",
                read_only: true,
                timeout_ms: 5000,
                requires_approval: false,
              },
            ],
            obligation_keeper: [
              {
                tool_id: "shared",
                enabled: true,
                purpose: "Shared tool again",
                read_only: true,
                timeout_ms: 5000,
                requires_approval: false,
              },
              {
                tool_id: "disabled",
                enabled: false,
                purpose: "Disabled tool",
                read_only: true,
                timeout_ms: 5000,
                requires_approval: false,
              },
            ],
          },
        },
      },
      tool_definitions: {
        shared: {
          id: "shared",
          source_type: "local_executable",
          executable_path: "/usr/bin/env",
        },
        disabled: {
          id: "disabled",
          source_type: "http_endpoint",
          url: "https://should-not-appear.example.com",
        },
      },
    });

    expect(collectOperationalRequirements(config, "mb-1")).toEqual([
      {
        kind: "local_executable",
        command: "/usr/bin/env",
        description: "Executable for tool shared",
        working_directory: undefined,
      },
    ]);
  });
});
