# Task Lifecycle Role Enforcement Policy

Task lifecycle role enforcement is resolved policy, not a hardcoded claim rule.

## Policy Scopes

Resolution order is:

1. Product default
2. Host config
3. User Site config
4. Target Narada Site config
5. Task override

Later scopes override earlier scopes. The target Site owns normal task governance for its own tasks; host and user scopes provide capability/posture defaults, and task scope is an explicit local override.

## Policy Field

Site-level policy lives in the Site authority document:

```json
{
  "schema": "narada.site.v0",
  "task_lifecycle": {
    "role_enforcement": "strict"
  }
}
```

Supported values:

- `off`: `target_role` is advisory metadata only.
- `warn`: role mismatches are allowed and surfaced as warnings.
- `strict`: role mismatches block claim and continuation.

Compatibility aliases:

- `advisory` and `suggested_role` resolve to `warn`.
- `required` and `required_role` resolve to `strict`.

## Host And User Site

Host config uses host schema, not Site schema:

```json
{
  "schema": "narada.host.v0",
  "task_lifecycle": {
    "role_enforcement": "warn"
  }
}
```

User Site config uses Site schema because the User Site is a Narada Site:

```json
{
  "schema": "narada.site.v0",
  "task_lifecycle": {
    "role_enforcement": "warn"
  }
}
```

## Observability

Claim, continue, read, show, and workboard surfaces should expose the resolved `role_policy` object. That object includes the effective value and the resolution chain, so an operator can see why a mismatch blocked, warned, or passed.
