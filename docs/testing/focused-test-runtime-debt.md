# Focused Test Runtime Debt

`pnpm test:focused` records runtime metrics and emits a compact slow-test warning when a focused run exceeds `NARADA_FOCUSED_SLOW_MS` (default: 30000).

Slow command tests should be converted by:

1. Moving repeated temp-repo bootstrapping into a focused proof harness.
2. Avoiding full CLI command stacks when a single command function proves the invariant.
3. Keeping SQLite setup per proof case minimal.
4. Recording residual slowness as task debt instead of hiding it in foreground waits.
