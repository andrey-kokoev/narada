# New Site NARS / Agent-CLI Projection Smoke Check

Run these checks before declaring a Site aligned with packaged NARS launch and the `agent-cli` terminal projection.

0. Run `narada sites deps sync --root <site> --apply` and confirm the follow-up dry run reports `status: current`.
1. Start the Site with `-Runtime agent-cli`.
2. Confirm the preamble shows the packaged NARS launch path and `agent-cli` compatibility surface.
3. Run startup sequence.
4. Read a truncated output with `mcp_output_show({"ref":"mcp_output:..."})`.
5. Create a long payload with `mcp_payload_create`; confirm inline JSON contains `payload_ref`.
6. Retry a long-argument tool using `payload_ref`.
7. Confirm invalid fields are reported as schema validation errors before payload-size errors.
8. Dry-run one task report or closeout path.

Passing this check means the Site uses the shared package and transport contracts. It does not prove site-specific task policy correctness.
