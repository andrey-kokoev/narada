/**
 * Health record write/read for macOS Sites.
 *
 * Wraps computeHealthTransition from the control plane and persists
 * the result to the site-local SQLite coordinator.
 */

import { computeHealthTransition, type HealthStatus } from "@narada2/control-plane";
import type { SiteHealthRecord, MacosCycleOutcome } from "./types.js";
import { SqliteSiteCoordinator, openCoordinatorDb } from "./coordinator.js";

/**
 * Write a health record after a Cycle outcome.
 */
export async function writeHealthRecord(
  siteId: string,
  outcome: MacosCycleOutcome,
  startedAt: string,
): Promise<SiteHealthRecord> {
  const db = openCoordinatorDb(siteId);
  const coordinator = new SqliteSiteCoordinator(db);
  try {
    const previousHealth = coordinator.getHealth(siteId);
    const durationMs = Date.now() - new Date(startedAt).getTime();
    const transition = computeHealthTransition(
      previousHealth.status,
      previousHealth.consecutive_failures,
      outcome,
    );
    const record: SiteHealthRecord = {
      site_id: siteId,
      status: transition.status as HealthStatus,
      last_cycle_at: startedAt,
      last_cycle_duration_ms: durationMs,
      consecutive_failures: transition.consecutiveFailures,
      message: transition.message,
      updated_at: new Date().toISOString(),
    };
    coordinator.setHealth(record);
    return record;
  } finally {
    coordinator.close();
  }
}

/**
 * Read the current health record for a macOS Site.
 */
export async function readHealthRecord(siteId: string): Promise<SiteHealthRecord> {
  const db = openCoordinatorDb(siteId);
  const coordinator = new SqliteSiteCoordinator(db);
  try {
    return coordinator.getHealth(siteId);
  } finally {
    coordinator.close();
  }
}
