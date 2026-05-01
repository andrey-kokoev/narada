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
ROOT_DIR="${ROOT_DIR}"
BUILD_COMMAND='pnpm --filter @narada2/cli build'
classify_command() {
  local root="\${1:-}"
  local sub="\${2:-}"
  case "\${root}" in
    --help|-h|help|--version|-V)
      echo read_only
      return 0
      ;;
  esac
  case "\${root}:\${sub}" in
    task:read|task:list|task:status|task:evidence|task:graph|task:work-next|task:preflight|task:recommend|task:reconcile|task:lifecycle|task:help)
      echo read_only
      return 0
      ;;
    chapter:list|chapter:status|chapter:read|chapter:preflight|chapter:help)
      echo read_only
      return 0
      ;;
    inbox:list|inbox:next|inbox:show|inbox:doctor|inbox:work-next|inbox:help)
      echo read_only
      return 0
      ;;
    principal:list|principal:show|principal:status|principal:help)
      echo read_only
      return 0
      ;;
    task:*|chapter:*|inbox:*|principal:*)
      echo authority_mutation
      return 0
      ;;
  esac
  echo implementation
}
source_dirty() {
  git -C "\${ROOT_DIR}" status --porcelain -- packages/layers/cli/src packages/layers/cli/test scripts/install-narada-shim.sh 2>/dev/null | grep -q .
}
print_readiness() {
  local state="\$1"
  local class="\$2"
  local detail="\$3"
  echo "${name} embodiment readiness: \${state}" >&2
  echo "command_class: \${class}" >&2
  echo "detail: \${detail}" >&2
  echo "repair_command: \${BUILD_COMMAND}" >&2
}
if [[ ! -f "\${DIST_BIN}" ]]; then
  print_readiness "missing_dist" "\$(classify_command "\$@")" "${name} dist not found: \${DIST_BIN}"
  exit 1
fi
if [[ -d "\${SRC_DIR}" ]]; then
  stale_source=\$(find "\${SRC_DIR}" -type f \\( -name '*.ts' -o -name '*.tsx' \\) -newer "\${DIST_BIN}" -print -quit)
  if [[ -n "\${stale_source}" ]]; then
    command_class="\$(classify_command "\$@")"
    if [[ "\${NARADA_SHIM_AUTO_BUILD:-0}" == "1" ]]; then
      if source_dirty && [[ "\${NARADA_SHIM_AUTO_BUILD_WITH_DIRTY_SOURCE:-0}" != "1" ]]; then
        print_readiness "stale_dist_auto_build_refused_active_work" "\${command_class}" "Source is stale and dirty; auto-build would smear over active Builder work."
        echo "Override only with explicit policy: NARADA_SHIM_AUTO_BUILD=1 NARADA_SHIM_AUTO_BUILD_WITH_DIRTY_SOURCE=1 ${name} ..." >&2
        exit 1
      fi
      print_readiness "stale_dist_auto_build_admitted" "\${command_class}" "Source is stale; rebuilding because NARADA_SHIM_AUTO_BUILD=1."
      pnpm --dir "\${ROOT_DIR}" --filter @narada2/cli build >&2
    elif [[ "\${command_class}" == "read_only" ]]; then
      print_readiness "stale_dist_read_only_admitted" "\${command_class}" "Source is stale relative to dist: \${stale_source}"
    elif [[ "\${command_class}" == "authority_mutation" && "\${NARADA_SHIM_ALLOW_STALE_AUTHORITY_MUTATION:-0}" == "1" ]]; then
      print_readiness "stale_dist_authority_mutation_admitted_by_policy" "\${command_class}" "Source is stale; authority mutation admitted by NARADA_SHIM_ALLOW_STALE_AUTHORITY_MUTATION=1."
    else
      print_readiness "stale_dist_blocked" "\${command_class}" "Source is stale relative to dist: \${stale_source}"
      echo "Auto-build opt-in: NARADA_SHIM_AUTO_BUILD=1 ${name} ..." >&2
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
