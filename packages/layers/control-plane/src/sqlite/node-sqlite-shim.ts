import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nodeSqlite = require("node:sqlite") as {
  DatabaseSync: new (...args: unknown[]) => unknown;
  StatementSync: new (...args: unknown[]) => unknown;
  backup: unknown;
  constants: unknown;
};

export const DatabaseSync = nodeSqlite.DatabaseSync;
export const StatementSync = nodeSqlite.StatementSync;
export const backup = nodeSqlite.backup;
export const constants = nodeSqlite.constants;
export default nodeSqlite;
