# narada-andrey MCP Inbox Route v0

`narada_andrey_mcp_inbox_route.v0` defines the route and capability contract
for Narada proper to submit inert Canonical Inbox envelopes to `narada-andrey`.

This contract does not create the route. It defines the evidence required before
the route can be admitted.

## Rule

```text
Site name is not addressability.
Addressability is not capability.
Delivery is not target admission.
```

Narada proper may know the Site reference `narada-andrey` and still lack the
right to deliver an envelope there. A route record only resolves an address. A
capability grant admits a bounded use of that address. The target Site still
owns local Canonical Inbox admission.

## Required Route Record

When target coordinates are admitted, the route must be added through the
canonical routing operator, not by editing JSON directly:

```powershell
narada routing add `
  --target-kind site `
  --target-ref narada-andrey `
  --authority-locus narada-andrey:canonical_inbox `
  --address-kind site_root `
  --address-ref <admitted-narada-andrey-site-root> `
  --transport filesystem `
  --capability-kind canonical_inbox_cross_site_submission `
  --priority 100 `
  --evidence-ref <target-coordinate-evidence-ref> `
  --by operator
```

Required fields:

| Field | Required value/posture |
| --- | --- |
| `target_kind` | `site` |
| `target_ref` | `narada-andrey` |
| `authority_locus` | `narada-andrey:canonical_inbox` or equivalent target-local inbox authority |
| `address_kind` | `site_root` or `narada_site_root` for current MCP fabric |
| `address_ref` | Admitted target Site root path; never inferred from memory |
| `transport` | `filesystem` for current MCP fabric |
| `capability_kind` | `canonical_inbox_cross_site_submission` |
| `priority` | Positive integer; lower CLI priority selection rules apply |
| `active` | `true` only after coordinate and capability posture are admitted |
| `evidence_ref` | Decision, inbox reply, Site relation ledger, or target-provided route evidence |

The current MCP fabric resolver supports only filesystem-backed Site-root
routes. A non-filesystem route to a remote `narada-andrey` surface is future
work and must not be represented as active under this contract.

## Capability Grant

The route alone is not enough for mutation tools.

Minimum capability grant shape:

```json
{
  "grant_id": "grant_narada-proper_to_narada-andrey_cross_site_inbox_submit_v0",
  "site_id": "narada-andrey",
  "capability_kind": "canonical_inbox_cross_site_submission",
  "allowed_actions": [
    "inbox_stage_submission_workflow",
    "narada_inbox_stage_submission_workflow",
    "inbox_submit_observation",
    "narada_inbox_submit_typed_envelope"
  ],
  "source_site_id": "narada-proper",
  "target_authority": "canonical_inbox",
  "principal_scope": ["operator", "narada.architect"],
  "secret_values_recorded": false,
  "authority_limits": [
    "grant_allows_inert_envelope_submission_only",
    "grant_does_not_admit_target_site_inbox",
    "grant_does_not_mutate_task_lifecycle",
    "grant_does_not_read_or_write_secrets",
    "grant_does_not_register_site_registry_relation"
  ]
}
```

Grant evidence must come from one of:

- `narada-andrey` local admission evidence;
- an operator-admitted capability consent record;
- a Site relation/lineage artifact explicitly authorizing this crossing.

Existing `narada-andrey -> narada.architect` Operator Surface delivery
capability is not sufficient. It is opposite direction and different target
authority.

Historical notes or older task text may mention `cross_site_inbox.submit`.
That is superseded shorthand for this route family. The current MCP facade
enforces `canonical_inbox_cross_site_submission`.

## Submission Flow

Once route and capability are active:

1. Resolve route:

   ```powershell
   narada routing resolve --target-kind site --target-ref narada-andrey --format json
   ```

2. Inspect MCP fabric context:

   ```text
   narada_mcp_fabric_context target site:narada-andrey
   ```

3. Preview staged submission:

   ```text
   inbox_stage_submission_workflow submit=false target site:narada-andrey
   ```

4. Submit only if preview shows active route and active capability.

5. Record delivery confirmation against the outbox item.

6. Await target Site finalization/admission evidence separately.

## Refusals And Repair

| Condition | Refusal | Repair |
| --- | --- | --- |
| No route record | `No active MCP fabric route for target site:narada-andrey` | Obtain target coordinates; then add route through `narada routing add`. |
| Unsupported route address | `unsupported address_kind` | Use `site_root`/`narada_site_root` or implement admitted non-filesystem MCP transport. |
| Unsupported route transport | `unsupported transport` | Use `filesystem` for current fabric or admit a new transport. |
| Missing target root | `target_site_root_missing` | Ask `narada-andrey`/operator for admitted route coordinates. |
| Missing capability grant | `capability_status: missing` | Add target-approved or operator-approved capability consent. |
| Target unavailable | `target_site_unavailable` | Keep outbox item undelivered; retry later. |
| Target refuses local admission | `local_rejected` | Preserve delivery receipt and target rejection evidence; do not retry as if admission succeeded. |

## Authority Limits

This route may only support inert envelope submission to `narada-andrey`
Canonical Inbox. It does not grant:

- task lifecycle mutation;
- Site Registry relation activation;
- Site config mutation;
- raw secret access;
- operator-surface runtime mutation;
- target Site local admission;
- source Site import or migration.

## Current Posture

As of tasks 1467 and 1470:

- no active route exists for `site:narada-andrey`;
- no outbound `canonical_inbox_cross_site_submission` grant exists;
- outbox item `out_216c869d-5781-4539-a3d6-8ec21cd6b7c5` is confirmed as directly delivered to the target inbox through explicit target authority fallback;
- delivered target envelope: `env_37e5cd13-d005-4ba9-b0a2-e982139f246b`;
- target artifact: `C:\Users\Andrey\Narada\.ai\inbox-envelopes\2026-05-17T16-50-32-744Z-env_37e5cd13-d005-4ba9-b0a2-e982139f246b.json`;
- delivery evidence decision: `.ai/decisions/2026-05-17-narada-andrey-direct-target-inbox-delivery.md`.

Direct target delivery does not repair the MCP route and does not prove target
Site local admission, hosted registry registration, or reusable cross-Site
submission capability. Route and capability repair continue through the
principled route chapter.
