#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(fileURLToPath(import.meta.url)).replace(/[\\/]scripts$/, '');
const baselinePath = join(repoRoot, 'scripts', 'process-launch-posture-baseline.json');
const args = new Set(process.argv.slice(2));
const updateBaseline = args.has('--update-baseline');
const report = args.has('--report');

const scanRoots = ['packages', 'scripts', 'tools']
  .map((entry) => join(repoRoot, entry))
  .filter((path) => existsSync(path));

const skippedDirectories = new Set([
  '.git',
  '.narada',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
]);

const sourceFilePattern = /\.(?:mjs|cjs|js|ts|tsx|ps1)$/i;
const wrapperFiles = new Set([
  'packages/process-launch-posture/src/index.mjs',
]);

const operatorProjectionOpenBypassAllowed = new Set([
  'packages/process-launch-posture/src/index.test.mjs',
  'packages/process-launch-posture/src/index.d.ts',
]);

const rawLaunchPatterns = [
  { api: 'child_process.spawn', pattern: /(?<![.$\w])spawn\s*\(/ },
  { api: 'child_process.spawnSync', pattern: /(?<![.$\w])spawnSync\s*\(/ },
  { api: 'child_process.execFile', pattern: /(?<![.$\w])execFile\s*\(/ },
  { api: 'child_process.execFileSync', pattern: /(?<![.$\w])execFileSync\s*\(/ },
  { api: 'child_process.exec', pattern: /(?<![.$\w])exec\s*\(/ },
  { api: 'PowerShell.Start-Process', pattern: /\bStart-Process\b/i },
  { api: 'windows.cmd-start', pattern: /\bcmd(?:\.exe)?['\"]?\s*,?\s*\[?\s*['\"]\/c['\"]\s*,\s*['\"]start['\"]/i },
  { api: 'browser.open-command', pattern: /\bcommand\s*=\s*['\"]open['\"]|\bcommand\s*=\s*['\"]xdg-open['\"]|\bxdg-open\b/ },
  { api: 'process_launch_posture.openBrowserUrl', pattern: /\bopenBrowserUrl\s*\(/ },
];

const postureAnnotationPattern = /narada-process-launch-posture:\s*([a-z_]+)/;
const admittedPostures = new Set([
  'operator_terminal',
  'browser_open',
  'provider_subprocess',
  'mcp_server',
  'governed_command_execution',
  'test_child',
  'elevated_or_operator_prompt',
]);

function normalizedRelative(path) {
  return relative(repoRoot, path).split(sep).join('/');
}

function stableFindingId(file, api, lines, index) {
  const context = lines
    .slice(Math.max(0, index - 2), Math.min(lines.length, index + 3))
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
  const fingerprint = createHash('sha256').update(`${file}\n${api}\n${context}`).digest('hex').slice(0, 16);
  return `${file}:${api}:${fingerprint}`;
}

function walk(directory, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) walk(join(directory, entry.name), files);
      continue;
    }
    if (entry.isFile() && sourceFilePattern.test(entry.name)) files.push(join(directory, entry.name));
  }
  return files;
}

function inferPosture(file, text) {
  if (/\.test\.|\/test\/|\/test-|\.spec\./.test(file)) return 'test_child';
  if (/browser|agent-web-ui|render/i.test(file) && /cmd|xdg-open|open|start|spawn/i.test(text)) return 'browser_open';
  if (/provider|codex|kimi|charter/i.test(file)) return 'provider_subprocess';
  if (/mcp-fabric|mcp-runtime|mcp-server|\/mcp-|server\.mjs/i.test(file)) return 'mcp_server';
  if (/launcher|agent-start|workspace|terminal|carrier-process-launch/i.test(file)) return 'operator_terminal';
  if (/command|executor|shell|backup|restore|deploy|script/i.test(file)) return 'governed_command_execution';
  return 'governed_command_execution';
}

function annotationFor(lines, index) {
  for (let cursor = Math.max(0, index - 2); cursor <= index; cursor += 1) {
    const match = postureAnnotationPattern.exec(lines[cursor] ?? '');
    if (match) return admittedPostures.has(match[1]) ? match[1] : `invalid:${match[1]}`;
  }
  return null;
}

function scan() {
  const findings = [];
  const files = scanRoots.flatMap((root) => walk(root));
  for (const fullPath of files) {
    const file = normalizedRelative(fullPath);
    if (wrapperFiles.has(file)) continue;
    const content = readFileSync(fullPath, 'utf8');
    const lines = content.split(/\r?\n/);
    lines.forEach((text, lineIndex) => {
      for (const rule of rawLaunchPatterns) {
        if (!rule.pattern.test(text)) continue;
        if (rule.api === 'process_launch_posture.openBrowserUrl' && operatorProjectionOpenBypassAllowed.has(file)) continue;
        if (rule.api === 'child_process.exec' && /^\s*exec\s*\([^)]*\)\s*\{/.test(text)) continue;
        const annotation = annotationFor(lines, lineIndex);
        findings.push({
          id: stableFindingId(file, rule.api, lines, lineIndex),
          file,
          line: lineIndex + 1,
          api: rule.api,
          inferred_posture: annotation ?? inferPosture(file, text),
          annotation,
          text: text.trim(),
        });
      }
    });
  }
  return findings.sort((left, right) => left.id.localeCompare(right.id));
}

function loadBaseline() {
  if (!existsSync(baselinePath)) return { schema: 'narada.process_launch_posture.baseline.v1', entries: [] };
  return JSON.parse(readFileSync(baselinePath, 'utf8'));
}

function baselineEntry(finding) {
  return {
    id: finding.id,
    file: finding.file,
    line: finding.line,
    api: finding.api,
    posture: finding.inferred_posture,
    text: finding.text,
  };
}

const findings = scan();

if (updateBaseline) {
  const entries = findings.map(baselineEntry);
  const existing = loadBaseline();
  if (JSON.stringify(existing.entries ?? []) === JSON.stringify(entries)) {
    console.log(`process-launch-posture baseline unchanged: ${entries.length} entries`);
    process.exit(0);
  }
  const baseline = {
    schema: 'narada.process_launch_posture.baseline.v2',
    generated_at: new Date().toISOString(),
    id_basis: 'file + child-process api + local source context sha256/16; line is metadata only',
    note: 'Migration baseline for raw process launch sites. New sites must use @narada2/process-launch-posture wrappers or be intentionally added here.',
    entries,
  };
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
  console.log(`process-launch-posture baseline updated: ${baseline.entries.length} entries`);
  process.exit(0);
}

const baseline = loadBaseline();
const baselineIds = new Set((baseline.entries ?? []).map((entry) => entry.id));
const currentIds = new Set(findings.map((finding) => finding.id));
const newFindings = findings.filter((finding) => !baselineIds.has(finding.id));
const staleBaseline = (baseline.entries ?? []).filter((entry) => !currentIds.has(entry.id));
const invalidAnnotations = findings.filter((finding) => finding.annotation?.startsWith?.('invalid:'));

const summary = {
  schema: 'narada.process_launch_posture.guard.v1',
  status: newFindings.length === 0 && invalidAnnotations.length === 0 ? 'ok' : 'failed',
  current_raw_launch_count: findings.length,
  baseline_count: baseline.entries?.length ?? 0,
  new_unbaselined_count: newFindings.length,
  stale_baseline_count: staleBaseline.length,
  invalid_annotation_count: invalidAnnotations.length,
};

if (report || summary.status !== 'ok') {
  console.log(JSON.stringify({
    ...summary,
    new_unbaselined: newFindings.slice(0, 50),
    stale_baseline: staleBaseline.slice(0, 50),
    invalid_annotations: invalidAnnotations.slice(0, 50),
  }, null, 2));
} else {
  console.log(`process-launch-posture guard ok: ${findings.length} raw launch sites tracked`);
}

if (summary.status !== 'ok') process.exit(1);
