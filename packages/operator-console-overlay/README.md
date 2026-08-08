# @narada-core/operator-console-overlay

Operator Console specialization of the reusable Narada window-overlay-core mechanics.

This specialization owns only:

- the stable operator-console overlay id;
- resolution of the existing Operator Router URL;
- the Operator Console document rows and actions, including a local-only `Restart console` action;
- delegating local console readiness to `@narada-core/operator-console-runtime` before creating the overlay.

The generic package owns the Windows process, WPF window, persisted position/opacity/layer state, document refresh, and safe action mechanics. `@narada-core/operator-console-runtime` owns the local console/router lifecycle. This package never creates a dead local overlay: it waits for a ready local projection or returns diagnostics without writing the overlay state.

Use the CLI from a Narada checkout:

    pnpm exec narada-operator-console-overlay start
    pnpm exec narada-operator-console-overlay focus

The Narada CLI commands are `narada console overlay` for start/refresh and `narada console overlay-focus` for explicit focus.
