# `agent-pi-tui` live E2E coverage audit

**Audit date:** 2026-07-22

## Verdict

**Complete for the bounded live-E2E acceptance matrix; not a universal
external-production claim.** Core
`agent-pi-tui` behavior now has strong genuine live coverage: real runtime
processes, real Pi PTYs or the production attach client, durable `events.jsonl`
assertions, independent provider/MCP oracles, restart/cancellation faults,
negative authority cases, transport ambiguity, and repeated-run determinism.
Every matrix probe has an explicit production-launch mode and the aggregate
verifies the persisted launch binding. The remaining limits are intentionally
bounded external-credential, proprietary-SDK, and CI-environment dimensions;
they are not silently counted as covered.

The live suite now has two deliberately different evidence classes:

1. **Baseline live acceptance** — `live-four-surface-acceptance-e2e.mjs` starts a
   CLI-launched runtime, a real persisted session, a fixture HTTP provider and
   MCP child, then exercises real `agent-pi-tui`, `agent-cli`, `agent-tui`, and
   `agent-web-ui` processes. The runtime writes a real launch binding, and Pi,
   CLI, TUI, and browser all resolve it while observing the waiting-to-ready
   transition. This is genuine all-surface production-binding evidence for the
   baseline journey; it does not imply that every fault/substrate scenario has
   been repeated through the launcher.
2. **Gap probes** — the P0/P1/P2 scripts default to a real runtime child and,
   where the scenario is terminal-facing, a real Pi PTY. The
   transport/idempotency probe uses the production `NarsAttachClient` over
   real WebSockets instead of a synthetic event hub. The default mode is
   `fixture-boundary`; `--production-launch` selects the canonical workspace
   launcher and the harness validates its persisted launch binding, producing
   `partial-production-launch` evidence. These modes are not interchangeable
   in reports.

Every opt-in probe emits a `narada.agent.live_evidence.v2` record under
`.ai/tmp/agent-pi-tui-live-e2e/evidence/`. Each record includes runtime/client
PIDs, input boundary, durable and external oracles, negative assertions,
same-session-after-fault status, a canonical posture, and—when production
launch is selected—a validated launch-binding record. The records make the
remaining boundary gap visible instead of allowing a direct fixture to be
reported as full production coverage.

Kernel implementation/substitutability ownership is in
`@narada2/agent-runtime-server` and `@narada2/nars-pi-kernel`, not in
`@narada2/agent-pi-tui`. The moved runtime-server probe is run by the root
gated live command.

## What counts as genuine

A live claim requires all applicable conditions:

1. The NARS server and `narada-agent-pi-tui` binary are separate OS
   processes.
2. Input crosses the production client boundary; it is not injected into an
   in-process event hub.
3. Assertions read an independent durable oracle such as `events.jsonl`, a
   persisted cursor, a provider/MCP request log, a session-index record, or an
   observed side effect.
4. Negative cases assert absence of provider traffic, child processes, files, or
   durable events.
5. Fault tests terminate or disconnect the real process/transport and reuse the
   persisted session state.
6. Terminal/browser text is supplemental; it is never the sole proof of
   admission, ordering, idempotency, or side effects.
7. Restart/reconnect claims use the same session directory and event log.
8. Substitutability claims compare the same client journey against two kernel
   selections and remove only generated identifiers, timestamps, and diagnostics.

The in-process `live-four-client-acceptance.test.ts` and `pty-e2e.test.ts`
tests remain useful component tests, but do not discharge these live
requirements.

## Current evidence

| Capability | Evidence | Status |
| Real runtime/session launch | Baseline CLI launch plus persisted launch binding; production-binding gap matrix | Covered for baseline and selected production fault scenarios |
| Four concurrent projections | Real Pi/CLI/TUI PTYs plus browser | Covered for baseline; all four resolve the production launch binding |
| Durable ordinary/streamed/tool turns | Baseline event log plus provider/MCP oracles | Covered for baseline |
| Artifact authorization | MCP-created file on the default path; Pi-RPC inline artifact candidate, NARS registrar, durable index/content and four-surface projection | Covered for the bounded Pi-RPC admission path |
| Queueing and steering | Baseline real client inputs | Covered for baseline |
| Provider failure/recovery | `live-p1-provider-auth-faults-e2e.mjs` with HTTP 401 and malformed-body fixtures, recovery turns, and production binding | Covered at the fixture external-provider boundary; real credentials are not claimed |
| Pi detach/reattach/cursor replay | Baseline four-surface reattach plus P0 restart/cursor probe | Covered with production binding |
| Explicit admitted close | Baseline `session_closed` assertion | Covered for baseline |
| Runtime crash/restart | `live-p0-durability-cancellation-e2e.mjs` | Covered with production-launch binding, explicit same-session resume, crash recovery, and no duplicate completed turn |
| Pi cancellation | P0 real Pi PTY and provider abort | Covered with production binding |
| Controls and strict binding | `live-p1-controls-launch-binding-e2e.mjs` plus baseline binding | Covered for all four production binding and fixture controls |
| Transport ambiguity/idempotency | `live-p1-transport-idempotency-e2e.mjs` | Covered with bounded WebSocket fault fixture |
| MCP startup/disconnect/timeout/malformed/cancel faults | `live-p1-mcp-faults-e2e.mjs` | Covered for direct startup degradation, production missing-child refusal, child restart, bounded timeout, malformed stdout, and real Pi cancellation |
| Real PTY input boundary | `live-p1-pty-boundary-e2e.mjs` | Covered with production-launch binding and durable PTY assertions |
| Repeated-run determinism | `live-p2-determinism-e2e.mjs` | Covered with production-launch binding; launch/process metadata is excluded before projection comparison |
| Kernel substitutability | Runtime-server-owned Pi client fixture probe (`test:live:pi-client-kernel`) | Covered for native versus `pi-rpc` on the same real Pi PTY journey; production-launch mode is available but not a full four-surface claim |
| SDK ambient-resource isolation | `live-p1-ambient-isolation-e2e.mjs` plus runtime-server/package live SDK coverage | Process-level Pi-RPC isolation is covered through the production launcher; arbitrary in-process SDK ambient state is intentionally not claimed |
| Pi RPC child negotiation | Runtime/kernel package, four-surface `--pi-rpc` production-binding baseline, ambient-isolation probe, and moved runtime-server probe | Covered for the bounded child/four-surface boundary; external Pi is not claimed |
| Compaction evidence/reconstruction | `live-p1-compaction-reconstruction-e2e.mjs` | Covered with durable evidence and same-session Pi-RPC reconstruction under production binding |
| Negotiation refusal at launch | RPC/package tests plus production missing-child refusal | Pi-RPC valid-handshake path is live; invalid-version production refusal remains package-level |
| External provider/auth | `live-p1-provider-auth-faults-e2e.mjs` fixture provider | Covered at the safe fixture boundary; real credentials/auth are intentionally not exercised |
| CI selection | Manual workflow dispatch runs the fixture aggregate; the full root aggregate adds the four-surface baseline | Opt-in only and not a default required check; the full baseline needs sibling `agent-cli`/`agent-tui` binaries and a browser |

## Remaining production-boundary obligations

The bounded matrix has no unwaived coverage gap. These are explicit
non-claims rather than missing matrix cases:

- Keep the production-binding aggregate green for runtime crash/recovery,
  cancellation, uncertain retry, transport ambiguity, kernel substitutability,
  ambient isolation, provider faults, compaction/reconstruction, and both
  four-surface kernel selections. The probes use the explicit resume handle for
  same-session recovery; startup never performs implicit replay.
- Add a process-level SDK/ambient negative test if the SDK integration ever
  claims isolation stronger than the current strict adapter policy.
- Add a real-credential/proprietary-provider case only in an explicitly
  provisioned, secret-safe environment; the current 401 and malformed-body
  probes intentionally use fixture servers.
- Extend the Pi-RPC compaction fixture to a separately provisioned external Pi
  process if that product boundary is required.

## Required evidence record

```json
{
  "schema": "narada.agent.live_evidence.v2",
  "scenario": "p0-durability-cancellation",
  "status": "passed",
  "posture": "fixture-boundary",
  "runtime_pid": 1234,
  "runtime_pids": [1234],
  "client_pids": [1235],
  "input_boundary": "agent-pi-tui-pty",
  "durable_oracle": "events.jsonl",
  "external_oracles": ["fixture-provider-request-log"],
  "negative_assertions": ["ctrl-c-does-not-close-session"],
  "same_session_after_fault": true,
  "production_launch_binding": false,
  "production_launch_binding_evidence": null,
  "session_ids": ["session-example"]
}
```

The exact IDs and paths are run data. A `fixture-boundary` record with
`production_launch_binding: false` is valid fixture evidence, not a
production-launch claim. A `partial-production-launch` record must contain
the ready launch-binding evidence and the `production-launch-binding`
external oracle. Only the four-surface baseline may use the full
`production-launch` posture.

## Commands and gates

Normal unit/typecheck commands intentionally do not start live providers,
browsers, sibling binaries, or opt-in processes. The live package guard checks
that every listed probe remains explicitly opt-in.

The gated commands are:

```powershell
pnpm --filter @narada2/agent-pi-tui test:live:guard
pnpm test:agent-pi-tui:live:fixture
pnpm test:agent-pi-tui:live
pnpm --filter @narada2/agent-pi-tui test:live:production-binding
pnpm --filter @narada2/agent-runtime-server test:live:pi-client-kernel
```

On 2026-07-22, isolated Windows runs passed the default and `--pi-rpc`
four-surface acceptance, production-bound P0 recovery/cancellation, authority
negatives, controls and binding, MCP faults, PTY boundary,
transport/idempotency, uncertain-admission retry, ambient-child isolation,
provider-auth fixtures, compaction/reconstruction, determinism, and the
native-versus-`pi-rpc` kernel probe. The complete
`test:live:production-binding` aggregate also passed, proving production
binding for both four-surface kernel selections and every selected launcher
scenario. The ambient and compaction probes resolve their RPC fixtures from
the repository root rather than the package working directory, and determinism
removes launch/process authority metadata before comparing canonical events.
The focused Pi-kernel suite had 62 passing tests; the agent-pi-tui
and runtime-server focused suites also passed. Individual evidence records
remain authoritative for their scenario-specific oracles.

The workflow `.github/workflows/agent-pi-tui-live-e2e.yml` runs the
fixture-only aggregate (`test:agent-pi-tui:live:fixture`) only when its
`workflow_dispatch.run_live_e2e` input is explicitly enabled. The full
`test:agent-pi-tui:live` aggregate additionally runs the four-surface
baseline; a provisioned run must supply the sibling `agent-cli` and
`agent-tui` checkouts/binaries and a headless browser for that baseline. This
is deliberate: the suite is expensive and environment dependent. It is not
selected by ordinary `test:unit` or `test:integration`.

## Completion gate

Call the bounded live matrix complete only while its production-binding
aggregate remains green and the explicit non-claims above remain true. The
four-surface result must continue to be reported as
`baseline-live-acceptance`; gap results must identify whether they used
`fixture-boundary` or `partial-production-launch` and retain the validated
evidence record.
