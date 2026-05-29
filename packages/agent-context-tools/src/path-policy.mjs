import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

export function enforceAgentPathPolicy({ siteRoot, agentId = process.env.NARADA_AGENT_ID, absolutePath, operation }) {
  const policyResult = resolveAgentPathPolicy(siteRoot, agentId);
  if (!policyResult.configured) {
    return { status: 'not_configured', agent_id: agentId ?? null };
  }
  if (!policyResult.allowed) {
    throw new Error(policyResult.error);
  }

  const normalizedPath = resolve(absolutePath);
  const allowedRoots = policyResult.allowed_roots ?? [];
  const allowed = allowedRoots.some((root) => isPathWithin(normalizedPath, root.absolute_path));
  if (!allowed) {
    const allowedList = allowedRoots.map((root) => root.display_path).join(', ');
    throw new Error(`path_policy_denied: agent=${agentId} operation=${operation} path=${normalizedPath} allowed_roots=[${allowedList}]`);
  }

  return {
    status: 'allowed',
    agent_id: agentId,
    operation,
    path: normalizedPath,
    matched_roots: allowedRoots
      .filter((root) => isPathWithin(normalizedPath, root.absolute_path))
      .map((root) => root.display_path),
  };
}

export function resolveAgentPathPolicy(siteRoot, agentId = process.env.NARADA_AGENT_ID) {
  if (!agentId) return { configured: false, allowed: true, reason: 'agent_unbound' };

  const rosterPath = resolve(siteRoot, '.ai', 'agents', 'roster.json');
  let roster;
  try {
    roster = JSON.parse(readFileSync(rosterPath, 'utf8'));
  } catch (err) {
    return { configured: false, allowed: true, reason: `roster_unavailable: ${err.message}` };
  }

  const agent = roster.agents?.find((candidate) => candidate.agent_id === agentId);
  if (!agent) {
    return {
      configured: true,
      allowed: false,
      error: `path_policy_identity_not_in_roster: ${agentId}`,
    };
  }

  const policy = agent.capability_policy?.path_policy
    ?? agent.capability_policy?.filesystem_path_policy
    ?? null;
  if (!policy) return { configured: false, allowed: true, agent_id: agentId };

  const mode = policy.mode ?? 'allowlist';
  if (mode !== 'allowlist') {
    return { configured: false, allowed: true, agent_id: agentId, reason: `path_policy_mode_${mode}` };
  }

  const roots = normalizePolicyRoots(siteRoot, policy);
  if (roots.length === 0) {
    return {
      configured: true,
      allowed: false,
      error: `path_policy_empty_allowlist: ${agentId}`,
    };
  }

  return {
    configured: true,
    allowed: true,
    agent_id: agentId,
    mode,
    allowed_roots: roots,
  };
}

function normalizePolicyRoots(siteRoot, policy) {
  const rawEntries = policy.allow
    ?? policy.allowlist
    ?? policy.allowed_paths
    ?? policy.allowed_roots
    ?? [];
  const entries = Array.isArray(rawEntries) ? rawEntries : [];
  const roots = [];

  for (const entry of entries) {
    const rawPath = typeof entry === 'string'
      ? entry
      : typeof entry?.path === 'string'
        ? entry.path
        : typeof entry?.root === 'string'
          ? entry.root
          : null;
    if (!rawPath) continue;

    const absolutePath = isAbsolute(rawPath) ? resolve(rawPath) : resolve(siteRoot, rawPath);
    if (!isPathWithin(absolutePath, siteRoot)) continue;
    roots.push({
      display_path: normalizeDisplayPath(relative(siteRoot, absolutePath)),
      absolute_path: absolutePath,
    });
  }

  return roots;
}

function isPathWithin(candidatePath, rootPath) {
  const rel = relative(resolve(rootPath), resolve(candidatePath));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function normalizeDisplayPath(pathValue) {
  const normalized = pathValue.replace(/\\/g, '/');
  return normalized === '' ? '.' : normalized;
}
