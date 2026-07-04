export const ADMITTED_MCP_SCOPES = Object.freeze(['all', 'host', 'user-site', 'local-site', 'none']);

export function parseArgs(argv) {
  const result = {};
  let i = 0;
  if (argv.length > 0 && !argv[0].startsWith('--')) {
    result.identity = argv[0];
    i = 1;
  }
  for (; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;

    const key = arg.slice(2).replace(/-/g, '_');
    if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      result[key] = argv[i + 1];
      i++;
    } else {
      result[key] = true;
    }
  }
  return result;
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function identityToken(identity) {
  return String(identity).replace(/[^A-Za-z0-9]+/g, '_');
}

export function normalizeMcpScope(value) {
  const normalized = String(value ?? 'all').trim().toLowerCase();
  if (ADMITTED_MCP_SCOPES.includes(normalized)) return normalized;
  throw new Error(`mcp_scope_not_admitted: ${normalized}. Admitted scopes: ${ADMITTED_MCP_SCOPES.join(', ')}`);
}

export function mcpScopeLoci(scope) {
  if (scope === 'none') return [];
  if (scope === 'host') return ['host'];
  if (scope === 'user-site') return ['user-site'];
  if (scope === 'local-site') return ['local-site'];
  return ['host', 'user-site', 'local-site'];
}
