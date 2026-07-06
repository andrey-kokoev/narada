# NARS Speech Audio Projection

## Purpose

This document defines the target shape for making speech output available in `agent-web-ui` without collapsing MCP tool authority, NARS session authority, and browser projection responsibilities.

The concrete use case is: a Site has `speech-mcp` available, an agent or runtime wants to produce spoken output, and an attached browser UI should be able to play that output when appropriate.

## Target Statement

Browser speech output is a NARS session artifact projection.

```text
speech-mcp produces or retains audio
-> NARS admits and registers an audio artifact
-> NARS emits an assistant/session event with an artifact_ref
-> agent-web-ui renders explicit operator-controlled audio playback
```

The web UI must not call `speech-mcp` directly, render arbitrary local paths, or treat MCP tool results as browser media URLs.

## Ownership

| Concern | Owner | Notes |
| --- | --- | --- |
| Speech synthesis, voice selection, capture/transcription tools | `speech-mcp` | Provides governed host-level speech tools such as `speech_speak`, `speech_voices`, and prompt/capture workflows. |
| Session binding, event evidence, artifact admission, artifact content serving | NARS | Owns the public session protocol and session-scoped artifact registry. |
| Audio rendering in browser | `agent-web-ui` | Renders `artifact_ref` parts as browser controls. Does not synthesize speech or host MCP. |
| Site/agent speech preferences | Site and agent config | Preferences select provider/model/voice defaults. They do not bypass artifact admission. |
| Host audible playback | `speech-mcp` / host OS | Separate from browser playback. A host-side `speech_speak` call may play through local speakers even if web UI does nothing. |

## Non-Goals

This target is not:

- browser autoplay by default;
- a direct browser-to-MCP call path;
- a `file://` path projection;
- a raw websocket audio stream;
- a replacement for host-side `speech_speak`;
- a reason for `agent-web-ui` to own MCP hosting or NARS runtime state.

## Artifact Contract

NARS session artifacts should support audio as a first-class artifact kind.

Required artifact kind:

```text
audio
```

Required content-type support should include at least:

| Extension | Content type |
| --- | --- |
| `.wav` | `audio/wav` |
| `.mp3` | `audio/mpeg` |
| `.ogg` | `audio/ogg` |
| `.m4a` | `audio/mp4` |

The public artifact record remains path-redacted:

```json
{
  "schema": "narada.nars.artifact_public.v1",
  "artifact_id": "art_...",
  "session_id": "carrier_...",
  "agent_id": "resident",
  "kind": "audio",
  "title": "Spoken briefing",
  "content_type": "audio/wav",
  "created_at": "2026-07-05T00:00:00.000Z",
  "access": { "scope": "session", "token_required": false },
  "render": { "preferred": "inline", "media_controls": true },
  "lifecycle": { "state": "active", "owner": "nars-session" }
}
```

Private artifact records may retain `source_path`; public client metadata must not expose it.

## Message Shape

Assistant or session events reference audio through the same structured message-part mechanism used by other artifacts:

```json
{
  "event": "assistant_message",
  "content": [
    { "type": "text", "text": "Spoken version is ready." },
    {
      "type": "artifact_ref",
      "artifact_id": "art_...",
      "kind": "audio",
      "title": "Spoken version",
      "render_hint": "inline"
    }
  ]
}
```

Clients should render from artifact metadata when available and treat the event's `kind` as a hint.

## Browser Rendering

`agent-web-ui` should render audio artifacts with explicit controls:

```html
<audio controls preload="metadata" src="..."></audio>
```

The card should also expose ordinary artifact actions:

- Open;
- Copy link;
- Refresh metadata;
- Collapse/expand if the card pattern supports it.

Autoplay is not default. If autoplay is ever added, it must be gated by an explicit local operator preference and must tolerate browser user-gesture restrictions.

## Speech MCP Integration

`speech-mcp` currently supports host-side audible output. For browser projection, it needs one of these compatible output modes:

1. Return or expose a retained audio file path from a speech generation call, which a NARS-side caller can register as an artifact.
2. Add an explicit `retain_audio` or `output_path` option for TTS calls so the generated audio survives long enough to register. Explicit output paths must be admitted under bounded roots such as the OS temp directory, the bound Site/workspace root, or an explicit speech output root.
3. Keep host playback as the default for `speech_speak`, and add a separate tool or mode for `speech_render_audio` if conflating playback and artifact generation becomes unclear.

The principled default is not to make every `speech_speak` call automatically publish browser audio. Publication is a projection decision and should be visible in session events.

## Local And Remote Projection

For a local web UI, audio content is served from the local NARS artifact endpoint:

```text
GET /sessions/:sessionId/artifacts/:artifactId/content
```

For Cloudflare/browser projection, audio should follow the same artifact proxy path used by other artifact types. The browser still receives a normal HTTP media URL; it does not receive local filesystem paths.

Large audio files should be served as artifacts rather than injected into websocket events. Byte streaming and range requests are optional follow-up improvements; the first contract only requires correct content type and playable content.

## Security And Authority

The invariant is:

```text
audio bytes are session artifacts; playback is a client projection; speech generation remains a governed tool action
```

Security rules:

- NARS admits artifact source paths only from admitted roots.
- Public metadata redacts local paths.
- Browser playback requires a NARS content endpoint or admitted remote projection URL.
- Remote audio transcription remains separate from browser audio playback and keeps its own capability/consent posture.
- Speech preferences do not authorize remote audio egress by themselves.

## Implementation Slices

1. Extend NARS artifact kind/content-type support for `audio`.
2. Add tests for audio artifact registration, metadata redaction, and content serving.
3. Extend web UI artifact rendering for audio content.
4. Add web UI projection tests for `artifact_ref kind=audio`.
5. Add or adjust speech MCP output retention so generated audio can be registered as a NARS artifact.
6. Add documentation linking speech output to the NARS artifact contract.

## Verification

Fast verification should include:

- artifact unit/contract tests proving `audio` registration and serving;
- web UI projection tests proving audio artifact cards render with `<audio controls>`;
- one integration path where a real NARS artifact message contains `artifact_ref kind=audio` and the web UI can resolve metadata/content URL.

Full browser media playback does not need to assert that host speakers emitted sound. It should assert that the browser has a valid audio element with a resolvable source and correct content type.

## Confidence

CL `0.99`: this shape follows the existing NARS session artifact boundary, keeps `agent-web-ui` as a projection surface, avoids browser-local-path leakage, and separates host audible effects from browser playback.
