# Task 082 — Complete De-Mailboxing of Observation Storage Models

## Objective
Finish Task 079 at the durable/read-model boundary so generic observation no longer depends on mailbox-era ontology.

## Why
The UI/query layer now exposes `context_id` / `scope_id`, but the underlying read path still depends on mailbox-era tables and fields such as:
- `conversation_records`
- `conversation_id`
- `mailbox_id`

Non-mail verticals currently work by projecting synthetic contexts into mailbox-shaped storage and then filtering them back out in mailbox-specific views. That is transitional, not closed. :contentReference[oaicite:0]{index=0}

## Required Changes
- Introduce neutral observation-facing durable naming and adapters for:
  - context records
  - scope ownership
  - generic context summaries
- Remove mailbox-era naming from generic observation query helpers
- Stop relying on mailbox-prefix filtering (`timer:%`, `webhook:%`, `filesystem:%`) inside generic storage logic
- Keep mailbox-specific semantics isolated to mailbox vertical views/adapters only
- Add compatibility shims or migration helpers where needed so existing mailbox behavior remains intact

## Acceptance Criteria
- Generic observation queries do not read or expose mailbox-only concepts except through explicit compatibility adapters
- Mailbox-specific filtering logic no longer compensates for generic storage semantics
- Non-mail fixtures pass without requiring mailbox-shaped intermediate assumptions
- Grep over generic observation/query/type surfaces shows no `mailbox_id` / `conversation_id` leakage except in mailbox vertical modules and compatibility boundaries

## Invariant
Generic observation models must describe kernel truth, not mailbox history.