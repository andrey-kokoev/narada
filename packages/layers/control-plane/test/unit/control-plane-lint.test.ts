import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

describe("control-plane invariant lint", () => {
  it("passes with no mailbox leakage in control-plane modules", () => {
    const scriptPath = resolve(
      "..",
      "..",
      "..",
      "scripts",
      "control-plane-lint.ts",
    );
    const output = execSync(`npx tsx ${scriptPath}`, {
      encoding: "utf8",
      cwd: resolve("..", "..", ".."),
    });
    expect(output).toContain("Control-plane lint passed");
  });

  it("has no stale allowlist entries", () => {
    const scriptPath = resolve("..", "..", "..", "scripts", "control-plane-lint.ts");
    const output = execSync(`npx tsx ${scriptPath} --stale`, {
      encoding: "utf8",
      cwd: resolve("..", "..", ".."),
    });
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
    const scriptPath = resolve("..", "..", "..", "scripts", "control-plane-lint.ts");
    const output = execSync(`npx tsx ${scriptPath} --stats`, {
      encoding: "utf8",
      cwd: resolve("..", "..", ".."),
    });
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
    const scriptPath = resolve("..", "..", "..", "scripts", "control-plane-lint.ts");
    const output = execSync(`npx tsx ${scriptPath} --wildcards`, {
      encoding: "utf8",
      cwd: resolve("..", "..", ".."),
    });
    const wildcardFiles = JSON.parse(output.trim()) as string[];
    expect(wildcardFiles).toEqual([]);
  });
});
