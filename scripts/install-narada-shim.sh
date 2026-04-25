#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHIM_DIR="${HOME}/.local/bin"
SHIM_PATH="${SHIM_DIR}/narada"
NODE_BIN="${NODE_BIN:-$(command -v node)}"
DIST_BIN="${ROOT_DIR}/packages/layers/cli/dist/main.js"
SRC_DIR="${ROOT_DIR}/packages/layers/cli/src"
TARGET="${DIST_BIN}"

if [[ -z "${NODE_BIN}" ]]; then
  echo "node not found on PATH" >&2
  exit 1
fi

if [[ ! -f "${DIST_BIN}" ]]; then
  echo "narada CLI target not found. Build/install the workspace first." >&2
  exit 1
fi

mkdir -p "${SHIM_DIR}"

cat > "${SHIM_PATH}" <<EOF
#!/usr/bin/env bash
set -euo pipefail
DIST_BIN="${TARGET}"
SRC_DIR="${SRC_DIR}"
if [[ ! -f "\${DIST_BIN}" ]]; then
  echo "narada CLI dist not found: \${DIST_BIN}" >&2
  echo "Run: pnpm --filter @narada2/cli build" >&2
  exit 1
fi
if [[ -d "\${SRC_DIR}" ]]; then
  stale_source=\$(find "\${SRC_DIR}" -type f \\( -name '*.ts' -o -name '*.tsx' \\) -newer "\${DIST_BIN}" -print -quit)
  if [[ -n "\${stale_source}" ]]; then
    if [[ "\${NARADA_SHIM_AUTO_BUILD:-0}" == "1" ]]; then
      echo "narada CLI dist is stale; rebuilding because NARADA_SHIM_AUTO_BUILD=1" >&2
      pnpm --dir "${ROOT_DIR}" --filter @narada2/cli build >&2
    else
    echo "narada CLI dist is stale relative to source: \${stale_source}" >&2
    echo "Run: pnpm --filter @narada2/cli build" >&2
    echo "Or opt in to shim rebuilds with: NARADA_SHIM_AUTO_BUILD=1 narada ..." >&2
    exit 1
    fi
  fi
fi
exec "${NODE_BIN}" "\${DIST_BIN}" "\$@"
EOF

chmod +x "${SHIM_PATH}"

echo "Installed narada shim: ${SHIM_PATH}"
case ":${PATH}:" in
  *":${SHIM_DIR}:"*) ;;
  *)
    echo "Add ${SHIM_DIR} to PATH to use 'narada' directly."
    ;;
esac
