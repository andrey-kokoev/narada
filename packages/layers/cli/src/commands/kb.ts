import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { ExitCode } from '../lib/exit-codes.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { parseFrontMatter, serializeFrontMatter } from '../lib/task-governance.js';

export interface KbSearchOptions {
  cwd?: string;
  query?: string;
  limit?: number;
  format?: CliFormat;
}

export interface KbAliasAddOptions {
  cwd?: string;
  file?: string;
  alias?: string[];
  symptom?: string[];
  system?: string[];
  failureMode?: string[];
  relatedRunbook?: string[];
  by?: string;
  format?: CliFormat;
}

export interface KbLintOptions {
  cwd?: string;
  limit?: number;
  format?: CliFormat;
}

interface KbEntry {
  path: string;
  title: string;
  lookup_aliases: string[];
  symptoms: string[];
  systems: string[];
  failure_modes: string[];
  related_runbooks: string[];
  body_excerpt: string;
}

const KB_ROOTS = ['kb', '.narada/kb', 'knowledge', 'runbooks', 'docs/runbooks'];
const METADATA_FIELDS = ['lookup_aliases', 'symptoms', 'systems', 'failure_modes', 'related_runbooks'] as const;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

async function listMarkdownFiles(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await listMarkdownFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(path);
  }
  return files;
}

async function readKbEntries(cwd: string): Promise<KbEntry[]> {
  const root = resolve(cwd);
  const files = (await Promise.all(KB_ROOTS.map((dir) => listMarkdownFiles(join(root, dir))))).flat();
  const entries: KbEntry[] = [];
  for (const file of files) {
    const raw = await readFile(file, 'utf8');
    const { frontMatter, body } = parseFrontMatter(raw);
    const title = /^#\s+(.+)$/m.exec(body)?.[1]?.trim() ?? relative(root, file);
    entries.push({
      path: relative(root, file),
      title,
      lookup_aliases: asStringArray(frontMatter.lookup_aliases),
      symptoms: asStringArray(frontMatter.symptoms),
      systems: asStringArray(frontMatter.systems),
      failure_modes: asStringArray(frontMatter.failure_modes),
      related_runbooks: asStringArray(frontMatter.related_runbooks),
      body_excerpt: body.replace(/\s+/g, ' ').trim().slice(0, 240),
    });
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

function scoreEntry(entry: KbEntry, query: string): { score: number; matched_fields: string[] } {
  const q = normalize(query);
  const fields: Array<[string, string[]]> = [
    ['title', [entry.title]],
    ['lookup_aliases', entry.lookup_aliases],
    ['symptoms', entry.symptoms],
    ['systems', entry.systems],
    ['failure_modes', entry.failure_modes],
    ['related_runbooks', entry.related_runbooks],
    ['body', [entry.body_excerpt]],
  ];
  let score = 0;
  const matched: string[] = [];
  for (const [field, values] of fields) {
    if (values.some((value) => normalize(value).includes(q) || q.includes(normalize(value)))) {
      matched.push(field);
      score += field === 'lookup_aliases' || field === 'symptoms' ? 5 : field === 'title' ? 3 : 1;
    }
  }
  return { score, matched_fields: matched };
}

export async function kbSearchCommand(options: KbSearchOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const query = options.query?.trim();
  if (!query) return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: '--query is required' } };
  const limit = Math.max(1, Math.min(options.limit ?? 10, 50));
  const matches = (await readKbEntries(cwd))
    .map((entry) => ({ entry, match: scoreEntry(entry, query) }))
    .filter((item) => item.match.score > 0)
    .sort((a, b) => b.match.score - a.match.score || a.entry.path.localeCompare(b.entry.path))
    .slice(0, limit)
    .map((item) => ({ ...item.entry, score: item.match.score, matched_fields: item.match.matched_fields }));
  const result = {
    status: 'success',
    mutation_performed: false,
    query,
    count: matches.length,
    limit,
    searched_roots: KB_ROOTS,
    matches,
    authority_boundary: 'Search reads Site-local KB/runbook files only; it does not centralize client Site knowledge into Narada proper.',
  };
  return { exitCode: ExitCode.SUCCESS, result: formattedResult(result, renderSearchHuman(result), options.format ?? 'auto') };
}

export async function kbAliasAddCommand(options: KbAliasAddOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = resolve(options.cwd ?? process.cwd());
  if (!options.file) return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: '--file is required' } };
  const file = resolve(cwd, options.file);
  if (!existsSync(file)) return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: `KB file not found: ${options.file}` } };
  const raw = await readFile(file, 'utf8');
  const { frontMatter, body } = parseFrontMatter(raw);
  const additions: Record<typeof METADATA_FIELDS[number], string[]> = {
    lookup_aliases: options.alias ?? [],
    symptoms: options.symptom ?? [],
    systems: options.system ?? [],
    failure_modes: options.failureMode ?? [],
    related_runbooks: options.relatedRunbook ?? [],
  };
  for (const field of METADATA_FIELDS) {
    frontMatter[field] = unique([...asStringArray(frontMatter[field]), ...additions[field]]);
  }
  frontMatter.kb_metadata_updated_at = new Date().toISOString();
  frontMatter.kb_metadata_updated_by = options.by?.trim() || 'unknown';
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, serializeFrontMatter(frontMatter, body), 'utf8');
  return {
    exitCode: ExitCode.SUCCESS,
    result: formattedResult({
      status: 'success',
      mutation_performed: true,
      file: relative(cwd, file),
      metadata: Object.fromEntries(METADATA_FIELDS.map((field) => [field, frontMatter[field]])),
      next_search_command: `narada kb search --query ${JSON.stringify([...(options.alias ?? []), ...(options.symptom ?? [])][0] ?? '')}`,
    }, [`Updated KB metadata: ${relative(cwd, file)}`], options.format ?? 'auto'),
  };
}

export async function kbLintCommand(options: KbLintOptions): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const limit = Math.max(1, Math.min(options.limit ?? 50, 100));
  const entries = await readKbEntries(cwd);
  const findings = entries
    .filter((entry) => entry.symptoms.length === 0 && entry.lookup_aliases.length === 0)
    .slice(0, limit)
    .map((entry) => ({
      path: entry.path,
      title: entry.title,
      severity: 'warning',
      finding: 'missing_lookup_aliases_or_symptoms',
      closure_question: 'What would the Operator or future agent search for next time?',
      repair_command: `narada kb alias add --file ${JSON.stringify(entry.path)} --alias <operator phrase> --symptom <symptom phrase> --by <principal>`,
    }));
  const result = {
    status: findings.length === 0 ? 'success' : 'warning',
    mutation_performed: false,
    checked: entries.length,
    findings,
    closure_guidance: 'Incident/runbook closure should record at least one lookup_alias or symptom phrase.',
  };
  return { exitCode: ExitCode.SUCCESS, result: formattedResult(result, renderLintHuman(result), options.format ?? 'auto') };
}

function renderSearchHuman(result: { query: string; count: number; matches: Array<{ path: string; title: string; matched_fields: string[] }> }): string[] {
  return [
    `KB search: ${result.query}`,
    `Matches: ${result.count}`,
    ...result.matches.slice(0, 10).map((match) => `- ${match.path}: ${match.title} (${match.matched_fields.join(', ')})`),
  ];
}

function renderLintHuman(result: { checked: number; findings: Array<{ path: string; finding: string }> }): string[] {
  return [
    `KB lint checked: ${result.checked}`,
    `Findings: ${result.findings.length}`,
    ...result.findings.slice(0, 10).map((finding) => `- ${finding.path}: ${finding.finding}`),
  ];
}
