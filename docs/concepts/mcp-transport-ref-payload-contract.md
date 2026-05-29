# MCP Transport Ref/Payload Contract

This contract governs Narada MCP tool results that are too large or too structured to send inline.

## Canonical Ref

- `ref` is the canonical argument name for readback tools.
- `output_ref` is accepted only as an input compatibility alias by `mcp_output_show`.
- New guidance and examples must tell agents to call `mcp_output_show({"ref":"mcp_output:..."})`.

## Output Refs

- A tool may return an inline envelope with canonical `ref` when the full result exceeds the inline limit.
- The same envelope may include `output_ref` for compatibility, but agents should use `ref`.
- The envelope must be valid JSON.
- The envelope must name `reader_tool: "mcp_output_show"`.
- `mcp_output_show` must reject `mcp_payload:*` refs and explain to use `mcp_payload_show`.

## Payload Refs

- `mcp_payload_create` is special: it must always return valid inline JSON containing `payload_ref`.
- A created payload may also have an output ref for audit/readback, but `payload_ref` must remain visible inline.
- Tools that support payload transport accept `payload_ref` as a complete argument-object replacement.
- Payload transport is not authority. It only moves bytes; the receiving tool still owns validation and admission.

## Validation Order

Tools that support payload transport must process calls in this order:

1. Resolve payload transport.
2. Validate the effective argument object against the tool schema.
3. Enforce inline-size limits for inline calls.
4. Apply authority/admission checks.
5. Dispatch.

This order prevents a wrong field from being misreported as a payload-size problem.

## Package Boundary

The implementation lives in `packages/mcp-transport/src/mcp-payload-file.mjs`.

Consuming sites may keep a local compatibility shim, but must not keep editable transport logic. Site shims re-export the Narada proper package implementation.

Sites that consume the package record that dependency with `narada sites deps sync --root <site> --apply`. The resulting `.ai/runtime/package-provenance.json` is the local evidence that the Site is using the Narada proper package through a workspace link rather than a drifting copied implementation.
