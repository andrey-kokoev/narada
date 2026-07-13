import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  primaryOperatorSurfaceRoute,
  projectOperatorSurfaceNavigation,
  projectOperatorSurfaceCatalog,
  type OperatorSurfaceAvailabilityOverrides,
  type OperatorSurfaceProjection,
} from '@narada2/operator-console-contract';

const require = createRequire(import.meta.url);
let sharedUiCssCache: string | undefined;

function sharedUiCss(): string {
  if (sharedUiCssCache !== undefined) return sharedUiCssCache;
  const cssPath = require.resolve('@narada2/ui/styles.css');
  sharedUiCssCache = readFileSync(cssPath, 'utf8').replace(/<\/style/gi, '<\\/style');
  return sharedUiCssCache;
}

function workspaceNavigation(options: OperatorWorkspacePageOptions): string {
  const items = projectOperatorSurfaceNavigation({ availability: options.surfaceAvailability });
  return [
    '<a href="/" aria-current="page">Home</a>',
    ...items.map((item) => `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`),
  ].join('');
}

export interface OperatorWorkspacePageOptions {
  ingressMode: 'diagnostic' | 'router';
  surfaceAvailability: OperatorSurfaceAvailabilityOverrides;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

function surfaceMarkup(surface: OperatorSurfaceProjection): string {
  const route = primaryOperatorSurfaceRoute(surface)?.path;
  const routeMarkup = route ? `<dt>Route</dt><dd><code>${escapeHtml(route)}</code></dd>` : '';
  const nextAction = surface.nextAction ? `<p class="surface-action"><a href="${escapeHtml(surface.nextAction.href)}">${escapeHtml(surface.nextAction.label)}</a></p>` : '';
  const content = `<div class="surface-heading"><h2>${escapeHtml(surface.name)}</h2><span class="status ${surface.availability}">${escapeHtml(surface.availability)}</span></div><dl><dt>Scope</dt><dd>${escapeHtml(surface.scope)}</dd><dt>Owner</dt><dd>${escapeHtml(surface.owner)}</dd>${routeMarkup}</dl><p>${escapeHtml(surface.projectedDetail)}</p>${nextAction}`;
  if (surface.availability === 'available' && route) {
    return `<a class="surface available" href="${escapeHtml(route)}" data-surface-id="${escapeHtml(surface.id)}">${content}</a>`;
  }
  return `<div class="surface ${surface.availability}" data-surface-id="${escapeHtml(surface.id)}">${content}</div>`;
}

export function renderOperatorWorkspacePage(options: OperatorWorkspacePageOptions): string {
  const surfaces = projectOperatorSurfaceCatalog({ availability: options.surfaceAvailability });
  const availableSurfaces = surfaces.filter((surface) => surface.availability === 'available');
  const unavailableSurfaces = surfaces.filter((surface) => surface.availability === 'unavailable');
  const plannedSurfaces = surfaces.filter((surface) => surface.availability === 'planned');
  const sharedUiStyles = sharedUiCss();
  const ingressLabel = options.ingressMode === 'diagnostic' ? 'Direct diagnostic host' : 'Operator Router host';
  const availableMarkup = availableSurfaces.length
    ? availableSurfaces.map(surfaceMarkup).join('')
    : '<p class="empty">No surfaces are currently available.</p>';
  const unavailableMarkup = unavailableSurfaces.map(surfaceMarkup).join('');
  const plannedMarkup = plannedSurfaces.map(surfaceMarkup).join('');
  const navigationMarkup = workspaceNavigation(options);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Narada Operator Workspace</title>
  <style data-narada-ui-foundation>${sharedUiStyles}</style>
  <style data-narada-operator-workspace>
    body { min-width: 320px; }
    .bar { min-height: 64px; display: flex; align-items: center; gap: 18px; padding: 12px 20px; background: var(--surface); color: var(--text); border-bottom: 1px solid var(--line); }
    .bar h1 { margin: 0; font-size: 18px; font-weight: 650; } .bar p { margin: 3px 0 0; color: var(--muted); font-size: 13px; } .spacer { flex: 1; } .posture { color: var(--muted); border: 1px solid var(--line); border-radius: var(--radius); padding: 5px 8px; font-size: 11px; white-space: nowrap; }
    .workspace-nav { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; } .workspace-nav a { color: var(--muted); text-decoration: none; padding: 5px 8px; border: 1px solid transparent; border-radius: var(--radius); font-size: 12px; } .workspace-nav a:hover, .workspace-nav a[aria-current="page"] { color: var(--text); border-color: var(--line-strong); background: var(--surface-muted); }
    main { max-width: 1180px; margin: 0 auto; padding: 24px 20px 40px; } .intro { margin-bottom: 18px; } .intro h2 { margin: 0; font-size: 15px; font-weight: 650; } .intro p { margin: 5px 0 0; color: var(--muted); font-size: 13px; } .surface-section { margin-top: 24px; } .surface-section:first-child { margin-top: 0; } .section-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px; } .section-head h2 { margin: 0; font-size: 15px; font-weight: 650; } .section-head p { margin: 0; color: var(--muted); font-size: 12px; }
    .surface-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .surface { display: block; min-width: 0; padding: 16px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); color: var(--text); text-decoration: none; } .surface.available:hover { border-color: var(--operator); background: var(--surface-muted); } .surface.unavailable, .surface.planned { color: var(--muted); background: var(--surface-muted); }
    .surface-heading { display: flex; align-items: center; gap: 10px; justify-content: space-between; } .surface h2 { margin: 0; font-size: 15px; font-weight: 650; } .status { flex: 0 0 auto; padding: 3px 7px; border-radius: calc(var(--radius) - 2px); font-size: 11px; text-transform: uppercase; letter-spacing: .04em; } .status.available { color: var(--operator); background: var(--activity-chip-bg); } .status.unavailable, .status.planned { color: var(--muted); background: var(--control-bg); }
    dl { display: grid; grid-template-columns: 80px minmax(0, 1fr); gap: 6px 12px; margin: 16px 0 0; font-size: 12px; } dt { color: var(--muted); } dd { margin: 0; overflow-wrap: anywhere; } code { font: 12px/1.4 var(--mono); }
    .surface p { margin: 16px 0 0; color: var(--muted); font-size: 13px; line-height: 1.4; } .surface.available p { color: var(--text); } .surface-action a { color: var(--operator); font-weight: 600; text-decoration: none; } .surface-action a:hover { text-decoration: underline; } .empty { padding: 16px; border: 1px dashed var(--line); color: var(--muted); font-size: 13px; }
    @media (max-width: 760px) { .bar { align-items: flex-start; flex-wrap: wrap; } .spacer { display: none; } main { padding: 18px 12px 28px; } .surface-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body data-narada-surface="operator-workspace">
  <header class="bar"><div><h1>Operator Workspace</h1><p>Choose the next governed surface</p></div><nav class="workspace-nav" aria-label="Operator workspace">${navigationMarkup}</nav><span class="posture">${escapeHtml(ingressLabel)}</span><div class="spacer"></div></header>
  <main>
    <div class="intro"><h2>Surfaces</h2><p>Only available surfaces are links. Future surfaces show their next valid handoff.</p></div>
    <section class="surface-section"><div class="section-head"><h2>Available</h2><p>Ready from this host</p></div><div class="surface-grid">${availableMarkup}</div></section>
    ${unavailableMarkup ? `<section class="surface-section"><div class="section-head"><h2>Unavailable</h2><p>Not currently reachable</p></div><div class="surface-grid">${unavailableMarkup}</div></section>` : ''}
    ${plannedMarkup ? `<section class="surface-section"><div class="section-head"><h2>Not available yet</h2><p>Planned next-level projections</p></div><div class="surface-grid">${plannedMarkup}</div></section>` : ''}
  </main>
</body>
</html>`;
}
