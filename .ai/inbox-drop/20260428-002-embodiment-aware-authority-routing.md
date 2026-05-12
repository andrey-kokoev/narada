# Execute Embodiment-Aware Authority Routing

Kind: task_candidate
Source: codex-user-site
Authority: operator_confirmed
Principal: andrey

## Trigger

Narada proper added the canonical `embodiments` key to `docs/product/site-factorization.md`.

That clarifies static Site topology: roots, roles, and mutation policy. The next coherent step is to make authority routing embodiment-aware so multiple concrete presences of one Site cannot silently desync or mutate through the wrong locus.

## Execution Request

Create and execute a Narada proper task/chapter to specify and implement embodiment-aware authority routing.

## Proposed Scope

- Define stable embodiment roles, for example:
  - `authority`
  - `working`
  - `mirror`
  - `runtime`
  - `presentation`
- Distinguish Site, Operation, Embodiment, Runtime, and Projection in the relevant docs.
- Add or specify mutation routing by mutation class:
  - task lifecycle
  - inbox admission
  - config mutation
  - runtime state mutation
  - operator UI/preference mutation
  - external effect confirmation
- Ensure dynamic freshness remains a preflight observation/projection, not static config.
- Add an embodiment-aware preflight/report shape covering:
  - current embodiment
  - authority embodiment
  - allowed mutation classes here
  - dirty/ahead/behind posture
  - pending inbox-drop files
  - route for disallowed mutations
- Add a route/refuse behavior for commands invoked from the wrong embodiment.
- Consider a `narada site whereami` command that answers:
  - current Site
  - current embodiment
  - authority embodiment
  - mutation permissions here
  - route for disallowed mutations
  - current freshness/posture observations

## Acceptance Sketch

- Narada proper docs make the factorization crisp enough that an agent can tell whether it is allowed to mutate from Windows, WSL, or another clone.
- Config supports static embodiment declarations without storing dynamic sync state.
- Preflight/whereami exposes dynamic posture.
- Authority-affecting commands either execute only on the authority embodiment or emit a clear handoff/refusal path.

## Motivation

Recent Windows/WSL Narada work exposed a recurring failure mode: a clone or runtime presence exists and can run commands, but that does not mean it is authoritative for governed mutations. The Site should be one authority-bearing locus with multiple declared embodiments, not an accidental set of partially equivalent repos.
