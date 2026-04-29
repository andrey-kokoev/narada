#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHIM_DIR="${HOME}/.local/bin"
NODE_BIN="${NODE_BIN:-$(command -v node)}"
SRC_DIR="${ROOT_DIR}/packages/layers/cli/src"
CLI_DIST_BIN="${ROOT_DIR}/packages/layers/cli/dist/main.js"
MCP_DIST_BIN="${ROOT_DIR}/packages/layers/cli/dist/mcp-main.js"

if [[ -z "${NODE_BIN}" ]]; then
  echo "node not found on PATH" >&2
  exit 1
fi

if [[ ! -f "${CLI_DIST_BIN}" || ! -f "${MCP_DIST_BIN}" ]]; then
  echo "narada CLI/MCP dist targets not found. Build/install the workspace first." >&2
  exit 1
fi

mkdir -p "${SHIM_DIR}"

write_shim() {
  local name="$1"
  local target="$2"
  local shim_path="${SHIM_DIR}/${name}"

  cat > "${shim_path}" <<EOF
#!/usr/bin/env bash
set -euo pipefail
DIST_BIN="${target}"
SRC_DIR="${SRC_DIR}"
is_governance_command() {
  case "\${1:-}" in
    task|chapter|inbox|principal)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}
if [[ ! -f "\${DIST_BIN}" ]]; then
  echo "${name} dist not found: \${DIST_BIN}" >&2
  echo "Run: pnpm --filter @narada2/cli build" >&2
  exit 1
fi
if [[ -d "\${SRC_DIR}" ]]; then
  stale_source=\$(find "\${SRC_DIR}" -type f \\( -name '*.ts' -o -name '*.tsx' \\) -newer "\${DIST_BIN}" -print -quit)
  if [[ -n "\${stale_source}" ]]; then
    if [[ "\${NARADA_SHIM_AUTO_BUILD:-0}" == "1" ]]; then
      echo "narada CLI dist is stale; rebuilding because NARADA_SHIM_AUTO_BUILD=1" >&2
      pnpm --dir "${ROOT_DIR}" --filter @narada2/cli build >&2
    elif [[ "${name}" == "narada" ]] && [[ "\${NARADA_SHIM_ALLOW_STALE_GOVERNANCE:-1}" == "1" ]] && is_governance_command "\$@"; then
      echo "narada CLI dist is stale relative to source: \${stale_source}" >&2
      echo "continuing with installed dist for governance command; set NARADA_SHIM_ALLOW_STALE_GOVERNANCE=0 to block" >&2
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

  chmod +x "${shim_path}"
}

write_shim "narada" "${CLI_DIST_BIN}"
write_shim "narada-mcp" "${MCP_DIST_BIN}"

echo "Installed narada shim: ${SHIM_DIR}/narada"
echo "Installed narada-mcp shim: ${SHIM_DIR}/narada-mcp"
case ":${PATH}:" in
  *":${SHIM_DIR}:"*) ;;
  *)
    echo "Add ${SHIM_DIR} to PATH to use 'narada' and 'narada-mcp' directly."
    ;;
esac
