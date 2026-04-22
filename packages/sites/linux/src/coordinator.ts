import type { Database } from "better-sqlite3";
import type { SiteHealthRecord, CycleTraceRecord, LinuxSiteMode } from "./types.js";
import { siteDbPath } from "./path-utils.js";

export interface LinuxSiteCoordinator {
  getHealth(siteId: string): SiteHealthRecord;
  setHealth(record: SiteHealthRecord): void;
  getLastCycleTrace(siteId: string): CycleTraceRecord | null;
  setLastCycleTrace(record: CycleTraceRecord): void;
  close(): void;
}

export class SqliteSiteCoordinator implements LinuxSiteCoordinator {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS site_health (
        site_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        last_cycle_at TEXT,
        last_cycle_duration_ms INTEGER,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        message TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cycle_traces (
        cycle_id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT NOT NULL,
        status TEXT NOT NULL,
        steps_completed TEXT NOT NULL,
        error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_cycle_traces_site_id ON cycle_traces(site_id);
    `);
  }

  getHealth(siteId: string): SiteHealthRecord {
    const row = this.db
      .prepare(
        `SELECT site_id, status, last_cycle_at, last_cycle_duration_ms,
                consecutive_failures, message, updated_at
         FROM site_health WHERE site_id = ?`
      )
      .get(siteId) as
      | {
          site_id: string;
          status: string;
          last_cycle_at: string | null;
          last_cycle_duration_ms: number | null;
          consecutive_failures: number;
          message: string;
          updated_at: string;
        }
      | undefined;

    if (!row) {
      return {
        site_id: siteId,
        status: "healthy",
        last_cycle_at: null,
        last_cycle_duration_ms: null,
        consecutive_failures: 0,
        message: "No cycles recorded yet",
        updated_at: new Date().toISOString(),
      };
    }

    return {
      site_id: row.site_id,
      status: row.status as SiteHealthRecord["status"],
      last_cycle_at: row.last_cycle_at,
      last_cycle_duration_ms: row.last_cycle_duration_ms,
      consecutive_failures: row.consecutive_failures,
      message: row.message,
      updated_at: row.updated_at,
    };
  }

  setHealth(record: SiteHealthRecord): void {
    this.db
      .prepare(
        `INSERT INTO site_health (site_id, status, last_cycle_at, last_cycle_duration_ms,
                                  consecutive_failures, message, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(site_id) DO UPDATE SET
           status = excluded.status,
           last_cycle_at = excluded.last_cycle_at,
           last_cycle_duration_ms = excluded.last_cycle_duration_ms,
           consecutive_failures = excluded.consecutive_failures,
           message = excluded.message,
           updated_at = excluded.updated_at`
      )
      .run(
        record.site_id,
        record.status,
        record.last_cycle_at,
        record.last_cycle_duration_ms,
        record.consecutive_failures,
        record.message,
        record.updated_at
      );
  }

  getLastCycleTrace(siteId: string): CycleTraceRecord | null {
    const row = this.db
      .prepare(
        `SELECT cycle_id, site_id, started_at, finished_at, status,
                steps_completed, error
         FROM cycle_traces
         WHERE site_id = ?
         ORDER BY started_at DESC
         LIMIT 1`
      )
      .get(siteId) as
      | {
          cycle_id: string;
          site_id: string;
          started_at: string;
          finished_at: string;
          status: string;
          steps_completed: string;
          error: string | null;
        }
      | undefined;

    if (!row) return null;

    return {
      cycle_id: row.cycle_id,
      site_id: row.site_id,
      started_at: row.started_at,
      finished_at: row.finished_at,
      status: row.status as CycleTraceRecord["status"],
      steps_completed: JSON.parse(row.steps_completed) as number[],
      error: row.error,
    };
  }

  setLastCycleTrace(record: CycleTraceRecord): void {
    this.db
      .prepare(
        `INSERT INTO cycle_traces (cycle_id, site_id, started_at, finished_at,
                                   status, steps_completed, error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(cycle_id) DO UPDATE SET
           finished_at = excluded.finished_at,
           status = excluded.status,
           steps_completed = excluded.steps_completed,
           error = excluded.error`
      )
      .run(
        record.cycle_id,
        record.site_id,
        record.started_at,
        record.finished_at,
        record.status,
        JSON.stringify(record.steps_completed),
        record.error
      );
  }

  close(): void {
    this.db.close();
  }
}

/**
 * Open (or create) the coordinator database for a site.
 */
export async function openCoordinatorDb(
  siteId: string,
  mode: LinuxSiteMode
): Promise<Database> {
  const { default: DatabaseCtor } = await import("better-sqlite3");
  const dbPath = siteDbPath(siteId, mode);
  return new DatabaseCtor(dbPath) as Database;
}
