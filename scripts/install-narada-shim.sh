#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHIM_DIR="${HOME}/.local/bin"
SHIM_PATH="${SHIM_DIR}/narada"
NODE_BIN="${NODE_BIN:-$(command -v node)}"
DIST_BIN="${ROOT_DIR}/packages/layers/cli/dist/main.js"
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
exec "${NODE_BIN}" "${TARGET}" "\$@"
EOF

chmod +x "${SHIM_PATH}"

echo "Installed narada shim: ${SHIM_PATH}"
case ":${PATH}:" in
  *":${SHIM_DIR}:"*) ;;
  *)
    echo "Add ${SHIM_DIR} to PATH to use 'narada' directly."
    ;;
esac
