# Canonical Operator Journey Acceptance

The canonical operator journey is accepted only when the operator can stay on
one stable Operator Router origin while moving through the live projections:

Router -> Workspace -> Registry -> Site Operations -> Agent Web UI -> artifact

The acceptance suite has complementary layers. The real-start test
launches the compiled `narada console serve` command as a child process and
verifies its stable Router projection. The canonical journey test
starts the Router through the production `ensureOperatorRouter` path, which
exercises hidden detached ownership and same-port restart; it starts the real
Console, Site Operations,
and Agent Web UI servers in-process, seeds one User Site registry record and
one NARS session-owned artifact, edits that record and creates a second
registry record through the governed plan/apply workflow, and registers the
corresponding production-shaped routes with that Router. The runtime control
sideband accepts either governed carrier-input envelopes or the narrow NARS
session-core control methods; it does not accept arbitrary commands.
Both tests keep browser navigation
on the Router origin, not on any backing server URL.

The launcher acceptance layer (`test:launcher-acceptance`) drives the real
installed User Site `Start-NaradaWorkspace.ps1` against the compiled
`narada launcher workspace-launch` command: dry-run plans map one selected
agent to its admitted operator-surface projections, and a live launch proves a
real hidden-detached NARS runtime host with an attached agent-web-ui
projection, an exact healthy session attachment, and a clean shutdown through
the NARS session control path. The earlier interactive launcher UI journey was
removed with the group-launch stack (decision 20260718-2038, task #2041).

The bounded acceptance commands are:

pnpm --filter @narada2/cli run test:launcher-acceptance
pnpm --filter @narada2/cli run test:operator-journey-acceptance
pnpm --filter @narada2/agent-start run test:launcher-contract

## Cross-Carrier Matrix

The launcher-contract test derives its carrier set from the shared admitted
carrier launch matrix contract at
`packages/operator-surface-runtime-contract/contracts/operator-surface-launch-matrix.json` and
runs a bounded dry-run for every row. Runtime adapter selection consumes the
same contract. A dry-run proves selection, runtime identity, launch packet
shape, and tool-fabric adapter selection. It does not claim that an external
carrier binary or provider was started.

The authoritative row data is the JSON contract itself. The generated
conformance report at `tools/operator-surface-carriers/carrier-conformance-matrix.mjs`
projects those rows and adds current launch-registry observations. This
document intentionally does not repeat the row table, because a second table
would become an unvalidated carrier authority.

The report preserves the matrix's runtime substrate, fabric source, adapter
entrypoint, projection capabilities, expected tools, and states for each row;
it is therefore a complete readback with observations, not a reduced carrier
summary.

The matrix is intentionally factored. `launch selection` is the value consumed
by the legacy `--carrier` path; `operator surface` identifies the presentation;
`carrier implementation` identifies the semantic carrier family; and `runtime host`
identifies the process substrate that owns the session. The launch result
keeps `carrier_kind` as the compatibility selection alias and exposes
`carrier_implementation_kind` for the semantic value. `agent-cli` and
`agent-web-ui` therefore share one carrier implementation and runtime host
while remaining distinct projections. The other rows must not be described as
NARS sessions merely because they are admitted launch selections. Materialized
carrier-session records must preserve `launch_selection_kind` and
`operator_surface_kind` from the same matrix row; they must not infer the
operator surface from a hard-coded subset of carriers.

Rows may also declare bounded `projection_capabilities`. These are capability
selectors, not runtime hosts: the `nars_attach` capability currently resolves
to `agent-cli`, `agent-web-ui`, and `agent-tui`, even though the latter uses a
different runtime host. Consumers must use the capability helper rather than
recreate that subset locally.

Each row also carries the static conformance profile used by the carrier
conformance report: evidence level, MCP-fabric source, native-shell posture,
mutation handling, startup availability, and known gaps. The report may add
current launch-registry observations, but it must not define another carrier
row set.

The matrix is a launch-contract boundary, not a claim of feature parity. A
carrier row with a native or ambient adapter still needs its own substrate
integration evidence before it can be promoted to live journey acceptance.

## Evidence

The test records these acceptance properties as assertions:

- the Router route inventory contains the operator console, Site Operations,
  agent session, WebSocket, and NARS artifact routes;
- the compiled `narada console serve` process reports the stable Router and
  operator projection, serves Workspace and Registry through that origin, and
  leaves no backing target or health URL in the public route inventory; after
  the real child terminates, its Router projection is no longer healthy;
- the launcher acceptance layer proves the compiled launcher through the
  installed User Site PowerShell wrapper: dry-run plans carry the admitted
  operator-surface projection set and never open Windows Terminal, and the
  live launch starts a real hidden-detached runtime host, observes its
  newly-created NARS session as healthy and launch-owned, links the logical
  launch-session ID to the distinct NARS session record, proves projection
  readiness through the published health endpoint, and stops the runtime
  through the durable session control path. The acceptance waits for the
  session-owned runtime PID to exit before removing the temporary Site root;
- the Workspace route directory exposes Registry, Site Operations, and the
  session route from the live Router inventory;
- Registry edit and add each use the canonical preview, explicit confirmation,
  and apply gateway; the edited metadata and second Site are read back from
  the live registry;
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

Status: accepted for the representative continuous operator journey across
two Sites and two Registry mutation classes.

Proven: hidden Router start and same-port restart, stable-origin navigation,
live WebSocket and artifact delivery, hidden-detached launch-to-session
observation and shutdown through the launcher acceptance layer, governed
registry edit and add mutations, CSRF boundaries, route reconstruction, and
cleanup.

Remaining by design: live end-to-end journeys for external carrier processes,
the agent-tui terminal loop, and a separately selected agent-web-ui carrier
remain outside this milestone. Destructive Registry mutation classes also
remain outside the acceptance journey. The contract matrix is the evidence
boundary for those rows until their native processes can be exercised in a
controlled environment.
