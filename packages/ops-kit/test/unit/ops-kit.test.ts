import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CoordinatorConfig } from "@narada2/charters";
import { wantMailbox } from "../../src/commands/want-mailbox.js";
import { wantWorkflow } from "../../src/commands/want-workflow.js";
import { wantPosture } from "../../src/commands/want-posture.js";
import { setup } from "../../src/commands/setup.js";
import { activate } from "../../src/commands/activate.js";
import { inspect } from "../../src/commands/inspect.js";
import { explain } from "../../src/commands/explain.js";
import { preflight } from "../../src/commands/preflight.js";
import { readConfig, findScope, writeConfig } from "../../src/lib/config-io.js";
import { POSTURE_ACTIONS } from "../../src/intents/posture.js";

function makeOpsRepo(): { root: string; configPath: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "narada-ops-kit-"));
  const configDir = path.join(root, "config");
  fs.mkdirSync(configDir, { recursive: true });
  return { root, configPath: path.join(configDir, "config.json") };
}

describe("ops-kit", () => {
  it("shapes a mailbox into config and ops-repo scaffold", () => {
    const { root, configPath } = makeOpsRepo();
    const result = wantMailbox("help@example.com", { configPath, posture: "draft-only" });
    const config = readConfig(configPath)!;
    const scope = findScope(config, "help@example.com")!;
    expect(result.scopeId).toBe("help@example.com");
    expect(scope.policy.primary_charter).toBe("support_steward");
    expect(scope.policy.allowed_actions).toEqual(POSTURE_ACTIONS["draft-only"]);
    expect(fs.existsSync(path.join(root, "mailboxes", "help@example.com", "README.md"))).toBe(true);
  });

  it("shapes a workflow and writes schedule declaration", () => {
    const { root, configPath } = makeOpsRepo();
    const result = wantWorkflow("sonar-postgres-watch", { configPath, schedule: "* * * * *", posture: "observe-only" });
    expect(result.contextId).toBe("timer:sonar-postgres-watch");
    expect(fs.existsSync(path.join(root, "workflows", "sonar-postgres-watch", "schedule.json"))).toBe(true);
  });

  it("applies a posture preset to an existing target", () => {
    const { configPath } = makeOpsRepo();
    wantMailbox("help@example.com", { configPath, posture: "draft-only" });
    const result = wantPosture("help@example.com", "send-allowed", { configPath });
    expect(result.newActions).toEqual(POSTURE_ACTIONS["send-allowed"]);
    expect(findScope(readConfig(configPath)!, "help@example.com")!.policy.allowed_actions).toContain("send_reply");
  });

  it("setup, preflight, inspect, explain, and activate form a coherent lifecycle", () => {
    const { configPath } = makeOpsRepo();
    wantMailbox("help@example.com", { configPath, posture: "draft-only", scaffold: false });

    const before = preflight("help@example.com", { configPath });
    expect(before.status).toBe("fail");

    const setupResult = setup({ configPath, target: "help@example.com" });
    expect(setupResult.createdPaths.length).toBeGreaterThan(0);

    const activated = activate("help@example.com", { configPath });
    expect(activated.activated).toBe(true);

    const after = preflight("help@example.com", { configPath });
    expect(after.status).toBe("pass");

    const inspected = inspect("help@example.com", { configPath });
    expect(inspected.summary).toContain("primary_charter: support_steward");

    const explained = explain("help@example.com", { configPath });
    expect(explained.whyNoAction).toContain("Ready");
    expect(explained.operationalConsequences.some((line) => line.includes("draft replies"))).toBe(true);
  });

  it("preflight incorporates declared operational requirements", () => {
    const { configPath } = makeOpsRepo();
    wantMailbox("help@example.com", { configPath, posture: "draft-only" });
    const config = readConfig(configPath)!;
    const scope = findScope(config, "help@example.com")!;
    scope.charter = { runtime: "kimi-api", model: "moonshot-v1-8k", base_url: "https://api.moonshot.ai/v1" };
    writeConfig(config, configPath);
    const coordinator: CoordinatorConfig = {
      foreman_id: "fm",
      mailbox_bindings: {
        "help@example.com": {
          mailbox_id: "help@example.com",
          available_charters: ["support_steward", "obligation_keeper"],
          default_primary_charter: "support_steward",
          invocation_policies: [],
          knowledge_sources: { support_steward: [], obligation_keeper: [] },
          charter_tools: {
            support_steward: [{ tool_id: "check_pg", enabled: true, purpose: "Check PG", read_only: true, timeout_ms: 1000, requires_approval: false }],
            obligation_keeper: [],
          },
        },
      },
      global_escalation_precedence: [],
      tool_definitions: {
        check_pg: {
          id: "check_pg",
          source_type: "local_executable",
          executable_path: "/missing/check-postgres-health.sh",
          setup_requirements: [{ kind: "env_var", name: "PGPASSWORD", description: "Postgres password" }],
        },
      },
    };
    const report = preflight("help@example.com", { configPath, coordinatorConfig: coordinator, mailboxIdForTools: "help@example.com" } as any);
    expect(report.status).toBe("fail");
    expect(report.nextActions.some((x) => x.includes("NARADA_KIMI_API_KEY"))).toBe(true);
    expect(report.nextActions.some((x) => x.includes("PGPASSWORD"))).toBe(true);
  });
});
