import { DatabaseSync } from 'node:sqlite';
import { ensureSiteLoopTables } from '../../src/site-loop-store.js';

export function openSiteLoopStore(siteRoot: any): any {
  const dbPath = process.env.NARADA_SITE_LOOP_FIXTURE_DB ?? ':memory:';
  const db = new DatabaseSync(dbPath);
  ensureSiteLoopTables(db);
  return {
    site_root: siteRoot,
    db,
    close() {
      db.close();
    },
  };
}
