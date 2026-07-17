import {
  parseWorkspaceLaunchUiSessionList,
  type WorkspaceLaunchUiSessionList,
} from '@narada2/workspace-launch-contract';

export function parseOperatorConsoleLauncherSessions(value: unknown): WorkspaceLaunchUiSessionList | null {
  const parsed = parseWorkspaceLaunchUiSessionList(value);
  if (!parsed) return null;
  const all = [...parsed.sessions, ...(parsed.history ?? [])];
  const sessions = all.filter((session) => isActiveSession(session));
  const activeIds = new Set(sessions.map((session) => session.ui_session_id));
  const history = all.filter((session) => !isActiveSession(session) && !activeIds.has(session.ui_session_id));
  return { ...parsed, sessions, history };
}

function isActiveSession(session: WorkspaceLaunchUiSessionList['sessions'][number]): boolean {
  return session.status === 'open' || session.status === 'closing';
}
