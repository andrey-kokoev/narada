/**
 * Task relatedness search — Phase 1: tag-based overlap.
 * Extracts implicit tags from task titles/content and finds overlapping tasks.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const STOP_WORDS: any = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by','from','as','is','was','are','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','must','shall','can','need','dare','ought','used','this','that','these','those','i','you','he','she','it','we','they','me','him','her','us','them','my','your','his','her','its','our','their','mine','yours','hers','ours','theirs','what','which','who','whom','whose','where','when','why','how','all','each','every','both','few','more','most','other','some','such','no','nor','not','only','own','same','so','than','too','very','just','now','then','here','there','up','down','out','off','over','under','again','further','on','off','also','into','through','during','before','after','above','below','between','among','within','without','against','towards','upon','across','around','behind','beyond','except','inside','outside','until','via','per','amongst','amid','beside','besides','concerning','despite','following','like','minus','near','past','regarding','round','save','since','till','toward','underneath','unlike','versus','worth',
]);

function tokenize(text: any) : any {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter((t: any) : any => t.length > 2 && !STOP_WORDS.has(t) && !/^\d+$/.test(t));
}

function extractFrontmatter(text: any) : any {
  if (!text.startsWith('---')) return {};
  const end: any = text.indexOf('---', 3);
  if (end === -1) return {};
  const fm: any = text.slice(3, end).trim();
  const result: any = {};
  for (const line of fm.split('\n')) {
    const m: any = line.match(/^([a-z_]+):\s*(.*)$/);
    if (m) result[m[1]] = m[2].trim();
  }
  return result;
}

export function extractTaskTags(taskPath: any) : any {
  const text: any = readFileSync(taskPath, 'utf8');
  const fm: any = extractFrontmatter(text);
  const body: any = text.replace(/^---[\s\S]*?---/, '').trim();

  // Collect text sources for tagging
  const sources: any = [];
  if (fm.title) sources.push(fm.title);
  // Title from first heading
  const titleMatch: any = body.match(/^#\s+(.+)$/m);
  if (titleMatch) sources.push(titleMatch[1]);
  // Goal section
  const goalMatch: any = body.match(/^##\s+Goal\s*$/m);
  if (goalMatch) {
    const start: any = goalMatch.index + goalMatch[0].length;
    const rest: any = body.slice(start);
    const next: any = rest.match(/^##\s/m);
    const goalText: any = next ? body.slice(start, start + next.index) : body.slice(start);
    sources.push(goalText.slice(0, 500));
  }
  // Context section
  const ctxMatch: any = body.match(/^##\s+Context\s*$/m);
  if (ctxMatch) {
    const start: any = ctxMatch.index + ctxMatch[0].length;
    const rest: any = body.slice(start);
    const next: any = rest.match(/^##\s/m);
    const ctxText: any = next ? body.slice(start, start + next.index) : body.slice(start);
    sources.push(ctxText.slice(0, 300));
  }

  const tokens: any = tokenize(sources.join(' '));
  const tagCounts: any = new Map();
  for (const t of tokens) {
    tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  }

  // Sort by frequency, take top 12 as implicit tags
  const sorted: any = (Array.from(tagCounts.entries()) as Array<[string, number]>)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([tag]) => tag);

  // Add explicit tags from frontmatter if present
  if (fm.tags) {
    const explicit: any = fm.tags.split(',').map((t: any) : any => t.trim().toLowerCase()).filter(Boolean);
    for (const t of explicit) {
      if (!sorted.includes(t)) sorted.push(t);
    }
  }

  return {
    task_number: parseInt(fm.number, 10) || null,
    tags: sorted,
    title: fm.title || (titleMatch ? titleMatch[1] : null),
  };
}

export function findRelatedTasks({ tasksDir, targetTaskNumber, limit = 8 }: any) : any {
  const dir: any = resolve(tasksDir);
  const files: any = readdirSync(dir).filter((f) : any => f.endsWith('.md'));

  const allTags: any = [];
  for (const f of files) {
    const info: any = extractTaskTags(join(dir, f));
    if (info.task_number) allTags.push(info);
  }

  const target: any = allTags.find((t: any) : any => t.task_number === targetTaskNumber);
  if (!target) return { target: targetTaskNumber, related: [], schema: 'narada.task.relatedness.v0' };

  const targetTagSet: any = new Set(target.tags);
  const scored: any = [];

  for (const other of allTags) {
    if (other.task_number === targetTaskNumber) continue;
    const overlap: any = other.tags.filter((t: any) : any => targetTagSet.has(t));
    if (overlap.length === 0) continue;
    // Score: overlap count weighted by overlap ratio
    const score: any = overlap.length * (overlap.length / Math.max(target.tags.length, other.tags.length));
    scored.push({
      task_number: other.task_number,
      title: other.title,
      overlap_tags: overlap,
      overlap_count: overlap.length,
      score: Math.round(score * 100) / 100,
    });
  }

  scored.sort((a: any, b: any) : any => b.score - a.score);

  return {
    target: targetTaskNumber,
    target_tags: target.tags,
    related: scored.slice(0, limit),
    schema: 'narada.task.relatedness.v0',
    generated_at: new Date().toISOString(),
  };
}
