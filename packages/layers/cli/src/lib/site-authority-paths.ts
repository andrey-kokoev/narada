import { join } from 'node:path';
import { siteAuthorityRootFromSiteRoot } from '@narada2/site-paths';

export function siteAuthorityRootForRoot(root: string): string {
  return siteAuthorityRootFromSiteRoot(root);
}

export function coordinatorDbPathForRoot(root: string): string {
  return join(siteAuthorityRootForRoot(root), 'coordinator.db');
}
