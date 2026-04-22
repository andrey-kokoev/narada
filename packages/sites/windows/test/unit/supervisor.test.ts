import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  generateSystemdUnits,
  generateCronEntry,
  generateShellScript,
  writeSystemdUnits,
  writeShellScript,
} from "../../src/supervisor.js";
import type { WindowsSiteConfig } from "../../src/types.js";

describe("supervisor templates", () => {
  let tempDir: string;
  let config: WindowsSiteConfig;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "narada-supervisor-test-"));
    config = {
      site_id: "test-site",
      variant: "wsl",
      site_root: tempDir,
      config_path: join(tempDir, "config.json"),
      cycle_interval_minutes: 5,
      lock_ttl_ms: 35_000,
      ceiling_ms: 30_000,
    };
    process.env.NARADA_SITE_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.NARADA_SITE_ROOT;
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("generateSystemdUnits", () => {
    it("generates a service file containing the site id", async () => {
      const { service } = await generateSystemdUnits(config);
      expect(service).toContain("test-site");
      expect(service).toContain("Type=oneshot");
      expect(service).toContain("narada cycle --site test-site");
    });

    it("generates a timer file with the correct interval", async () => {
      const { timer } = await generateSystemdUnits(config);
      expect(timer).toContain("OnUnitActiveSec=5min");
      expect(timer).toContain("Persistent=true");
    });

    it("includes safety limits from config", async () => {
      const { service } = await generateSystemdUnits(config);
      expect(service).toContain("TimeoutStartSec=30");
      expect(service).toContain("MemoryMax=512M");
    });
  });

  describe("writeSystemdUnits", () => {
    it("writes unit files to the site directory", async () => {
      const { servicePath, timerPath } = await writeSystemdUnits(config);
      expect(readFileSync(servicePath, "utf8")).toContain("test-site");
      expect(readFileSync(timerPath, "utf8")).toContain("5min");
    });
  });

  describe("generateCronEntry", () => {
    it("generates a cron entry with the site id and path", () => {
      const entry = generateCronEntry(config);
      expect(entry).toContain("test-site");
      expect(entry).toContain("narada cycle --site test-site");
      expect(entry).toContain("*/5 * * * *");
    });

    it("uses hourly cron for intervals >= 60 minutes", () => {
      const hourlyConfig = { ...config, cycle_interval_minutes: 120 };
      const entry = generateCronEntry(hourlyConfig);
      expect(entry).toContain("0 */2 * * *");
    });
  });

  describe("generateShellScript", () => {
    it("generates a bash script with set -euo pipefail", () => {
      const script = generateShellScript(config);
      expect(script).toContain("#!/bin/bash");
      expect(script).toContain("set -euo pipefail");
      expect(script).toContain("narada cycle --site");
      expect(script).toContain("test-site");
    });
  });

  describe("writeShellScript", () => {
    it("writes the script to the site directory", async () => {
      const path = await writeShellScript(config);
      const content = readFileSync(path, "utf8");
      expect(content).toContain("#!/bin/bash");
    });
  });
});
