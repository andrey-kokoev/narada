import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveSecret,
  resolveSecretRequired,
  envVarName,
  credentialManagerTarget,
} from "../../src/credentials.js";

describe("envVarName", () => {
  it("formats basic names", () => {
    expect(envVarName("prod", "api_key")).toBe("NARADA_PROD_API_KEY");
  });

  it("sanitizes special characters", () => {
    expect(envVarName("my-site.dev", "client-secret")).toBe(
      "NARADA_MY_SITE_DEV_CLIENT_SECRET"
    );
  });
});

describe("credentialManagerTarget", () => {
  it("formats target name", () => {
    expect(credentialManagerTarget("prod", "api_key")).toBe(
      "Narada/prod/api_key"
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
  });

  it("returns env var value when present", async () => {
    process.env.NARADA_PROD_API_KEY = "env-secret";
    const result = await resolveSecret("prod", "api_key", "wsl");
    expect(result).toBe("env-secret");
  });

  it("ignores empty string env var and falls through", async () => {
    process.env.NARADA_PROD_API_KEY = "";
    const result = await resolveSecret("prod", "api_key", "wsl", {
      configValue: "config-secret",
    });
    expect(result).toBe("config-secret");
  });

  it("reads .env file when env var is absent", async () => {
    const envFile = join(tmpDir, ".env");
    writeFileSync(envFile, "NARADA_PROD_API_KEY=dotenv-secret\n", "utf-8");
    const result = await resolveSecret("prod", "api_key", "wsl", {
      envFilePath: envFile,
    });
    expect(result).toBe("dotenv-secret");
  });

  it("env var wins over .env file", async () => {
    process.env.NARADA_PROD_API_KEY = "env-wins";
    const envFile = join(tmpDir, ".env");
    writeFileSync(envFile, "NARADA_PROD_API_KEY=dotenv-loses\n", "utf-8");
    const result = await resolveSecret("prod", "api_key", "wsl", {
      envFilePath: envFile,
    });
    expect(result).toBe("env-wins");
  });

  it(".env file wins over config value", async () => {
    const envFile = join(tmpDir, ".env");
    writeFileSync(envFile, "NARADA_PROD_API_KEY=dotenv-wins\n", "utf-8");
    const result = await resolveSecret("prod", "api_key", "wsl", {
      envFilePath: envFile,
      configValue: "config-loses",
    });
    expect(result).toBe("dotenv-wins");
  });

  it("config value is last resort", async () => {
    const result = await resolveSecret("prod", "api_key", "wsl", {
      configValue: "config-fallback",
    });
    expect(result).toBe("config-fallback");
  });

  it("returns null when nothing found", async () => {
    const result = await resolveSecret("prod", "api_key", "wsl");
    expect(result).toBeNull();
  });

  it("throws on native variant when not on Windows", async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "linux" });

    await expect(resolveSecret("prod", "api_key", "native")).rejects.toThrow(
      /Windows Credential Manager resolution requested.*but the current platform.*is not Windows/
    );

    if (originalPlatform) {
      Object.defineProperty(process, "platform", originalPlatform);
    }
  });

  it("allows native variant on win32 platform", async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
    const originalLocalAppData = process.env.LOCALAPPDATA;
    Object.defineProperty(process, "platform", { value: "win32" });
    process.env.LOCALAPPDATA = "C:\\Users\\Test\\AppData\\Local";

    process.env.NARADA_PROD_API_KEY = "win-secret";
    const result = await resolveSecret("prod", "api_key", "native");
    expect(result).toBe("win-secret");

    if (originalPlatform) {
      Object.defineProperty(process, "platform", originalPlatform);
    }
    if (originalLocalAppData === undefined) {
      delete process.env.LOCALAPPDATA;
    } else {
      process.env.LOCALAPPDATA = originalLocalAppData;
    }
  });
});

describe("resolveSecretRequired", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("NARADA_")) delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("NARADA_")) delete process.env[key];
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      process.env[key] = value;
    }
  });

  it("returns value when found", async () => {
    process.env.NARADA_PROD_API_KEY = "found-it";
    const result = await resolveSecretRequired("prod", "api_key", "wsl");
    expect(result).toBe("found-it");
  });

  it("throws actionable error when missing", async () => {
    await expect(
      resolveSecretRequired("prod", "api_key", "wsl")
    ).rejects.toThrow(
      /Required secret "api_key" for site "prod" was not found/
    );
  });

  it("error mentions env var name", async () => {
    await expect(
      resolveSecretRequired("prod", "api_key", "wsl")
    ).rejects.toThrow(/NARADA_PROD_API_KEY/);
  });

  it("error mentions Credential Manager target for native", async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
    const originalLocalAppData = process.env.LOCALAPPDATA;
    Object.defineProperty(process, "platform", { value: "win32" });
    process.env.LOCALAPPDATA = "C:\\Users\\Test\\AppData\\Local";

    await expect(
      resolveSecretRequired("prod", "api_key", "native")
    ).rejects.toThrow(/Narada\/prod\/api_key/);

    if (originalPlatform) {
      Object.defineProperty(process, "platform", originalPlatform);
    }
    if (originalLocalAppData === undefined) {
      delete process.env.LOCALAPPDATA;
    } else {
      process.env.LOCALAPPDATA = originalLocalAppData;
    }
  });
});
