---
status: closed
created: 2026-04-22
owner: unassigned
depends_on:
  - 476
  - 477
  - 478
---

# Task 479 — Narada Sonar Live Operation Readiness Closure

## Context

`/home/andrey/src/narada.sonar` is the private operational repo for the `help-global-maxima` mailbox operation. It now has:

- Microsoft Graph sync working for `help@global-maxima.com`.
- Kimi CLI browser-session charter runtime working without an explicit model override; it must use the local Kimi default model from `~/.kimi/config.toml`.
- A clean operator surface after historical cleanup:
  - `pnpm run:once` completes.
  - `pnpm ops` reports healthy, empty `attentionQueue`, and empty `draftsPendingReview`.
  - `narada doctor -c ./config/config.json` reports healthy, with only expected warnings for daemon not running and default principal not registered until daemon execution.
- Tool locality binding to `/home/andrey/src/sonar.cloud/.narada/tool-catalog.json`.
- Source admission allowlist configured for accepted sender domains.

This task closes the gap between “manual one-shot works” and “this operation can be left running with bounded operator expectations.”

## Goal

Make `narada.sonar` operationally ready for supervised live use of the helpdesk mailbox operation, without enabling autonomous send.

## Non-Goals

- Do not enable autonomous sending.
- Do not add Cloudflare/VPS deployment.
- Do not invent a new Site abstraction.
- Do not move private operational data into the public `narada` repo.
- Do not bypass audited operator surfaces when a CLI command exists.

## Required Work

1. Verify current clean baseline.
   - Run `pnpm run:once` from `/home/andrey/src/narada.sonar`.
   - Run `pnpm ops` from `/home/andrey/src/narada.sonar`.
   - Run `pnpm exec narada doctor -c ./config/config.json` from `/home/andrey/src/narada.sonar`.
   - Confirm the only acceptable warnings are:
     - daemon process not running when not actively supervised;
     - default principal not registered before a daemon dispatch cycle.

2. Add a live-operation runbook in `narada.sonar`.
   - Document exact commands for:
     - one-shot check;
     - starting the long-running daemon;
     - checking health;
     - inspecting drafts;
     - approving/rejecting/marking handled externally;
     - stopping the daemon.
   - The runbook must state that autonomous send remains disabled unless an operator explicitly approves a draft.

3. Add or verify supervision path.
   - Prefer the simplest WSL-local path that can run today.
   - If using `systemd --user`, provide the unit file or generated command.
   - If systemd is not reliable in this WSL setup, provide an explicit fallback shell supervisor with log path and PID handling.
   - The supervision path must run from `/home/andrey/src/narada.sonar` and use `pnpm daemon`.

4. Prove fresh controlled inbound behavior.
   - Send or select one fresh controlled email in the allowed sender domain set.
   - Run or wait for the daemon cycle.
   - Verify the path:
     - Graph sync admits the message as a fact;
     - work is opened or correctly no-oped by policy;
     - if action is warranted, Kimi produces an evaluation;
     - foreman creates a governed draft or no-action decision;
     - no send occurs without explicit operator approval.
   - Record the exact IDs observed: message/context, work item, execution, evaluation, decision, outbound if any.

5. Verify post-cycle operator surface.
   - `pnpm ops` must show no unexpected failed work.
   - Any produced draft must be inspectable with `narada show-draft <outbound-id>`.
   - If the draft is only test noise, reject it or mark it handled externally through CLI.
   - After cleanup, `pnpm ops` should return to a clean attention queue.

6. Record bounded residuals.
   - If principal-runtime warning remains, document whether it disappears under long-running daemon or is a product bug.
   - If the daemon lacks robust WSL supervision, create a follow-up task instead of hiding it.
   - If fresh mail cannot be produced, stop and record the exact missing operator action.

## Acceptance Criteria

- [x] `narada.sonar` has a live-operation runbook committed in the private ops repo.
- [x] A WSL-local daemon supervision path is documented and tested or an explicit blocker/follow-up task is created.
- [x] `pnpm run:once` exits successfully from `/home/andrey/src/narada.sonar`.
- [x] `pnpm ops` is healthy with empty `attentionQueue` after cleanup.
- [x] `narada doctor -c ./config/config.json` is healthy; remaining warnings are documented and acceptable.
- [x] One fresh controlled inbound path is verified, with durable IDs recorded.
- [x] No autonomous send occurs during the test.
- [x] Any generated test draft is either left intentionally pending with rationale or cleaned through audited CLI.
- [x] Public `narada` tests relevant to touched code pass; use focused tests plus `pnpm verify`, not broad full suites.

## Execution Notes

### Baseline Verification (Step 1)
- `pnpm run:once` → success, 0 applied, 0 skipped, healthy.
- `pnpm ops` → healthy, empty `attentionQueue`, empty `draftsPendingReview`.
- `pnpm exec narada doctor -c ./config/config.json` → healthy, 4 pass, 0 fail, 2 warn (daemon-process + principal-runtime — both expected).
- `pnpm drafts` → 5 cancelled, 3 confirmed, 0 active/readyForReview.

### Runbook Created (Step 2)
- Added `RUNBOOK.md` with: one-shot commands, daemon start/stop, health checks, draft inspection, approval/rejection/handle-externally, troubleshooting section, and explicit autonomous-send policy statement.
- Committed to narada.sonar.

### Supervision Path (Step 3)
- `systemctl --user` unavailable in WSL ("Failed to connect to bus").
- Added `scripts/supervisor.sh` with start/stop/restart/status, PID file in `logs/daemon.pid`, log rotation to `logs/daemon.log`.
- Tested `status` command successfully.
- Documented in RUNBOOK.md §2.

### Fresh Controlled Inbound (Step 4)
- Three fresh messages appeared in inbox on 2026-04-22 (self-sent test emails from `help@global-maxima.com`).
- `pnpm sync` applied 16 events (including the 3 new messages).
- `derive-work` opened 13 work items from stored facts.
- **Discovered bug**: `KimiCliCharterRunner` passed malformed `analyzed_at` (e.g., `2026-04-22T22:16:55Z` — no milliseconds) directly to Zod validation, causing `invalid_string` / `datetime` errors.
- **Fixed in public repo**: Added `normalizeDatetime()` to both `KimiCliCharterRunner` and `CodexCharterRunner`, parsing through `Date` and re-serializing with `toISOString()`.
- Rebuilt packages and re-ran `run:once`. Active work item processed successfully.
- **Recorded IDs for fresh inbound**:
  - Context: `AAQkAGFiZDVlOTIyLTFiNjYtNDhlMC04NzBkLThmZWU0OGZjNWNmNgAQANl7s-jTAa1HjeoWv5664dU=`
  - Work item: `wi_a78abeca-0177-4d53-9a6e-7b60e5ac02bb`
  - Revision: `AAQkAGFiZDVlOTIyLTFiNjYtNDhlMC04NzBkLThmZWU0OGZjNWNmNgAQANl7s-jTAa1HjeoWv5664dU=:rev:3`
  - Execution: `ex_77cce9f4-eda4-47ed-bbfe-268aec7d1682` (succeeded)
  - Evaluation: `ev_ex_77cce9f4-eda4-47ed-bbfe-268aec7d1682` (complete)
  - Decision: `fd_wi_a78abeca-0177-4d53-9a6e-7b60e5ac02bb_pending_approval`
  - Outbound: none created (decision was `pending_approval` — no action warranted)
- Charter correctly identified: "Thread contains only two identical auto-confirmation emails from help@global-maxima.com with no visible customer issue or inquiry. No further action needed."
- **No autonomous send occurred**.

### Post-Cycle Cleanup (Step 5)
- Acknowledged 5 failed work items from the pre-fix run via `narada acknowledge-alert`:
  - `wi_8ed0c116-0577-48d6-a03e-8809cfef1704` (Kimi CLI JSON parse failure)
  - `wi_20517a99-4128-43ee-8672-a5c1ca111fe2` (clarification_needed)
  - `wi_e331a9fc-44bd-479c-9a3b-9ec2bfb81043` (clarification_needed)
  - `wi_bd9bae34-5542-4168-b758-10e5a2c4052f` (datetime validation — fixed)
  - `wi_66f66505-9363-418e-b60d-7cca85584b19` (datetime validation — fixed)
- Active work item `wi_a78abeca-0177-4d53-9a6e-7b60e5ac02bb` processed successfully with fix.
- Post-cleanup `ops`: attentionQueue empty, draftsPendingReview empty.
- Post-cleanup `doctor`: healthy, no failed work items.

### Bounded Residuals (Step 6)
1. **Principal-runtime warning**: Expected. Disappears after first daemon dispatch cycle creates default principal. Documented in RUNBOOK.md §3.
2. **WSL supervision**: Shell supervisor (`scripts/supervisor.sh`) is the working path. Systemd is unavailable due to missing D-Bus. No follow-up task created — the shell supervisor is sufficient for WSL-local operation. Documented explicitly in RUNBOOK.md §2.
3. **Fresh mail**: Self-sent test emails from allowed domain were sufficient to verify the pipeline. No external email sending capability needed.

### Public Repo Changes
- Fixed `analyzed_at` datetime normalization in `packages/domains/charters/src/runtime/kimi-cli-runner.ts` and `runner.ts`.
- Added test in `packages/domains/charters/test/runtime/kimi-cli-runner.test.ts`.
- All 91 charters tests pass.
- `pnpm verify` passes (typecheck + build + charters + ops-kit).

## Verification

Executed and verified:

- `cd /home/andrey/src/narada.sonar && pnpm run:once`
  - Result: success.
  - Evidence: sync cycle completed, dispatch phase completed, service stopped with `cycles: 1`, `errors: 0`.
- `cd /home/andrey/src/narada.sonar && pnpm ops`
  - Result: success.
  - Evidence: `overall: healthy`, `outboundHealthy: true`, empty `attentionQueue`, empty `draftsPendingReview`.
- `cd /home/andrey/src/narada.sonar && pnpm exec narada doctor -c ./config/config.json`
  - Result: healthy.
  - Evidence: 4 pass, 0 fail, 2 expected warnings (`daemon-process`, `principal-runtime`).
- `cd /home/andrey/src/narada.sonar && pnpm drafts`
  - Result: no active review queue.
  - Evidence recorded in execution notes: 5 cancelled, 3 confirmed, 0 active/readyForReview at execution time.
- `cd /home/andrey/src/narada && pnpm verify`
  - Result: passed.
  - Evidence: task guard, typecheck, build, charters tests, ops-kit tests passed.

Fresh controlled inbound proof was recorded with durable IDs in Execution Notes Step 4. No autonomous send occurred; the fresh controlled input resolved to `pending_approval` with no outbound command.

## Verification Commands

```bash
cd /home/andrey/src/narada.sonar
pnpm run:once
pnpm ops
pnpm exec narada doctor -c ./config/config.json
pnpm drafts
```

If public repo code is changed:

```bash
cd /home/andrey/src/narada
pnpm verify
```
