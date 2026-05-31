# Agent TUI Contracts

This directory contains small machine-readable contracts shared by the Rust `agent-tui` crate and Narada proper launcher metadata.

These files are authoritative where launcher metadata and Rust runtime evidence must agree.

## Files

- `mcp-runtime.json`: MCP runtime config path policy used by Rust MCP runtime config and `agent-start` MCP launch metadata.
- `provider-adapters.json`: provider adapter kind names and production implementation posture used by Rust provider adapter admission and `agent-start` provider launch metadata.

## Rules

- Do not duplicate values from these files as independent constants in Rust or JavaScript launcher code.
- Contract readers must validate expected schema posture before using values.
- A contract value change is a semantic carrier change and requires Rust and launcher tests.
