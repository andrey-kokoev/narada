#!/usr/bin/env node
import { buildSiteTarget, buildUserTarget, loadPolicy } from './policy.js';
import { runHistoryDaemon } from './daemon.js';

const args = process.argv.slice(2);
const siteRoot = value('--site-root');
const userSiteRoot = value('--user-site-root');
const workspaceRoot = value('--root');
const siteId = value('--site-id');
const once = args.includes('--once');

if (!siteRoot && !(userSiteRoot && workspaceRoot)) {
  throw new Error('history_daemon_target_required');
}

const target = siteRoot
  ? buildSiteTarget({ siteRoot, siteId })
  : buildUserTarget({ userSiteRoot: userSiteRoot as string, workspaceRoot: workspaceRoot as string });
const policy = await loadPolicy(target);
if (!policy) throw new Error('local_history_policy_missing');
await runHistoryDaemon({ target, policy, once });

function value(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
