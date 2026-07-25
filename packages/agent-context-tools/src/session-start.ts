// Canonical home: @narada2/agent-context-mcp (mcp-surfaces) — the only
// published artifact and the only registrar-bound agent-context surface.
// This shim keeps existing narada importers working while all session-start
// logic lives in one place.
// Decision: .ai/decisions/20260719-2067-agent-context-session-start-convergence.md (#2067)
export * from '@narada2/agent-context-mcp/session-start';
