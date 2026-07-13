import {
  parseWorkspaceLaunchUiSessionList,
  type WorkspaceLaunchUiSession,
} from '@narada2/workspace-launch-contract';

export function parseOperatorConsoleLauncherSessions(value: unknown): WorkspaceLaunchUiSession[] | null {
  return parseWorkspaceLaunchUiSessionList(value)?.sessions ?? null;
}
