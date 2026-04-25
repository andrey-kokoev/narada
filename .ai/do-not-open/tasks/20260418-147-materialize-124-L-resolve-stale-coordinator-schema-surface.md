# Task 147: Materialize 124-L Resolve Stale Coordinator Schema Surface

## Source

Derived from Task 461-L in `.ai/do-not-open/tasks/20260418-461-comprehensive-semantic-architecture-audit-report.md`.

## Why

Stale schema artifacts create false authority and confuse contributors about which schema is real.

## Goal

Delete or clearly mark stale `coordinator/schema.sql` so there is one believable schema authority.

## Deliverables

- stale schema artifact removed or explicitly marked non-authoritative
- docs/comments updated to point to the real schema authority

## Definition Of Done

- [ ] no stale schema file remains implicitly authoritative
- [ ] contributors can identify the real schema authority unambiguously
