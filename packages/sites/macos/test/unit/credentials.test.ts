import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveSecret,
  resolveSecretRequired,
  envVarName,
  keychainServiceName,
  setupKeychainAccess,
  _setTestExecImpl,
} from "../../src/credentials.js";

describe("envVarName", () => {
  it("formats basic names", () => {
    expect(envVarName("prod", "api_key")).toBe("NARADA_PROD_API_KEY");
  });

  it("sanitizes special characters", () => {
    expect(envVarName("my-site.dev", "client-secret")).toBe(
      "NARADA_MY_SITE_DEV_CLIENT_SECRET",
    );
  });
});

describe("keychainServiceName", () => {
  it("formats service name", () => {
    expect(keychainServiceName("prod", "api_key")).toBe(
      "dev.narada.site.prod.api_key",
    );
  });
});

describe("resolveSecret", () => {
  const originalEnv = { ...process.env };
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "cred-test-"));
    // Clear narada env vars
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("NARADA_")) delete process.env[key];
    }
    delete process.env.NARADA_SITE_ROOT;
    _setTestExecImpl(undefined);
  });

  afterEach(() => {
    // Restore env
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("NARADA_")) delete process.env[key];
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      process.env[key] = value;
    }
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    _setTestExecImpl(undefined);
  });

  it("returns Keychain value when present", async () => {
    _setTestExecImpl(async () => ({ stdout: "keychain-secret\n", stderr: "" }));

    const result = await resolveSecret("prod", "api_key");
    expect(result).toBe("keychain-secret");
  });

  it("falls back to env var when Keychain fails", async () => {
    _setTestExecImpl(async () => {
      throw new Error("not found");
    });

    process.env.NARADA_PROD_API_KEY = "env-secret";
    const result = await resolveSecret("prod", "api_key");
    expect(result).toBe("env-secret");
  });

  it("falls back to .env file when Keychain and env are absent", async () => {
    _setTestExecImpl(async () => {
      throw new Error("not found");
    });

    const envFile = join(tmpDir, ".env");
    writeFileSync(envFile, "NARADA_PROD_API_KEY=dotenv-secret\n", "utf-8");
    const result = await resolveSecret("prod", "api_key", {
      envFilePath: envFile,
    });
    expect(result).toBe("dotenv-secret");
  });

  it("falls back to config value when all else fails", async () => {
    _setTestExecImpl(async () => {
      throw new Error("not found");
    });

    const result = await resolveSecret("prod", "api_key", {
      configValue: "config-fallback",
    });
    expect(result).toBe("config-fallback");
  });

  it("env var wins over .env file", async () => {
    _setTestExecImpl(async () => {
      throw new Error("not found");
    });

    process.env.NARADA_PROD_API_KEY = "env-wins";
    const envFile = join(tmpDir, ".env");
    writeFileSync(envFile, "NARADA_PROD_API_KEY=dotenv-loses\n", "utf-8");
    const result = await resolveSecret("prod", "api_key", {
      envFilePath: envFile,
    });
    expect(result).toBe("env-wins");
  });

  it("Keychain wins over env var", async () => {
    _setTestExecImpl(async () => ({ stdout: "keychain-wins\n", stderr: "" }));

    process.env.NARADA_PROD_API_KEY = "env-loses";
    const result = await resolveSecret("prod", "api_key");
    expect(result).toBe("keychain-wins");
  });

  it("ignores empty string env var and falls through", async () => {
    _setTestExecImpl(async () => {
      throw new Error("not found");
    });

    process.env.NARADA_PROD_API_KEY = "";
    const result = await resolveSecret("prod", "api_key", {
      configValue: "config-secret",
    });
    expect(result).toBe("config-secret");
  });

  it("returns null when nothing found", async () => {
    _setTestExecImpl(async () => {
      throw new Error("not found");
    });

    const result = await resolveSecret("prod", "api_key");
    expect(result).toBeNull();
  });

  it("resolves from site .env when envFilePath is not overridden", async () => {
    _setTestExecImpl(async () => {
      throw new Error("not found");
    });

    process.env.NARADA_SITE_ROOT = tmpDir;
    const siteRoot = join(tmpDir, "prod");
    mkdirSync(siteRoot, { recursive: true });
    const envFile = join(siteRoot, ".env");
    writeFileSync(envFile, "NARADA_PROD_API_KEY=site-dotenv\n", "utf-8");

    const result = await resolveSecret("prod", "api_key");
    expect(result).toBe("site-dotenv");
  });
});

describe("resolveSecretRequired", () => {
  beforeEach(() => {
    _setTestExecImpl(undefined);
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("NARADA_")) delete process.env[key];
    }
  });

  afterEach(() => {
    _setTestExecImpl(undefined);
  });

  it("throws when secret is not found", async () => {
    _setTestExecImpl(async () => {
      throw new Error("not found");
    });

    await expect(resolveSecretRequired("prod", "api_key")).rejects.toThrow(
      /Required secret "api_key" for site "prod" was not found/,
    );
  });

  it("returns value when found", async () => {
    _setTestExecImpl(async () => ({ stdout: "found-it\n", stderr: "" }));

    const value = await resolveSecretRequired("prod", "api_key");
    expect(value).toBe("found-it");
  });
});

describe("setupKeychainAccess", () => {
  beforeEach(() => {
    _setTestExecImpl(undefined);
  });

  afterEach(() => {
    _setTestExecImpl(undefined);
  });

  it("returns true even when security command fails (prompt may still trigger)", async () => {
    _setTestExecImpl(async () => {
      throw new Error("user canceled");
    });

    const result = await setupKeychainAccess("prod");
    expect(result).toBe(true);
  });

  it("returns true when security command succeeds", async () => {
    _setTestExecImpl(async () => ({ stdout: "test\n", stderr: "" }));

    const result = await setupKeychainAccess("prod");
    expect(result).toBe(true);
  });
});
