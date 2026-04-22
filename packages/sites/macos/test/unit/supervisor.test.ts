import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  generateLaunchAgentPlist,
  generateWrapperScript,
  writeLaunchAgentFiles,
  generateLoadCommand,
  generateUnloadCommand,
  generateStatusCommand,
} from "../../src/supervisor.js";
import type { MacosSiteConfig } from "../../src/types.js";

describe("supervisor templates", () => {
  let tempDir: string;
  let config: MacosSiteConfig;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "narada-macos-supervisor-test-"));
    config = {
      site_id: "test-site",
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

  describe("generateLaunchAgentPlist", () => {
    it("generates valid XML plist with correct Label", () => {
      const plist = generateLaunchAgentPlist(config, "/usr/local/bin/node", "/tmp/run.sh");
      expect(plist).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(plist).toContain("<plist version=\"1.0\">");
      expect(plist).toContain("<key>Label</key>");
      expect(plist).toContain("<string>dev.narada.site.test-site</string>");
    });

    it("includes StartInterval in seconds", () => {
      const plist = generateLaunchAgentPlist(config, "/usr/local/bin/node", "/tmp/run.sh");
      expect(plist).toContain("<key>StartInterval</key>");
      expect(plist).toContain("<integer>300</integer>");
    });

    it("includes ProgramArguments with script path", () => {
      const plist = generateLaunchAgentPlist(config, "/usr/local/bin/node", "/tmp/run.sh");
      expect(plist).toContain("<key>ProgramArguments</key>");
      expect(plist).toContain("<array>");
      expect(plist).toContain("<string>/tmp/run.sh</string>");
    });

    it("includes RunAtLoad", () => {
      const plist = generateLaunchAgentPlist(config, "/usr/local/bin/node", "/tmp/run.sh");
      expect(plist).toContain("<key>RunAtLoad</key>");
      expect(plist).toContain("<true/>");
    });

    it("includes WorkingDirectory", () => {
      const plist = generateLaunchAgentPlist(config, "/usr/local/bin/node", "/tmp/run.sh");
      expect(plist).toContain("<key>WorkingDirectory</key>");
      expect(plist).toContain(`<string>${tempDir}</string>`);
    });

    it("includes EnvironmentVariables with PATH", () => {
      const plist = generateLaunchAgentPlist(config, "/usr/local/bin/node", "/tmp/run.sh");
      expect(plist).toContain("<key>EnvironmentVariables</key>");
      expect(plist).toContain("<key>PATH</key>");
      expect(plist).toContain("/opt/homebrew/bin");
    });

    it("escapes XML special characters in paths", () => {
      const specialConfig = { ...config, site_root: "/tmp/narada<test>&foo'bar" };
      const plist = generateLaunchAgentPlist(specialConfig, "/usr/local/bin/node", "/tmp/run.sh");
      expect(plist).not.toContain("<string>/tmp/narada<test>&foo'bar");
      expect(plist).toContain("&lt;");
      expect(plist).toContain("&gt;");
      expect(plist).toContain("&amp;");
    });
  });

  describe("generateWrapperScript", () => {
    it("includes shebang and set -euo pipefail", () => {
      const script = generateWrapperScript(tempDir, "/usr/local/bin/node", "test-site");
      expect(script).toContain("#!/bin/zsh");
      expect(script).toContain("set -euo pipefail");
    });

    it("quotes the site root path", () => {
      const script = generateWrapperScript(tempDir, "/usr/local/bin/node", "test-site");
      expect(script).toContain(`SITE_ROOT='${tempDir}'`);
    });

    it("handles paths with single quotes by using double quotes", () => {
      const script = generateWrapperScript("/tmp/foo'bar", "/usr/local/bin/node", "test-site");
      expect(script).toContain('SITE_ROOT="');
    });

    it("exports NODE_ENV=production", () => {
      const script = generateWrapperScript(tempDir, "/usr/local/bin/node", "test-site");
      expect(script).toContain('export NODE_ENV=production');
    });

    it("uses cd with quoted variable", () => {
      const script = generateWrapperScript(tempDir, "/usr/local/bin/node", "test-site");
      expect(script).toContain('cd "${SITE_ROOT}"');
    });

    it("invokes node with exec", () => {
      const script = generateWrapperScript(tempDir, "/usr/local/bin/node", "test-site");
      expect(script).toContain('exec "${NODE_PATH}"');
      expect(script).toContain("require('@narada2/macos-site')");
    });
  });

  describe("writeLaunchAgentFiles", () => {
    it("writes wrapper script and plist to disk", async () => {
      const { plistPath, scriptPath } = await writeLaunchAgentFiles(config);

      const script = readFileSync(scriptPath, "utf8");
      expect(script).toContain("#!/bin/zsh");

      const plist = readFileSync(plistPath, "utf8");
      expect(plist).toContain("dev.narada.site.test-site");
    });
  });

  describe("generateLoadCommand", () => {
    it("contains launchctl load and the plist path", () => {
      const cmd = generateLoadCommand("test-site");
      expect(cmd).toContain("launchctl load");
      expect(cmd).toContain("dev.narada.site.test-site.plist");
    });
  });

  describe("generateUnloadCommand", () => {
    it("contains launchctl unload and the plist path", () => {
      const cmd = generateUnloadCommand("test-site");
      expect(cmd).toContain("launchctl unload");
      expect(cmd).toContain("dev.narada.site.test-site.plist");
    });
  });

  describe("generateStatusCommand", () => {
    it("contains launchctl list and the site label", () => {
      const cmd = generateStatusCommand("test-site");
      expect(cmd).toContain("launchctl list");
      expect(cmd).toContain("dev.narada.site.test-site");
    });
  });
});
