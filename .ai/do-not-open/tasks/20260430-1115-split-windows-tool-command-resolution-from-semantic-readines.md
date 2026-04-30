---
status: opened
---
# Split Windows tool command resolution from semantic readiness

## Chapter

/home/andrey/src/narada/.ai/do-not-open/tasks/20260430-1113-1118-windows-bootstrap-correctness.md

## Goal

Make Windows substrate readiness separate command discovery from semantic readiness/read-back probes for Windows Terminal, Komorebi, YASB, and PowerShell.

## Context

Inbox observation env_ffeed7c4 reports that tool availability is probed by invoking every command with `--version`, which is brittle for `wt`, `yasb`, and `yasbc` and does not prove semantic readiness.

## Required Work

1. Inventory current tool probes in `bootstrap-windows`.
2. Introduce distinct fields for command_resolution, version_probe, semantic_readiness, and read_back where appropriate.
3. Use tool-specific non-destructive probes for Windows Terminal, Komorebi, YASB/YASBC, PowerShell, and execution policy posture.
4. Keep missing-tool output compact with exact install/repair commands.
5. Add tests covering command found/no-version, command missing, semantic readiness unknown, and known ready states.

## Non-Goals

- Do not require live Windows UI automation in core tests.
- Do not claim readiness from mere command existence when read-back is unavailable.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Substrate readiness output separates command resolution from semantic readiness
- [ ] Windows Terminal, Komorebi, YASB/YASBC, and PowerShell each have tool-appropriate non-destructive probe posture
- [ ] Missing or ambiguous readiness returns exact unblock guidance without giant transcripts
- [ ] Focused tests cover found/no-version, missing command, unknown semantic readiness, and ready cases
