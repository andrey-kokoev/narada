import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  envVarName,
  resolveSecret,
  resolveSecretRequired,
} from "../src/credentials.js";

describe("credentials", () => {
  const testRoot = join(tmpdir(), "narada-linux-cred-test-" + Date.now());

  beforeEach(async () => {
    process.env.NARADA_SITE_ROOT = testRoot;
    await mkdir(testRoot, { recursive: true });
  });

  afterEach(async () => {
    delete process.env.NARADA_SITE_ROOT;
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("NARADA_")) {
        delete process.env[key];
      }
    }
    try {
      await rm(testRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe("envVarName", () => {
    it("builds uppercased sanitized env var name", () => {
      expect(envVarName("my-site", "api-key")).toBe("NARADA_MY_SITE_API_KEY");
    });

    it("handles alphanumeric site ids and secrets", () => {
      expect(envVarName("site1", "token")).toBe("NARADA_SITE1_TOKEN");
    });
  });

  describe("resolveSecret", () => {
    it("returns null when secret is not found anywhere", async () => {
      const result = await resolveSecret("test-site", "user", "missing-secret");
      expect(result).toBeNull();
    });

    it("resolves from environment variable in both modes", async () => {
      process.env.NARADA_TEST_SITE_API_KEY = "env-value";

      const systemResult = await resolveSecret("test-site", "system", "api-key");
      expect(systemResult).toBe("env-value");

      const userResult = await resolveSecret("test-site", "user", "api-key");
      expect(userResult).toBe("env-value");
    });

    it("resolves from .env file when env var is absent", async () => {
      const siteRoot = join(testRoot, "test-site");
      await mkdir(siteRoot, { recursive: true });
      await writeFile(
        join(siteRoot, ".env"),
        'NARADA_TEST_SITE_API_KEY="dotenv-value"\n',
        "utf8"
      );

      const result = await resolveSecret("test-site", "user", "api-key");
      expect(result).toBe("dotenv-value");
    });

    it("resolves from config value when env and .env are absent", async () => {
      const result = await resolveSecret("test-site", "user", "api-key", {
        configValue: "config-value",
      });
      expect(result).toBe("config-value");
    });

    it("prefers env var over .env and config", async () => {
      process.env.NARADA_TEST_SITE_API_KEY = "env-wins";
      const siteRoot = join(testRoot, "test-site");
      await mkdir(siteRoot, { recursive: true });
      await writeFile(
        join(siteRoot, ".env"),
        'NARADA_TEST_SITE_API_KEY="dotenv-loses"\n',
        "utf8"
      );

      const result = await resolveSecret("test-site", "user", "api-key", {
        configValue: "config-loses",
      });
      expect(result).toBe("env-wins");
    });

    it("prefers .env over config when env is absent", async () => {
      const siteRoot = join(testRoot, "test-site");
      await mkdir(siteRoot, { recursive: true });
      await writeFile(
        join(siteRoot, ".env"),
        'NARADA_TEST_SITE_API_KEY="dotenv-wins"\n',
        "utf8"
      );

      const result = await resolveSecret("test-site", "user", "api-key", {
        configValue: "config-loses",
      });
      expect(result).toBe("dotenv-wins");
    });

    it("ignores empty strings in env var", async () => {
      process.env.NARADA_TEST_SITE_API_KEY = "";
      const result = await resolveSecret("test-site", "user", "api-key", {
        configValue: "fallback",
      });
      expect(result).toBe("fallback");
    });

    it("ignores empty strings in .env", async () => {
      const siteRoot = join(testRoot, "test-site");
      await mkdir(siteRoot, { recursive: true });
      await writeFile(
        join(siteRoot, ".env"),
        'NARADA_TEST_SITE_API_KEY=""\n',
        "utf8"
      );

      const result = await resolveSecret("test-site", "user", "api-key", {
        configValue: "fallback",
      });
      expect(result).toBe("fallback");
    });

    it("strips quotes from .env values", async () => {
      const siteRoot = join(testRoot, "test-site");
      await mkdir(siteRoot, { recursive: true });
      await writeFile(
        join(siteRoot, ".env"),
        `NARADA_TEST_SITE_API_KEY='single-quoted'\nNARADA_TEST_SITE_OTHER="double-quoted"\n`,
        "utf8"
      );

      const single = await resolveSecret("test-site", "user", "api-key");
      expect(single).toBe("single-quoted");

      const double = await resolveSecret("test-site", "user", "other");
      expect(double).toBe("double-quoted");
    });

    it("uses custom envFilePath when provided", async () => {
      const customEnv = join(testRoot, "custom.env");
      await writeFile(
        customEnv,
        'NARADA_TEST_SITE_API_KEY="custom-env-value"\n',
        "utf8"
      );

      const result = await resolveSecret("test-site", "user", "api-key", {
        envFilePath: customEnv,
      });
      expect(result).toBe("custom-env-value");
    });

    it("does not require live secret stores", async () => {
      // This test verifies that v0 resolution works without systemd,
      // Secret Service, or pass installed.
      process.env.NARADA_TEST_SITE_API_KEY = "works-without-stores";
      const result = await resolveSecret("test-site", "system", "api-key");
      expect(result).toBe("works-without-stores");
    });
  });

  describe("resolveSecretRequired", () => {
    it("returns the secret when found", async () => {
      process.env.NARADA_TEST_SITE_API_KEY = "found-it";
      const result = await resolveSecretRequired("test-site", "user", "api-key");
      expect(result).toBe("found-it");
    });

    it("throws a clear error when secret is not found in system mode", async () => {
      await expect(
        resolveSecretRequired("test-site", "system", "api-key")
      ).rejects.toThrow(/Required secret "api-key" for site "test-site"/);
    });

    it("throws a clear error when secret is not found in user mode", async () => {
      await expect(
        resolveSecretRequired("test-site", "user", "api-key")
      ).rejects.toThrow(/Required secret "api-key" for site "test-site"/);
    });
  });
});
