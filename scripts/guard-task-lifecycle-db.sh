#!/usr/bin/env bash
set -euo pipefail

DB_PATH=".ai/task-lifecycle.db"
SNAPSHOT_PATH=".ai/task-lifecycle-snapshot.json"

if [[ ! -f "${SNAPSHOT_PATH}" ]]; then
  echo "task lifecycle snapshot missing: ${SNAPSHOT_PATH}" >&2
  echo "Run: narada task lifecycle export --output ${SNAPSHOT_PATH}" >&2
  exit 1
fi

if ! git ls-files --error-unmatch "${SNAPSHOT_PATH}" >/dev/null 2>&1; then
  echo "task lifecycle snapshot is not tracked: ${SNAPSHOT_PATH}" >&2
  echo "Run: git add ${SNAPSHOT_PATH}" >&2
  exit 1
fi

if git ls-files --error-unmatch "${DB_PATH}" >/dev/null 2>&1; then
  echo "task lifecycle DB is still tracked: ${DB_PATH}" >&2
  echo "Run the sanctioned cutover: narada task lifecycle export --output ${SNAPSHOT_PATH} && git rm --cached ${DB_PATH}" >&2
  exit 2
fi

if ! git check-ignore -q "${DB_PATH}"; then
  echo "task lifecycle DB is not ignored: ${DB_PATH}" >&2
  echo "Add ${DB_PATH} to .gitignore after exporting the snapshot." >&2
  exit 2
fi

if [[ ! -f "${DB_PATH}" ]]; then
  echo "task lifecycle snapshot posture ok: tracked snapshot, ignored local DB path"
  echo "Local DB missing; reconstruct with: narada task lifecycle import --input ${SNAPSHOT_PATH}"
  exit 0
fi

echo "task lifecycle snapshot posture ok: tracked snapshot, ignored local DB"
