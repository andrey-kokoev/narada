# NARS Session Authority

## Purpose

The NARS session index is a discovery/history projection. It is not a lock. The
canonical singleton invariant for a local Site principal is owned by the
NARS session-authority registry.

A principal is:

`authority_scope + site_id + local_agent_id`

For local NARS this is normally `local:<site-id>:<local-agent-id>`. A
site-qualified legacy identity such as `sonar.resident` normalizes to the
same principal as `resident` when the Site is `sonar`.

## Lifecycle

The authority registry is a local `node:sqlite` database at:

```text
<site-root>/.ai/runtime/session-authority.sqlite
```

One row exists per principal. The row transitions through:

```text
starting -> active -> stopping -> closed
                       \-> failed
```

The implemented start path uses `starting -> active -> closed|failed`.
`stopping` is reserved for the explicit graceful-replacement transition and
must not be inferred by a projection or an operator surface.

Admission is atomic (`BEGIN IMMEDIATE`) and issues:

- a concrete NARS session id;
- an authority epoch;
- a private owner token for the admitted runtime lifecycle;
- a heartbeat lease;
- an attach handoff.

The token is passed only to the child runtime through the authority environment.
The token is never included in operator-facing result objects.

The runtime server must activate the admission before serving the session,
refresh the authority lease with its heartbeat, and close or fail the row when
the runtime exits. Epoch and token checks fence stale runtimes.

## Duplicate and crash behavior

A second supported launch for the same principal is refused with a stable
authority reason code and the existing session's attach handoff. It does not
choose newest/oldest and does not silently reuse a session.

Expired leases are reclaimable only when process evidence says the old process
is absent. If process evidence says it is alive, reclamation is refused.

Records written before the authority registry existed are legacy evidence. If a
live legacy session is found and no authority row exists, launch refuses with
an explicit reconciliation instruction. The session index is not silently
rewritten or deleted.

## Reconciliation

Use the CLI to inspect and explicitly record legacy reconciliation:

```text
narada nars session reconcile \
  --site-root <site-root> \
  --agent <local-agent-id> \
  --keep-session <session-id>
```

The command is read-only by default. `--apply` writes a reconciliation
receipt only after all matching sessions are inactive. It does not adopt a
running legacy process because adoption without a launcher-issued token would
break fencing. The next launch must go through the normal launcher admission
path.

## Authority versus index

- **Session authority**: prevention, admission, lease, fencing, lifecycle.
- **Session index**: discovery, replay attachment, history, diagnostics.
- **Runtime health**: liveness evidence used by projections and reconciliation.
- **Operator surfaces**: attach to an exact session; they never decide which
  duplicate is canonical.

Cloudflare implementations must conform to the same contract. The local
`node:sqlite` store is the first authority implementation; a remote store
must preserve principal uniqueness, epochs, tokens, leases, and explicit
reconciliation semantics.
