#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHIM_DIR="${HOME}/.local/bin"
NODE_BIN="${NODE_BIN:-$(command -v node)}"
SRC_DIR="${ROOT_DIR}/packages/layers/cli/src"
CLI_DIST_BIN="${ROOT_DIR}/packages/layers/cli/dist/main.js"
MCP_DIST_BIN="${ROOT_DIR}/packages/layers/cli/dist/mcp-main.js"
CONTROL_PLANE_SRC_DIR="${ROOT_DIR}/packages/layers/control-plane/src"
CONTROL_PLANE_DIST_BIN="${ROOT_DIR}/packages/layers/control-plane/dist/index.js"
TASK_GOVERNANCE_SRC_DIR="${ROOT_DIR}/packages/task-governance/src"
TASK_GOVERNANCE_DIST_BIN="${ROOT_DIR}/packages/task-governance/dist/index.js"

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
CONTROL_PLANE_SRC_DIR="${CONTROL_PLANE_SRC_DIR}"
CONTROL_PLANE_DIST_BIN="${CONTROL_PLANE_DIST_BIN}"
TASK_GOVERNANCE_SRC_DIR="${TASK_GOVERNANCE_SRC_DIR}"
TASK_GOVERNANCE_DIST_BIN="${TASK_GOVERNANCE_DIST_BIN}"
BUILD_COMMAND='pnpm --filter @narada2/control-plane build && pnpm --filter @narada2/task-governance build && pnpm --filter @narada2/cli build'
ALLOW_STALE_REASON="\${NARADA_SHIM_ALLOW_STALE_AUTHORITY_MUTATION_REASON:-}"
SANITIZED_ARGS=()
while [[ \$# -gt 0 ]]; do
  case "\$1" in
    --allow-stale-governance)
      shift
      if [[ \$# -eq 0 || -z "\${1:-}" ]]; then
        echo "--allow-stale-governance requires a reason" >&2
        exit 1
      fi
      ALLOW_STALE_REASON="\$1"
      shift
      ;;
    --allow-stale-governance=*)
      ALLOW_STALE_REASON="\${1#--allow-stale-governance=}"
      if [[ -z "\${ALLOW_STALE_REASON}" ]]; then
        echo "--allow-stale-governance requires a reason" >&2
        exit 1
      fi
      shift
      ;;
    *)
      SANITIZED_ARGS+=("\$1")
      shift
      ;;
  esac
done
set -- "\${SANITIZED_ARGS[@]}"
COMMAND_IDENTITY="${name} \$*"
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
    task:read|task:list|task:status|task:evidence|task:graph|task:work-next|task:workboard|task:preflight|task:recommend|task:reconcile|task:lifecycle|task:help)
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
  git -C "\${ROOT_DIR}" status --porcelain -- packages/layers/control-plane/src packages/layers/control-plane/test packages/task-governance/src packages/task-governance/test packages/layers/cli/src packages/layers/cli/test scripts/install-narada-shim.sh 2>/dev/null | grep -q .
}
find_stale_sources() {
  local source_dir
  local dist_bin
  local package_name
  while IFS='|' read -r package_name source_dir dist_bin; do
    [[ -z "\${package_name}" ]] && continue
    if [[ ! -f "\${dist_bin}" ]]; then
      printf '%s\n' "\${package_name}:missing_dist:\${dist_bin}"
      continue
    fi
    if [[ -d "\${source_dir}" ]]; then
      find "\${source_dir}" -type f \\( -name '*.ts' -o -name '*.tsx' \\) -newer "\${dist_bin}" -print | sed "s#^#\${package_name}:#"
    fi
  done <<PAIRS
@narada2/control-plane|\${CONTROL_PLANE_SRC_DIR}|\${CONTROL_PLANE_DIST_BIN}
@narada2/task-governance|\${TASK_GOVERNANCE_SRC_DIR}|\${TASK_GOVERNANCE_DIST_BIN}
@narada2/cli|\${SRC_DIR}|\${DIST_BIN}
PAIRS
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
export_stale_governance_evidence() {
  local command_class="\$1"
  local stale_sources="\$2"
  local posture="\$3"
  export NARADA_STALE_DIST_ACCEPTED=1
  export NARADA_STALE_DIST_SOURCE_PATHS="\${stale_sources}"
  export NARADA_STALE_DIST_COMMAND_CLASS="\${command_class}"
  export NARADA_STALE_DIST_COMMAND="\${COMMAND_IDENTITY}"
  export NARADA_STALE_DIST_ACCEPTANCE_REASON="\${ALLOW_STALE_REASON}"
  export NARADA_STALE_DIST_POSTURE="\${posture}"
}
if [[ ! -f "\${DIST_BIN}" ]]; then
  print_readiness "missing_dist" "\$(classify_command "\$@")" "${name} dist not found: \${DIST_BIN}"
  exit 1
fi
stale_sources="\$(find_stale_sources | head -n 20 || true)"
if [[ -n "\${stale_sources}" ]]; then
    command_class="\$(classify_command "\$@")"
    if [[ "\${NARADA_SHIM_AUTO_BUILD:-0}" == "1" ]]; then
      if source_dirty && [[ "\${NARADA_SHIM_AUTO_BUILD_WITH_DIRTY_SOURCE:-0}" != "1" ]]; then
        print_readiness "stale_dist_auto_build_refused_active_work" "\${command_class}" "Source is stale and dirty; auto-build would smear over active Builder work."
        echo "Override only with explicit policy: NARADA_SHIM_AUTO_BUILD=1 NARADA_SHIM_AUTO_BUILD_WITH_DIRTY_SOURCE=1 ${name} ..." >&2
        exit 1
      fi
      print_readiness "stale_dist_auto_build_admitted" "\${command_class}" "Source is stale; rebuilding because NARADA_SHIM_AUTO_BUILD=1."
      pnpm --dir "\${ROOT_DIR}" --filter @narada2/control-plane build >&2
      pnpm --dir "\${ROOT_DIR}" --filter @narada2/task-governance build >&2
      pnpm --dir "\${ROOT_DIR}" --filter @narada2/cli build >&2
    elif [[ "\${command_class}" == "read_only" ]]; then
      print_readiness "stale_dist_read_only_admitted" "\${command_class}" "Source is stale relative to dist: \${stale_sources}"
    elif [[ "\${command_class}" == "authority_mutation" && "\${NARADA_SHIM_ALLOW_STALE_AUTHORITY_MUTATION:-0}" == "1" && -n "\${ALLOW_STALE_REASON}" ]]; then
      print_readiness "stale_dist_authority_mutation_admitted_by_policy" "\${command_class}" "Source is stale; authority mutation admitted by NARADA_SHIM_ALLOW_STALE_AUTHORITY_MUTATION=1."
      export_stale_governance_evidence "\${command_class}" "\${stale_sources}" "stale_dist_authority_mutation_admitted_by_policy"
    elif [[ "\${command_class}" == "authority_mutation" && "\${NARADA_SHIM_ALLOW_STALE_AUTHORITY_MUTATION:-0}" == "1" ]]; then
      print_readiness "stale_dist_authority_mutation_reason_required" "\${command_class}" "Source is stale; authority mutation allow-policy requires --allow-stale-governance <reason> or NARADA_SHIM_ALLOW_STALE_AUTHORITY_MUTATION_REASON."
      exit 1
    else
      print_readiness "stale_dist_blocked" "\${command_class}" "Source is stale relative to dist: \${stale_sources}"
      echo "Auto-build opt-in: NARADA_SHIM_AUTO_BUILD=1 ${name} ..." >&2
      exit 1
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
