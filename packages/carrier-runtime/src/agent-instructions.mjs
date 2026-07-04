import { dirname, join, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

export function loadRolePrompt(identityName, siteRoot) {
  return agentInstructionsPrompt(agentInstructionChain(siteRoot));
}

export function agentInstructionChain(siteRoot) {
  if (!siteRoot) return [];
  const normalizedSiteRoot = resolve(siteRoot);
  const ancestorDirs = [];
  let current = normalizedSiteRoot;
  while (true) {
    ancestorDirs.push(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  const candidates = [
    ...ancestorDirs.reverse().map((directory) => join(directory, 'AGENTS.md')),
    join(normalizedSiteRoot, '.narada', 'AGENTS.md'),
  ];
  const seen = new Set();
  return candidates.filter((candidate) => {
    const path = resolve(candidate);
    if (seen.has(path) || !existsSync(path)) return false;
    seen.add(path);
    return true;
  });
}

function agentInstructionsPrompt(paths) {
  return paths.map((path) => [
    `# AGENTS.md authority: ${path}`,
    readFileSync(path, 'utf8'),
  ].join('\n\n')).join('\n\n');
}
