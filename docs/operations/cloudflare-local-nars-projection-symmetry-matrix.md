# Cloudflare / Local NARS Projection Symmetry Matrix

## Purpose

This matrix records the intended symmetry between local NARS sessions, Cloudflare-hosted projection surfaces, and Cloudflare-origin authority/runtime slices. It is a documentation boundary, not a runtime authority claim.

The checked-in tests already cover the core synthetic projection paths. This matrix names the quadrants explicitly so local-vs-Cloudflare projection work does not drift into accidental authority mixing.

## Quadrants

| Runtime origin | Surface origin | Coverage | Evidence |
| --- | --- | --- | --- |
| Local NARS runtime | Local browser surface | Covered. | `packages/agent-web-ui/test/agent-web-ui.test.mjs`, `packages/agent-web-ui/test/e2e/ux-smoke.spec.js`, `packages/agent-web-ui/test/e2e/slash-snippets.spec.js`, `packages/agent-web-ui/test/e2e/panels.spec.js` |
| Local NARS runtime | Cloudflare-hosted browser surface | Covered. | `packages/agent-web-ui/test/agent-web-ui-local-submit-html-artifact-cloudflare-e2e.test.mjs`, `packages/agent-web-ui/test/agent-web-ui-cloudflare-html-artifact-e2e.test.mjs` |
| Cloudflare-origin authority/runtime | Local browser surface | Covered at service/projection level. | `packages/cloudflare-nars-projection/test/cloudflare-nars-projection.test.ts`, `packages/cloudflare-nars-projection/test/cloudflare-nars-projection-node.test.ts`, `packages/agent-web-ui/test/agent-web-ui.test.mjs` |
| Cloudflare-origin authority/runtime | Cloudflare-hosted browser surface | Covered. | `packages/cloudflare-nars-projection/test/cloudflare-nars-projection.test.ts`, `packages/cloudflare-nars-projection/test/cloudflare-nars-projection-node.test.ts`, `docs/concepts/cloudflare-nars-web-projection.md` |

## Coverage Notes

- Local runtime to Cloudflare surface covers replay, live event delivery, operator input admission, artifact rendering, and revocation through the existing local-submit and hosted-artifact E2E tests.
- Cloudflare-origin runtime to local browser surface covers event replay, input admission, health, and revocation at the synthetic authority/runtime level.
- Cloudflare-origin runtime to Cloudflare-hosted browser surface is the hosted authority path documented in the Cloudflare projection target and exercised by the Cloudflare projection tests.

## Principled Asymmetry

- Full provider/tool execution is not required on Cloudflare for the local-projection slice.
- The local projection bridge remains a projection edge, not a second local runtime.
- The Cloudflare-origin authority slice is synthetic and does not imply local provider execution semantics.
- Remote observation and authority-host transition remain distinct from projection symmetry.

## References

- [`Cloudflare NARS Web Projection`](../concepts/cloudflare-nars-web-projection.md)
- [`NARS Remote Projection Gateway`](../concepts/nars-remote-projection-gateway.md)
- [`Cloudflare Carrier Target`](../architecture/cloudflare-carrier/target.md)

