# @narada2/mcp-shell-windows

Descriptor contracts for a policy-aware Windows shell-like MCP surface.

This package defines request envelopes, approval categories, and refusal policy. It does not execute shell commands, grant live shell authority, import local allowlists, cross WSL boundaries, or hold credentials.

## Boundary Decisions

The package also provides `narada.mcp_shell_windows.boundary_request.v0` descriptors for deciding whether a requested operation belongs to filesystem MCP, shell MCP Git tools, a domain MCP surface, or refusal. Decisions are descriptor-only: they never execute a command, mutate Git state, grant live shell authority, or import credentials.

Boundary guards refuse raw WSL crossings, destructive process-kill patterns, source Site runtime imports, and credential import requests. Repository text reads/writes are classified as filesystem-MCP-preferred, while task lifecycle, inbox, and operator-surface mutations are classified as domain-MCP-required.
