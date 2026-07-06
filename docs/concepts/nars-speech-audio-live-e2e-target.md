# NARS Speech Audio Live E2E Target

## Purpose

This document defines the target proof shape for speech audio output in `agent-web-ui`.

The architectural boundary is already defined in [`nars-speech-audio-projection.md`](nars-speech-audio-projection.md): speech output is projected as a NARS session artifact, not by letting the browser call `speech-mcp` or read local files directly. This document defines the live end-to-end evidence required to prove that shape is actually wired.

## Objective

A live test must prove this full path:

```text
live speech-mcp process
  -> generated retained audio bytes
  -> NARS audio artifact admission
  -> NARS session event with artifact_ref
  -> agent-web-ui browser rendering
  -> browser fetches playable audio bytes from NARS/projection endpoint
```

A synthetic `artifact_ref kind=audio` event is useful coverage, but it is not enough for this objective. The proof must include a real speech MCP invocation that writes or returns retained audio.

## Authority Shape

| Stage | Owner | Proof Required |
| --- | --- | --- |
| Speech synthesis | `speech-mcp` | A live MCP subprocess accepts `speech_speak` or equivalent and returns retained audio metadata. |
| Audio bytes | `speech-mcp` / host filesystem under admitted output path | The retained file exists, has an audio content type, and has non-empty audio bytes. |
| Artifact admission | NARS | NARS registers the file as a session-scoped `audio` artifact and redacts local source paths from public metadata. |
| Session event | NARS | NARS emits or stores a message/session event containing an `artifact_ref` that points to the admitted artifact. |
| Browser projection | `agent-web-ui` | A real browser renders an explicit audio control for the artifact. |
| Byte serving | NARS or projection host | The browser-resolved media URL returns the same audio bytes with the expected content type. |

The browser remains a projection surface. It does not synthesize speech, call MCP tools, or receive raw local paths.

## Live E2E Acceptance Criteria

A live E2E is accepted only when all of these are true:

1. The test starts or connects to a real `speech-mcp` entrypoint, not a mocked in-process helper.
2. The speech call requests retained audio explicitly, using an admitted output path.
3. The returned retained-audio metadata includes a path, content type, and byte evidence.
4. The retained file exists on disk and is larger than an empty WAV/header-only artifact.
5. NARS admits the file through its artifact registry as `kind: audio`.
6. Public artifact metadata does not expose the local source path.
7. A NARS event references the audio through `artifact_ref`, not through a raw path.
8. `agent-web-ui` renders the artifact as an `<audio controls>` element.
9. The browser fetches the audio URL successfully with an audio content type.
10. The fetched byte length matches the admitted retained audio file, or the response otherwise proves faithful streamed content.

## Non-Accepted Proofs

These are useful tests, but they do not close the live objective by themselves:

- rendering a hand-written synthetic `artifact_ref` event;
- testing only NARS artifact content-type registration;
- testing only the Vue audio component;
- asserting that host speakers made sound;
- invoking a speech library directly without the MCP server boundary;
- passing a local filesystem path into the browser;
- accepting a websocket event with embedded audio bytes as the primary media path.

## Preferred Test Topology

The first load-bearing test should run locally and avoid Cloudflare unless the local path is already proven:

```text
temp Site root
  -> local NARS runtime/server mode
  -> local event and health projection
  -> live speech-mcp subprocess
  -> browser-attached agent-web-ui
```

The test may use SAPI or another local provider if it can create retained bytes deterministically. It should avoid requiring audible playback. The output can be written under a temp directory or an admitted Site runtime artifact directory.

Once local proof passes, a remote projection proof can be added:

```text
same NARS artifact/event proof
  -> Cloudflare projection bridge/cache
  -> hosted browser UI
  -> browser fetches projected audio content
```

Remote projection is a second proof, not a substitute for local NARS admission.

## Runtime Contract Expectations

NARS must expose enough protocol to support the proof without test-only shortcuts:

- artifact registration accepts `audio` artifacts from admitted roots;
- artifact metadata includes kind, content type, title, id, lifecycle, and render hints;
- artifact content is served by session-scoped HTTP routes;
- event replay delivers the artifact reference to newly attached clients;
- health/session state lets clients discover that artifact serving is available.

If a test has to reach into private runtime arrays instead of public event/artifact endpoints, the contract is not yet clean.

## UI Contract Expectations

`agent-web-ui` must treat speech output as ordinary artifact content:

- render inline audio controls by default;
- avoid autoplay by default;
- provide a stable loading/error state if artifact metadata or bytes cannot be fetched;
- keep code/render tabs and markdown rendering independent of audio playback;
- preserve copy/open affordances without leaking private source paths.

The UI should not show raw artifact JSON in the conversation view unless the operator chooses a diagnostic view.

## Follow-On Work

After the first live proof passes, useful hardening slices are:

1. Add remote Cloudflare projection proof for audio artifacts.
2. Add range request or streaming support for larger audio files if needed.
3. Add explicit operator preference for autoplay only if there is a real workflow demand.
4. Add richer speech preference projection in Site/agent config panels.
5. Add failure-mode tests for missing artifact bytes, wrong content type, and redacted source paths.

## Confidence

CL `0.99`: this target keeps the architecture aligned with NARS artifact authority, proves the actual live speech MCP boundary, and avoids the common false proof where the browser only renders a synthetic audio artifact.