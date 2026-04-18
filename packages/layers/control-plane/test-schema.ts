import Database from "better-sqlite3";
import { SqliteCoordinatorStore } from "./src/coordinator/store.js";
import { SqliteOutboundStore } from "./src/outbound/store.js";

const db = new Database(":memory:");
const cs = new SqliteCoordinatorStore({ db });
cs.initSchema();
const os = new SqliteOutboundStore({ db });
os.initSchema();

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
console.log("outbound tables:", tables.map((t) => t.name).filter((n) => n.includes("outbound")));

const cols = db.prepare("PRAGMA table_info(outbound_commands)").all() as { name: string }[];
console.log("outbound_commands columns:", cols.map((c) => c.name));

db.close();
