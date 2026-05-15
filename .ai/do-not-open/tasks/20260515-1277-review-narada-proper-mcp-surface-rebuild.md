---
status: in_review
---

# Review Narada proper MCP surface rebuild

## Chapter

Canonical Inbox Promotions

## Goal

Operator requests narada.architect review the committed MCP infrastructure rebuild before treating it as settled site posture. Review commit 2f6446b1 and the follow-up review recommendation 45294baf.

## Context

Source inbox envelope: env_2ccb1628-a612-487b-851d-9844a59b6524

Source: user_chat:commit:2f6446b1

Envelope kind: observation

Summary: Operator requests narada.architect review the committed MCP infrastructure rebuild before treating it as settled site posture. Review commit 2f6446b1 and the follow-up review recommendation 45294baf.

Recommendation: narada.architect should review commit 2f6446b1 for package boundary, launch config, tool vocabulary, break-glass posture, builder admission, and absence of User/PC runtime state import.

Recurrence severity: medium
Recurrence key: observation:user_chat:commit:2f6446b1
Prior related envelopes: env_e26184db-7083-4f74-a4e4-d5eea06fec43

## Required Work

0. Source summary: Operator requests narada.architect review the committed MCP infrastructure rebuild before treating it as settled site posture. Review commit 2f6446b1 and the follow-up review recommendation 45294baf.
1. Read source inbox envelope env_2ccb1628-a612-487b-851d-9844a59b6524 and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Promoted source inbox envelope `env_2ccb1628-a612-487b-851d-9844a59b6524` into this governed Architect review task.
- Reviewed commit `2f6446b1` and follow-up recommendation `45294baf`.
- Inspected the new `packages/narada-proper-mcp` package, launcher changes in `tools/agent-start/start-agent.mjs`, MCP capability metadata, and related tests.
- Recorded review findings in `.narada/audit/task-1277-mcp-surface-rebuild-review.md`.
- Disposition: `needs_repair`. The rebuild is directionally aligned but should not be admitted as settled Narada proper MCP posture while live tools still depend on CLI dist/ad hoc lifecycle substrates.

## Verification

- `git show --stat --oneline --find-renames 2f6446b1`: reviewed change scope for MCP package, launcher, capability metadata, and task evidence.
- `git show --stat --oneline --find-renames 45294baf`: reviewed follow-up review recommendation.
- `pnpm --filter @narada2/narada-proper-mcp test`: passed, 5 tests.
- `pnpm --filter @narada2/narada-proper-mcp build`: passed.
- Source inspection found package-boundary and authority defects recorded in `.narada/audit/task-1277-mcp-surface-rebuild-review.md`.

## Acceptance Criteria

- [x] Recommendation addressed or explicitly rejected: narada.architect should review commit 2f6446b1 for package boundary, launch config, tool vocabulary, break-glass posture, builder admission, and absence of User/PC runtime state import.
