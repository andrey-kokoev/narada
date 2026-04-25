/**
 * Task search operator.
 *
 * Inspection: full-text search across task files (front matter + body).
 * Pure read — no mutations.
 */

import { resolve } from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import { parseFrontMatter, extractTaskNumberFromFileName } from '../lib/task-governance.js';

const TASKS_DIR = '.ai/do-not-open/tasks';
const DERIVATIVE_SUFFIXES = ['-EXECUTED.md', '-DONE.md', '-RESULT.md', '-FINAL.md', '-SUPERSEDED.md'];

export interface TaskSearchOptions {
  query: string;
  format?: 'json' | 'human' | 'auto';
  cwd?: string;
}

export interface TaskSearchResult {
  task_id: string;
  task_number: number | null;
  status: string | undefined;
  title: string | undefined;
  matches: string[];
}

function resolveRepoPath(cwd: string): string {
  return resolve(cwd);
}

function isDerivative(fileName: string): boolean {
  return DERIVATIVE_SUFFIXES.some((suffix) => fileName.endsWith(suffix));
}

function extractTitle(body: string): string | undefined {
  const heading = body.match(/^#\s+(.+)$/m);
  return heading ? heading[1].trim() : undefined;
}

function findMatches(content: string, query: string, maxSnippets = 3): string[] {
  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const snippets: string[] = [];
  let idx = 0;

  while (snippets.length < maxSnippets) {
    const found = lowerContent.indexOf(lowerQuery, idx);
    if (found === -1) break;

    const start = Math.max(0, found - 60);
    const end = Math.min(content.length, found + query.length + 60);
    let snippet = content.slice(start, end).replace(/\s+/g, ' ').trim();
    if (start > 0) snippet = '…' + snippet;
    if (end < content.length) snippet = snippet + '…';
    snippets.push(snippet);

    idx = found + query.length;
  }

  return snippets;
}

export async function taskSearchCommand(
  options: TaskSearchOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format || 'auto', verbose: false });
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const query = options.query.trim();

  if (!query) {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: 'Search query is required' },
    };
  }

  const dir = join(resolveRepoPath(cwd), TASKS_DIR);
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: `Cannot read tasks directory: ${dir}` },
    };
  }

  const mdFiles = files.filter((f) => f.endsWith('.md') && !isDerivative(f));
  const results: TaskSearchResult[] = [];

  for (const f of mdFiles) {
    const content = await readFile(join(dir, f), 'utf8');
    const { frontMatter, body } = parseFrontMatter(content);

    const fullText = content;
    const lowerQuery = query.toLowerCase();
    if (!fullText.toLowerCase().includes(lowerQuery)) continue;

    const taskNumber = extractTaskNumberFromFileName(f);
    const title = extractTitle(body);
    const matches = findMatches(fullText, query);

    results.push({
      task_id: f.replace(/\.md$/, ''),
      task_number: taskNumber,
      status: frontMatter.status as string | undefined,
      title,
      matches,
    });
  }

  // Sort by task number descending (most recent first)
  results.sort((a, b) => (b.task_number ?? 0) - (a.task_number ?? 0));

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        query,
        count: results.length,
        results,
      },
    };
  }

  if (results.length === 0) {
    fmt.message(`No tasks match "${query}"`, 'info');
    return {
      exitCode: ExitCode.SUCCESS,
      result: { status: 'success', query, count: 0, results: [] },
    };
  }

  fmt.section(`Task Search Results for "${query}" (${results.length})`);

  for (const r of results) {
    const numStr = r.task_number !== null ? `#${r.task_number}` : r.task_id;
    const statusStr = r.status ? `[${r.status}]` : '';
    console.log(`\n${numStr} ${statusStr} ${r.title ?? ''}`);
    for (const snippet of r.matches) {
      console.log(`  ${snippet}`);
    }
  }

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      query,
      count: results.length,
      results,
    },
  };
}
