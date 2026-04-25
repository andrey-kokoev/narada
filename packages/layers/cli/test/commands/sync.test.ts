import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { resolveSingleScopeSyncRoot } from '../../src/commands/sync.js';
import type { ScopeConfig } from '@narada2/control-plane';

function makeScope(rootDir: string): ScopeConfig {
  return {
    scope_id: 'help-global-maxima',
    root_dir: rootDir,
    sources: [{ type: 'graph' }],
    context_strategy: 'mail',
    scope: {
      included_container_refs: ['inbox', 'sentitems'],
      included_item_kinds: ['message'],
    },
    normalize: {
      attachment_policy: 'metadata_only',
      body_policy: 'text_only',
      include_headers: false,
      tombstones_enabled: true,
    },
    runtime: {
      polling_interval_ms: 60000,
      acquire_lock_timeout_ms: 30000,
      cleanup_tmp_on_startup: true,
      rebuild_views_after_sync: false,
      rebuild_search_after_sync: false,
    },
    policy: {
      primary_charter: 'support_steward',
      allowed_actions: ['draft_reply'],
    },
  };
}

describe('sync command', () => {
  it('persists single-scope sync state under the scope root_dir', () => {
    const scope = makeScope('/tmp/site-root/help-global-maxima');

    expect(resolveSingleScopeSyncRoot(scope)).toBe(
      resolve('/tmp/site-root/help-global-maxima'),
    );
  });
});
