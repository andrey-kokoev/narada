import type {
  OperatorSurfaceProjection,
  OperatorSurfaceRouteProjection,
  OperatorWorkspaceRouteDirectory,
} from '@narada2/operator-console-contract';

export function renderCloudflareWorkspacePage(
  directory: OperatorWorkspaceRouteDirectory,
  origin: string,
): string {
  const routes = availableRoutes(directory.surfaces);
  const routeMarkup = routes.length > 0
    ? routes.map(({ surface, route }) => `
        <li>
          <a href="${escapeHtml(route.path)}">
            <strong>${escapeHtml(route.label)}</strong>
            <span>${escapeHtml(surface.name)} - ${escapeHtml(route.path)}</span>
          </a>
        </li>`).join('')
    : '<li class="empty">No workspace routes are currently leased to this host.</li>';
  const host = `${directory.workspaceHost.kind}:${directory.workspaceHost.id}`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Narada Cloudflare Workspace</title>
    <style>
      :root { color-scheme: light dark; font-family: system-ui, sans-serif; background: #f6f7f9; color: #20242b; }
      body { max-width: 720px; margin: 0 auto; padding: 48px 24px; }
      main { border: 1px solid #d8dce3; border-radius: 8px; background: #fff; padding: 28px; }
      h1 { margin: 0 0 8px; font-size: 24px; }
      p { color: #606875; line-height: 1.5; }
      ul { display: grid; gap: 8px; padding: 0; list-style: none; }
      li a { display: grid; gap: 4px; border: 1px solid #d8dce3; border-radius: 6px; padding: 12px 14px; color: inherit; text-decoration: none; }
      li a:hover { border-color: #8b94a3; background: #f6f7f9; }
      li span { color: #606875; font-size: 13px; }
      li.empty { color: #606875; padding: 12px 0; }
      code { font-size: 12px; }
      @media (prefers-color-scheme: dark) {
        :root { background: #17191d; color: #f2f4f7; }
        main, li a { border-color: #3b404a; background: #22262d; }
        li a:hover { border-color: #737d8d; background: #2c3139; }
        p, li span, li.empty { color: #aeb6c2; }
      }
    </style>
  </head>
  <body>
    <main>
      <p><code>${escapeHtml(host)}</code></p>
      <h1>Narada Cloudflare Workspace</h1>
      <p>This host is a projection surface. Only routes currently leased to this Cloudflare workspace are available here. Local Narada remains the authority for site registry and runtime state.</p>
      <ul>${routeMarkup}</ul>
      <p><small>${escapeHtml(origin)}</small></p>
    </main>
  </body>
</html>`;
}

function availableRoutes(surfaces: readonly OperatorSurfaceProjection[]): Array<{ surface: OperatorSurfaceProjection; route: OperatorSurfaceRouteProjection }> {
  const seen = new Set<string>();
  const result: Array<{ surface: OperatorSurfaceProjection; route: OperatorSurfaceRouteProjection }> = [];
  for (const surface of surfaces) {
    for (const route of surface.projectedRoutes) {
      if (route.availability !== 'available') continue;
      if (!isLocalRoutePath(route.path)) continue;
      const key = `${surface.id}:${route.id}:${route.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ surface, route });
    }
  }
  return result;
}

function isLocalRoutePath(path: string): boolean {
  return path.startsWith('/')
    && !path.startsWith('//')
    && !path.includes('\\')
    && !/[\u0000-\u001f]/.test(path);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character] ?? character));
}
