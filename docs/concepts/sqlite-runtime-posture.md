# SQLite Runtime Posture

Narada treats SQLite as local runtime substrate, not as portable authority by itself. Portable mutation evidence remains Git-visible and replayable; SQLite stores the local materialized state that commands use while operating.

## Current Runtime

The current authoritative SQLite runtime is `better-sqlite3`.

Reasons:

- Narada currently supports Node versions below the `node:sqlite` floor.
- Existing stores and tests use the `better-sqlite3` synchronous API shape.
- Native binding failures are operationally annoying, but the migration target must be proven by conformance, not selected by preference.

## Migration Target

`node:sqlite` is the preferred long-term runtime candidate once the selected Node CLI embodiment can require a Node version that includes it and once the task/inbox/control-plane stores pass an adapter conformance suite. The contract is store behavior, mutation evidence, and replayability, not loyalty to one Node storage module.

The migration order is:

1. Make SQLite backend selection explicit.
2. Keep `auto` mode on `better-sqlite3` until conformance exists.
3. Detect `node:sqlite` without static imports, so older Node runtimes do not fail at load time.
4. Reject explicit unsupported `NARADA_SQLITE_BACKEND=node:sqlite` with a clear diagnostic.
5. Promote `node:sqlite` only behind the same store interface and verification gates.

## Environment

`NARADA_SQLITE_BACKEND` accepts:

- `auto`: current default; uses `better-sqlite3` until `node:sqlite` is promoted.
- `better-sqlite3`: explicit current runtime.
- `node:sqlite`: future runtime; currently rejected by task lifecycle open until adapter conformance is implemented.

## Invariant

Changing the SQLite driver must not change command authority, mutation evidence, task lifecycle semantics, or inbox admission semantics. Driver selection is substrate posture only.
