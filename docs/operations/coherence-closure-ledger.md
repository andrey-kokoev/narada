# Coherence Closure Ledger

## Scope

This ledger tracks adjacent coherence areas that are not task-lifecycle work:

- Pi carrier enforcement;
- mailbox-to-task admission;
- generated registry drift;
- central launch registry ownership;
- identity, role, and launcher consistency;
- startup sequence contract;
- secret and auth profile posture.

## Gates

`@narada2/mcp-fabric` owns MCP fabric loading/projection semantics for carriers.
The `tools\mcp-fabric\*.mjs` commands in this ledger are operator-facing audit
and registry-maintenance entrypoints over that fabric posture.

Base carrier and Site fabric gate:

```powershell
node tools\mcp-fabric\coherence-gate.mjs --pretty
```

Adjacent coherence gate:

```powershell
node tools\mcp-fabric\adjacent-coherence-gate.mjs --pretty
```

Identity projection audit:

```powershell
node tools\mcp-fabric\launch-identity-projection.mjs --pretty
```

Registry regeneration:

```powershell
node tools\mcp-fabric\generate-mcp-surface-registry.mjs --site-root "<site-root>" --pretty
```

## Closure Slices

### A. Pi Carrier Enforcement

Status: bounded.

Current decision: Pi is admitted for governed launch through the Narada-owned Pi MCP bridge extension. Its evidence level is config/adapter enforced, matching the Codex and Claude Code posture rather than Agent Runtime Server code-mediated execution.

Acceptance:

- carrier matrix marks Pi as `config_enforced`;
- carrier matrix marks `launch_supported: true`;
- carrier matrix marks `coherent_launch_supported: true`;
- adjacent gate reports Pi runtime count but does not fail solely because Pi appears in the coherent launch registry.

### B. Mailbox-To-Task Admission

Status: standardized; statically checked at surface level.

The standard is documented in `docs/product/mailbox-to-task-admission-standard.md`.

Acceptance:

- mailbox-enabled Sites expose mailbox/mail plus inbox posture or explicitly remain non-mailbox;
- raw mailbox bodies, tokens, and Graph identifiers do not become task authority by default;
- task creation/admission is a bounded transformation with evidence references.

Current static gate evidence level: `surface_presence_only`. Runtime mailbox sync, draft/reply/send, and task-admission behavior still require Site-local mailbox doctors or live smoke tests.

### C. Registry Drift Workflow

Status: gated.

Acceptance:

- Site-local registries live under each Site control root;
- generated registries can be intentionally regenerated from `.ai/mcp`;
- stale generated client-config entries fail the base coherence gate.

### D. Central Launch Registry Ownership

Status: bounded.

The central launch registry is a launch index only. It does not own Site capabilities, mailbox grants, tool authority, or runtime effects.

### E. Identity / Role / Launcher Consistency

Status: gated for projection consistency.

Acceptance:

- every central launch entry has an existing launcher script;
- every launcher-known Site has a local identity projection;
- every launched agent id appears in that local identity projection.

The generated identity projections are compatibility projections from the central launch registry. They prove local binding consistency, not independent Site identity authority.

### F. Startup Sequence Contract

Status: gated for registry declaration.

Acceptance:

- every launcher-known Site registry includes `startup_sequence`;
- every launcher-known Site registry includes `agent_context_hydrate_current`;
- every launcher-known Site registry includes `mcp_output_show`.

Current static gate evidence level: `registry_declaration_only`. Runtime MCP handshake/tool-list proof is a separate launch smoke.

### G. Secret/Auth Profile Posture

Status: documented; control artifacts marker-scanned.

Acceptance:

- raw secrets are not launch registry fields;
- auth profiles may be referenced, but raw token/key material lives in provider stores, OS user stores, `.narada-private`, or environment variables according to the owning Site policy;
- evidence records may report configured/missing/stale posture without printing raw secret values.

Current static gate scans the central launch registry plus Site-local MCP registries and identity projections for raw secret markers. It does not inspect provider token caches or every Site-local evidence artifact.
