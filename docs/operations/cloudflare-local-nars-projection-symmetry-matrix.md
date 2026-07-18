# Cloudflare / Local NARS Projection Symmetry Matrix

## Purpose

This matrix records the intended symmetry between local NARS sessions, Cloudflare-hosted projection surfaces, and Cloudflare-origin authority/runtime slices. It is a documentation boundary, not a runtime authority claim.

The canonical runtime/surface/authority contract is
[`@narada2/nars-runtime-contract` `runtime-surface-contract`](../../packages/nars-runtime-contract/src/runtime-surface-contract.mjs)
(schema `narada.nars.runtime_surface_contract.v1`). Every supported quadrant reports `runtime_origin`, `surface_origin`, `authority_runtime_host`, `authority_epoch`, `authority_runtime_id`, projection identity/route, and `capability_profile` from declared contract fields — never inferred from transport or UI state.

## Quadrants

| Runtime origin | Surface origin | Evidence class | Truthful behavior label | Evidence |
| --- | --- | --- | --- | --- |
| Local NARS runtime | Local browser surface | `genuine` | Real local NARS authority; real local surface. | `packages/agent-runtime-server/test/server-wrapper.test.mjs` (spawned runtime emits `runtime_origin`/`authority_runtime_host` in `session_started`), `packages/agent-web-ui/test/agent-web-ui-projection.test.mjs` |
| Local NARS runtime | Cloudflare-hosted browser surface | `projected` | Real local authority; Cloudflare state is a non-canonical projection. Projected input is admitted only by local NARS (`semantic_success_point: nars_admission`). | `packages/cloudflare-nars-projection/test/runtime-surface-quadrants.test.ts`, `test/cloudflare-nars-projection.test.ts`, `test/cloudflare-nars-projection-node.test.ts` |
| Cloudflare-origin synthetic runtime | Local browser surface | `synthetic` | Synthetic authority: ordered synthetic events, replay, health, input admission, revocation are real at the synthetic boundary; provider/tool/local-MCP/local-filesystem/local-artifact authority are **absent** by declared capability profile. | `packages/cloudflare-nars-projection/test/runtime-surface-quadrants.test.ts`, `packages/agent-web-ui/test/agent-web-ui-projection.test.mjs` |
| Cloudflare-origin synthetic runtime | Cloudflare-hosted browser surface | `synthetic` | Same synthetic slice, consumed from the Cloudflare-hosted shell. Deployed live smoke evidence exists separately and is operator-run only. | `packages/cloudflare-nars-projection/test/runtime-surface-quadrants.test.ts`, `test/cloudflare-nars-projection.test.ts` |

## Coverage Notes

- Local runtime to Cloudflare surface covers endpoint derivation, replay/input transport, browser-token projection, asset hosting, and revocation through the Cloudflare projection service tests plus the shared quadrant conformance tests.
- Cloudflare-origin runtime to local and Cloudflare-hosted surfaces covers session creation, ordered synthetic events, duplicate/replay cursors, input admission/refusal, health, revocation, and close via `createCloudflareNarsAuthorityService` tests.
- Negative authority cases are tested explicitly: browser tokens cannot publish (`credential_kind_not_authorized_for_action`); input relay acknowledgement confirms only the crossing (`acknowledgement: requires_nars_admission`), never NARS admission; ambiguous dual-host authority creation is durably refused (`dual_host_authority_conflict`) without wiping the existing authority event log.
- Refused behaviors are labeled refusals, not failures: projection stores never mint canonical local events; the Cloudflare synthetic slice never claims local provider/tool/MCP/filesystem authority.
- `packages/cloudflare-carrier` remains a separate carrier implementation. A boundary guard test (`packages/cloudflare-carrier/src/cloudflare-carrier.test.mjs`) asserts it does not depend on NARS session authority/projection packages; it is not a NARS runtime quadrant.

## Principled Asymmetry

- Full provider/tool execution is not required on Cloudflare for the local-projection slice.
- The local projection bridge remains a projection edge, not a second local runtime.
- The Cloudflare-origin authority slice is synthetic and does not imply local provider execution semantics; its `capability_profile` reports `provider_execution`, `local_tool_execution`, `local_mcp`, `local_filesystem_authority`, and `local_artifact_authority` as `absent` in session and health diagnostics.
- Remote observation and authority-host transition remain distinct from projection symmetry. Host transition follows the existing drain/seal/prepare/activate FSM in `packages/nars-session-core` with epoch-token and first-sequence evidence; ambiguous dual-host operation is refused.

## References

- [`NARS Runtime Contract`](../concepts/nars-runtime-contract.md)
- [`Cloudflare NARS Web Projection`](../concepts/cloudflare-nars-web-projection.md)
- [`NARS Remote Projection Gateway`](../concepts/nars-remote-projection-gateway.md)
- [`Cloudflare Carrier Target`](../architecture/cloudflare-carrier/target.md)
