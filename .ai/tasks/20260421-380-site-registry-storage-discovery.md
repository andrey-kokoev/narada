---
status: closed
closed: 2026-04-21
depends_on: [379]
---

# Task 380 — Site Registry Storage & Discovery

## Assignment

Implement the Site Registry storage layer and discovery mechanism for local Windows and WSL Sites.

## Context

Task 379 produces the boundary contract. This task implements the durable registry that discovers and tracks Sites.

## Goal

Build a registry that can discover Windows native and WSL Sites by filesystem scan, persist metadata, and answer basic queries.

## Required Work

1. Define registry storage schema:
   - `site_registry` table: `site_id`, `variant` (native/wsl/cloudflare), `site_root`, `substrate`, `aim_json`, `control_endpoint`, `last_seen_at`, `created_at`
   - `registry_audit_log` table: `request_id`, `site_id`, `action_type`, `target_id`, `routed_at`, `site_response_status`, `site_response_detail`

2. Implement discovery:
   - Native Windows: scan `%LOCALAPPDATA%\Narada\*` for directories containing `config.json`
   - WSL: scan `/var/lib/narada/*` and `~/narada/*` for directories containing `config.json`
   - Detect variant by platform (`process.platform`, `WSL_DISTRO_NAME` env)

3. Implement registry operations:
   - `discoverSites(): RegisteredSite[]`
   - `refreshSite(siteId): void` — re-read metadata from disk
   - `getSite(siteId): RegisteredSite | null`
   - `listSites(): RegisteredSite[]`
   - `removeSite(siteId): void` — removes from registry, does NOT delete Site

4. Store registry SQLite in a well-known location:
   - Native Windows: `%LOCALAPPDATA%\Narada\.registry\registry.db`
   - WSL: `~/.narada/registry.db`

5. Add focused tests with filesystem fixtures (temp dirs, mock configs).

## Non-Goals

- Do not implement health aggregation (Task 381).
- Do not implement control routing (Task 382).
- Do not implement Cloudflare Site discovery yet.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Registry schema exists and is documented.
- [x] Discovery finds Windows native Sites by directory scan.
- [x] Discovery finds WSL Sites by directory scan.
- [x] Registry persists across process restarts.
- [x] Removing a Site from the registry does not delete the Site.
- [x] Focused tests prove discovery and persistence without requiring real Sites.
- [x] No derivative task-status files are created.
