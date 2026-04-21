import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadEnvFile } from "../../../src/config/dotenv.js";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("loadEnvFile", () => {
  const testEnvPath = join(tmpdir(), `narada-dotenv-test-${Date.now()}.env`);

  beforeEach(() => {
    delete process.env.NARADA_DOTENV_TEST_KEY;
    delete process.env.NARADA_DOTENV_TEST_KEY2;
    delete process.env.NARADA_DOTENV_TEST_KEY3;
  });

  afterEach(() => {
    if (existsSync(testEnvPath)) {
      unlinkSync(testEnvPath);
    }
    delete process.env.NARADA_DOTENV_TEST_KEY;
    delete process.env.NARADA_DOTENV_TEST_KEY2;
    delete process.env.NARADA_DOTENV_TEST_KEY3;
  });

  it("loads variables from .env file", () => {
    writeFileSync(testEnvPath, "NARADA_DOTENV_TEST_KEY=from_env_file\n", "utf-8");
    loadEnvFile(testEnvPath);
    expect(process.env.NARADA_DOTENV_TEST_KEY).toBe("from_env_file");
  });

  it("does not override already-exported variables", () => {
    process.env.NARADA_DOTENV_TEST_KEY = "already_set";
    writeFileSync(testEnvPath, "NARADA_DOTENV_TEST_KEY=from_env_file\n", "utf-8");
    loadEnvFile(testEnvPath);
    expect(process.env.NARADA_DOTENV_TEST_KEY).toBe("already_set");
  });

  it("silently no-ops when file does not exist", () => {
    const missingPath = join(tmpdir(), `narada-dotenv-missing-${Date.now()}.env`);
    expect(() => loadEnvFile(missingPath)).not.toThrow();
    expect(process.env.NARADA_DOTENV_TEST_KEY).toBeUndefined();
  });

  it("skips comments and blank lines", () => {
    writeFileSync(
      testEnvPath,
      "\n# this is a comment\nNARADA_DOTENV_TEST_KEY=value1\n\nNARADA_DOTENV_TEST_KEY2=value2\n",
      "utf-8",
    );
    loadEnvFile(testEnvPath);
    expect(process.env.NARADA_DOTENV_TEST_KEY).toBe("value1");
    expect(process.env.NARADA_DOTENV_TEST_KEY2).toBe("value2");
  });

  it("handles values with equals signs", () => {
    writeFileSync(testEnvPath, "NARADA_DOTENV_TEST_KEY=foo=bar=baz\n", "utf-8");
    loadEnvFile(testEnvPath);
    expect(process.env.NARADA_DOTENV_TEST_KEY).toBe("foo=bar=baz");
  });

  it("trims keys and values", () => {
    writeFileSync(testEnvPath, "  NARADA_DOTENV_TEST_KEY  =  spaced_value  \n", "utf-8");
    loadEnvFile(testEnvPath);
    expect(process.env.NARADA_DOTENV_TEST_KEY).toBe("spaced_value");
  });
});
