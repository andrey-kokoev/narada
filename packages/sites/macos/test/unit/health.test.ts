import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeHealthRecord, readHealthRecord } from "../../src/health.js";

describe("health", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "narada-macos-health-test-"));
    process.env.NARADA_SITE_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.NARADA_SITE_ROOT;
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("writeHealthRecord", () => {
    it("writes a healthy record after success", async () => {
      const record = await writeHealthRecord("test-site", "success", "2024-01-01T00:00:00Z");
      expect(record.site_id).toBe("test-site");
      expect(record.status).toBe("healthy");
      expect(record.consecutive_failures).toBe(0);
      expect(record.message).toContain("success");
    });

    it("writes a degraded record after first failure", async () => {
      // First success to establish baseline
      await writeHealthRecord("test-site", "success", "2024-01-01T00:00:00Z");
      const record = await writeHealthRecord("test-site", "failure", "2024-01-01T00:01:00Z");
      expect(record.status).toBe("degraded");
      expect(record.consecutive_failures).toBe(1);
    });

    it("writes a critical record after three failures", async () => {
      await writeHealthRecord("test-site", "success", "2024-01-01T00:00:00Z");
      await writeHealthRecord("test-site", "failure", "2024-01-01T00:01:00Z");
      await writeHealthRecord("test-site", "failure", "2024-01-01T00:02:00Z");
      const record = await writeHealthRecord("test-site", "failure", "2024-01-01T00:03:00Z");
      expect(record.status).toBe("critical");
      expect(record.consecutive_failures).toBe(3);
    });

    it("resets to healthy after success following failures", async () => {
      await writeHealthRecord("test-site", "failure", "2024-01-01T00:01:00Z");
      await writeHealthRecord("test-site", "failure", "2024-01-01T00:02:00Z");
      const record = await writeHealthRecord("test-site", "success", "2024-01-01T00:03:00Z");
      expect(record.status).toBe("healthy");
      expect(record.consecutive_failures).toBe(0);
    });

    it("writes auth_failed record after auth_failure", async () => {
      const record = await writeHealthRecord("test-site", "auth_failure", "2024-01-01T00:00:00Z");
      expect(record.status).toBe("auth_failed");
    });
  });

  describe("readHealthRecord", () => {
    it("reads back the written record", async () => {
      await writeHealthRecord("read-site", "success", "2024-01-01T00:00:00Z");
      const record = await readHealthRecord("read-site");
      expect(record.site_id).toBe("read-site");
      expect(record.status).toBe("healthy");
    });

    it("returns default healthy record when none exists", async () => {
      const record = await readHealthRecord("new-site");
      expect(record.status).toBe("healthy");
      expect(record.consecutive_failures).toBe(0);
      expect(record.message).toBe("No cycles recorded yet");
    });
  });
});
