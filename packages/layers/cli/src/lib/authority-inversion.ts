import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface AuthorityInversionWarning {
  finding_id: string;
  surface: string;
  changed_file: string;
  visible_artifact: string;
  hidden_authority_structure: string;
  current_guard: string;
  gap: string;
  severity: 'info' | 'warning' | 'error';
  recommended_follow_up: string | null;
}

interface Inventory {
  findings?: InventoryFinding[];
}

interface InventoryFinding {
  finding_id?: unknown;
  surface?: unknown;
  visible_artifact?: unknown;
  hidden_authority_structure?: unknown;
  current_guard?: unknown;
  gap?: unknown;
  severity?: unknown;
  recommended_follow_up?: unknown;
}

const SURFACE_MATCHERS: Array<{ surface: string; matches: (file: string) => boolean }> = [
  { surface: 'task_lifecycle', matches: (file) => file.startsWith('.ai/do-not-open/tasks/') || file === '.ai/task-lifecycle-snapshot.json' || file.endsWith('task-lifecycle.db') },
  { surface: 'inbox', matches: (file) => file === '.ai/inbox.db' || file.startsWith('.ai/inbox-envelopes/') || file.includes('/commands/inbox') },
  { surface: 'resume_work_next', matches: (file) => file.includes('/commands/resume') || file.includes('/commands/work-next') || file.endsWith('resume-continuity.md') },
  { surface: 'publication', matches: (file) => file.includes('/commands/publication') || file.includes('repo-publication-intent-zone') },
  { surface: 'cli_output_admission', matches: (file) => file.includes('/lib/cli-output') || file.includes('/commands/') || file.includes('/command-wrapper') },
  { surface: 'site_registry', matches: (file) => file.includes('/commands/sites') || file.includes('site-') || file.includes('Site') },
  { surface: 'secrets', matches: (file) => file.includes('secret') || file.includes('.env') || file.includes('credential') },
  { surface: 'tests', matches: (file) => file.includes('/test/') || file.endsWith('.test.ts') },
  { surface: 'generated_artifacts', matches: (file) => file.startsWith('.ai/reviews/') || file.includes('review') || file.includes('work-result') },
];

export async function evaluateAuthorityInversionForChangedFiles(
  cwd: string,
  changedFilesCsv: string | undefined,
): Promise<AuthorityInversionWarning[]> {
  const changedFiles = parseChangedFiles(changedFilesCsv);
  if (changedFiles.length === 0) return [];

  const inventory = await loadInventory(cwd);
  const warnings: AuthorityInversionWarning[] = [];
  const seen = new Set<string>();

  for (const file of changedFiles) {
    for (const surface of surfacesForFile(file)) {
      const finding = inventory.find((entry) => stringOr(entry.surface, '') === surface);
      if (!finding) continue;
      const key = `${stringOr(finding.finding_id, surface)}:${file}`;
      if (seen.has(key)) continue;
      seen.add(key);
      warnings.push({
        finding_id: stringOr(finding.finding_id, surface),
        surface,
        changed_file: file,
        visible_artifact: stringOr(finding.visible_artifact, file),
        hidden_authority_structure: stringOr(finding.hidden_authority_structure, 'unknown authority structure'),
        current_guard: stringOr(finding.current_guard, 'unknown guard'),
        gap: stringOr(finding.gap, 'artifact may be mistaken for authority'),
        severity: parseSeverity(finding.severity),
        recommended_follow_up: stringOrNull(finding.recommended_follow_up),
      });
    }
  }

  return warnings.slice(0, 8);
}

export function formatAuthorityInversionWarning(warning: AuthorityInversionWarning): string {
  return `${warning.surface}: ${warning.changed_file} appears as ${warning.visible_artifact}; authority is ${warning.hidden_authority_structure}`;
}

function parseChangedFiles(changedFilesCsv: string | undefined): string[] {
  if (!changedFilesCsv) return [];
  return changedFilesCsv
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

async function loadInventory(cwd: string): Promise<InventoryFinding[]> {
  const path = join(cwd, 'docs', 'concepts', 'authority-inversion-inventory.json');
  const raw = await readFile(path, 'utf8').catch(() => null);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Inventory;
    return Array.isArray(parsed.findings) ? parsed.findings : [];
  } catch {
    return [];
  }
}

function surfacesForFile(file: string): string[] {
  return SURFACE_MATCHERS
    .filter((matcher) => matcher.matches(file))
    .map((matcher) => matcher.surface);
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function parseSeverity(value: unknown): 'info' | 'warning' | 'error' {
  return value === 'info' || value === 'warning' || value === 'error' ? value : 'warning';
}
