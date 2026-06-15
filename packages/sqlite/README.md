# @narada2/sqlite

A thin wrapper around Node.js's built-in `node:sqlite` module that exposes a
`better-sqlite3`-compatible API surface.

This lets the rest of the monorepo use a single SQLite driver without relying
on a native add-on.

## Requirements

- Node.js >= 22.0.0 (`node:sqlite` is available experimentally in Node 22 and
  later).

## API

```ts
import Database from "@narada2/sqlite";

const db = new Database(":memory:");
db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)");
const stmt = db.prepare("INSERT INTO t (name) VALUES (?)");
stmt.run("alice");
const row = db.prepare("SELECT * FROM t WHERE id = ?").get(1);
db.close();
```

Supported `better-sqlite3`-style methods:

- `new Database(path)`
- `db.exec(sql)`
- `db.prepare(sql)` → `Statement`
- `statement.all(...args)`, `statement.get(...args)`, `statement.run(...args)`
- `statement.pluck()`
- `db.pragma(source)`
- `db.transaction(fn)`
- `db.close()`
