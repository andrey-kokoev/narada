# Charter Tool Bindings

## Mission
Add a first-class `tools` concept to the foreman/charter architecture so that charters can invoke executable capabilities against live systems, with the same mailbox-scoped, deployment-local binding model used for knowledge sources.

## Problem

The current architecture gives charters two capability categories:

1. `knowledge_sources` — passive reference material (docs, playbooks, sqlite)
2. `allowed_actions` — mailbox mutations (`send_reply`, `mark_read`, etc.)

This leaves a semantic cavity: **live-system interrogation**.

A `support_steward` working a bug report needs to query Sentry for recent errors. An `obligation_keeper` needs to run a SQL timeline query. These are not "knowledge" (they are not cached reference documents) and they are not "actions" (they do not mutate the mailbox). They are **tools**.

Without an explicit tool contract, charters will either:
- abuse `knowledge_sources` to invoke arbitrary scripts, or
- hardcode tool access inside charter definitions, breaking portability.

## Decision: Two-Layer Model

Tools have a **definition layer** (repo-specific) and a **binding layer** (mailbox-specific).

1. **Tool definitions** live in coordinator config but are inherently tied to the deployment/repo. A `local_executable` tool like `sentry-query` only works when executed from the repo that contains its `ops.env`.
2. **Tool bindings** declare which charters on which mailboxes may use which defined tools.
3. **Thread-level override** is supported: the foreman may add or remove available tools based on triage classifications (e.g., Product A threads get `sentry_query`, Product B threads get `datadog_query`).

## Tool Definition Model

```typescript
type ToolSourceType = "local_executable" | "http_endpoint" | "docker_image";

interface ToolDefinition {
  id: string;
  source_type: ToolSourceType;
  // Repo/deployment context
  repo_root?: string;
  working_directory?: string;
  // Execution shape
  executable_path?: string;
  url?: string;
  docker_image?: string;
  schema_args?: ToolArgSchema[];
}
```

## Tool Binding Model

Bindings belong in coordinator configuration, not inside `packages/charters`.

```typescript
interface MailboxToolBinding {
  mailbox_id: string;
  charter_tools: Record<string, ToolBinding[]>;
}

interface ToolBinding {
  tool_id: string;
  enabled: boolean;
  purpose: string;
  // Execution boundary
  read_only: boolean;
  timeout_ms: number;
  allowed_env_vars?: string[];
  // Human approval gate
  requires_approval: boolean;
  // Override the definition's working directory for this binding
  working_directory_override?: string;
}
```

JSON shape:

```json
{
  "mailbox_bindings": {
    "help@global-maxima.com": {
      "available_charters": ["support_steward", "obligation_keeper"],
      "default_primary_charter": "support_steward",
      "knowledge_sources": { ... },
      "tools": {
        "support_steward": [
          {
            "id": "sentry_query",
            "source_type": "local_executable",
            "enabled": true,
            "purpose": "Query Sentry for recent unresolved errors",
            "read_only": true,
            "timeout_ms": 15000,
            "allowed_env_vars": ["SENTRY_TOKEN", "SENTRY_ORG", "SENTRY_HOST"],
            "requires_approval": false
          },
          {
            "id": "sonar_psql",
            "source_type": "local_executable",
            "enabled": true,
            "purpose": "Run read-only diagnostic SQL against Sonar Postgres",
            "read_only": true,
            "timeout_ms": 30000,
            "allowed_env_vars": ["SONAR_PGHOST", "SONAR_PGPORT", "SONAR_PGDATABASE", "SONAR_PGUSER"],
            "requires_approval": true
          }
        ],
        "obligation_keeper": [
          {
            "id": "followup_sql",
            "source_type": "local_executable",
            "enabled": true,
            "purpose": "Query obligation timelines",
            "read_only": true,
            "timeout_ms": 10000,
            "requires_approval": false
          }
        ]
      }
    }
  }
}
```

## Tool Source Type Definitions

### 1. `local_executable`

A script or binary on the local filesystem.

```typescript
interface LocalExecutableTool extends ToolBinding {
  source_type: "local_executable";
  executable_path: string;
  working_directory?: string;
  default_args?: string[];
  schema_args?: ToolArgSchema[];  // for LLM arg generation
}

interface ToolArgSchema {
  name: string;
  type: "string" | "number" | "boolean" | "date";
  required: boolean;
  description: string;
}
```

Example mapping for the user's existing scripts:

```json
{
  "id": "sentry_query",
  "source_type": "local_executable",
  "executable_path": "/home/andrey/src/sonar.cloud/scripts/ops/sentry-query",
  "schema_args": [
    { "name": "command", "type": "string", "required": true, "description": "One of: issues, events, projects, search" },
    { "name": "query", "type": "string", "required": false, "description": "Sentry search query string" },
    { "name": "issue_id", "type": "string", "required": false, "description": "Issue ID for events lookup" },
    { "name": "start", "type": "date", "required": false, "description": "Start date (ISO 8601)" },
    { "name": "end", "type": "date", "required": false, "description": "End date (ISO 8601)" }
  ]
}
```

```json
{
  "id": "sonar_psql",
  "source_type": "local_executable",
  "executable_path": "/home/andrey/src/sonar.cloud/scripts/ops/sonar-psql",
  "schema_args": [
    { "name": "file", "type": "string", "required": false, "description": "Path to .sql file to execute" },
    { "name": "command", "type": "string", "required": false, "description": "Raw SQL command string" },
    { "name": "variables", "type": "string", "required": false, "description": "Variable substitutions as key=value pairs" }
  ]
}
```

Rules:
- The executable path is deployment-local, not repo-relative.
- The foreman or tool runner validates that the executable exists and is executable.
- Output is captured as structured text; non-zero exit codes surface as tool errors.
- `read_only: true` is a policy flag, not a filesystem guarantee. The runner should still log the invocation.

### 2. `http_endpoint`

A remote API endpoint the tool runner can POST to.

```typescript
interface HttpEndpointTool extends ToolBinding {
  source_type: "http_endpoint";
  url: string;
  method: "GET" | "POST";
  headers?: Record<string, string>;
  auth_type?: "bearer" | "basic" | "none";
  schema_args?: ToolArgSchema[];
}
```

Rules:
- The tool runner is responsible for injecting credentials from secure storage, not from charter prompts.
- Timeouts and retry policies are enforced by the runner.
- Response bodies are truncated if they exceed a size threshold.

### 3. `docker_image`

A containerized tool invocation.

```typescript
interface DockerImageTool extends ToolBinding {
  source_type: "docker_image";
  image: string;
  entrypoint?: string[];
  env_pass_through?: string[];
  schema_args?: ToolArgSchema[];
}
```

Rules:
- The runner manages the container lifecycle.
- Network access may be restricted by runner policy.
- This is a v2/v3 candidate; documenting it now keeps the enum extensible.

## Tool Invocation Contract

The foreman does not execute tools directly. Instead, it passes the **tool catalog** into charter invocation context, and the charter may request tool use in its structured output.

### Tool Catalog In Context

```typescript
interface ToolCatalogEntry {
  tool_id: string;
  purpose: string;
  read_only: boolean;
  requires_approval: boolean;
  schema_args?: ToolArgSchema[];
}
```

This is added to `CharterInvocationInput`:

```typescript
interface CharterInvocationInput {
  // ... existing fields ...
  available_tools: ToolCatalogEntry[];
}
```

### Tool Request In Charter Output

Charters may include tool requests in their output envelope:

```typescript
interface ToolInvocationRequest {
  tool_id: string;
  args: Record<string, unknown>;
  rationale: string;
}
```

Added to `CharterOutputEnvelope`:

```typescript
interface CharterOutputEnvelope {
  // ... existing fields ...
  tool_requests: ToolInvocationRequest[];
}
```

### Foreman Tool Runner Boundary

The foreman validates tool requests:

1. `tool_id` must exist in `available_tools` for this charter.
2. If `requires_approval` is true, the foreman must hold the request until approved (or auto-approve if policy allows).
3. If `read_only` is false, additional policy checks apply.
4. Args are validated against `schema_args`.
5. The foreman invokes the tool through a **tool runner** (not the charter).
6. The tool result is returned to the charter in a follow-up invocation or appended to thread context.

### Tool Result Shape

```typescript
interface ToolResult {
  tool_id: string;
  request_args: Record<string, unknown>;
  exit_status: "success" | "timeout" | "error";
  stdout: string;
  stderr: string;
  // Structured extraction if available
  structured_output?: unknown;
  executed_at: string;
  duration_ms: number;
}
```

## Safety Boundaries

1. **No tool execution inside charter definitions.**
   Charters propose tool use; the foreman/tool runner executes it.

2. **Credential isolation.**
   Tools receive credentials from the runner's secure storage or allowed env vars, never from charter-generated args.

3. **Timeout enforcement.**
   Every tool binding declares `timeout_ms`. The runner hard-kills processes that exceed it.

4. **Read-only default.**
   `read_only: true` is the default. Write-capable tools must be explicitly marked and may require approval.

5. **Audit trail.**
   Every tool invocation is recorded in the agent trace store (see task 20260413-009) with full args and result summary.

## Relationship to Knowledge Sources

| Dimension | Knowledge Source | Tool |
|-----------|-----------------|------|
| Nature | Passive reference | Active execution |
| Latency | Cached/pre-loaded | Live invocation |
| Mutates external state? | No | May (if `read_only: false`) |
| Charter interaction | Consumed directly | Proposed, then executed by runner |
| Typical examples | Docs, playbooks, sqlite history | Sentry query, SQL diagnostic, API call |

## Relationship to Outbound Actions

| Dimension | Action | Tool |
|-----------|--------|------|
| Target | Mailbox / Graph API | External systems |
| Durability | Outbound worker queue | Tool runner + trace store |
| Charter role | Proposes to foreman | Proposes to foreman |
| Execution | Outbound worker | Tool runner |

## Open Questions For Review

1. Should `tool_requests` in charter output be synchronous (charter waits for result in the same turn) or asynchronous (charter is re-invoked with results later)?
2. Should the tool runner be a separate long-running process, or a library call inside the foreman/coordinator?
3. How should `schema_args` be exposed to LLM-based charters — as JSON schema, as natural description, or both?
4. Should tool results themselves be cacheable knowledge items for future charter invocations?

## Definition Of Done

- [ ] Tool binding model is defined (`MailboxToolBinding`, `ToolBinding`)
- [ ] `local_executable` source contract is defined
- [ ] `http_endpoint` source contract is defined
- [ ] `docker_image` source contract is defined (v2 placeholder)
- [ ] Tool invocation request/result contract is defined
- [ ] Foreman validation rules for tool requests are documented
- [ ] Safety boundaries (credentials, timeouts, read-only, audit) are specified
- [ ] Distinction from `knowledge_sources` and `allowed_actions` is explicit
- [ ] Relationship to agent trace store is documented
