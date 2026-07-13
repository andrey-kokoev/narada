# Canonical Operator Journey Acceptance

The canonical operator journey is accepted only when the operator can stay on
one stable Operator Router origin while moving through the live projections:

Router -> Workspace -> Registry -> Site Operations -> Agent Web UI -> artifact -> Launcher

The acceptance suite has three complementary layers. The real-start test
launches the compiled `narada console serve` command as a child process and
verifies its stable Router projection. The launcher journey test separately
starts the real compiled `narada launcher workspace-launch` process with
`--interactive-selection-ui` alongside that Console, opens the returned browser
page through the stable Router session path, and closes the session through the
same path. The canonical journey test also starts that real
launcher against the already-running Router after artifact delivery, opens
and cancels its session through the same browser origin, and only then tests
Router restart. That test starts the Router through the
production `ensureOperatorRouter` path, which exercises hidden detached
ownership and same-port restart; it starts the real Console, Site Operations,
and Agent Web UI servers in-process, seeds one User Site registry record and
one NARS session-owned artifact, and registers the corresponding
production-shaped routes with that Router. Both tests keep browser navigation
on the Router origin, not on any backing server URL.

The bounded acceptance commands are:

pnpm --filter @narada2/cli run test:launcher-acceptance
pnpm --filter @narada2/cli run test:operator-journey-acceptance

## Evidence

The test records these acceptance properties as assertions:

- the Router route inventory contains the operator console, Site Operations,
  agent session, WebSocket, and NARS artifact routes;
- the compiled `narada console serve` process reports the stable Router and
  operator projection, serves Workspace and Registry through that origin, and
  leaves no backing target or health URL in the public route inventory; after
  the real child terminates, its Router projection is no longer healthy;
- the canonical journey's real launcher process reports a session URL on the
  same stable Router origin used by Workspace, Registry, Site Operations,
  Agent Web UI, and the artifact; it serves the browser UI through
  `/console/launch/sessions/<id>`, keeps its direct localhost port out of
  operator-facing output, and exits cleanly after the operator cancels through
  that Router; the closed session no longer serves launcher content;
- the separate launcher acceptance test repeats the real Console-plus-launcher
  projection with an independently started Router, covering the launcher
  process boundary without relying on the in-process journey fixture;
- the Workspace route directory exposes Registry, Site Operations, and the
  session route from the live Router inventory;
- Registry edit uses the canonical preview, explicit confirmation, and apply
  gateway, and the changed metadata is read back from the live registry;
- a same-origin browser mutation succeeds;
- a foreign Origin is refused by the stable Router with status 421, and the
  direct owner server refuses the same request with status 403;
- the Agent Web UI receives one event from the Router WebSocket route;
- the artifact metadata and content are served by the session-owned Router
  artifact route without exposing its source path;
- restarting the Router on the same port and state root reconstructs the route
  inventory and preserves navigation to the live session;
- backing ports and ephemeral server URLs do not appear in operator-facing
  HTML or the public route inventory;
- all browser, socket, server, and temporary-root resources are closed by the
  fixture, with a bounded force-termination fallback for Windows child-process
  signal semantics. Graceful route unregister is covered by the in-process
  route-set lifecycle in the same suite.

The CSRF assertions deliberately cover two boundaries. The Router is the
operator-facing boundary and rejects foreign Origins before forwarding. The
owner surface keeps its own local-origin guard as defense in depth. The
acceptance test does not treat a direct owner URL as an operator surface.

## Residual report

Status: accepted for the representative continuous operator journey.

Proven: hidden Router start and same-port restart, stable-origin navigation,
live WebSocket and artifact delivery, real launcher projection and cancellation,
governed registry mutation, CSRF boundaries, route reconstruction, and cleanup.

Remaining by design: coverage uses one representative Site and one
non-destructive registry metadata mutation. Other Site types and mutation
classes remain outside this milestone.
