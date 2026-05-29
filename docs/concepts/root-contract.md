# Narada Launch Root Contract

Narada launch records separate three roots.

`NaradaRoot` is the launcher working root. The workspace launcher opens the terminal there and resolves relative launcher paths from it.

`SiteRoot` is the authoritative Narada Site root. Site-local tools, manifests, `.ai` runtime state, and `NARADA_SITE_ROOT` are scoped here.

`WorkspaceRoot` is the project workspace exposed to the agent when it differs from the Site root. It is optional for Sites where the launcher already emits the intended `NARADA_WORKSPACE_ROOT`.

Rules:

- If `SiteRoot` differs from `NaradaRoot`, the launch registry must declare `SiteRoot`.
- If workspace semantics matter and differ from launcher defaults, the registry must declare `WorkspaceRoot`.
- Workspace launch dry-run must pass declared `SiteRoot` and `WorkspaceRoot` into the Site starter.
- Starter dry-run must fail when launcher output disagrees with declared roots.
- Tool-surface manifests are reconciled against `SiteRoot`, never inferred from launcher cwd when `SiteRoot` is declared.

Canonical manifest location:

- Each Site root owns `site-tool-surface.manifest.json` directly.
- A Site whose root is `.narada` stores `.narada/site-tool-surface.manifest.json`.
- Narada proper stores `site-tool-surface.manifest.json` at the repository/Site root.
