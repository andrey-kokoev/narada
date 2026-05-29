# Site Tool Surface Legacy Migration Roadmap

Current user-site audit posture:

- `legacy_package_mirror_count`: 1515
- `duplicate_group_count`: 0
- `exception_count`: 0

Legacy mirrors are not canonical packages. They are visible burden: Site-local files matching paths owned by `@narada2/site-tool-surface-legacy`.

Ranked migration order from current manifests:

| Rank | Surface | Mirror count | Direction |
| --- | ---: | ---: | --- |
| 1 | `site-tools` | 557 | Split into small packages by function before touching client Sites. |
| 2 | `task-lifecycle` | 541 | Replace Site-local copies with task-governance/control-plane packages. |
| 3 | `operator-surface` | 330 | Keep launcher wrappers generated; package shared operator-surface tools. |
| 4 | `typed-mcp` | 55 | Move MCP facade helpers behind package exports. |
| 5 | `window-surface-overlay` | 24 | Package overlay runtime as a platform surface. |
| 6 | `agent-start` | 8 | Finish after root contract stays green. |

Migration rule:

1. Pick one surface.
2. Create or extend a Narada proper package for that surface.
3. Update Site manifests from `legacy_package_mirror` to `canonical_package` only when the package is the source of truth.
4. Remove or replace Site-local copies in registry Sites.
5. Run the manifest idempotence, duplicate, path, agent-start, and package-cutover gates.

Exit condition:

- `legacy_package_mirror_count` trends down.
- `duplicate_group_count` remains zero.
- Manifest reconcile is idempotent, including clean `--apply`.
