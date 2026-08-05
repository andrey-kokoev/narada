#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = dirname(fileURLToPath(import.meta.url)).replace(/[\\/]scripts$/, '');
const baselinePath = join(repoRoot, 'scripts', 'process-launch-posture-baseline.json');

const scanRoots = ['packages', 'scripts', 'tools']
  .map((entry: any) => join(repoRoot, entry))
  .filter((path: any) => existsSync(path));

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
  'packages/process-launch-posture/src/index.ts',
]);

export const guardImplementationFiles = new Set([
  'scripts/process-launch-posture-guard.ts',
  'scripts/process-launch-posture-guard.test.ts',
]);

const operatorProjectionOpenBypassAllowed = new Set([
  'packages/process-launch-posture/src/index.test.ts',
  'packages/process-launch-posture/src/index.d.ts',
]);

const rawLaunchPatterns = [
  { api: 'child_process.spawn', identifier: 'spawn', pattern: /(?<![.$\w])spawn\s*\(/ },
  { api: 'child_process.spawnSync', identifier: 'spawnSync', pattern: /(?<![.$\w])spawnSync\s*\(/ },
  { api: 'child_process.execFile', identifier: 'execFile', pattern: /(?<![.$\w])execFile\s*\(/ },
  { api: 'child_process.execFileSync', identifier: 'execFileSync', pattern: /(?<![.$\w])execFileSync\s*\(/ },
  { api: 'child_process.exec', identifier: 'exec', pattern: /(?<![.$\w])exec\s*\(/ },
  { api: 'PowerShell.Start-Process', pattern: /\bStart-Process\b/i },
  { api: 'windows.cmd-start', pattern: /\bcmd(?:\.exe)?['\"]?\s*,?\s*\[?\s*['\"]\/c['\"]\s*,\s*['\"]start['\"]/i },
  { api: 'browser.open-command', pattern: /\bcommand\s*=\s*['\"]open['\"]|\bcommand\s*=\s*['\"]xdg-open['\"]|\bxdg-open\b/ },
  { api: 'process_launch_posture.openBrowserUrl', identifier: 'openBrowserUrl', pattern: /\bopenBrowserUrl\s*\(/ },
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

function normalizedRelative(path: any) {
  return relative(repoRoot, path).split(sep).join('/');
}

function normalizedLaunchStatement(text: any) {
  return String(text).trim();
}

function stableFindingId(file: any, api: any, text: any, occurrence: any) {
  const statement = normalizedLaunchStatement(text);
  const fingerprint = createHash('sha256')
    .update(`${file}\n${api}\n${statement}\n${occurrence}`)
    .digest('hex')
    .slice(0, 16);
  return `${file}:${api}:${fingerprint}`;
}

function escapedRegExp(value: any) {
  return String(value).replace(/[$()*+.?[\\\]^{|}]/gu, '\\$&');
}

function isIdentifierDeclaration(text: any, identifier: any) {
  const escaped = escapedRegExp(identifier);
  const genericParameters = '(?:<[^>]*>)?';
  const parameters = '\\([^)]*\\)';
  const modifiers = '(?:(?:public|private|protected|static|abstract|readonly|override|declare|async)\\s+)*';
  const functionDeclaration = new RegExp(
    `^\\s*(?:(?:export|default|declare|async)\\s+)*function\\s+${escaped}\\s*${genericParameters}\\s*\\(`,
    'u',
  );
  const methodHead = `^\\s*${modifiers}${escaped}\\s*${genericParameters}\\s*${parameters}`;
  const methodBody = new RegExp(`${methodHead}\\s*(?::[^=;{]+)?\\s*\\{`, 'u');
  const typedSignature = new RegExp(`${methodHead}\\s*:[^=;{]+\\s*;`, 'u');
  return functionDeclaration.test(text) || methodBody.test(text) || typedSignature.test(text);
}

function walk(directory: any, files: any= []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) walk(join(directory, entry.name), files);
      continue;
    }
    if (entry.isFile() && sourceFilePattern.test(entry.name)) files.push(join(directory, entry.name));
  }
  return files;
}

function inferPosture(file: any, text: any) {
  if (/\.test\.|\/test\/|\/test-|\.spec\./.test(file)) return 'test_child';
  if (/browser|agent-web-ui|render/i.test(file) && /cmd|xdg-open|open|start|spawn/i.test(text)) return 'browser_open';
  if (/provider|codex|kimi|charter/i.test(file)) return 'provider_subprocess';
  if (/mcp-fabric|mcp-runtime|mcp-server|\/mcp-|server\.ts/i.test(file)) return 'mcp_server';
  if (/launcher|agent-start|workspace|terminal|carrier-process-launch/i.test(file)) return 'operator_terminal';
  if (/command|executor|shell|backup|restore|deploy|script/i.test(file)) return 'governed_command_execution';
  return 'governed_command_execution';
}

function annotationFor(lines: any, index: any) {
  for (let cursor = Math.max(0, index - 2); cursor <= index; cursor += 1) {
    const match = postureAnnotationPattern.exec(lines[cursor] ?? '');
    if (match) return admittedPostures.has(match[1]) ? match[1] : `invalid:${match[1]}`;
  }
  return null;
}

export function scanProcessLaunchEntries(entries: any) {
  const findings: any[] = [];
  const sortedEntries = [...entries]
    .map((entry: any) => ({ file: String(entry.file).replaceAll('\\', '/'), content: String(entry.content ?? '') }))
    .sort((left: any, right: any) => left.file.localeCompare(right.file));

  for (const { file, content } of sortedEntries) {
    if (wrapperFiles.has(file) || guardImplementationFiles.has(file)) continue;
    const lines = content.split(/\r?\n/);
    const occurrences = new Map();
    lines.forEach((text: any, lineIndex: any) => {
      for (const rule of rawLaunchPatterns) {
        if (!rule.pattern.test(text)) continue;
        if (rule.api === 'process_launch_posture.openBrowserUrl' && operatorProjectionOpenBypassAllowed.has(file)) continue;
        if (rule.identifier && isIdentifierDeclaration(text, rule.identifier)) continue;
        const occurrenceKey = `${rule.api}\n${normalizedLaunchStatement(text)}`;
        const occurrence = (occurrences.get(occurrenceKey) ?? 0) + 1;
        occurrences.set(occurrenceKey, occurrence);
        const annotation = annotationFor(lines, lineIndex);
        findings.push({
          id: stableFindingId(file, rule.api, text, occurrence),
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
  return findings.sort((left: any, right: any) => left.id.localeCompare(right.id));
}

function scan() {
  const files = scanRoots.flatMap((root: any) => walk(root));
  return scanProcessLaunchEntries(files.map((fullPath: any) => ({
    file: normalizedRelative(fullPath),
    content: readFileSync(fullPath, 'utf8'),
  })));
}

function loadBaseline() {
  if (!existsSync(baselinePath)) return { schema: 'narada.process_launch_posture.baseline.v1', entries: [] };
  return JSON.parse(readFileSync(baselinePath, 'utf8'));
}

function baselineEntry(finding: any) {
  return {
    id: finding.id,
    file: finding.file,
    line: finding.line,
    api: finding.api,
    posture: finding.inferred_posture,
    text: finding.text,
  };
}

function runGuard() {
  const args = new Set(process.argv.slice(2));
  const updateBaseline = args.has('--update-baseline');
  const report = args.has('--report');
  const findings = scan();

  if (updateBaseline) {
    const entries = findings.map(baselineEntry);
    const existing = loadBaseline();
    if (JSON.stringify(existing.entries ?? [])=== JSON.stringify(entries)) {
      console.log(`process-launch-posture baseline unchanged: ${entries.length} entries`);
      return;
    }
    const baseline = {
      schema: 'narada.process_launch_posture.baseline.v3',
      generated_at: new Date().toISOString(),
      id_basis: 'file + child-process api + trimmed launch statement + duplicate occurrence sha256/16; line is metadata only',
      note: 'Migration baseline for raw process launch sites. New sites must use @narada-core/process-launch-posture wrappers or be intentionally added here.',
      entries,
    };
    writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
    console.log(`process-launch-posture baseline updated: ${baseline.entries.length} entries`);
    return;
  }

  const baseline = loadBaseline();
  const baselineIds = new Set((baseline.entries ?? []).map((entry: any) => entry.id));
  const currentIds = new Set(findings.map((finding: any) => finding.id));
  const newFindings = findings.filter((finding: any) => !baselineIds.has(finding.id));
  const staleBaseline = (baseline.entries ?? []).filter((entry: any) => !currentIds.has(entry.id));
  const invalidAnnotations = findings.filter((finding: any) => finding.annotation?.startsWith?.('invalid:'));

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

  if (summary.status !== 'ok') process.exitCode = 1;
}

function isDirectRun() {
  return Boolean(process.argv[1]) && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
}

if (isDirectRun()) runGuard();
