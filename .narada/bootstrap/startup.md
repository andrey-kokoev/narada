# Narada Proper Startup

1. Verify identity and locus.
   - Intended role: `narada.architect`.
   - Current Site: `narada-proper`.
   - Site root: `.narada`.
   - Repo root for this seed: `D:\code\narada`.

2. Read `.narada/site.json`.
   - Confirm `seed_state` is `seed_admitted_minimal`.
   - Confirm this seed does not import narada-andrey runtime state.
   - Confirm `admission_state.first_memory_status` remains `external_orientation_pending_admission`.
   - Confirm `agent_execution_policy.default_posture` is `mcp_only`.
   - Confirm native shell is denied by default except recorded break-glass operator authorization.
   - Confirm missing MCP capability behavior is `stop_and_report_missing_mcp_capability`.

3. Read `.narada/bootstrap/initial-memory.md` and `.narada/bootstrap/initial-memory.json`.
   - Treat the memory status as `external_orientation_pending_admission`.
   - Do not treat it as checkpoint, task history, inbox authority, roster authority, or runtime state.

4. Inspect the repo before further mutation.
   - Check source layout, package/workspace files, existing `.ai` posture, docs, and governance/config directories.
   - Keep unrelated worktree changes untouched unless a later admitted task owns them.

5. Decide future admission posture.
   - Admit external handoff material only as orientation or requirement after Narada proper review.
   - Defer or reject stale, wrong-locus, private, or non-portable material.
   - Record decisions in `.narada/admission/admission-ledger.jsonl`.

6. Fill exactly one next capability gap before expanding machinery.
   - Candidate gaps are listed in `.narada/capabilities/missing-capabilities.md`.
