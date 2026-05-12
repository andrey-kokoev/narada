# narada-proper.task-0018

Status: completed by `narada-proper.task-0024`.

Evidence:
- Carrier: `tools/site-init/site-live-carriers.mjs`
- Test: `tools/site-init/site-live-carriers.test.mjs`
- Audit: `.narada/audit/task-0024-create-site-live-carriers-implementation-audit.json`

Title: Add admitted Windows PowerShell consuming-Site integration

Goal:
- Make greenfield Sites easy to enter from Windows PowerShell without making profile writes implicit.

Acceptance:
- The CLI can emit pwsh snippets by default and perform profile writes only under explicit local admission.
- Tests cover Windows path examples and profile-write refusal.
- No PC-locus mutation without explicit PC authority.

Former blocker resolved:
- Target-local Windows profile binding artifact carrier implemented as `windows_profile_site_binding`.
- Real Windows profile file mutation outside the target Site remains a separate PC/profile authority step.
