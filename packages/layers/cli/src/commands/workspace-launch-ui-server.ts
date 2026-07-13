import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { dirname, extname, resolve, sep } from 'node:path';

const requireFromWorkspaceLaunchUiServer = createRequire(import.meta.url);

export interface WorkspaceLaunchUiPortPolicy {
  port: number;
  fallbackToEphemeral: boolean;
  source: 'default' | 'config' | 'explicit';
}

export interface WorkspaceLaunchUiAsset {
  body: Buffer;
  contentType: string;
}

export interface WorkspaceLaunchUiResponse {
  status: number;
  payload: unknown;
  close?: boolean;
  afterSend?: () => void | Promise<void>;
}

export type WorkspaceLaunchUiAction =
  | 'recheck'
  | 'retry'
  | 'forget'
  | 'open-web-ui'
  | 'attach-cli'
  | 'stop-runtime'
  | 'stop-projection';

export interface WorkspaceLaunchUiController {
  page: () => string | Promise<string>;
  asset?: (pathname: string) => WorkspaceLaunchUiAsset | null;
  selectorModel?: (payload: unknown) => unknown | Promise<unknown>;
  dashboard?: () => unknown | Promise<unknown>;
  submit?: (payload: unknown) => WorkspaceLaunchUiResponse | Promise<WorkspaceLaunchUiResponse>;
  action?: (launchAttemptId: string, action: WorkspaceLaunchUiAction) => WorkspaceLaunchUiResponse | Promise<WorkspaceLaunchUiResponse>;
  cancel?: () => WorkspaceLaunchUiResponse | Promise<WorkspaceLaunchUiResponse>;
}

function jsonResponse(res: ServerResponse, status: number, payload: unknown, options: { close?: boolean } = {}): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    ...(options.close ? { Connection: 'close' } : {}),
  });
  res.end(body);
}

function textResponse(res: ServerResponse, body: string): void {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function assetResponse(res: ServerResponse, asset: WorkspaceLaunchUiAsset): void {
  res.writeHead(200, {
    'Content-Type': asset.contentType,
    'Content-Length': asset.body.byteLength,
  });
  res.end(asset.body);
}

async function controllerResponse(res: ServerResponse, response: WorkspaceLaunchUiResponse): Promise<void> {
  jsonResponse(res, response.status, response.payload, { close: response.close });
  await response.afterSend?.();
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

export function createWorkspaceLaunchUiServer(controller: WorkspaceLaunchUiController): Server {
  return createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1:0'}`);

      if (req.method === 'GET' && url.pathname === '/') {
        textResponse(res, await controller.page());
        return;
      }

      if (req.method === 'GET' && controller.asset) {
        const asset = controller.asset(url.pathname);
        if (asset) {
          assetResponse(res, asset);
          return;
        }
      }

      if (req.method === 'GET' && url.pathname === '/launches' && controller.dashboard) {
        jsonResponse(res, 200, await controller.dashboard());
        return;
      }

      if (req.method === 'POST' && url.pathname === '/selector-model' && controller.selectorModel) {
        jsonResponse(res, 200, await controller.selectorModel(await readJsonBody(req)));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/submit' && controller.submit) {
        const response = await controller.submit(await readJsonBody(req));
        await controllerResponse(res, response);
        return;
      }

      const launchAction = url.pathname.match(/^\/launches\/([^/]+)\/(recheck|retry|forget|open-web-ui|attach-cli|stop-runtime|stop-projection)$/);
      if (req.method === 'POST' && launchAction && controller.action) {
        const [, launchAttemptId, action] = launchAction;
        const response = await controller.action(launchAttemptId, action as WorkspaceLaunchUiAction);
        await controllerResponse(res, response);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/cancel' && controller.cancel) {
        const response = await controller.cancel();
        await controllerResponse(res, response);
        return;
      }

      jsonResponse(res, 404, { error: 'not_found' });
    })().catch((error) => {
      if (!res.headersSent) jsonResponse(res, 500, { error: error instanceof Error ? error.message : String(error) });
    });
  });
}

export function readWorkspaceLaunchUiAsset(pathname: string): WorkspaceLaunchUiAsset | null {
  if (!pathname.startsWith('/assets/')) return null;
  const relativePath = pathname.slice('/assets/'.length);
  if (!relativePath || relativePath.includes('..') || !/^[A-Za-z0-9._/-]+$/.test(relativePath)) return null;
  const indexPath = requireFromWorkspaceLaunchUiServer.resolve('@narada2/workspace-launch-ui/dist/index.html');
  const assetsRoot = resolve(dirname(indexPath), 'assets');
  const assetPath = resolve(assetsRoot, relativePath);
  if (assetPath !== assetsRoot && !assetPath.startsWith(`${assetsRoot}${sep}`)) return null;
  try {
    const extension = extname(assetPath).toLowerCase();
    const contentType = extension === '.css'
      ? 'text/css; charset=utf-8'
      : extension === '.js'
        ? 'text/javascript; charset=utf-8'
        : 'application/octet-stream';
    return { body: readFileSync(assetPath), contentType };
  } catch {
    return null;
  }
}

export async function closeWorkspaceLaunchUiServer(server: Server | null): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolveClose) => {
    server.close(() => resolveClose());
    server.closeAllConnections?.();
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function workspaceLaunchUiPortProbeUrl(host: string, port: number): string {
  return `http://${host}:${port}`;
}

async function probeWorkspaceLaunchUiSession(url: string): Promise<{ active: boolean; detail: string | null }> {
  const probes = [`${url}/launches`, `${url}/`];
  for (const probeUrl of probes) {
    try {
      const response = await fetch(probeUrl);
      if (!response.ok) continue;
      if (probeUrl.endsWith('/launches')) {
        const payload = await response.json().catch(() => null);
        if (isRecord(payload) && payload.schema === 'narada.workspace_launch.ui_session_state.v1') {
          const uiSession = isRecord(payload.ui_session) ? payload.ui_session : null;
          return { active: true, detail: typeof uiSession?.ui_session_id === 'string' ? uiSession.ui_session_id : null };
        }
      } else {
        const text = await response.text();
        if (text.includes('Narada Workspace Launch')) {
          return { active: true, detail: null };
        }
      }
    } catch {
      // Ignore transport failures and continue probing.
    }
  }
  return { active: false, detail: null };
}

export async function listenWorkspaceLaunchUiServer(
  server: Server,
  host: string,
  policy: WorkspaceLaunchUiPortPolicy,
): Promise<{ port: number; url: string; fallback_used: boolean }> {
  const bind = async (port: number): Promise<number> => new Promise<number>((resolvePort, rejectPort) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.off('listening', onListening);
      rejectPort(error);
    };
    const onListening = () => {
      server.off('error', onError);
      const address = server.address();
      const actualPort = typeof address === 'object' && address !== null ? address.port : port;
      resolvePort(actualPort);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });

  try {
    const port = await bind(policy.port);
    return { port, url: workspaceLaunchUiPortProbeUrl(host, port), fallback_used: false };
  } catch (error) {
    const errno = isRecord(error) && typeof error.code === 'string' ? error.code : null;
    if (errno !== 'EADDRINUSE') throw error;
    const occupiedUrl = workspaceLaunchUiPortProbeUrl(host, policy.port);
    const probe = await probeWorkspaceLaunchUiSession(occupiedUrl);
    if (policy.fallbackToEphemeral) {
      const port = await bind(0);
      return { port, url: workspaceLaunchUiPortProbeUrl(host, port), fallback_used: true };
    }
    if (probe.active) {
      throw new Error(`launcher_ui_port_in_use: ${occupiedUrl} is already serving an active Narada Workspace Launch session${probe.detail ? ` (${probe.detail})` : ''}. Use --launcher-ui-port-fallback to allow an ephemeral fallback port.`);
    }
    throw new Error(`launcher_ui_port_in_use: ${occupiedUrl} is already occupied. Use --launcher-ui-port-fallback to allow an ephemeral fallback port or choose a different --launcher-ui-port.`);
  }
}
