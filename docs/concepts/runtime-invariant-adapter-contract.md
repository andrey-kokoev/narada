# Runtime-Invariant Adapter Contract

Narada may run through many embodiments. Node is one current implementation runtime, not Narada's ontology.

## Definitions

| Term | Meaning |
| --- | --- |
| Execution surface | The command, API, script, UI, MCP tool, or daemon entrypoint through which a request is presented. |
| Runtime substrate | The concrete runtime that executes adapter code: Node CLI, PowerShell, shell, Cloudflare Worker, browser, daemon, or future runtime. |
| Authority locus | The Site, Operation, principal, or runtime locus authorized to admit or mutate the governed object. |
| Storage substrate | The persistence technology used locally: SQLite, JSON, filesystem, Durable Object storage, D1, keychain, or similar. |
| Runtime-invariant adapter surface | The stable request/result contract an adapter must satisfy regardless of runtime substrate. |
| Adapter protocol | The versioned contract that binds invocation, capability, authority, evidence, dry-run, error, idempotency, secret, observability, and compatibility rules. |

## Rule

Runtime substrate selection must always name the invariant adapter contract it satisfies.

A command may say "this CLI embodiment requires Node >=20." It must not say or imply "Narada requires Node" unless the current Operation Specification actually selects a Node-only runtime substrate.

Authority does not move because an adapter can execute. Storage does not become authority because an adapter persists. A runtime does not become ontology because it is convenient.

## Protocol Shape

The initial example artifact is [`../product/narada.adapter_protocol.v0.json`](../product/narada.adapter_protocol.v0.json). It covers:

- invocation contract;
- capability declaration;
- authority binding;
- evidence contract;
- dry-run contract;
- error taxonomy;
- idempotency;
- secret handling;
- observability;
- version compatibility.

## Multiple Runtime Substrates

The same adapter contract may be satisfied by:

- a Node CLI command that emits bounded JSON and mutation evidence;
- a PowerShell Windows script that performs the host-local adapter mutation and writes read-back evidence.

These are different runtime substrates. They are the same adapter only if they honor the same protocol and authority locus rules.

## Relationship To Existing Docs

SQLite posture remains adapter-first: `better-sqlite3` is the current local storage runtime, while `node:sqlite` is a future candidate behind the same store contract.

Operator Surface posture remains adapter-first: Windows Terminal, Komorebi, YASB, browser profiles, MCP consoles, and HTTP consoles are presentation adapters, not authority.

The current audit is [`../product/runtime-adapter-contract-audit.json`](../product/runtime-adapter-contract-audit.json).
