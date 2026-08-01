#!/usr/bin/env node
/**
 * lint-ps1.ts — Run PSScriptAnalyzer against project PS1 files.
 *
 * Usage:
 *   node lint-ps1.ts [--json] [--sarif]
 *
 * Excludes:
 *   - node_modules, .git, .ai/tmp, tombstones, vendor/.venv
 *   - Test-*.ps1 in operator-surface-carriers (migrated wrappers)
 *
 * Exit codes:
 *   0 — no Error severity findings
 *   1 — Error severity findings present (or invocation failure)
 */

import { resolve, relative, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { runGovernedCommand } from '@narada-core/process-launch-posture';

const __dirname: any = dirname(fileURLToPath(import.meta.url));

function findProjectRoot() : any {
  let dir: any = resolve(__dirname, '..', '..');
  while (dir !== dirname(dir)) {
    if (existsSync(resolve(dir, 'PSScriptAnalyzerSettings.psd1'))) {
      return dir;
    }
    dir = dirname(dir);
  }
  return resolve(__dirname, '..', '..');
}

const cwd: any = findProjectRoot();
const settingsPath: any = resolve(cwd, 'PSScriptAnalyzerSettings.psd1');

function runPwsh(script: any) : any {
  return new Promise((res, rej)  => {
    const proc: any = runGovernedCommand('pwsh', ['-NoProfile', '-Command', script], { cwd });
    let out: any = '';
    let err: any = '';
    proc.stdout.on('data', (d: any) : any => { out += d.toString(); });
    proc.stderr.on('data', (d: any) : any => { err += d.toString(); });
    proc.on('close', (code: any) : any => {
      res({ code, out, err });
    });
  });
}

async function main() : Promise<any> {
  const args: any = process.argv.slice(2);
  const asJson: any = args.includes('--json');
  const asSarif: any = args.includes('--sarif');
  const fileArgIdx: any = args.findIndex((a: any) : any => a === '--file');
  const singleFile: any = fileArgIdx >= 0 ? args[fileArgIdx + 1] : null;

  const settingsArg: any = existsSync(settingsPath) ? `-Settings "${settingsPath}"` : '';

  let psScript: any;
  if (singleFile) {
    const filePath: any = resolve(cwd, singleFile).replace(/\\/g, '\\');
    psScript = `
      $file = "${filePath}";
      $allFindings = @();
      $results = Invoke-ScriptAnalyzer -Path $file ${settingsArg} -Severity Error,Warning;
      if ($results) {
        foreach ($r in $results) {
          $allFindings += @{
            file = [System.IO.Path]::GetRelativePath("${cwd}", $file).Replace("\\", "/");
            rule = $r.RuleName;
            severity = $r.Severity.ToString();
            line = $r.Line;
            message = $r.Message;
          };
        }
      }
      @{ files_scanned = 1; findings = $allFindings } | ConvertTo-Json -Depth 5 -Compress
    `.trim();
  } else {
    psScript = `
      $excludePaths = @('node_modules', '.git', '.ai\\tmp', 'tombstones', 'vendor\\yasb\\.venv');
      $excludeFiles = @('operator-surface-carriers\\Test-*.ps1');
      $files = Get-ChildItem -Path "${cwd}" -Recurse -Filter '*.ps1' -ErrorAction SilentlyContinue | Where-Object {
        $f = $_.FullName;
        foreach ($p in $excludePaths) { if ($f -like "*$p*") { return $false } }
        foreach ($p in $excludeFiles) { if ($f -like "*$p") { return $false } }
        $true
      } | Select-Object -ExpandProperty FullName | Sort-Object;

      $allFindings = @();
      foreach ($file in $files) {
        $results = Invoke-ScriptAnalyzer -Path $file ${settingsArg} -Severity Error,Warning;
        if ($results) {
          foreach ($r in $results) {
            $allFindings += @{
              file = [System.IO.Path]::GetRelativePath("${cwd}", $file).Replace("\\", "/");
              rule = $r.RuleName;
              severity = $r.Severity.ToString();
              line = $r.Line;
              message = $r.Message;
            };
          }
        }
      }

      @{ files_scanned = $files.Count; findings = $allFindings } | ConvertTo-Json -Depth 5 -Compress
    `.trim();
  }

  const { code, out, err }: any = await runPwsh(psScript);

  if (code !== 0 && err.trim()) {
    console.error(JSON.stringify({ status: 'error', error: err.trim() }));
    process.exit(1);
  }

  let data: any;
  try {
    data = JSON.parse(out);
  } catch (e: any) {
    console.error(JSON.stringify({ status: 'error', error: `JSON parse failed: ${e.message}`, stdout: out, stderr: err }));
    process.exit(1);
  }

  const findings: any = Array.isArray(data.findings) ? data.findings : [];
  const errorCount: any = findings.filter((f: any )=> f.severity === 'Error').length;
  const warningCount: any = findings.filter((f: any )=> f.severity === 'Warning').length;

  if (asSarif) {
    const sarif: any = buildSarif(findings);
    console.log(JSON.stringify(sarif, null, 2));
  } else if (asJson) {
    console.log(JSON.stringify({
      schema: 'narada.lint.ps1.v0',
      files_scanned: data.files_scanned ?? 0,
      error_count: errorCount,
      warning_count: warningCount,
      findings,
    }, null, 2));
  } else {
    console.log(`Scanned ${data.files_scanned ?? 0} PS1 files.`);
    if (errorCount === 0 && warningCount === 0) {
      console.log('No issues found.');
    } else {
      for (const f of findings) {
        const prefix: any = f.severity === 'Error' ? 'ERROR' : 'WARN';
        console.log(`${prefix}: ${f.file}:${f.line} — ${f.rule}: ${f.message}`);
      }
      console.log(`\n${errorCount} error(s), ${warningCount} warning(s).`);
    }
  }

  process.exit(errorCount > 0 ? 1 : 0);
}

function buildSarif(findings: any) : any {
  const rules: any = new Map();
  const results: any = [];

  for (const f of findings) {
    if (!rules.has(f.rule)) {
      rules.set(f.rule, { id: f.rule, name: f.rule });
    }
    results.push({
      ruleId: f.rule,
      level: f.severity === 'Error' ? 'error' : 'warning',
      message: { text: f.message },
      locations: [{
        physicalLocation: {
          artifactLocation: { uri: f.file },
          region: { startLine: f.line },
        },
      }],
    });
  }

  return {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: { driver: { name: 'PSScriptAnalyzer', rules: Array.from(rules.values()) } },
      results,
    }],
  };
}

main().catch((e) : any => {
  console.error(JSON.stringify({ status: 'error', error: e.message, stack: e.stack }));
  process.exit(1);
});
