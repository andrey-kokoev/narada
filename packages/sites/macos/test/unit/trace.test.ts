import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendCycleTrace, writeTraceArtifact } from "../../src/trace.js";
import { SqliteSiteCoordinator, openCoordinatorDb } from "../../src/coordinator.js";

describe("trace", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "narada-macos-trace-test-"));
    process.env.NARADA_SITE_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.NARADA_SITE_ROOT;
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("appendCycleTrace", () => {
    it("inserts a trace record into SQLite", async () => {
      const trace = {
        cycle_id: "cycle-1",
        site_id: "trace-site",
        started_at: "2024-01-01T00:00:00Z",
        finished_at: "2024-01-01T00:00:01Z",
        status: "complete" as const,
        steps_completed: [1, 2, 3, 4, 5, 6, 7, 8],
        error: null,
      };

      await appendCycleTrace("trace-site", trace);

      const db = openCoordinatorDb("trace-site");
      const coordinator = new SqliteSiteCoordinator(db);
      try {
        const lastTrace = coordinator.getLastCycleTrace("trace-site");
        expect(lastTrace).not.toBeNull();
        expect(lastTrace!.cycle_id).toBe("cycle-1");
        expect(lastTrace!.status).toBe("complete");
      } finally {
        coordinator.close();
      }
    });
  });

  describe("writeTraceArtifact", () => {
    it("writes a JSON artifact to the traces directory", async () => {
      const artifact = {
        cycle_id: "cycle-2",
        steps: [
          { step: 1, name: "lock", duration_ms: 10 },
          { step: 2, name: "sync", duration_ms: 500 },
        ],
      };

      const path = await writeTraceArtifact("artifact-site", "cycle-2", artifact);
      expect(existsSync(path)).toBe(true);

      const content = JSON.parse(readFileSync(path, "utf8"));
      expect(content.cycle_id).toBe("cycle-2");
      expect(content.steps).toHaveLength(2);
    });
  });
});
