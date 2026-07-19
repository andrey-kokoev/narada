# Decision: converge agent-context session-start split-brain to one canonical home

- Task: #2067 (Multi-repo workspace build fragility + module split-brain convergence)
- Date: 2026-07-19
- Status: decided

## Context

Two full implementations of the agent-context session-start module exist and have
diverged:

1. `mcp-surfaces/packages/agent-context-mcp/src/session-start.ts` — published as
   `@narada2/agent-context-mcp` (`exports["./session-start"]`). Strict: session start
   fails when `.ai/agents/roster.json` is missing or the identity is not in it.
2. `narada/packages/agent-context-tools/src/session-start.mjs` — private package,
   newer behavior: when the site has not opted into roster enforcement
   (`enforce_session_roster === true` in roster.json), identity is validated by
   non-authoritative inference (`roster_source: identity_inference_non_authoritative`)
   instead of failing.

On 2026-07-18 the strict copy broke agent start for identities absent from the roster
DB; #2047 flipped narada source checkouts to prefer the narada copy. Published installs
still resolve `@narada2/agent-context-mcp/session-start`, i.e. the strict copy.

## Inventory (verified 2026-07-19)

### session-start module pair

- mcp-surfaces `agent-context-mcp/src/session-start.ts` (strict, 867 lines). Imported
  only by the package's own `main.ts`; also exported as the package subpath
  `@narada2/agent-context-mcp/session-start`.
- narada `agent-context-tools/src/session-start.mjs` (lenient, 929 lines). Importers:
  - `agent-start/src/narada-agent-start.ts` (launcher; prefers this copy in source
    checkouts since #2047, falls back to the packaged strict copy),
  - `agent-context-tools/src/list-sessions.mjs`,
  - `agent-context-tools/src/agent-context-mcp-server.mjs` (legacy server, see below),
  - `agent-context-tools/src/agent-context-tools.test.mjs`.
- Dead reference: `site-common-tools/src/mcp-servers/shell/shell-mcp-server.mjs`
  imports `../../agent-context/session-start.mjs` and `../../agent-context/path-policy.mjs`,
  a directory that does not exist — the file cannot be loaded at all. Nothing spawns
  it: references are a registry descriptor string (`mcp-test-windows`), an audit path
  check, and historical task docs. The live shell server is
  `packages/mcp-shell-windows/server.mjs`. Classified as unloadable dead code;
  folded into follow-up task #2138's retirement audit instead of import surgery.
- No third implementation found. `cloudflare-carrier`, `carrier-protocol`,
  `narada-native-carrier` hits for "session-start" are incidental strings.

### agent-context MCP server pair (assessed)

- mcp-surfaces `agent-context-mcp/src/main.ts` exposes 14 tools (guidance, doctor,
  whoami, start_session, checkpoint, rehydrate, continuation_export,
  continuation_read, hydrate_current, startup_sequence, list_sessions, output_show,
  plus the startup prompt).
- narada `agent-context-tools/src/agent-context-mcp-server.mjs` (5655 lines) exposes
  ~40 tools, a superset adding ISN tools, IS movement-trace tools, lifecycle
  history/show, doctrinal grounding, codex session evidence tools, restart/pause, and
  event/bootstrap inspection.
- Binding evidence: every registrar-bound site fabric resolves the agent-context
  surface to `mcp-surfaces/packages/agent-context-mcp/dist/src/main.js`
  (verified: andrey-user, narada-proper, smart-scheduling, thoughts-project,
  narada-cpy, narada-staccato; all other surfaces in all fabrics likewise resolve to
  mcp-surfaces dist entrypoints). No site fabric binds narada's
  `agent-context-mcp-server.mjs`. The narada monolith is unbound legacy.

## Decision

1. **Canonical home for session-start is `@narada2/agent-context-mcp`
   (mcp-surfaces).** It is the only published artifact and the only registrar-bound
   surface; narada's `agent-context-tools` is `private: true` and can never reach
   published installs.

2. **Port the lenient roster behavior into the mcp-surfaces TypeScript
   implementation**, preserving its `node:sqlite` (`DatabaseSync`) substrate and
   public export surface. Behavioral parity target: narada's copy, including
   `enforce_session_roster` opt-in semantics, `identity_inference_non_authoritative`
   source, inferred role binding, and `prior_error` propagation.

3. **narada's `session-start.mjs` becomes a thin re-export shim** of
   `@narada2/agent-context-mcp/session-start` (export parity permitting), so existing
   narada importers (list-sessions, legacy server, tests) keep working with zero
   churn while all logic lives in one place. `@narada2/agent-context-mcp` is added as
   a workspace dependency of `agent-context-tools`.

4. **agent-start drops the source-copy preference** added in #2047 and always
   resolves the packaged module; the stale "divergent older implementation" comment
   is removed.

5. **`shell-mcp-server.mjs` is assessed as unloadable dead code** (both relative
   imports dangle; nothing executes it). It joins the legacy server in #2138's
   retirement audit rather than receiving import fixes.

6. **narada's legacy `agent-context-mcp-server.mjs` is assessed as unbound legacy.**
   Retirement is out of scope for #2067; a follow-up task audits live consumers of
   its unique tools (ISN, movement traces, lifecycle, doctrinal grounding, codex
   evidence), ports survivors into the mcp-surfaces surface, then deletes the
   monolith.

7. **Sibling-repo uncommitted state is accepted fragility, made loud.** narada's
   pnpm workspace deliberately spans `../narada-core`, `../mcp-surfaces`,
   `../agent-cli`, `../agent-tui`; builds and tests consume sibling live state by
   design (fast inner loop across repos). A root `prebuild` guard
   (`scripts/sibling-workspace-state-guard.mjs`) prints each sibling repo's dirty
   files before `pnpm -r build`, converting silent breakage into an explicit warning;
   `NARADA_SIBLING_GUARD=strict` turns it into a failure for CI or release flows.

## Consequences

- One session-start implementation serves all three consumers: bound MCP surface,
  launcher (source and published), narada tooling.
- Published installs get the lenient behavior on the next
  `@narada2/agent-context-mcp` publish; no narada-side publish is needed.
- narada tests exercising the shim now require the mcp-surfaces checkout to be
  built (`dist/` present) — the prebuild guard warns about exactly this class.
- The legacy server's unique tools remain available in-repo until the follow-up
  retirement task completes; no site can bind them, so they are not operator-facing.
