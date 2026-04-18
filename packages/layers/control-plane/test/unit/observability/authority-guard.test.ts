import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const observabilityDir = resolve(process.cwd(), "src/observability");

describe("observability authority guardrails", () => {
  it("has ts files to guard", () => {
    const files = execSync(`find ${observabilityDir} -name "*.ts" -type f`, { encoding: "utf8" });
    expect(files.trim().length).toBeGreaterThan(0);
  });

  const forbiddenPatterns = [
    { regex: String.raw`\.run\s*\(`, description: "statement execution (.run)" },
    { regex: String.raw`\.exec\s*\(`, description: "raw db execution (.exec)" },
    { regex: String.raw`updateWorkItemStatus\s*\(`, description: "direct work item mutation" },
    { regex: String.raw`insertWorkItem\s*\(`, description: "direct work item creation" },
    { regex: String.raw`upsertContextRecord\s*\(`, description: "direct context mutation" },
    { regex: String.raw`insertExecutionAttempt\s*\(`, description: "direct execution mutation" },
    { regex: String.raw`updateExecutionAttemptStatus\s*\(`, description: "direct execution mutation" },
    { regex: String.raw`insertAgentSession\s*\(`, description: "direct session mutation" },
    { regex: String.raw`updateAgentSessionStatus\s*\(`, description: "direct session mutation" },
    { regex: String.raw`insertDecision\s*\(`, description: "direct decision mutation" },
    { regex: String.raw`insertToolCallRecord\s*\(`, description: "direct tool call mutation" },
    { regex: String.raw`updateToolCallRecord\s*\(`, description: "direct tool call mutation" },
    { regex: String.raw`insertOverride\s*\(`, description: "direct override mutation" },
    { regex: String.raw`insertOperatorActionRequest\s*\(`, description: "direct operator action mutation" },
    { regex: String.raw`markOperatorActionRequestExecuted\s*\(`, description: "direct operator action mutation" },
    { regex: String.raw`createCommand\s*\(`, description: "direct outbound mutation" },
    { regex: String.raw`updateCommandStatus\s*\(`, description: "direct outbound mutation" },
    { regex: String.raw`appendTransition\s*\(`, description: "direct outbound mutation" },
    { regex: String.raw`admit\s*\(`, description: "direct intent mutation" },
    { regex: String.raw`ingest\s*\(`, description: "direct fact mutation" },
    { regex: String.raw`markAdmitted\s*\(`, description: "direct fact mutation" },
    { regex: String.raw`register\s*\(`, description: "direct worker registry mutation" },
  ];

  for (const { regex, description } of forbiddenPatterns) {
    it(`observability layer contains no ${description}`, () => {
      const output = execSync(
        `grep -rE "${regex}" ${observabilityDir} || true`,
        { encoding: "utf8" },
      );
      expect(output.trim()).toBe("");
    });
  }

  it("does not import mutable store implementations as values", () => {
    // Value imports (not type-only) from store implementation modules are forbidden
    const implementationModules = [
      "../coordinator/store.js",
      "../outbound/store.js",
      "../intent/store.js",
      "../executors/store.js",
      "../facts/store.js",
    ];
    for (const mod of implementationModules) {
      const output = execSync(
        `grep -r "${mod}" ${observabilityDir} | grep -v "import type" || true`,
        { encoding: "utf8" },
      );
      expect(output.trim()).toBe("");
    }
  });

  it("enforces read-only semantics through View type usage", () => {
    const queriesPath = resolve(observabilityDir, "queries.ts");
    const content = execSync(`cat ${queriesPath}`, { encoding: "utf8" });

    // All store parameters in queries.ts must use View types (or Pick of View types)
    const fullStoreTypeParams = [
      /:\s*CoordinatorStore\b(?!View)/,
      /:\s*OutboundStore\b(?!View)/,
      /:\s*IntentStore\b(?!View)/,
      /:\s*ProcessExecutionStore\b(?!View)/,
      /:\s*FactStore\b(?!View)/,
      /:\s*WorkerRegistry\b(?!View)/,
    ];

    for (const pattern of fullStoreTypeParams) {
      expect(content).not.toMatch(pattern);
    }
  });
});
