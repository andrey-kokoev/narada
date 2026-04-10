import { resolve } from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "exchange-fs-sync";

export interface IntegrityOptions {
  config: string;
  verbose?: boolean;
}

interface IntegrityReport {
  status: "ok" | "issues_found";
  checks: {
    cursor: { exists: boolean; valid: boolean; error?: string };
    messages: { count: number; invalid: number; errors: string[] };
    applyLog: { count: number; orphanMarkers: number };
    views: { exists: boolean; folderCount: number };
  };
  summary: string;
}

export async function integrityCommand(options: IntegrityOptions): Promise<void> {
  const configPath = resolve(options.config);
  const config = await loadConfig({ path: configPath });
  const rootDir = resolve(config.root_dir);
  
  const report: IntegrityReport = {
    status: "ok",
    checks: {
      cursor: { exists: false, valid: false },
      messages: { count: 0, invalid: 0, errors: [] },
      applyLog: { count: 0, orphanMarkers: 0 },
      views: { exists: false, folderCount: 0 },
    },
    summary: "",
  };
  
  // Check cursor
  try {
    const cursorPath = join(rootDir, "state", "cursor.json");
    const cursorStat = await stat(cursorPath);
    report.checks.cursor.exists = cursorStat.isFile();
    
    if (report.checks.cursor.exists) {
      const cursorData = JSON.parse(await readFile(cursorPath, "utf8"));
      report.checks.cursor.valid = 
        typeof cursorData.cursor === "string" &&
        typeof cursorData.mailbox_id === "string";
    }
  } catch (err) {
    report.checks.cursor.error = (err as Error).message;
  }
  
  // Check messages
  try {
    const messagesDir = join(rootDir, "messages");
    const entries = await readdir(messagesDir, { withFileTypes: true });
    const messageDirs = entries.filter(e => e.isDirectory());
    report.checks.messages.count = messageDirs.length;
    
    // Sample a few messages for validity
    const sampleSize = Math.min(10, messageDirs.length);
    for (let i = 0; i < sampleSize; i++) {
      try {
        const recordPath = join(messagesDir, messageDirs[i].name, "record.json");
        const record = JSON.parse(await readFile(recordPath, "utf8"));
        if (!record.message_id || !record.mailbox_id) {
          report.checks.messages.invalid++;
          report.checks.messages.errors.push(`Invalid record in ${messageDirs[i].name}`);
        }
      } catch (err) {
        report.checks.messages.invalid++;
        report.checks.messages.errors.push(`Error reading ${messageDirs[i].name}: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    // Directory may not exist yet
  }
  
  // Check apply-log
  try {
    const applyLogDir = join(rootDir, "state", "apply-log");
    const entries = await readdir(applyLogDir);
    report.checks.applyLog.count = entries.filter(e => e.endsWith(".json")).length;
  } catch (err) {
    // Directory may not exist
  }
  
  // Check views
  try {
    const viewsDir = join(rootDir, "views");
    const entries = await readdir(viewsDir, { withFileTypes: true });
    report.checks.views.exists = true;
    report.checks.views.folderCount = entries.filter(e => e.isDirectory()).length;
  } catch (err) {
    // Directory may not exist
  }
  
  // Determine overall status
  if (
    !report.checks.cursor.valid ||
    report.checks.messages.invalid > 0
  ) {
    report.status = "issues_found";
  }
  
  // Generate summary
  const parts: string[] = [];
  parts.push(`Cursor: ${report.checks.cursor.exists ? (report.checks.cursor.valid ? "✓ valid" : "✗ invalid") : "missing"}`);
  parts.push(`Messages: ${report.checks.messages.count} (${report.checks.messages.invalid} invalid)`);
  parts.push(`Apply log: ${report.checks.applyLog.count} events`);
  parts.push(`Views: ${report.checks.views.exists ? `${report.checks.views.folderCount} folders` : "missing"}`);
  report.summary = parts.join(", ");
  
  console.log(JSON.stringify(report, null, 2));
  
  if (report.status === "issues_found") {
    process.exit(1);
  }
}
