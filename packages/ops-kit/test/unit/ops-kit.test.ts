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
import { initRepo } from "../../src/commands/init-repo.js";
import { readConfig, findScope, writeConfig } from "../../src/lib/config-io.js";
import { MAILBOX_POSTURE_ACTIONS } from "../../src/intents/posture.js";

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
    expect(scope.policy.allowed_actions).toEqual(MAILBOX_POSTURE_ACTIONS["draft-only"]);
    expect(fs.existsSync(path.join(root, "mailboxes", "help@example.com", "README.md"))).toBe(true);
  });

  it("want-mailbox accepts graph-user-id, folders, and data-root-dir", () => {
    const { configPath } = makeOpsRepo();
    const result = wantMailbox("help@example.com", {
      configPath,
      posture: "draft-only",
      graphUserId: "alias@company.com",
      folders: ["inbox", "archive"],
      dataRootDir: "./custom-data",
    });
    const config = readConfig(configPath)!;
    const scope = findScope(config, "help@example.com")!;
    expect(result.scopeId).toBe("help@example.com");
    const graphSource = scope.sources.find((s) => s.type === "graph");
    expect(graphSource?.user_id).toBe("alias@company.com");
    expect(scope.scope.included_container_refs).toEqual(["inbox", "archive"]);
    expect(scope.root_dir).toBe("./custom-data");
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
    const result = wantPosture("help@example.com", "autonomous", { configPath });
    expect(result.newActions).toEqual(MAILBOX_POSTURE_ACTIONS["autonomous"]);
    expect(findScope(readConfig(configPath)!, "help@example.com")!.policy.allowed_actions).toContain("send_reply");
  });

  it("setup, preflight, inspect, explain, and activate form a coherent lifecycle", () => {
    const { root, configPath } = makeOpsRepo();
    wantMailbox("help@example.com", { configPath, posture: "draft-only", scaffold: false });

    const before = preflight("help@example.com", { configPath });
    expect(before.status).toBe("fail");

    const setupResult = setup({ configPath, target: "help@example.com" });
    expect(setupResult.createdPaths.length).toBeGreaterThan(0);

    // Satisfy credential checks for preflight pass
    const origTenant = process.env.GRAPH_TENANT_ID;
    const origClient = process.env.GRAPH_CLIENT_ID;
    const origSecret = process.env.GRAPH_CLIENT_SECRET;
    process.env.GRAPH_TENANT_ID = "test-tenant";
    process.env.GRAPH_CLIENT_ID = "test-client";
    process.env.GRAPH_CLIENT_SECRET = "test-secret";
    fs.writeFileSync(path.join(root, ".env"), "GRAPH_TENANT_ID=test\n", "utf-8");

    const activated = activate("help@example.com", { configPath });
    expect(activated.activated).toBe(true);

    const after = preflight("help@example.com", { configPath });
    expect(after.status).toBe("pass");

    // Restore env
    process.env.GRAPH_TENANT_ID = origTenant;
    process.env.GRAPH_CLIENT_ID = origClient;
    process.env.GRAPH_CLIENT_SECRET = origSecret;

    const inspected = inspect("help@example.com", { configPath });
    expect(inspected.summary).toContain("primary_charter: support_steward");

    const explained = explain("help@example.com", { configPath });
    expect(explained.whyNoAction).toContain("Ready");
    expect(explained.operationalConsequences.some((line) => line.includes("draft replies"))).toBe(true);
  });

  it("init-repo creates a coherent private ops repo skeleton", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "narada-init-repo-"));
    const repoPath = path.join(tmpDir, "narada.sonar");
    const result = initRepo(repoPath, { name: "narada-sonar" });

    expect(result.repoPath).toBe(repoPath);
    expect(fs.existsSync(path.join(repoPath, "package.json"))).toBe(true);
    expect(fs.existsSync(path.join(repoPath, ".gitignore"))).toBe(true);
    expect(fs.existsSync(path.join(repoPath, ".env.example"))).toBe(true);
    expect(fs.existsSync(path.join(repoPath, "config", "config.json"))).toBe(true);
    expect(fs.existsSync(path.join(repoPath, "config", "config.example.json"))).toBe(true);
    expect(fs.existsSync(path.join(repoPath, "mailboxes"))).toBe(true);
    expect(fs.existsSync(path.join(repoPath, "workflows"))).toBe(true);
    expect(fs.existsSync(path.join(repoPath, "logs"))).toBe(true);
    expect(fs.existsSync(path.join(repoPath, "README.md"))).toBe(true);

    const pkg = JSON.parse(fs.readFileSync(path.join(repoPath, "package.json"), "utf-8"));
    expect(pkg.name).toBe("narada-sonar");
    expect(pkg.dependencies["@narada2/control-plane"]).toBe("^0.1.0");
    expect(pkg.dependencies["@narada2/cli"]).toBe("^0.1.0");

    const config = JSON.parse(fs.readFileSync(path.join(repoPath, "config", "config.json"), "utf-8"));
    expect(config.root_dir).toBe("./data");
    expect(config.scopes).toEqual([]);

    const envExample = fs.readFileSync(path.join(repoPath, ".env.example"), "utf-8");
    expect(envExample).toContain("GRAPH_ACCESS_TOKEN=");
    expect(envExample).toContain("NARADA_OPENAI_API_KEY=");
    expect(envExample).toContain("GRAPH_TENANT_ID=");
    expect(envExample).toContain("GRAPH_CLIENT_SECRET=");

    // Verify the repo works with existing shaping commands
    const configPath = path.join(repoPath, "config", "config.json");
    wantMailbox("help@example.com", { configPath, posture: "draft-only" });
    const setupResult = setup({ configPath, target: "help@example.com" });
    expect(setupResult.createdPaths.length).toBeGreaterThan(0);
  });

  it("init-repo --local-source generates link: dependencies", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "narada-init-repo-"));
    const repoPath = path.join(tmpDir, "narada-local");
    const result = initRepo(repoPath, { name: "narada-local", localSource: true });

    expect(result.repoPath).toBe(repoPath);
    const pkg = JSON.parse(fs.readFileSync(path.join(repoPath, "package.json"), "utf-8"));
    expect(pkg.dependencies["@narada2/control-plane"]).toMatch(/^link:/);
    expect(pkg.dependencies["@narada2/cli"]).toMatch(/^link:/);
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
            support_steward: [{ tool_id: "check_pg", enabled: true, purpose: "Check PG", read_only: true, timeout_ms: 1000, requires_approval: false, authority_class: "derive" }],
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

  it("preflight fails on missing authority_class", () => {
    const { configPath } = makeOpsRepo();
    wantMailbox("help@example.com", { configPath, posture: "draft-only" });
    const coordinator: CoordinatorConfig = {
      foreman_id: "fm",
      mailbox_bindings: {
        "help@example.com": {
          mailbox_id: "help@example.com",
          available_charters: ["support_steward"],
          default_primary_charter: "support_steward",
          invocation_policies: [],
          knowledge_sources: { support_steward: [] },
          charter_tools: {
            support_steward: [
              { tool_id: "bad", enabled: true, purpose: "Bad", read_only: true, timeout_ms: 1000, requires_approval: false, authority_class: undefined as unknown as "derive" },
            ],
          },
        },
      },
      global_escalation_precedence: [],
      tool_definitions: {},
    };
    const report = preflight("help@example.com", { configPath, coordinatorConfig: coordinator, mailboxIdForTools: "help@example.com" } as any);
    expect(report.checks.some((c) => c.category === "authority" && c.status === "fail" && c.detail.includes("missing authority_class"))).toBe(true);
  });

  it("preflight fails on runtime authority_class without runtime authorization", () => {
    const { configPath } = makeOpsRepo();
    wantMailbox("help@example.com", { configPath, posture: "draft-only" });
    const coordinator: CoordinatorConfig = {
      foreman_id: "fm",
      mailbox_bindings: {
        "help@example.com": {
          mailbox_id: "help@example.com",
          available_charters: ["support_steward"],
          default_primary_charter: "support_steward",
          invocation_policies: [],
          knowledge_sources: { support_steward: [] },
          charter_tools: {
            support_steward: [
              { tool_id: "exec", enabled: true, purpose: "Exec", read_only: false, timeout_ms: 1000, requires_approval: true, authority_class: "execute" },
            ],
          },
        },
      },
      global_escalation_precedence: [],
      tool_definitions: {},
    };
    const report = preflight("help@example.com", { configPath, coordinatorConfig: coordinator, mailboxIdForTools: "help@example.com" } as any);
    expect(report.checks.some((c) => c.category === "authority" && c.status === "fail" && c.detail.includes("without runtime authorization"))).toBe(true);
  });

  it("preflight passes on runtime authority_class with runtime authorization", () => {
    const { configPath } = makeOpsRepo();
    wantMailbox("help@example.com", { configPath, posture: "autonomous" });
    const config = readConfig(configPath)!;
    const scope = findScope(config, "help@example.com")!;
    scope.policy = { ...scope.policy, runtime_authorized: true };
    writeConfig(config, configPath);

    const coordinator: CoordinatorConfig = {
      foreman_id: "fm",
      mailbox_bindings: {
        "help@example.com": {
          mailbox_id: "help@example.com",
          available_charters: ["support_steward"],
          default_primary_charter: "support_steward",
          invocation_policies: [],
          knowledge_sources: { support_steward: [] },
          charter_tools: {
            support_steward: [
              { tool_id: "exec", enabled: true, purpose: "Exec", read_only: false, timeout_ms: 1000, requires_approval: true, authority_class: "execute" },
            ],
          },
        },
      },
      global_escalation_precedence: [],
      tool_definitions: {},
    };
    const report = preflight("help@example.com", { configPath, coordinatorConfig: coordinator, mailboxIdForTools: "help@example.com" } as any);
    expect(report.checks.some((c) => c.category === "authority" && c.status === "pass" && c.detail.includes("runtime authority_class: execute (authorized)"))).toBe(true);
  });

  it("preflight fails on admin authority_class without admin authorization", () => {
    const { configPath } = makeOpsRepo();
    wantMailbox("help@example.com", { configPath, posture: "draft-only" });
    const coordinator: CoordinatorConfig = {
      foreman_id: "fm",
      mailbox_bindings: {
        "help@example.com": {
          mailbox_id: "help@example.com",
          available_charters: ["support_steward"],
          default_primary_charter: "support_steward",
          invocation_policies: [],
          knowledge_sources: { support_steward: [] },
          charter_tools: {
            support_steward: [
              { tool_id: "admin_tool", enabled: true, purpose: "Admin", read_only: false, timeout_ms: 1000, requires_approval: true, authority_class: "admin" },
            ],
          },
        },
      },
      global_escalation_precedence: [],
      tool_definitions: {},
    };
    const report = preflight("help@example.com", { configPath, coordinatorConfig: coordinator, mailboxIdForTools: "help@example.com" } as any);
    expect(report.checks.some((c) => c.category === "authority" && c.status === "fail" && c.detail.includes("without admin authorization"))).toBe(true);
  });

  it("preflight passes on admin authority_class with admin authorization", () => {
    const { configPath } = makeOpsRepo();
    wantMailbox("help@example.com", { configPath, posture: "autonomous" });
    const config = readConfig(configPath)!;
    const scope = findScope(config, "help@example.com")!;
    scope.policy = { ...scope.policy, admin_authorized: true };
    writeConfig(config, configPath);

    const coordinator: CoordinatorConfig = {
      foreman_id: "fm",
      mailbox_bindings: {
        "help@example.com": {
          mailbox_id: "help@example.com",
          available_charters: ["support_steward"],
          default_primary_charter: "support_steward",
          invocation_policies: [],
          knowledge_sources: { support_steward: [] },
          charter_tools: {
            support_steward: [
              { tool_id: "admin_tool", enabled: true, purpose: "Admin", read_only: false, timeout_ms: 1000, requires_approval: true, authority_class: "admin" },
            ],
          },
        },
      },
      global_escalation_precedence: [],
      tool_definitions: {},
    };
    const report = preflight("help@example.com", { configPath, coordinatorConfig: coordinator, mailboxIdForTools: "help@example.com" } as any);
    expect(report.checks.some((c) => c.category === "authority" && c.status === "pass" && c.detail.includes("admin authority_class (authorized)"))).toBe(true);
  });
});
