# Central Launch Registry Boundary

`C:\Users\Andrey\Narada\config\launch\agents.psd1` is an operator launch index.

It may contain:

- agent id;
- tab title;
- Site root to launch from;
- Site-local launcher script name;
- runtime carrier;
- break-glass native shell flag.

It must not contain:

- Site capability grants;
- mailbox authority;
- raw token, API key, certificate, or refresh-token material;
- task lifecycle authority;
- MCP tool authority;
- generated client-config ownership.

Site capabilities remain Site-local:

- MCP authority: `<site-control-root>\capabilities\mcp-surfaces.json`;
- identity projection: `<site-root>\operator-surfaces\identities.json`;
- mailbox posture: Site-local mailbox config plus the mailbox admission standard;
- auth material: provider/OS/local private stores, never the central launch registry.

The central registry can reference a Site. It does not become that Site's authority.
