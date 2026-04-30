---
status: opened
---

# Extend client-service mailbox intent authoring

## Goal

Make client-service mailbox setup express material mailbox policy choices through sanctioned commands instead of direct config patching.

## Context

Inbox envelope `env_285e8922-6cc8-41ef-984a-3ac81f4753a0` reports that CPY mailbox setup succeeded, but `narada want-mailbox` could not express participant-domain admission across from/sender/to/cc/bcc, attachment policy, Site-local knowledge/material notes, a client-service correspondence scope name separate from mailbox address, or draft/send posture. These had to be patched directly into config files.

This follows task 1126. Task 1126 covers surfacing choices before readiness. This task covers making those choices executable through first-class mailbox intent authoring.

## Required Work

1. Inspect current `want-mailbox`, bootstrap-client, operation config schema, and mailbox charter/config output surfaces.
2. Extend or wrap mailbox intent authoring for client-service Sites so Operator choices can be expressed as command arguments or structured input.
3. Support admission predicates that can match participant domains across from, sender, to, cc, and bcc without direct config editing.
4. Support explicit attachment policy, mailbox user id, correspondence scope id, draft/send posture, and Site-local KB/material note posture.
5. Preserve existing simple `want-mailbox` usage for non-client-service or minimal mailbox operations.
6. Add help examples and tests for a CPY-like client-service mailbox setup.
7. Record residuals for any mailbox policy choice that remains intentionally manual.

## Non-Goals

- Do not provision Microsoft Graph credentials.
- Do not activate a live daemon or send mail.
- Do not make mailbox mandatory for every client-service Site.
- Do not encode CPY-specific domains as defaults.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Client-service mailbox authoring supports participant-domain predicates across from/sender/to/cc/bcc
- [ ] Client-service mailbox authoring supports attachment policy, mailbox user id, correspondence scope id, draft/send posture, and KB/material note posture
- [ ] CPY-like setup can be represented without direct config file editing
- [ ] Existing simple `want-mailbox` behavior remains compatible
- [ ] Help or docs show the guided client-service mailbox command path
- [ ] Tests cover structured client-service mailbox setup and minimal mailbox setup
