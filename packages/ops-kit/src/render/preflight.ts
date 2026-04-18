/**
 * Human-readable rendering for preflight output.
 */

import type { ReadinessReport } from "../readiness/types.js";

export function renderPreflight(report: ReadinessReport): string {
  const lines: string[] = [`Target: ${report.target}`, ""];

  const icon =
    report.status === "pass" ? "✓" : report.status === "warn" ? "⚠" : "✗";
  lines.push(`Overall: ${icon} ${report.status.toUpperCase()}`);
  lines.push(
    `  ${report.counts.pass} pass, ${report.counts.fail} fail, ${report.counts.warn} warn`
  );

  lines.push("");
  for (const check of report.checks) {
    const cIcon =
      check.status === "pass" ? "✓" : check.status === "warn" ? "⚠" : "✗";
    lines.push(`${cIcon} [${check.category}] ${check.name}`);
    lines.push(`    ${check.detail}`);
    if (check.remediation) {
      lines.push(`    → ${check.remediation}`);
    }
  }

  if (report.nextActions.length > 0) {
    lines.push("", "Next actions:");
    for (const a of report.nextActions) {
      lines.push(`  • ${a}`);
    }
  }

  return lines.join("\n");
}
