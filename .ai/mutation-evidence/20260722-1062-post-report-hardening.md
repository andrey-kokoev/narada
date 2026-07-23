# Task 1062 replacement evidence — post-report hardening

**Schema:** `narada.task.replacement_evidence.v1`  
**Task:** `20260722-1062-correct-nars-pi-kernel-and-agent-pi-tui-boundaries`  
**Agent:** `narada.architect`  
**Supersedes:** `wrr_1b18aec0_20260722-1062-correct-nars-pi-kernel-and-agent-pi-tui-boundaries_operator`

## Replacement summary

The post-report correction made the six boundary claims executable and
truthful rather than merely descriptive:

1. Production launches now validate canonical launcher, site/workspace, agent,
   runtime host, session, process ownership, and event/health identity. The
   live evidence contract is `narada.agent.live_evidence.v2` with explicit
   `fixture-boundary`, `partial-production-launch`, and `production-launch`
   postures.
2. The live guard and package aggregates distinguish fixture, partial-launch,
   and full four-surface production evidence.
3. Native and Pi provider rounds use the shared
   `narada.nars.tool_round.v1` contract; the native-versus-Pi substitutability
   probe remains runtime-server-owned.
4. SDK isolation is stated only as strict adapter policy. Pi-RPC retains the
   process-level disposable-cwd and ambient-negative proof; arbitrary
   in-process SDK ambient isolation is not claimed.
5. RPC auth refusal, dropped-response timeout, malformed MCP JSON-RPC/stdout,
   child disconnect/restart, provider 401/malformed response, compaction,
   reconstruction, cancellation, transport idempotency, and deterministic
   replay paths are covered by bounded live or package evidence.
6. Runtime evidence normalizes `{kind}` records to session-core `{event}`
   records, and the original task now contains a valid top-level Follow-Up
   Ledger. No derivative task-status file was created.

The ambient-isolation and compaction fixtures now resolve from the repository
root rather than the package working directory. Determinism removes launch,
process, and authority metadata before comparing semantic event projections.

## Changed files represented by this replacement

- `packages/agent-pi-tui/test/live-test-harness.mjs`
- `packages/agent-pi-tui/test/live-p1-ambient-isolation-e2e.mjs`
- `packages/agent-pi-tui/test/live-p1-compaction-reconstruction-e2e.mjs`
- `packages/agent-pi-tui/test/live-p2-determinism-e2e.mjs`
- `packages/agent-pi-tui/test/live-suite-guard.mjs`
- `packages/agent-pi-tui/package.json`
- `packages/agent-pi-tui/README.md`
- `packages/agent-runtime-server/src/live-evidence-contract.mjs`
- `packages/agent-runtime-server/src/server-wrapper.mjs`
- `packages/agent-runtime-server/test/live-pi-client-kernel-substitutability-fixture-e2e.mjs`
- `packages/nars-intelligence-kernel-contract/src/index.mjs`
- `packages/nars-intelligence-kernel-contract/src/native-kernel.mjs`
- `packages/nars-intelligence-runtime-pi/src/kernel.mjs`
- `packages/nars-intelligence-runtime-pi/src/pi/pi-runtime-isolation.mjs`
- `packages/nars-intelligence-runtime-pi/src/pi/pi-rpc-host.test.mjs`
- `packages/nars-intelligence-runtime-pi/src/recovery.test.mjs`
- `packages/nars-intelligence-runtime-pi/test/fixtures/pi-rpc-fixture.mjs`
- `docs/testing/agent-pi-tui-live-e2e-coverage.md`
- `.ai/do-not-open/tasks/20260722-1062-correct-nars-pi-kernel-and-agent-pi-tui-boundaries.md`

## Verification

- `pnpm --filter @narada2/nars-intelligence-kernel-contract test` — passed,
  4 tests.
- `pnpm --filter @narada2/nars-pi-kernel test` — passed, 62 tests.
- The bounded runtime-server test set — passed, 15 tests.
- `pnpm --filter @narada2/agent-pi-tui typecheck` — passed.
- `pnpm --filter @narada2/agent-pi-tui test` — passed, 5 files / 16 tests.
- `pnpm --filter @narada2/agent-pi-tui test:live:guard` — passed.
- `pnpm --filter @narada2/agent-pi-tui test:live:production-binding` —
  passed with exit 0 in 8m14s through the final 900000 ms structured-command
  MCP run. It passed both four-surface kernel selections and every selected
  production-launch gap probe, including ambient isolation, provider faults,
  compaction/reconstruction, and determinism.
- The moved native-versus-`pi-rpc` real-Pi-PTY substitutability probe passed.

An earlier 420000 ms aggregate timed out after its completed prefix; it is
retained as infrastructure evidence, not promoted to a pass. The final longer
aggregate passed after the fixture-path and determinism corrections. The
bounded full `agent-runtime-server` test command previously returned a child
timeout without stdout and remains unclaimed; its focused typecheck and
bounded tests passed.

## Evidence limits

No live external provider credentials or production side effects were used.
External provider/proxy credentials, arbitrary in-process SDK ambient
isolation, Pi-admitted artifact registration, and an external Pi compaction
implementation remain explicitly unclaimed. These are bounded evidence
limits, not hidden acceptance claims.
