const Database = require("better-sqlite3");
const db = new Database(":memory:");
db.exec("CREATE TABLE t (a TEXT, b TEXT DEFAULT 'def' NOT NULL)");
db.exec("INSERT INTO t (a, b) VALUES ('x', ?)", "hello");
const rows = db.prepare("SELECT * FROM t").all();
console.log("rows:", rows);
db.close();
