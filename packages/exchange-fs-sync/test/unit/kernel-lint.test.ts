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
});
