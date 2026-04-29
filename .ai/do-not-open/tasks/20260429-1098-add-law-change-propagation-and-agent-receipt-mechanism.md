---
status: opened
---

# Add law change propagation and agent receipt mechanism

## Chapter

Agent Law Propagation

## Goal

Create a first-class mechanism for propagating Narada law changes to active agents and recording explicit agent read/ack receipts before affected work continues.

## Context

Narada now changes its agent-facing law frequently: `AGENTS.md`, `SEMANTICS.md`, role docs, task contracts, Site governance coordinates, and generated Site bootstrap contracts all affect what active Architect, Builder, Observer, and future roles may do.

Current failure mode: a law change can be committed and pushed, but existing agents continue operating from stale context until the Operator manually tells them to refresh. Chat memory and commit visibility are not durable receipt. Narada needs a governed crossing from law-source mutation into agent execution posture:

```text
law source changed -> law_change record -> affected agents notified/blocked -> agent reads -> receipt recorded -> affected work admitted again
```

This is not an authority grant. A receipt proves only that the agent acknowledged the law change. It does not let the agent bypass target locus, role boundary, lifecycle, capability, verification, publication, or Operator constraints.

## Required Work

1. Define law source scope:
   - `AGENTS.md`;
   - `SEMANTICS.md`;
   - `.ai/task-contracts/**`;
   - role docs such as `docs/concepts/observer-role.md` and delegated role taxonomy docs;
   - Site governance coordinate docs/templates;
   - generated Site bootstrap contract templates;
   - any configured additional law source paths.
2. Add a durable `law_change` record model with at least:
   - `change_id`;
   - changed law-source files;
   - commit hash or local evidence ref;
   - summary;
   - effective scope;
   - required roles or all-roles marker;
   - issued_by;
   - issued_at;
   - optional supersedes/superseded_by.
3. Add a durable `agent_law_receipt` record model with at least:
   - `agent_id`;
   - `role`;
   - operator surface/session identity when available;
   - `change_id`;
   - read/ack time;
   - receipt status such as `read`, `acknowledged`, `blocked_by_question`;
   - optional questions or blockers.
4. Expose CLI surfaces with compact human and JSON output. Suggested shape:

   ```bash
   narada law changes
   narada law status --agent <id>
   narada law read <change-id> --agent <id>
   narada law ack <change-id> --agent <id>
   narada law sync --agent <id>
   ```

   `law sync` should be the ergonomic agent startup / duty-loop command when a single command is practical.

5. Add work-admission checks so affected commands can block with `law_update_required` when mandatory unread law changes apply to the acting agent. Include at least task claim/start/execute/report/close paths if those names exist in current CLI surfaces.
6. The blocker must return the exact next command, e.g. `narada law sync --agent builder`.
7. Support role-scoped applicability so Observer-only changes do not block Builder, and all-role changes block every applicable active role.
8. Preserve authority boundaries:
   - law receipt does not grant mutation authority;
   - law sync does not claim tasks, close tasks, execute effects, or publish;
   - agents must not read/write raw SQLite outside sanctioned commands.
9. Add focused tests for creation/discovery, ack, unread blocking, acknowledged pass-through, role-scoped applicability, JSON output, and compact human output.
10. Update docs and bootstrap instructions so agents know to run the ergonomic law-sync command on startup and before normal duty loops when required.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Define durable law change records for changes to `AGENTS.md`, `SEMANTICS.md`, role docs, task contracts, Site governance coordinates, generated bootstrap templates, and other configured law sources, including change id, files, commit/evidence ref, summary, scope, required roles, issuer, and issued time.
- [ ] Define durable agent law receipt records with agent id, role, session or operator surface identity when available, change id, read/ack time, status, and optional questions or blockers.
- [ ] Expose CLI commands to list law changes, show unread changes for an agent, record read/ack receipt, and report law-sync status in compact human and JSON formats.
- [ ] Add a work-admission check path so claim, execute/start, report, close, or other affected task commands can block with `law_update_required` when mandatory law changes are unread.
- [ ] Preserve authority boundaries: law receipt proves the agent acknowledged reading the law change, not that the agent may mutate or bypass role/locus/capability rules.
- [ ] Support dry-run/preview where applicable and avoid direct SQLite access by agents outside sanctioned commands.
- [ ] Add focused tests covering law change creation/discovery, agent ack, unread blocker, acknowledged pass-through, role-scoped applicability, and JSON output.
- [ ] Document the operational loop for Operator, Architect, Builder, and Observer, including the ergonomic command agents should run after startup or before normal duty loop.
