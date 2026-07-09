import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { runHiddenPostureCommandSync } from "@narada2/process-launch-posture";

const packageRoot = resolve("..", "..", "..");
const scriptPath = resolve(packageRoot, "scripts", "control-plane-lint.ts");

function runLint(args: string[] = []): string {
  const result = runHiddenPostureCommandSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["tsx", scriptPath, ...args],
    { cwd: packageRoot, posture: "test_child" },
  );
  if (result.status !== 0) {
    throw new Error(`control_plane_lint_failed:${result.status}:${String(result.stderr ?? "")}`);
  }
  return String(result.stdout ?? "");
}

describe("control-plane invariant lint", () => {
  it("passes with no mailbox leakage in control-plane modules", () => {
    const output = runLint();
    expect(output).toContain("Control-plane lint passed");
  });

  it("has no stale allowlist entries", () => {
    const output = runLint(["--stale"]);
    const stale = JSON.parse(output.trim()) as Array<{
      file: string;
      pattern: string;
    }>;
    if (stale.length > 0) {
      const details = stale
        .map((s) => `  ${s.file}: unused pattern "${s.pattern}"`)
        .join("\n");
      throw new Error(`Stale allowlist entries detected:\n${details}`);
    }
    expect(stale).toHaveLength(0);
  });

  it("allowlist does not grow without explicit justification", () => {
    const output = runLint(["--stats"]);
    const { fileKeys, patternCount } = JSON.parse(output.trim()) as {
      fileKeys: number;
      patternCount: number;
    };

    // Current counts after Task 097 boundary tightening.
    // Increased from 10 to 11 because we extracted mail-vertical code into
    // dedicated */mailbox/* sub-modules (foreman/mailbox/context-strategy.ts,
    // charter/mailbox/materializer.ts). This makes boundaries structurally obvious
    // and the allowlist accurately reflects explicit vertical-local modules.
    expect(fileKeys).toBeLessThanOrEqual(11);
    expect(patternCount).toBeLessThanOrEqual(28);
  });

  it("only mail-compat-types.ts may use the wildcard allowlist", () => {
    const output = runLint(["--wildcards"]);
    const wildcardFiles = JSON.parse(output.trim()) as string[];
    expect(wildcardFiles).toEqual([]);
  });
});
