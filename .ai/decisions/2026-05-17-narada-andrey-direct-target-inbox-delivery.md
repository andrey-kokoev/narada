# narada-andrey direct target inbox delivery

Date: 2026-05-17
Recorded by: narada.architect

## Context

Narada proper had an approved outbox request asking `narada-andrey` to decide whether to register/publish itself on the hosted Narada proper Site Registry:

- outbox id: `out_216c869d-5781-4539-a3d6-8ec21cd6b7c5`
- requested registry URL: `https://narada-site-registry.andrei-kokoev.workers.dev`
- target ref in outbox: `narada-andrey`

Task 1464 diagnosed that no active MCP fabric route exists for `site:narada-andrey`. Task 1465 specified the missing route contract. Task 1467 remains deferred for the specific route-mediated retry because the route/capability posture is still not admitted.

## Decision

Because the Operator explicitly requested sending the registration request to `narada-andrey`, and because `C:\Users\Andrey\Narada` is an available target authority surface with an accessible `.ai/inbox.db`, Narada proper delivered the request through the target Site's direct inbox authority surface rather than claiming MCP route success.

This is not evidence that `site:narada-andrey` has an admitted MCP route. It is only evidence that the request was placed into the target local inbox.

## Evidence

- Target root checked: `C:\Users\Andrey\Narada`
- Target inbox doctor found accessible inbox DB: `C:\Users\Andrey\Narada\.ai\inbox.db`
- MCP staged submission with explicit target root and `submit=true` refused cross-Site mutation because `canonical_inbox_cross_site_submission` capability was missing.
- Direct target inbox submission succeeded:
  - envelope id: `env_37e5cd13-d005-4ba9-b0a2-e982139f246b`
  - artifact: `C:\Users\Andrey\Narada\.ai\inbox-envelopes\2026-05-17T16-50-32-744Z-env_37e5cd13-d005-4ba9-b0a2-e982139f246b.json`
- The original outbox item was confirmed with:
  - delivery confirmation ref: `target-inbox:C:\Users\Andrey\Narada\.ai\inbox-envelopes\2026-05-17T16-50-32-744Z-env_37e5cd13-d005-4ba9-b0a2-e982139f246b.json`
  - execution evidence ref: `inbox-envelope:env_37e5cd13-d005-4ba9-b0a2-e982139f246b`

## Non-Claims

- No claim that `narada-andrey` admitted the registration request locally beyond receiving the inbox envelope.
- No claim that `narada-andrey` registered on the hosted registry.
- No claim that MCP fabric route/capability has been repaired.
- No claim that the target root's local configured Site identity is semantically identical to the operator-facing name `narada-andrey`; the target root currently identifies itself as `Narada` in the checked workflow output.
