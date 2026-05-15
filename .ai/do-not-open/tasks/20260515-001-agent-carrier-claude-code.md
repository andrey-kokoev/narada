# Chapter: Claude Code Agent Carrier

## Status

Ready for Builder handoff.

## Target Locus

- Site: `narada-proper`
- Authority locus: Narada proper
- Task spec path: `.ai/do-not-open/tasks/20260515-001-agent-carrier-claude-code.md`
- Primary concept anchor: `docs/concepts/agent-carrier.md`

## Operator Intent

Codex currently works as an Agent Carrier. Kimi used to work as an Agent Carrier. Add **Claude Code** as another Agent Carrier without collapsing the carrier concept into shell, MCP, HTTP, or any other executor substrate.

## Builder Mission

Materialize Claude Code as a first-class Agent Carrier peer to Codex and Kimi. The implementation must satisfy the hardened Agent Carrier obligations:

- bind one durable Agent identity into one bounded Carrier Session;
- hydrate law, role, launch packet, startup evidence, and context;
- project admitted capability channels;
- mediate effectful crossings;
- preserve approval, execution, and confirmation distinctions;
- emit reconstructable carrier-session evidence;
- support start, resume, interrupt, handoff, close, and reconstruction posture where applicable;
- avoid becoming the authority locus.

## Work Sequence

1. Inventory existing Codex and Kimi carrier materialization.
   - Locate carrier definitions, launch packets, startup command handling, MCP approval posture, evidence records, and any role binding logic.
   - Record which Codex path is known-good.
   - Record where Kimi drifted or broke, without repairing Kimi unless a shared abstraction requires it.

2. Define the Claude Code carrier contract.
   - Add or update carrier registry metadata for Claude Code.
   - Declare its carrier identity, session identity shape, launch packet shape, startup affordance, capability channels, approval posture, and evidence outputs.
   - Keep shell, MCP, HTTP, filesystem, and UI access modeled as projected capabilities, not as the carrier definition.

3. Implement Claude Code launch and hydration support.
   - Add the smallest code path that can start or represent a Claude Code carrier session using the existing carrier patterns.
   - Wire startup context hydration through the same governed route used by working carriers where applicable.
   - Preserve Narada proper as the authority locus for governed mutations.

4. Add evidence and readback surfaces.
   - Ensure a Claude Code carrier session produces durable evidence for launch, hydration, capability projection, approvals or approval requirements, tool calls where available, interruptions, and closeout posture.
   - Add readback or doctor output sufficient for an Architect or Builder to confirm carrier readiness.

5. Verify with focused tests or proof commands.
   - Re-run the existing Codex carrier proof to avoid regression.
   - Add Claude Code carrier tests or fixture proof at the same level as Codex/Kimi.
   - Include a negative check that Claude Code does not claim authority over task, inbox, outbox, repository publication, or Site mutation state.

## Acceptance Criteria

- Claude Code appears as a named Agent Carrier peer to Codex and Kimi.
- A Claude Code Carrier Session can be started or represented through the canonical carrier path.
- Startup hydration and capability projection are documented and evidenced.
- Approval posture is explicit for effectful channels.
- Evidence output is reconstructable enough to support resume or postmortem inspection.
- Existing Codex carrier behavior remains passing.
- Kimi prior-art is inspected and cited, but Kimi repair is not bundled unless required by shared carrier code.

## Non-Goals

- Do not rename the Agent Carrier concept.
- Do not make shell, MCP, HTTP, filesystem, or UI access the carrier primitive.
- Do not create a second task, inbox, outbox, or publication authority implementation.
- Do not repair unrelated Kimi drift unless it blocks the shared carrier abstraction.

## Suggested Builder Verification

- Carrier registry/readback includes `codex`, `kimi`, and `claude-code`.
- Existing Codex startup or hydration proof still passes.
- Claude Code launch or dry-run proof emits carrier-session evidence.
- Tests cover authority boundary language or data shape where the carrier definition is serialized.
