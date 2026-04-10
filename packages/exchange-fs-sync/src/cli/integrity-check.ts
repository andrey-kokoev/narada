import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export async function integrityCheckCommand(rootDir: string): Promise<void> {
  const issues: string[] = [];
  const messagesDir = join(rootDir, "messages");
  const viewsDir = join(rootDir, "views");

  try {
    const messageEntries = await readdir(messagesDir);

    for (const entry of messageEntries) {
      const recordPath = join(messagesDir, entry, "record.json");

      try {
        const raw = await readFile(recordPath, "utf8");
        const record = JSON.parse(raw) as {
          body_refs?: Record<string, string>;
          attachment_manifest_ref?: string;
        };

        for (const ref of Object.values(record.body_refs ?? {})) {
          await readFile(join(messagesDir, entry, ref), "utf8");
        }

        if (record.attachment_manifest_ref) {
          await readFile(
            join(messagesDir, entry, record.attachment_manifest_ref),
            "utf8",
          );
        }
      } catch (error) {
        issues.push(`broken message ${entry}: ${String(error)}`);
      }
    }
  } catch (error) {
    issues.push(`messages scan failed: ${String(error)}`);
  }

  try {
    const unreadDir = join(viewsDir, "unread");
    const unreadEntries = await readdir(unreadDir).catch(() => []);

    for (const entry of unreadEntries) {
      const linkPath = join(unreadDir, entry);

      try {
        await lstat(linkPath);
      } catch (error) {
        issues.push(`broken unread link ${entry}: ${String(error)}`);
      }
    }
  } catch (error) {
    issues.push(`views scan failed: ${String(error)}`);
  }

  if (issues.length) {
    for (const issue of issues) {
      process.stderr.write(`${issue}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write("integrity ok\n");
}