# narada-andrey MCP Inbox Route Diagnostic

Date: 2026-05-17

Task: 1464

## Trigger

Narada proper attempted to send an inbox message to `narada-andrey` asking it to
register/publish itself on the hosted Narada proper Site Registry.

The MCP staged submission failed:

```text
No active MCP fabric route for target site:narada-andrey
```

## Finding

This is a Narada proper Site fabric coherence miss in routing/addressability.
It is not a failure of the Site Registry UI itself.

The missing pieces are:

1. **Route record missing**: `narada routing list --target-kind site --target-ref narada-andrey --format json`
   returned `count: 0`.
2. **Route resolution missing**: `narada routing resolve --target-kind site --target-ref narada-andrey --format json`
   returned `status: not_found` with no selected route or alternatives.
3. **Target Site root absent in this workspace**: a bounded local search under
   `D:\code` found only `D:\code\narada\.narada\site.json`; no
   `narada-andrey` Site root was discovered.
4. **Capability grant not established for this direction**: existing admitted
   `narada-andrey` capability evidence covers bounded Operator Surface delivery
   from `narada-andrey.Kevin` to `narada.architect`; it does not grant Narada
   proper outbound Canonical Inbox submission authority to `narada-andrey`.
5. **Target admission remains separate**: even after a route and capability are
   admitted, delivery to `narada-andrey` is not target Site local admission.

## Classification

| Layer | Status |
| --- | --- |
| Site name/concept | Known as an external Site reference. |
| MCP fabric route record | Missing. |
| Supported MCP transport | Current resolver supports filesystem/site-root routes only. |
| Target Site root/address | Missing from local evidence. |
| Outbound capability grant | Missing for Narada proper -> narada-andrey Canonical Inbox submission. |
| Target Site local admission | Not attempted and not claimed. |
| Prior outbox item delivery | Not delivered; remains approved but unconfirmed. |

## Non-Action

No fake route was created. No direct mutation of `narada-andrey` was attempted.
The approved outbox item `out_216c869d-5781-4539-a3d6-8ec21cd6b7c5` was not
marked delivered.

## Next Admissible Steps

1. Specify the route/capability contract for `narada-proper -> narada-andrey`
   inbox submission.
2. Obtain admitted target coordinates from `narada-andrey` or an operator
   authority surface:
   - target Site root or supported non-filesystem address;
   - target authority boundary: Canonical Inbox;
   - allowed source principal/action;
   - capability reference, not raw secret material.
3. Add a route only through `narada routing add` after coordinates exist.
4. Add or reference capability consent evidence before mutating cross-Site
   inbox state.
5. Retry the approved outbox request via `inbox_stage_submission_workflow`.
6. Mark delivery only on receipt; do not claim target local admission unless
   `narada-andrey` reports an admission decision.
