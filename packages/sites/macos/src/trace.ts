/**
 * Trace persistence for macOS Sites.
 *
 * Appends compact cycle traces to SQLite and writes large artifacts
 * to the filesystem.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { CycleTraceRecord } from "./types.js";
import { siteTracesPath } from "./path-utils.js";
import { SqliteSiteCoordinator, openCoordinatorDb } from "./coordinator.js";

/**
 * Append a cycle trace record to the site-local SQLite.
 */
export async function appendCycleTrace(
  siteId: string,
  trace: CycleTraceRecord,
): Promise<void> {
  const db = openCoordinatorDb(siteId);
  const coordinator = new SqliteSiteCoordinator(db);
  try {
    coordinator.setLastCycleTrace(trace);
  } finally {
    coordinator.close();
  }
}

/**
 * Write a large trace artifact JSON to the filesystem.
 */
export async function writeTraceArtifact(
  siteId: string,
  cycleId: string,
  artifact: unknown,
): Promise<string> {
  const tracesDir = siteTracesPath(siteId);
  await mkdir(tracesDir, { recursive: true });
  const artifactPath = join(tracesDir, `${cycleId}.json`);
  await writeFile(artifactPath, JSON.stringify(artifact, null, 2), "utf8");
  return artifactPath;
}
