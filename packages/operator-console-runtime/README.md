# @narada2/operator-console-runtime

The local Operator Console runtime is the authority for the stable browser
projection at the host's Operator Router. This package owns readiness,
singleton start/stop/restart, process identity checks, bounded waiting, and
bounded local diagnostics. Child stdout/stderr is retained raw in a
user-local, rotating log; callers must never write secrets to that stream.

It does not own the console HTTP backend or the Operator Router domain. The
Narada CLI supplies the backend factory for foreground serving; detached
startup invokes the canonical CLI `console serve` command.

A local overlay or CLI caller must call `ensureOperatorConsoleRuntime` before
creating a browser projection. A failed readiness check produces a structured
failure with a log path, removes only a route proven to belong to the failed
child, and records a failed state for diagnosis. Dead legacy routes may be
removed without an owner match; a live process is never terminated unless its
command line is a canonical Narada `console serve` process and its route owner
matches the process PID. Runtime logs are bounded to the newest eight files.
`probeOperatorConsoleRuntime` is observational: it never removes runtime state;
state cleanup belongs to the explicit lifecycle operations.

The detached child receives an internal runtime nonce. It is used alongside
the PID and command-line shape to avoid treating a reused PID as the runtime
that owns the route. Direct foreground `console serve` remains valid without
that nonce.
