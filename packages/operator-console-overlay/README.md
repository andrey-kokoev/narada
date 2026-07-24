# @narada2/operator-console-overlay

Operator Console specialization of the reusable Narada window-overlay-core mechanics.

This specialization owns only:

- the stable operator-console overlay id;
- resolution of the existing Operator Router URL;
- the Operator Console document rows and actions, including a local-only `Restart console` action.

The generic package owns the Windows process, WPF window, persisted position/opacity/pin state, document refresh, and safe action mechanics. This package does not start or own the Operator Router or the console server.

Use the CLI from a Narada checkout:

    pnpm exec narada-operator-console-overlay start

The Narada CLI command will be wired as narada console overlay.
