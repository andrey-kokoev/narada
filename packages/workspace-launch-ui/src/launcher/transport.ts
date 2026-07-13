import {
  parseWorkspaceLaunchDashboard,
  parseWorkspaceLaunchResultEnvelope,
  parseWorkspaceLaunchSelectorModel,
} from '@narada2/workspace-launch-contract';
import type {
  WorkspaceLaunchAction,
  WorkspaceLaunchResultEnvelope,
  WorkspaceLaunchSelection,
  WorkspaceLaunchUiDashboard,
  WorkspaceLaunchSelectorModel,
} from '@narada2/workspace-launch-contract';

export interface WorkspaceLaunchTransportOptions {
  basePath?: string;
  fetchImpl?: typeof fetch;
}

export interface WorkspaceLaunchTransportResponse<T> {
  ok: boolean;
  status: number;
  payload: T | null;
}

export interface WorkspaceLaunchTransport {
  readonly basePath: string;
  selectorModel(
    selection: WorkspaceLaunchSelection,
  ): Promise<WorkspaceLaunchTransportResponse<WorkspaceLaunchSelectorModel>>;
  launches(): Promise<WorkspaceLaunchTransportResponse<WorkspaceLaunchUiDashboard>>;
  submit(
    selection: WorkspaceLaunchSelection,
  ): Promise<WorkspaceLaunchTransportResponse<WorkspaceLaunchResultEnvelope>>;
  action(
    launchAttemptId: string,
    action: WorkspaceLaunchAction,
  ): Promise<WorkspaceLaunchTransportResponse<WorkspaceLaunchResultEnvelope>>;
  cancel(): Promise<WorkspaceLaunchTransportResponse<WorkspaceLaunchResultEnvelope>>;
}

export function normalizeWorkspaceLaunchBasePath(value = ''): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '/') return '';
  return '/' + trimmed.replace(/^\/+|\/+$/g, '');
}

function endpoint(basePath: string, path: string): string {
  return basePath + path;
}

async function request<T>(
  fetchImpl: typeof fetch,
  basePath: string,
  path: string,
  init: RequestInit,
  parse: (value: unknown) => T | null,
): Promise<WorkspaceLaunchTransportResponse<T>> {
  const response = await fetchImpl(endpoint(basePath, path), init);
  let raw: unknown = null;
  try {
    raw = await response.json();
  } catch {
    raw = null;
  }
  return {
    ok: response.ok,
    status: response.status,
    payload: parse(raw),
  };
}

export function createWorkspaceLaunchTransport(
  options: WorkspaceLaunchTransportOptions = {},
): WorkspaceLaunchTransport {
  const basePath = normalizeWorkspaceLaunchBasePath(options.basePath);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  return {
    basePath,

    selectorModel(selection) {
      return request(
        fetchImpl,
        basePath,
        '/selector-model',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(selection),
        },
        parseWorkspaceLaunchSelectorModel,
      );
    },

    launches() {
      return request(
        fetchImpl,
        basePath,
        '/launches',
        { method: 'GET' },
        parseWorkspaceLaunchDashboard,
      );
    },

    submit(selection) {
      return request(
        fetchImpl,
        basePath,
        '/submit',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(selection),
        },
        parseWorkspaceLaunchResultEnvelope,
      );
    },

    action(launchAttemptId, action) {
      return request(
        fetchImpl,
        basePath,
        '/launches/' + encodeURIComponent(launchAttemptId) + '/' + encodeURIComponent(action),
        { method: 'POST' },
        parseWorkspaceLaunchResultEnvelope,
      );
    },

    cancel() {
      return request(
        fetchImpl,
        basePath,
        '/cancel',
        { method: 'POST' },
        parseWorkspaceLaunchResultEnvelope,
      );
    },
  };
}
