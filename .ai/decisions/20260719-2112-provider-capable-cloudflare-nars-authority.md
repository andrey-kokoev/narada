---
decision_of: 2112
decided_by: operator
decided_at: 2026-07-19T00:50:00Z
status: decided
---

# Decision: Provider-Capable Cloudflare NARS Authority Shape

Task 2112 asked whether the Cloudflare-origin NARS slice remains synthetic or grows into a provider/tool-capable authority runtime, and on what terms.

**Decision**: grow it, under the shape recorded in `docs/concepts/cloudflare-nars-provider-capable-authority.md`:

1. Provider dispatch is an in-Durable-Object HTTPS provider adapter, one call per admitted turn, with bounded timeout, operator abort, request-id idempotency, and no auto-retry.
2. Tool execution is bounded to the session MCP fabric (Cloudflare-native + provider-driven calls with per-effect admission); local filesystem/shell/local-MCP stay absent permanently.
3. Capability dimensions graduate `absent → declared → present` only with configuration or executed evidence; the validator enforces it. `local_tool_execution`, `local_mcp`, `local_filesystem_authority`, `local_artifact_authority` remain hard-absent on Cloudflare-origin.
4. Artifact/filesystem posture unchanged; session-native artifact adapter is the only artifact mutation path.
5. Host-transition admission is unchanged; provider-capable sessions must resolve (interrupt or complete) an in-flight provider turn before source seal.
6. Two new crossing regimes declared: provider dispatch; provider-driven tool effect.

**Rejected**: stay synthetic forever; full local-NARS parity on Cloudflare; proxying provider turns back to local NARS (authority collapse).

Implementation: Task 2113. Host transition: Task 2114. Live evidence: Task 2115.
