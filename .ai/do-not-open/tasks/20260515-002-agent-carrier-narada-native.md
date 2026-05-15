# Chapter: Narada-Native Agent Carrier

## Status

Ready for Builder handoff.

## Target Locus

- Site: `narada-proper`
- Authority locus: Narada proper
- Task spec path: `.ai/do-not-open/tasks/20260515-002-agent-carrier-narada-native.md`
- Primary concept anchor: `docs/concepts/agent-carrier.md`

## Operator Intent

Narada should have its own native Agent Carrier, alongside external carriers such as Codex, Kimi, and Claude Code. The native carrier should embody Narada's doctrine directly instead of inheriting carrier behavior from a third-party runtime shell.

## Builder Mission

Specify and implement the first useful Narada-native Agent Carrier slice. The slice must be small enough to build and verify, but real enough to carry one durable Agent through one bounded Carrier Session with evidence and capability posture.

## Work Sequence

1. Define the minimum native carrier vertical.
   - Identify the smallest useful session lifecycle: start, hydrate, project capabilities, record evidence, close.
   - Decide which existing Narada services own carrier registry, launch packets, startup hydration, capability projection, and evidence capture.
   - Keep Narada-native carrier work inside existing authority boundaries.

2. Add a native carrier specification.
   - Name the carrier identity and session identity shape.
   - Declare the launch packet schema, startup affordance, role/law hydration route, capability projection model, approval posture, and evidence schema.
   - Make the distinction between Agent, Agent Carrier, Carrier Session, Operator Surface, capability channel, and authority locus explicit.

3. Implement the first native carrier runtime path.
   - Add a minimal code path that can create or represent a native Carrier Session.
   - Hydrate current law/context through the governed startup affordance.
   - Project a conservative capability set initially, preferably read-only or facade-only until effect approval is proven.
   - Emit durable session evidence for launch, hydration, capability projection, and closeout.

4. Add native carrier readback and diagnostics.
   - Provide a doctor/readback surface that reports native carrier readiness, current authority posture, capability posture, and latest evidence references.
   - Ensure the readback makes clear whether runtime execution was attempted or only planned.

5. Verify against external carrier invariants.
   - Compare the native carrier against Codex and Kimi carrier obligations.
   - Ensure Codex continues to pass as known-good external prior art.
   - Ensure Claude Code can be modeled as a peer external carrier once implemented.
   - Add tests or fixtures that prove the native carrier does not become a task, inbox, outbox, repository publication, or Site authority implementation.

## Acceptance Criteria

- `narada-native` is represented as a named Agent Carrier peer to Codex, Kimi, and Claude Code.
- The native carrier has an explicit Carrier Session identity model.
- The native carrier can perform or plan startup hydration through Narada's governed affordance.
- The native carrier emits reconstructable evidence for at least launch, hydration, capability projection, and closeout.
- Capability posture starts conservative and is explicit.
- A readback or doctor surface reports native carrier readiness without requiring direct SQLite inspection.
- Tests or fixtures prove the authority boundary and carrier obligations.

## Non-Goals

- Do not build a general autonomous agent platform in this chapter.
- Do not bypass existing task lifecycle, inbox, outbox, command execution, or publication boundaries.
- Do not make native carrier implementation depend on Codex-specific or Kimi-specific runtime assumptions.
- Do not expose effectful capabilities without approval posture and evidence.

## Suggested Builder Verification

- Carrier registry/readback includes `narada-native`.
- Native carrier dry-run or minimal launch produces carrier-session evidence.
- Startup hydration reports `mutation_attempted: false` unless an explicit governed mutation is part of the test.
- Doctor/readback output distinguishes authority locus from carrier embodiment.
- Existing Codex carrier proof remains passing.
