# MCP Test Windows Source Inventory

Task: `narada-proper.task-0031`

This inventory records external orientation evidence used for the package-local test MCP contract. The evidence is not Narada proper truth and does not admit narada-andrey runtime state or test execution history.

## Considered Evidence

- `narada-andrey:tools/mcp-servers/test/test-mcp-server.mjs`
- `narada-andrey:tools/mcp-servers/test/test-mcp-server.test.mjs`
- `narada-andrey:tools/mcp-smoke-test.mjs`
- `narada-andrey:tools/mcp-smoke-test.test.mjs`

## Lifted

- Descriptor shape for approved test registry entries.
- Run-request decision shape for test id or approved path inputs.
- Refusal guards for mixed id/path requests, missing target, suspicious shell syntax, raw WSL path crossings, timeout range, source pass/fail import, and credential import.
- Evidence posture requiring receiving-Site generated test evidence.

## Refused

- Live Test MCP server implementation.
- Source Site test execution logs, pass/fail history, bound-agent roster, path policy, runtime logs, and credentials.
- Any command launch, process kill, or shell fallback.

## Package Claim

`@narada2/mcp-test-windows` now carries descriptor/contracts/tests for planning approved Windows/Narada test executions. A receiving Site must still admit its own test carrier, bound-agent policy, execution audit, and evidence storage.
