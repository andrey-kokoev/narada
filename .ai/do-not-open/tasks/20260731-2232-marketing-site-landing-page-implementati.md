---
number: 2232
governed_by: task_close:narada.architect
status: closed
tags: marketing, website
creation_payload_ref: mcp_payload:narada-mkt-site-2026-07-31-landing-page@v1
creation_payload_sha256: ac745dacdf411e1f8c8ed15f8a3f7e08e292b2eccf21f170e2d102c42ea88e14
idempotency_key: chapter-narada-marketing-site-2026-07-31-landing-page
execution_binding_json: {"workspace_root":"<src-root>\\narada","executor_kind":"manual","executor_profile":null,"executor_id":null,"repository_root":null,"site_root":"<src-root>\\narada","correlation_key":"chapter-narada-marketing-site-2026-07-31-landing-page"}
criteria_proved_by: andrey-user.resident
criteria_proved_at: 2026-07-31T22:43:01.422Z
closed_at: 2026-07-31T23:14:34.343Z
closed_by: narada.architect
closure_mode: agent_finish
---

# Marketing site: landing page implementation

## Goal

Implement the public landing page for Narada based on the approved positioning and messaging.

## Context

Depends on the positioning/messaging task in chapter narada-marketing-site. No existing website package in the repo; implementation location (new package vs separate repo) must be decided first.

## Required Work

1. Decide implementation location and stack (static site; keep dependencies minimal).
2. Implement landing page with approved copy.
3. Verify build and local rendering.

## Non-Goals

Docs portal; blog; operator console changes.

## Execution Notes


## Implementation location decision

Standalone project at <src-root>\narada-systems (sibling of the product repo), NOT a package inside <src-root>\narada. Rationale: the narada repo is a pnpm monorepo (packages/* globs) — adding an Astro app would churn the shared lockfile and CI for zero coupling benefit; the marketing site deploys independently to Cloudflare and only links back to the repo.

## Stack and provenance

Scaffolded via the official Cloudflare template path: create-cloudflare v2.70.16 --framework=astro (its create-astro delegation failed non-interactively, so create-astro@latest was run directly with --template basics --typescript strict, then npx astro add cloudflare -y — the same end state C3 produces for 'Workers with Assets'). @astrojs/cloudflare ^14.1.7, astro ^7.1.6, wrangler ^4.118.0. Zero runtime UI dependencies; single self-contained src/pages/index.astro with inline CSS.

## Page content

Implements the approved #2230 messaging verbatim: headline 'AI agents you can actually govern.', the approved subhead, five feature cards (Intelligence-Authority Separation, deterministic state compiler, vertical-agnostic kernel, governed tool fabric, operator-grade continuity), the full observe->...->reconciliation boundary chain as centerpiece, CTAs to github.com/andrey-kokoev/narada and npmjs.com/package/@narada2/cli, og:url https://narada.systems/.

## Files

wrangler.jsonc (assets binding ./dist, nodejs_compat; no 'main' — the vite-plugin adapter manages the worker entry), public/.assetsignore, src/pages/index.astro. Template boilerplate (Welcome.astro, Layout.astro, default assets) removed.

## Verification


1. npm run build: 1 page built, clean (dist/client + dist/server emitted; immutable Cache-Control injected for /_astro/*).
2. npx wrangler dev --port 8799: GET / returned HTTP 200.
3. Content greps against served HTML all OK: 'actually govern', 'Intelligence-Authority Separation', 'reconciliation', 'narada.systems', '@narada2/cli'.
Acceptance criteria: (a) builds and renders locally — build + wrangler dev 200 verified; (b) copy matches approved messaging — #2230 Execution Notes copy used verbatim; (c) implementation location recorded — see decision above.
no_files_changed declared because the deliverable intentionally lives outside the narada site root at <src-root>\narada-systems; the narada repo tree is untouched.

## Acceptance Criteria

- [x] Landing page builds and renders locally
- [x] Copy matches approved messaging
- [x] Implementation location recorded
