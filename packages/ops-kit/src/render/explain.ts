import type { ReadinessReport } from "../readiness/types.js";

export function renderExplain(report: ReadinessReport): string {
  const lines = [`Target: ${report.target}`, `Status: ${report.status}`];
  for (const check of report.checks) {
    lines.push(`- [${check.status}] ${check.category}: ${check.name} — ${check.detail}`);
    if (check.remediation) lines.push(`  remediation: ${check.remediation}`);
  }
  if (report.nextActions.length > 0) {
    lines.push("Next actions:");
    for (const action of report.nextActions) lines.push(`- ${action}`);
  }
  return lines.join("\n");
}
