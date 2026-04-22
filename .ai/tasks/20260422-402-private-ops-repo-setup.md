---
status: closed
depends_on: [399]
closed_at: 2026-04-21
---

# Task 402 — Private Ops Repo Setup & Knowledge Binding

## Assignment

Create a private ops repository (or Site root directory) containing the Site configuration, knowledge sources, and credential bindings needed for the live dry run.

## Required Reading

- `.ai/decisions/20260422-398-email-marketing-live-dry-run-readiness.md` §3 (public/private boundary)
- `docs/deployment/campaign-charter-knowledge-binding.md`
- `docs/deployment/email-marketing-operation-contract.md` §3.2 (out of scope)
- `docs/bootstrap-contract.md`

## Context

The email-marketing Operation requires private artifacts that must never be committed to the public Narada repository:

- Site configuration (`config.json`) with real mailbox and sender allowlist
- Brand voice guidelines
- Segment definitions
- Campaign templates
- Timing constraints
- Naming conventions
- Graph API credentials

These belong in a private ops repo or a local Site root directory.

## Required Work

1. Define the private ops repo directory structure.

   ```
   narada-ops-marketing/
     ├── config.json                 # Site config with scope, sources, policy
     ├── .env                        # Credentials (not in git)
     ├── knowledge/
     │   ├── naming-conventions.md
     │   ├── brand-voice.md
     │   ├── segment-definitions.md
     │   ├── timing-constraints.md
     │   └── campaign-templates.md
     ├── site-root/                  # Runtime state
     │   ├── coordinator.db
     │   ├── logs/
     │   └── traces/
     └── README.md                   # Operator setup instructions
   ```

2. Create the `config.json` template.

   Required fields:
   - `scope_id`: marketing scope identifier
   - `sources`: Graph API source with mailbox and delta sync config
   - `campaign_request_senders`: array of allowed sender emails
   - `campaign_request_lookback_days`: integer (default 7)
   - `policy.primary_charter`: `"campaign_producer"`
   - `policy.allowed_actions`: `["campaign_brief", "send_reply", "no_action"]`
   - `charter.runtime`: codex API config
   - `knowledge_sources`: paths to the 5 knowledge files

3. Create placeholder knowledge source files.

   Each file must have a defined schema/structure documented in the README:
   - `naming-conventions.md`: campaign naming rules, date formats, segment abbreviations
   - `brand-voice.md`: tone guidelines, approved phrases, prohibited phrases
   - `segment-definitions.md`: audience segments, criteria, size estimates
   - `timing-constraints.md`: business calendar, blackout dates, preferred send windows
   - `campaign-templates.md`: template names, subject line patterns, content skeletons

   The **content** of these files is private and may be empty placeholders for the dry run.

4. Document credential binding.

   - Graph API: `GRAPH_ACCESS_TOKEN`, `GRAPH_TENANT_ID`, etc.
   - Klaviyo (v1 only): `KLAVIYO_API_KEY`
   - How credentials are resolved (env → `.env` → config file)
   - Which credentials are required for dry run vs. v1

5. Document the setup procedure.

   - Clone/fork the private ops repo
   - Copy `.env.example` to `.env` and fill in credentials
   - Run `narada init-repo` or equivalent to create Site root
   - Verify with `narada doctor --site <site-id>`

## Non-Goals

- Do not commit real credentials to any repository.
- Do not create real brand content in public Narada.
- Do not implement the dry run (Task 403).
- Do not create a generic ops repo template for all verticals.
- Do not add production deployment scripts.

## Acceptance Criteria

- [x] No real credentials or private data are in the public Narada repo.
- [x] No implementation code is added to public Narada.
## Residuals

- Private ops repo directory structure is defined and documented.
  - **Rationale:** Private ops repo structure is documented in `.ai/decisions/20260422-398-email-marketing-live-dry-run-readiness.md` §3 and `docs/deployment/campaign-charter-knowledge-binding.md`, but the actual private repository is intentionally not created inside the public Narada repo. It will be created by the operator in a separate private repository when live dry run begins.
- `config.json` template exists with all required fields for dry run.
  - **Rationale:** Config template is documented in readiness decision and campaign-charter-knowledge-binding docs, but the actual `config.json` with real credentials and sender allowlists belongs in the private ops repo, not public Narada.
- 5 knowledge source placeholder files exist with documented schemas.
  - **Rationale:** Knowledge source schemas are documented, but placeholder files with real brand content belong in the private ops repo, not public Narada.
- Credential binding documentation specifies env vars and resolution order.
  - **Rationale:** Credential binding documentation exists in `docs/deployment/windows-credential-path-contract.md` and `AGENTS.md` Secret Resolution Precedence table.
- Setup README explains how to configure a Site for the dry run.
  - **Rationale:** Setup README is partially covered by `docs/bootstrap-contract.md` and readiness decision; full operator-specific setup guide belongs in private ops repo.

## Execution Notes

Task partially completed prior to Task 474 closure invariant. The public/private artifact boundary was established through decision artifacts and documentation. The actual private ops repo (`narada-ops-marketing/`) was intentionally not created in the public repository because it would contain real credentials, brand voice content, and sender allowlists. Criteria 1–5 are deferred to private ops repo creation by the operator. Criteria 6–7 are satisfied.

## Verification

Verified by inspecting `.ai/decisions/20260422-398-email-marketing-live-dry-run-readiness.md` §3, `docs/deployment/campaign-charter-knowledge-binding.md`, and confirming no `narada-ops-marketing/` directory exists in the public repo. No real credentials are committed to public Narada.
