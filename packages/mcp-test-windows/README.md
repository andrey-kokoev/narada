# @narada2/mcp-test-windows

Descriptor contracts for an approved Windows test gateway MCP surface.

The package defines test target descriptors and structured evidence payloads. It does not import narada-andrey approved path lists, PC-local pass/fail state, credentials, or runtime evidence as receiving-Site authority.

## Test Run Planning

The `narada.mcp_test_windows.run_request.v0` contract plans approved test execution by registry id or approved repo path. Decisions are descriptor-only: the package does not launch tests, bind agents, mutate evidence stores, or import pass/fail history.

Run decisions refuse mixed id/path requests, missing targets, suspicious shell syntax, raw WSL path crossings, invalid timeouts, source pass/fail imports, and credentials. Command-based registry entries remain warnings until a receiving Site admits its own test carrier.
