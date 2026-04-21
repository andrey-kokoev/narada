/**
 * Directory and file scaffolding utilities.
 */

import fs from "node:fs";
import path from "node:path";

export function ensureDir(dir: string): boolean {
  if (fs.existsSync(dir)) return false;
  fs.mkdirSync(dir, { recursive: true });
  return true;
}

export function writeIfAbsent(filePath: string, content: string): boolean {
  if (fs.existsSync(filePath)) return false;
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf-8");
  return true;
}

const SAMPLE_PLAYBOOK = `# Sample Support Playbook

Replace this file with your actual operational knowledge.

## Example: Login Issues

When a customer reports they cannot log in:

1. Acknowledge the frustration.
2. Ask which email address they are using.
3. Suggest password reset as the first step.
4. If reset fails, check for account lockout (escalate to engineering).
5. Escalate to security if account appears compromised.

## Escalation Criteria

- Multiple users report the same issue → possible outage.
- Legal or regulatory mention → immediate escalation.
- VIP customer → fast-track to engineering.

## Tone Guidance

- Be empathetic but concise.
- Never promise specific resolution times.
- Always offer clear next steps.
`;

export function scaffoldMailbox(opsRoot: string, mailboxId: string): string[] {
  const base = path.join(opsRoot, "mailboxes", mailboxId);
  const created: string[] = [];
  for (const dir of [
    path.join(base, "scenarios"),
    path.join(base, "knowledge"),
    path.join(base, "notes"),
  ]) {
    if (ensureDir(dir)) created.push(dir);
  }
  const readme = path.join(base, "README.md");
  if (writeIfAbsent(readme, `# ${mailboxId}\n\nMailbox-owned operational material.\n`)) created.push(readme);

  const samplePlaybook = path.join(base, "knowledge", "sample-playbook.md");
  if (writeIfAbsent(samplePlaybook, SAMPLE_PLAYBOOK)) created.push(samplePlaybook);

  return created;
}

export function scaffoldWorkflow(opsRoot: string, workflowId: string): string[] {
  const base = path.join(opsRoot, "workflows", workflowId);
  const created: string[] = [];
  for (const dir of [
    path.join(base, "knowledge"),
    path.join(base, "notes"),
  ]) {
    if (ensureDir(dir)) created.push(dir);
  }
  const readme = path.join(base, "README.md");
  if (writeIfAbsent(readme, `# ${workflowId}\n\nTimer- or workflow-owned operational material.\n`)) created.push(readme);
  return created;
}

export function scaffoldGlobal(opsRoot: string): string[] {
  const created: string[] = [];
  const logs = path.join(opsRoot, "logs");
  if (ensureDir(logs)) created.push(logs);
  return created;
}
