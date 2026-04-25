#!/usr/bin/env bash
set -euo pipefail

DB_PATH=".ai/task-lifecycle.db"

if [[ ! -f "${DB_PATH}" ]]; then
  echo "task lifecycle DB missing: ${DB_PATH}" >&2
  exit 1
fi

if ! git ls-files --error-unmatch "${DB_PATH}" >/dev/null 2>&1; then
  echo "task lifecycle DB is not tracked; use sanctioned export/import before changing DB posture" >&2
  exit 1
fi

if ! git diff --quiet -- "${DB_PATH}"; then
  echo "task lifecycle DB has uncommitted changes." >&2
  echo "This guard cannot prove whether those changes came from sanctioned Narada commands or ad hoc sqlite." >&2
  echo "Expected posture: mutate via narada task/chapter/reconcile commands; future work needs a DB mutation ledger." >&2
  exit 2
fi

echo "task lifecycle DB posture ok: tracked and clean"
