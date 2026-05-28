# Site Registry Relation Publication Surface v0

This specification defines the command and MCP surface for turning local relation
evidence into a hosted Site Registry relation transition. It is separate from
Site telemetry publication and Site communication send.

## Command Family

Preferred CLI shape:

```text
narada site-registry relation plan-transition
narada site-registry relation publish-transition
```

Compatibility aliases may exist later, but new docs should not use
`site-telemetry publish` for registry relation lifecycle.

`plan-transition` is dry-run only. It validates input, builds the transition
payload, classifies capability posture, and returns refusal/unblock guidance
without network, secret resolution, or hosted mutation.

`publish-transition` performs live transport only when:

- `--live` is explicit;
- registry-owner capability is active;
- credential reference resolves through an approved resolver;
- local evidence and transition policy pass validation;
- idempotency key is present.

## MCP Tool Family

Preferred tool names:

```text
site_registry_relation_plan_transition
site_registry_relation_publish_transition
```

MCP defaults to dry-run planning. The publish tool must require an explicit
`live: true` input and must return bounded evidence only. Raw token values must
not appear in MCP inputs, outputs, logs, fixtures, task notes, or docs.

## Input Shape

Minimum input:

```json
{
  "registry_url": "https://narada-repo-site-registry.example",
  "registry_id": "site-registry:narada-proper:cloudflare",
  "relation_id": "rel_narada-proper_registry_narada-andrey_user-locus-projection",
  "site_id": "narada-andrey",
  "subject_site_id": "narada-andrey",
  "relation_kind": "user_locus_site_public_projection",
  "transition": "activate",
  "from_state": "candidate",
  "to_state": "active",
  "from_visibility": "private",
  "to_visibility": "public",
  "actor": {
    "kind": "registry_owner",
    "site_id": "narada-proper",
    "principal": "narada.architect"
  },
  "capability_ref": "capability:site_registry.relation.admin.narada-proper",
  "credential_ref": "config-ref:NARADA_SITE_REGISTRY_RELATION_ADMIN_TOKEN",
  "idempotency_key": "narada-proper:narada-andrey:activate:2026-05-17",
  "evidence_refs": [
    "narada-andrey:task:957",
    "narada-andrey:mcp_output:o_7a8a14666ae64a1785ba6ac7",
    "narada-proper:task:1478"
  ]
}
```

Allowed first-slice transitions are inherited from
[`site-registry-relation-lifecycle.v0.md`](site-registry-relation-lifecycle.v0.md):
`activate`, `reject`, `withdraw`, `retire`, `suppress`, `unsuppress`, and
`reactivate`. `purge` and `delete` are refused.

## Credential Posture

- `credential_ref` is a reference only.
- Registry-owner/admin token material is resolved only during live transport.
- Dry-run planning must not resolve raw secrets.
- Raw bearer values must not be stored in relation payloads, D1 rows, KV rows,
  fixtures, docs, logs, MCP output, task notes, or chat context.
- `capability_ref` names consent/authority posture; it is not the secret.

## Authority Boundary

The represented Site's local declaration is evidence. It is not remote registry
authority and does not activate a public hosted relation by itself.

The registry owner decides registry counting/visibility. For narada-proper's
hosted registry, registry-owner authority is distinct from narada-andrey local
Site authority.

The hosted registry transition:

- changes registry projection state only;
- does not mutate represented Site authority;
- does not certify identity globally;
- does not grant inbox, telemetry, task, config, or secret capabilities;
- does not make cloud receipt local Site admission.

## Refusals

The planner and publisher must refuse:

- missing local relation evidence;
- missing registry-owner capability;
- missing idempotency key;
- raw secret marker in payload or evidence refs;
- unsupported transition;
- `purge` or `delete`;
- actor kind not admitted for the requested transition;
- represented Site attempting registry-owner-only `activate`;
- stale asserted `from_state` or `from_visibility` when live readback disagrees;
- missing credential reference for live publish;
- unapproved live flag or dry-run-only environment.

## narada-andrey Evidence Use

narada-andrey evidence can be used as input evidence that the represented Site
locally admits the relation in principle:

- task `#957` on narada-andrey;
- signed local declaration `mcp_output:o_7a8a14666ae64a1785ba6ac7`;
- response envelope `env_be44e421-caa6-4a76-99b7-fa481e19b3c6`.

That evidence supports a registry-owner activation decision. It does not itself
publish to the hosted registry, grant standing cross-Site inbox submission, or
make Narada proper the authority for narada-andrey.

## Output Shape

Plan output:

```json
{
  "status": "planned",
  "mutation_performed": false,
  "transition_payload_digest": "sha256:...",
  "capability_posture": "missing|active|expired|revoked",
  "credential_posture": "not_resolved_in_dry_run",
  "refusals": [],
  "required_live_command": "narada site-registry relation publish-transition --live ..."
}
```

Live output:

```json
{
  "status": "published",
  "mutation_performed": true,
  "cloud_receipt_ref": "site-registry:relation-transition:...",
  "local_site_admission_performed": false,
  "raw_secret_values_recorded": false
}
```
