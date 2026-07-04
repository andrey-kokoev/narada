# Delegation Work Order And Role Governance

This document records the target shape for delegated launcher and NARS work. It binds two concerns that are otherwise easy to blur:

- `work_order`: the delegation contract for scope, authority, budgets, deliverables, and review evidence.
- role enforcement: the task lifecycle policy that decides whether a principal may claim or continue a task with a target role.

## Surface Boundaries

`delegated-task-mcp` owns durable delegated task orchestration:

- workflow templates;
- DAG shape, dependencies, joins, review, repair, verification, and gates;
- durable delegated task status, result summaries, and handoff packets;
- validation of `workflow.work_order`.

`worker-delegation-mcp` owns runtime execution of child workers:

- worker runtime selection, including `codex` and `narada-agent-runtime-server`;
- Site binding for NARS-backed workers;
- worker authority, cognition, provider, sandbox, required MCP tools, and exit interview projection;
- worker run status, wait, batch, synthesis, and stale-run reaping.

Task lifecycle owns target-role policy and claim/continuation governance. Launcher and NARS should consume that policy; they should not locally infer whether a worker, resident, builder, or architect is allowed to claim a task.

## Work Order Shape

The governing object is `work_order`, not `budget`. Budget is a sub-object of the work order.

The current delegated-task validator accepts this shape under `workflow.work_order`:

```json
{
  "schema": "narada.delegated_task.work_order.v1",
  "source": "task-or-operator-reference",
  "scope": ["short bounded scope statement"],
  "authority": "read",
  "allowed_roots": ["D:/code/narada"],
  "allowed_repositories": ["D:/code/narada"],
  "mutation_boundaries": ["No commit or push without explicit authority."],
  "budget": {
    "max_minutes": 10,
    "max_worker_runs": 2,
    "max_verification_attempts": 1,
    "allowed_repositories": ["D:/code/narada"]
  },
  "verification_budget": {
    "focus": "focused",
    "max_commands": 1,
    "max_minutes": 3,
    "broad_commands_allowed": false
  },
  "test_budget": {
    "focus": "focused",
    "max_commands": 1,
    "max_minutes": 3,
    "broad_commands_allowed": false
  },
  "deliverables": [
    { "kind": "summary", "required": true },
    { "kind": "changed_files", "required": true },
    { "kind": "verification", "required": true }
  ],
  "exit_interview_policy": {
    "required": true,
    "questions": ["Which MCP ergonomics slowed the work?"]
  },
  "verification": {
    "focused_tests": ["pnpm --filter @narada2/cli typecheck"]
  },
  "acceptance": {
    "residual_risk_policy": "allow"
  }
}
```

Launcher/NARS callers should put descriptive objectives and required MCP surfaces in `scope` until delegated-task promotes dedicated keys. Do not invent top-level `objective`, `site_root`, `required_mcp_surfaces`, `authority_gates`, `review_policy`, or `exit_interview` keys inside `workflow.work_order`; current validation rejects them. Use worker constraints for runtime-specific `site_root`, provider, required MCP tools, and worker exit interview flags.

## NARS Worker Path

Use NARS-backed worker delegation when the worker needs Narada identity, Site MCPs, lifecycle evidence, or continuation semantics:

```json
{
  "constraints": {
    "runtime": "narada-agent-runtime-server",
    "site_root": "D:/code/narada",
    "cwd": "D:/code/narada",
    "provider": "codex-subscription",
    "authority": "read",
    "cognition": "low",
    "required_mcp_tools": ["narada-andrey-local-filesystem.fs_read_file"],
    "exit_interview": true
  }
}
```

Direct vendor runtimes remain acceptable for low-risk read-only research, but they are not Narada-bound sessions. If the worker must use Site-local MCPs or report governed Narada evidence, target `narada-agent-runtime-server`.

## Role Enforcement Policy

Role enforcement is resolved policy, not a hardcoded task claim rule. The resolution order is:

1. product default;
2. host config;
3. User Site config;
4. target Narada Site config;
5. task override.

Supported effective values are:

- `off`: `target_role` is advisory metadata only;
- `warn`: role mismatches are allowed and surfaced as warnings;
- `strict`: role mismatches block claim and continuation.

Launcher/NARS work should prefer `warn` during migration and `strict` only after the relevant Site has registered its role roster and worker delegation posture. Operator-directed task overrides remain valid when the operator intentionally assigns work across nominal role boundaries.

## Practical Delegation Path

For launcher/NARS work, use this minimum path:

1. Validate the work order with `delegated_task_validate` before launch.
2. Resolve NARS worker binding with `worker_config_resolve` when the worker should be Site-bound.
3. Launch with a template such as `research_synthesize`, `implement_review`, or `implement_review_repair_verify`.
4. Require bounded verification budgets and exit interviews.
5. Use task lifecycle evidence for final task state; do not treat worker output alone as task closure.

## Current Gaps

The validated current shape is usable, but two gaps remain outside launcher ownership:

- `worker_guidance` should return renderable guidance; task 1790 observed `worker_unrenderable_result_schema` for `narada.mcp_surface.guidance.v0`.
- `work_order` lacks dedicated accepted fields for `objective`, `site_root`, `required_mcp_surfaces`, and `review_policy`; callers must currently encode them in `scope`, worker constraints, or `acceptance`.
