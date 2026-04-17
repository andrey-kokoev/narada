import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

describe("kernel invariant lint", () => {
  it("passes with no mailbox leakage in kernel modules", () => {
    const scriptPath = resolve(
      "..",
      "..",
      "scripts",
      "kernel-lint.ts",
    );
    const output = execSync(`npx tsx ${scriptPath}`, {
      encoding: "utf8",
      cwd: resolve("..", ".."),
    });
    expect(output).toContain("Kernel lint passed");
  });

  it("has no stale allowlist entries", () => {
    const scriptPath = resolve("..", "..", "scripts", "kernel-lint.ts");
    const output = execSync(`npx tsx ${scriptPath} --stale`, {
      encoding: "utf8",
      cwd: resolve("..", ".."),
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
    const scriptPath = resolve("..", "..", "scripts", "kernel-lint.ts");
    const output = execSync(`npx tsx ${scriptPath} --stats`, {
      encoding: "utf8",
      cwd: resolve("..", ".."),
    });
    const { fileKeys, patternCount } = JSON.parse(output.trim()) as {
      fileKeys: number;
      patternCount: number;
    };

    // Current counts after Task 090 narrowing.
    // If you need to increase these, you must document the rationale in ALLOWLIST comments
    // and get sign-off because the invariant is: exceptions must be scarce and shrinking.
    expect(fileKeys).toBeLessThanOrEqual(10);
    expect(patternCount).toBeLessThanOrEqual(27);
  });

  it("only mail-compat-types.ts may use the wildcard allowlist", () => {
    const scriptPath = resolve("..", "..", "scripts", "kernel-lint.ts");
    const output = execSync(`npx tsx ${scriptPath} --wildcards`, {
      encoding: "utf8",
      cwd: resolve("..", ".."),
    });
    const wildcardFiles = JSON.parse(output.trim()) as string[];
    expect(wildcardFiles).toEqual(["coordinator/mail-compat-types.ts"]);
  });
});
