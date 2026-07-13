import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let sharedUiCssCache: string | undefined;

function sharedUiCss(): string {
  if (sharedUiCssCache !== undefined) return sharedUiCssCache;
  const cssPath = require.resolve('@narada2/ui/styles.css');
  sharedUiCssCache = readFileSync(cssPath, 'utf8').replace(/<\/style/gi, '<\\/style');
  return sharedUiCssCache;
}

export type SiteRegistryPageMode = 'list' | 'add' | 'manage';

export function renderSiteRegistryPage(mode: SiteRegistryPageMode = 'list'): string {
  const sharedUiStyles = sharedUiCss();
  const isListPage = mode === 'list';
  const isAddPage = mode === 'add';
  const pageTitle = isListPage ? 'Site Registry' : isAddPage ? 'Add Site' : 'Registry Changes';
  const pageDescription = isListPage
    ? 'Canonical user-site inventory'
    : isAddPage
      ? 'Register a new Site in the canonical inventory'
      : 'Plan and confirm governed registry changes';
  const changeTitle = isAddPage ? 'Add Site' : 'Registry Change';
  const changeHelp = isAddPage
    ? 'Start with the Site ID and root folder. Choose the Site variant if it is not a native Windows Site; optional details can be added below. Preview does not change the registry.'
    : 'Choose a registry change. Planning never changes the registry; applying requires explicit confirmation.';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Narada Site Registry</title>
  <style data-narada-ui-foundation>${sharedUiStyles}</style>
  <style data-narada-site-registry>
    [hidden] { display: none !important; }
    body { min-width: 320px; }
    body[data-page-mode="add"] main, body[data-page-mode="manage"] main { grid-template-columns: minmax(0, 1000px); justify-content: center; }
    body[data-page-mode="list"] #registry-change-panel { display: none; }
    body[data-page-mode="add"] #site-inventory-panel, body[data-page-mode="add"] #record-detail-panel, body[data-page-mode="add"] #discovery-panel { display: none; }
    body[data-page-mode="manage"] #site-inventory-panel, body[data-page-mode="manage"] #record-detail-panel, body[data-page-mode="manage"] #discovery-panel { display: none; }
    body[data-page-mode="add"] #operation-field, body[data-page-mode="add"] #existing-site-field { display: none !important; }
    .bar { min-height: 56px; display: flex; align-items: center; gap: 16px; padding: 10px 20px; background: var(--text); color: var(--surface); }
    .bar h1 { margin: 0; font-size: 17px; font-weight: 650; } .bar p { margin: 0; color: var(--muted); font-size: 13px; } .spacer { flex: 1; }
    .workspace-nav { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
    .workspace-nav a { color: inherit; text-decoration: none; padding: 5px 8px; border: 1px solid transparent; border-radius: var(--radius); font-size: 12px; white-space: nowrap; }
    .workspace-nav a:hover, .workspace-nav a[aria-current="page"] { border-color: currentColor; background: color-mix(in srgb, currentColor 10%, transparent); }
    @media (prefers-color-scheme: dark) { .bar { background: var(--surface-muted); color: var(--text); } .bar p { color: var(--muted); } }
    button { border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--surface); color: var(--text); padding: 7px 10px; cursor: pointer; } button:hover { background: var(--surface-muted); } button:disabled { cursor: not-allowed; opacity: .55; } button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, summary:focus-visible { outline: 3px solid var(--focus-ring); outline-offset: 2px; }
    main { display: grid; grid-template-columns: minmax(360px, 1fr) minmax(360px, 1fr); gap: 16px; padding: 16px; max-width: 1600px; margin: 0 auto; }
    section { min-width: 0; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); } .wide { grid-column: 1 / -1; }
    .section-head { display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 10px 14px; border-bottom: 1px solid var(--line); } .section-head h2 { margin: 0; font-size: 15px; font-weight: 650; } .count { color: var(--muted); font-size: 13px; }
    .content { padding: 14px; } .table-wrap { overflow-x: auto; } table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 13px; } .table-wrap table { min-width: 620px; } th, td { padding: 9px 8px; text-align: left; border-bottom: 1px solid var(--line); vertical-align: top; overflow-wrap: anywhere; } th { color: var(--muted); font-size: 11px; font-weight: 650; text-transform: uppercase; letter-spacing: .04em; } tbody tr { cursor: pointer; } tbody tr:hover, tbody tr[aria-selected="true"] { background: var(--activity-bg); }
    .state { display: inline-flex; max-width: 100%; padding: 2px 6px; border-radius: calc(var(--radius) - 4px); font-size: 12px; line-height: 1.3; } .active, .present { color: var(--operator); background: var(--activity-chip-bg); } .retired, .missing, .conflicted { color: var(--error); background: color-mix(in srgb, var(--error) 10%, var(--surface)); } .stale, .unverified { color: var(--warning); background: var(--accent-soft); }
    dl { margin: 0; display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 9px 14px; font-size: 13px; } dt { color: var(--muted); } dd { margin: 0; overflow-wrap: anywhere; } .list { margin: 0; padding-left: 18px; } .list li { margin: 0 0 6px; }
    .empty, .error { color: var(--muted); font-size: 14px; padding: 22px 6px; } .error { color: var(--error); } pre { margin: 0; padding: 12px; max-height: 300px; overflow: auto; background: var(--code-bg); border: 1px solid var(--line); border-radius: calc(var(--radius) - 2px); color: var(--code-text); font: 12px/1.45 var(--mono); white-space: pre-wrap; overflow-wrap: anywhere; }
    .form-section { min-width: 0; border: 0; padding: 0; margin: 0 0 18px; } .form-section legend { padding: 0; color: var(--text); font-size: 14px; font-weight: 650; } .section-help { margin: 4px 0 10px; color: var(--muted); font-size: 12px; line-height: 1.4; }
    .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 14px; } .picker-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px 14px; margin-bottom: 12px; }
    .field { display: grid; align-content: start; gap: 5px; font-size: 13px; color: var(--text); } .field input, .field select, .field textarea { width: 100%; min-height: 34px; border: 1px solid var(--line-strong); border-radius: calc(var(--radius) - 2px); padding: 6px 8px; color: var(--text); background: var(--control-bg); } .field input[readonly] { background: var(--surface-muted); color: var(--muted); } .field textarea { min-height: 88px; resize: vertical; } .field input[aria-invalid="true"], .field select[aria-invalid="true"], .field textarea[aria-invalid="true"] { border-color: var(--error); outline: 2px solid var(--accent-soft); }
    .help, .field small { color: var(--muted); font-size: 12px; line-height: 1.35; } .workflow-note { margin: 0 0 14px; padding: 10px 12px; color: var(--text); background: var(--activity-bg); border-left: 3px solid var(--operator); font-size: 13px; line-height: 1.4; } .field-error { min-height: 0; color: var(--error); font-size: 12px; } .validation { margin: 0 0 12px; color: var(--error); font-size: 13px; } .validation ul { margin: 0; padding-left: 20px; } .required-marker { color: var(--error); font-weight: 700; } .clear-toggle { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; } .clear-toggle input { min-height: auto; width: auto; } .draft-state.dirty { color: var(--error); font-weight: 650; }
    .span-2, .span-3 { grid-column: 1 / -1; } .advanced { grid-column: 1 / -1; margin-top: 12px; border-top: 1px solid var(--line); padding-top: 10px; } .advanced summary { cursor: pointer; color: var(--text); font-size: 13px; font-weight: 650; } .advanced .field { margin-top: 10px; }
    .actions { display: grid; gap: 12px; margin-top: 14px; } .primary-actions, .apply-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; } .apply-actions { border-top: 1px solid var(--line); padding-top: 12px; } .primary-actions #plan, .apply-actions #apply { border-color: var(--button-border); background: var(--button-border); color: var(--button-text); } .confirmation { display: flex; align-items: center; gap: 7px; font-size: 13px; color: var(--text); } .confirmation input { margin: 0; } .danger-note { color: var(--error); font-size: 12px; line-height: 1.35; } .purge-confirm { flex: 1 1 260px; min-width: 240px; }
    .preview-status { display: flex; align-items: baseline; gap: 8px; margin-bottom: 12px; } .preview-status strong { font-size: 14px; } .preview-status span { color: var(--muted); font-size: 12px; } .preview-heading { margin: 14px 0 7px; font-size: 13px; } .preview-table { table-layout: auto; } .preview-table th, .preview-table td { white-space: normal; } .preview-table td:first-child { width: 23%; color: var(--muted); } .preview-list { margin: 0; padding-left: 20px; font-size: 13px; } .preview-list li { margin-bottom: 5px; } .discovery-summary { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 12px; color: var(--muted); font-size: 13px; } .discovery-table { table-layout: auto; } .discovery-table td:last-child { width: 110px; } details.technical { margin-top: 14px; } details.technical summary { cursor: pointer; color: var(--muted); font-size: 12px; }
    @media (max-width: 900px) { main { grid-template-columns: 1fr; padding: 10px; } .wide { grid-column: auto; } .bar { align-items: flex-start; flex-wrap: wrap; } .spacer { display: none; } .form-grid, .picker-row { grid-template-columns: 1fr; } .span-2, .span-3 { grid-column: auto; } .table-wrap table { min-width: 0; } #site-list table th:nth-child(4), #site-list table td:nth-child(4), #site-list table th:nth-child(5), #site-list table td:nth-child(5), .discovery-table th:nth-child(3), .discovery-table td:nth-child(3) { display: none; } }
  </style>
</head>
<body data-page-mode="${mode}">
  <header class="bar"><div><h1>${pageTitle}</h1><p>${pageDescription}</p></div><nav class="workspace-nav" aria-label="Operator workspace"><a href="/">Home</a><a href="/console/registry"${isListPage ? ' aria-current="page"' : ''}>Sites</a><a href="/console/registry/add"${isAddPage ? ' aria-current="page"' : ''}>Add Site</a><a href="/console/registry/manage"${mode === 'manage' ? ' aria-current="page"' : ''}>Manage</a></nav><div class="spacer"></div><button id="refresh" type="button"${isListPage ? '' : ' hidden'}>Refresh</button><button id="discover" type="button"${isListPage ? '' : ' hidden'}>Preview Discovery</button></header>
  <main>
    <section id="site-inventory-panel"><div class="section-head"><h2>Sites</h2><span id="count" class="count"></span></div><div class="content" id="site-list"><p class="empty">Loading registry...</p></div></section>
    <section id="record-detail-panel"><div class="section-head"><h2>Record Detail</h2></div><div class="content" id="detail"><p class="empty">Select a Site to inspect its canonical record.</p></div></section>
    <section id="registry-change-panel" class="wide"><div class="section-head"><h2>${changeTitle}</h2><span id="operation-summary" class="count">Choose an operation</span><span id="draft-state" class="count draft-state" aria-live="polite">No unsaved changes</span></div><div class="content">
      <p id="operation-help" class="workflow-note">${changeHelp}</p>
      <form id="mutation-form" aria-describedby="operation-help">
        <div id="existing-site-field" class="picker-row" data-field hidden>
          <label class="field"><span>Find an existing Site</span><input id="existing-site-search" type="search" autocomplete="off" placeholder="Filter by ID, root, or alias" aria-describedby="existing-site-help"><select id="existing-site" aria-describedby="existing-site-help"><option value="">Choose a Site...</option></select><small id="existing-site-help">Optional for Add. Filter by canonical ID, root, or alias, then choose the Site you want to edit or change state.</small><span id="existing-site-error" class="field-error"></span></label>
          <label class="field"><span>Registry reference</span><input id="reference" readonly autocomplete="off" placeholder="Choose an existing Site" aria-describedby="reference-help"><small id="reference-help">This is filled from the selected Site and is used to identify the record.</small><span id="reference-error" class="field-error"></span></label>
        </div>
        <div id="validation" class="validation" role="alert" aria-live="polite"></div>
        <fieldset class="form-section" id="identity-section"><legend>Site identity</legend><div class="form-grid">
          <label id="operation-field" class="field" data-field><span>Operation</span><select id="operation" name="operation" aria-describedby="operation-help operation-error"><option value="add">Add a new Site</option><option value="edit">Edit Site metadata</option><option value="retire">Retire a Site</option><option value="restore">Restore a retired Site</option><option value="purge">Purge retired metadata</option></select><small>Choose the intended registry change, not the implementation command.</small><span id="operation-error" class="field-error" aria-live="polite"></span></label>
          <label id="site-id-field" class="field" data-field><span>Canonical Site ID</span><input id="site-id" name="site_id" autocomplete="off" placeholder="my-site" pattern="[A-Za-z0-9][A-Za-z0-9._\\-]*" title="Use letters, numbers, dots, underscores, or hyphens; start with a letter or number." required aria-describedby="site-id-help site-id-error"><small id="site-id-help">Stable name used by Narada. Example: <code>smart-scheduling</code>.</small><span id="site-id-error" class="field-error" aria-live="polite"></span></label>
          <label id="root-field" class="field span-2" data-field><span>Site root folder</span><input id="root" name="site_root" autocomplete="off" placeholder="D:/code/my-site" required aria-describedby="root-help root-error"><small id="root-help">Choose the Site variant first. The example updates for Windows, WSL, and Linux.</small><span id="root-error" class="field-error" aria-live="polite"></span></label>
        </div></fieldset>
        <fieldset class="form-section" id="registration-section"><legend>Registration details</legend><p class="section-help">Optional details help explain how the Site was found and how it runs. Leave them blank when you do not know them.</p><div class="form-grid">
          <label id="reason-field" class="field" data-field><span>Reason</span><input id="reason" name="reason" autocomplete="off" placeholder="e.g. moved to a new folder" aria-describedby="reason-help reason-error"><small id="reason-help">Short operator-facing reason recorded with the change.</small><span id="reason-error" class="field-error" aria-live="polite"></span></label>
          <label id="variant-field" class="field" data-field><span>Site variant</span><select id="variant" name="variant" aria-describedby="variant-help variant-error"><option value="">Leave unchanged</option><option value="native">Native Windows</option><option value="wsl">WSL</option><option value="cloudflare">Cloudflare</option><option value="linux-user">Linux user</option><option value="linux-system">Linux system</option></select><small id="variant-help">How the Site is embodied. Add defaults to Native Windows.</small><span id="variant-error" class="field-error" aria-live="polite"></span></label>
          <label id="substrate-field" class="field" data-field><span>Runtime environment</span><input id="substrate" name="substrate" list="substrate-kinds" autocomplete="off" placeholder="windows" aria-describedby="substrate-help substrate-error"><datalist id="substrate-kinds"><option value="windows"></option><option value="wsl"></option><option value="linux"></option><option value="cloudflare"></option></datalist><small id="substrate-help">Execution environment label. Common values include Windows, WSL, Linux, or Cloudflare.</small><span id="substrate-error" class="field-error" aria-live="polite"></span></label>
          <label id="source-field" class="field" data-field><span>How it was found</span><input id="source" name="source" list="source-kinds" autocomplete="off" placeholder="manual" aria-describedby="source-help source-error"><datalist id="source-kinds"><option value="manual"></option><option value="filesystem"></option><option value="launch_registry"></option></datalist><small id="source-help">Where this observation came from. Add defaults to manual.</small><span id="source-error" class="field-error" aria-live="polite"></span></label>
          <label id="control-endpoint-field" class="field span-2" data-field><span>Control endpoint</span><input id="control-endpoint" name="control_endpoint" type="url" autocomplete="off" placeholder="https://example.invalid/control" aria-describedby="control-endpoint-help control-endpoint-error"><small id="control-endpoint-help">Optional HTTP endpoint for observing or controlling the Site. Leave blank for a local-only Site.</small><span class="clear-toggle edit-only-clear" hidden><input id="clear-control-endpoint" type="checkbox"> Clear stored endpoint</span><span id="control-endpoint-error" class="field-error" aria-live="polite"></span></label>
          <label id="source-ref-field" class="field" data-field><span>Source reference</span><input id="source-ref" name="source_ref" autocomplete="off" placeholder="registry entry or file path" aria-describedby="source-ref-help source-ref-error"><small id="source-ref-help">Optional identifier for the observation, such as a registry entry or file path.</small><span id="source-ref-error" class="field-error" aria-live="polite"></span></label>
          <label id="aliases-field" class="field span-3" data-field><span>Other names</span><input id="aliases" name="aliases" placeholder="staccato, scheduling" autocomplete="off" aria-describedby="aliases-help aliases-error"><small id="aliases-help">Optional aliases, separated by commas. On Edit, replacing this list adds names; use Clear to remove all names.</small><span class="clear-toggle edit-only-clear" hidden><input id="clear-aliases" type="checkbox"> Clear all stored aliases</span><span id="aliases-error" class="field-error" aria-live="polite"></span></label>
        </div></fieldset>
        <details id="advanced-fields" class="advanced" data-field>
          <summary>More metadata</summary>
          <p class="section-help">Use this only when the Site needs a structured purpose record. Most registrations can leave it closed.</p>
          <label class="field"><span>Purpose metadata (JSON)</span><textarea id="aim-json" name="aim_json" spellcheck="false" placeholder='{\"purpose\":\"customer scheduling\"}' aria-describedby="aim-json-help aim-json-error"></textarea><small id="aim-json-help">Example: <code>{\"purpose\":\"customer scheduling\"}</code>. On Edit, leave it unchanged or explicitly clear it.</small><span class="clear-toggle edit-only-clear" hidden><input id="clear-aim-json" type="checkbox"> Clear stored purpose metadata</span><span id="aim-json-error" class="field-error" aria-live="polite"></span></label>
        </details>
        <label id="re-admit-field" class="confirmation" data-field hidden><input id="re-admit" name="re_admit" type="checkbox" aria-describedby="re-admit-help"><span><strong>Use the retired record</strong><small id="re-admit-help" class="help">A previous preview found a retired record for this Site. Select this only if you want to restore that record instead of creating a new one.</small></span></label>
        <div class="actions">
          <div class="primary-actions"><button id="plan" type="submit">Preview registration</button><button id="discard" type="button" disabled>Discard draft</button></div>
          <div id="apply-actions" class="apply-actions" hidden><p id="review-status" class="help" role="status" aria-live="polite">Review the preview before applying.</p><label class="confirmation"><input id="confirm-apply" type="checkbox" disabled> I reviewed this preview and want to apply it</label><label id="purge-confirm-field" class="field purge-confirm" hidden><span>Type the Site ID to confirm purge</span><input id="purge-confirm-site-id" name="purge_confirm_site_id" autocomplete="off" placeholder="Canonical Site ID" aria-describedby="purge-confirm-help purge-confirm-site-id-error"><small id="purge-confirm-help" class="danger-note">Purge removes registry metadata permanently. It does not delete the Site folder.</small><span id="purge-confirm-site-id-error" class="field-error" aria-live="polite"></span></label><button id="apply" type="button" disabled>Register Site</button></div>
        </div>
      </form>
      <div id="mutation-output" style="margin-top:14px" tabindex="-1" role="status" aria-live="polite" aria-atomic="true"><p class="empty">No preview yet. Enter the required details to preview the registration.</p></div>
    </div></section>
    <section id="discovery-panel" class="wide"><div class="section-head"><h2>Discovery Preview</h2><span class="count">Read-only dry run</span></div><div class="content" id="discovery-output"><p class="empty">No preview requested.</p></div></section>
  </main>
  <script>
    const listEl = document.getElementById('site-list');
    const detailEl = document.getElementById('detail');
    const countEl = document.getElementById('count');
    const discoveryEl = document.getElementById('discovery-output');
    const mutationOutput = document.getElementById('mutation-output');
    const validationEl = document.getElementById('validation');
    const operationEl = document.getElementById('operation');
    const operationSummaryEl = document.getElementById('operation-summary');
    const operationHelpEl = document.getElementById('operation-help');
    const mutationForm = document.getElementById('mutation-form');
    const planButton = document.getElementById('plan');
    const discardButton = document.getElementById('discard');
    const draftStateEl = document.getElementById('draft-state');
    const existingSiteSearchEl = document.getElementById('existing-site-search');
    const existingSiteEl = document.getElementById('existing-site');
    const applyButton = document.getElementById('apply');
    const applyActions = document.getElementById('apply-actions');
    const reviewStatus = document.getElementById('review-status');
    const confirmApply = document.getElementById('confirm-apply');
    const purgeConfirmField = document.getElementById('purge-confirm-field');
    const purgeConfirmEl = document.getElementById('purge-confirm-site-id');
    const reAdmitField = document.getElementById('re-admit-field');
    const reAdmitEl = document.getElementById('re-admit');
    const rootEl = document.getElementById('root');
    const rootHelpEl = document.getElementById('root-help');
    const variantEl = document.getElementById('variant');
    const clearAimJsonEl = document.getElementById('clear-aim-json');
    const clearControlEndpointEl = document.getElementById('clear-control-endpoint');
    const clearAliasesEl = document.getElementById('clear-aliases');
    const pageMode = document.body.dataset.pageMode || 'list';
    let selectedReference = null;
    let selectedSite = null;
    let siteRecords = [];
    let plannedMutation = null;
    let lastOperation = 'add';
    let originalEditValues = { endpoint: '', aim: '' };
    let clearDraftValues = {};
    let draftDirty = false;
    let mutationBusy = false;
    let reAdmitRecoveryAvailable = false;

    const operationConfig = {
      add: {
        summary: 'Register a new Site',
        help: 'Register a Site that does not yet have a canonical registry record. Provide its stable ID and absolute root folder; the remaining metadata is optional.',
        visible: ['operation-field', 'existing-site-field', 'site-id-field', 'root-field', 'reason-field', 'variant-field', 'substrate-field', 'source-field', 'control-endpoint-field', 'source-ref-field', 'aliases-field', 'advanced-fields'],
        required: ['site-id', 'root'],
      },
      edit: {
        summary: 'Update Site metadata',
        help: 'Choose an existing Site above. The current record is loaded into the form; change only the metadata that needs correction, then preview the diff.',
        visible: ['operation-field', 'existing-site-field', 'root-field', 'reason-field', 'variant-field', 'substrate-field', 'source-field', 'control-endpoint-field', 'source-ref-field', 'aliases-field', 'advanced-fields'],
        required: ['reference'],
      },
      retire: {
        summary: 'Retire a Site record',
        help: 'Retire keeps a reversible registry tombstone. Choose the Site and record why it should no longer be treated as active.',
        visible: ['operation-field', 'existing-site-field', 'reason-field'],
        required: ['reference', 'reason'],
      },
      restore: {
        summary: 'Restore a retired Site',
        help: 'Restore returns a retired record to the active catalog. Choose the Site and explain why it is being brought back.',
        visible: ['operation-field', 'existing-site-field', 'reason-field'],
        required: ['reference', 'reason'],
      },
      purge: {
        summary: 'Permanently remove retired metadata',
        help: 'Purge is the destructive registry operation. It removes retired metadata but never deletes the Site folder. Preview first, then type the canonical Site ID to confirm.',
        visible: ['operation-field', 'existing-site-field', 'reason-field'],
        required: ['reference', 'reason'],
      },
    };

    const value = (id) => document.getElementById(id).value.trim();
    const checked = (id) => document.getElementById(id).checked;
    function setValue(id, nextValue) { document.getElementById(id).value = nextValue == null ? '' : String(nextValue); }
    function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
    function text(nextValue) { return nextValue == null || nextValue === '' ? '-' : String(nextValue); }
    function stateClass(nextValue) { return String(nextValue || '').replace(/[^a-z-]/g, ''); }
    function state(nextValue) { const span = document.createElement('span'); span.className = 'state ' + stateClass(nextValue); span.textContent = nextValue || 'unknown'; return span; }
    function showError(node, message) { clear(node); const p = document.createElement('p'); p.className = 'error'; p.textContent = message; node.appendChild(p); }
    function formatPreviewValue(nextValue) { if (nextValue == null || nextValue === '') return '-'; if (typeof nextValue === 'object') return JSON.stringify(nextValue); return String(nextValue); }
    function labelForKey(key) { return String(key).replace(/_/g, ' ').replace(/\b[a-z]/g, (letter) => letter.toUpperCase()); }
    function sameValue(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

    function updateActionLabels() {
      const isAdd = value('operation') === 'add';
      planButton.textContent = isAdd ? 'Preview registration' : 'Preview change';
      applyButton.textContent = isAdd ? 'Register Site' : 'Apply change';
    }

    function setMutationBusy(busy) {
      mutationBusy = Boolean(busy);
      mutationForm.setAttribute('aria-busy', String(mutationBusy));
      planButton.setAttribute('aria-busy', String(mutationBusy));
      applyButton.setAttribute('aria-busy', String(mutationBusy));
      if (mutationBusy) {
        planButton.textContent = 'Working...';
        applyButton.textContent = 'Applying...';
      } else {
        updateActionLabels();
      }
      planButton.disabled = mutationBusy || !allowedOperations().has(value('operation'));
      discardButton.disabled = mutationBusy || !draftDirty;
      confirmApply.disabled = mutationBusy || !plannedMutation;
      updateApplyState();
    }

    const rootGuidance = {
      native: { placeholder: 'D:/code/my-site', help: 'Absolute Windows folder containing the Site. Example: D:/code/smart-scheduling.' },
      wsl: { placeholder: '/mnt/d/code/my-site', help: 'Absolute WSL path containing the Site. Example: /mnt/d/code/smart-scheduling.' },
      cloudflare: { placeholder: 'D:/code/my-site', help: 'Local project root associated with the Cloudflare Site.' },
      'linux-user': { placeholder: '/home/andrey/my-site', help: 'Absolute Linux folder containing the Site. Example: /home/andrey/smart-scheduling.' },
      'linux-system': { placeholder: '/var/lib/narada/my-site', help: 'Absolute Linux system folder containing the Site. Example: /var/lib/narada/smart-scheduling.' },
    };

    function updateRootGuidance() {
      const guidance = rootGuidance[value('variant') || 'native'] || rootGuidance.native;
      rootEl.placeholder = guidance.placeholder;
      rootHelpEl.textContent = guidance.help;
    }

    function syncReAdmitRecovery() {
      const visible = reAdmitRecoveryAvailable && pageMode === 'add' && value('operation') === 'add';
      reAdmitField.hidden = !visible;
      if (!visible) reAdmitEl.checked = false;
    }

    function setReAdmitRecoveryAvailable(available) {
      reAdmitRecoveryAvailable = Boolean(available);
      syncReAdmitRecovery();
    }

    function mutationErrorPayload(error) {
      return error && typeof error === 'object' && error.payload && typeof error.payload === 'object' ? error.payload : null;
    }

    function showMutationError(error) {
      const payload = mutationErrorPayload(error);
      const refusals = Array.isArray(payload?.refusals) ? payload.refusals : [];
      if (value('operation') === 'add' && refusals.includes('retired_record_requires_restore_or_re_admit')) {
        setReAdmitRecoveryAvailable(true);
        showError(mutationOutput, 'A retired registry record matches this Site. Select "Use the retired record" if that is the intended outcome, then preview again.');
      } else {
        showError(mutationOutput, error?.message || 'Request failed.');
      }
      mutationOutput.focus();
    }

    async function request(path, options) {
      const response = await fetch(path, options);
      const raw = await response.text();
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch { body = { detail: raw }; }
      if (!response.ok) {
        const error = new Error(body.error || body.detail || (body.refusals || []).join(', ') || 'Request failed (' + response.status + ')');
        error.status = response.status;
        error.payload = body;
        throw error;
      }
      return body;
    }

    function renderList(payload) {
      clear(listEl);
      siteRecords = Array.isArray(payload.sites) ? payload.sites : [];
      countEl.textContent = siteRecords.length + (siteRecords.length === 1 ? ' Site' : ' Sites');
      renderSitePicker();
      if (!siteRecords.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'No Sites are registered.'; listEl.appendChild(p); return; }
      const table = document.createElement('table');
      table.innerHTML = '<thead><tr><th>Site</th><th>Lifecycle</th><th>Observation</th><th>Provenance</th><th>Revision</th></tr></thead>';
      const body = document.createElement('tbody');
      for (const site of siteRecords) {
        const row = document.createElement('tr');
        row.tabIndex = 0;
        row.setAttribute('aria-selected', String(site.site_id === selectedReference));
        const cells = [site.site_id, state(site.lifecycle_status), state(site.observation_status), (site.sources || []).map((item) => item.kind).join(', ') || '-', site.revision];
        for (const item of cells) { const td = document.createElement('td'); if (item instanceof Node) td.appendChild(item); else td.textContent = text(item); row.appendChild(td); }
        row.addEventListener('click', () => { if (confirmDiscardDraft()) selectSite(site.site_id); });
        row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (confirmDiscardDraft()) selectSite(site.site_id); } });
        body.appendChild(row);
      }
      table.appendChild(body);
      const tableWrap = document.createElement('div');
      tableWrap.className = 'table-wrap';
      tableWrap.appendChild(table);
      listEl.appendChild(tableWrap);
    }

    function renderSitePicker() {
      const current = selectedReference || '';
      const query = value('existing-site-search').toLowerCase();
      clear(existingSiteEl);
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'Choose a Site...';
      existingSiteEl.appendChild(empty);
      const matches = siteRecords.filter((site) => {
        const aliases = (site.aliases || []).map((alias) => alias.value).join(' ');
        const haystack = [site.site_id, site.site_root, aliases].filter(Boolean).join(' ').toLowerCase();
        return !query || site.site_id === current || haystack.includes(query);
      });
      for (const site of matches) {
        const option = document.createElement('option');
        option.value = site.site_id || '';
        const aliases = (site.aliases || []).map((alias) => alias.value).join(', ');
        option.textContent = site.site_id + (site.site_root ? ' - ' + site.site_root : '') + (aliases ? ' [' + aliases + ']' : '');
        existingSiteEl.appendChild(option);
      }
      if (matches.length === 0) {
        const none = document.createElement('option');
        none.disabled = true;
        none.textContent = 'No matching Sites';
        existingSiteEl.appendChild(none);
      }
      existingSiteEl.value = current;
    }

    function renderDetail(payload) {
      clear(detailEl);
      if (payload.status !== 'success' || !payload.site) { showError(detailEl, (payload.refusals || ['Site record unavailable']).join(', ')); return; }
      const site = payload.site;
      const dl = document.createElement('dl');
      const rows = [['Canonical ID', site.site_id], ['Root', site.site_root], ['Control endpoint', site.control_endpoint], ['Variant / substrate', [site.variant, site.substrate].filter(Boolean).join(' / ')], ['Lifecycle', site.lifecycle_status], ['Observation', site.observation_status], ['Revision', site.revision], ['Created', site.created_at], ['Updated', site.updated_at], ['Last seen', site.last_seen_at], ['Retired', site.retired_at], ['Retire reason', site.retire_reason]];
      for (const [label, item] of rows) { const dt = document.createElement('dt'); dt.textContent = label; const dd = document.createElement('dd'); if (label === 'Lifecycle' || label === 'Observation') dd.appendChild(state(item)); else dd.textContent = text(item); dl.append(dt, dd); }
      const sourcesLabel = document.createElement('dt'); sourcesLabel.textContent = 'Provenance'; const sources = document.createElement('dd'); const sourceList = document.createElement('ul'); sourceList.className = 'list'; for (const source of site.sources || []) { const li = document.createElement('li'); li.textContent = [source.kind, source.ref, source.observed_at].filter(Boolean).join(' - '); sourceList.appendChild(li); } sources.appendChild(sourceList); dl.append(sourcesLabel, sources);
      const aliasesLabel = document.createElement('dt'); aliasesLabel.textContent = 'Aliases'; const aliases = document.createElement('dd'); aliases.textContent = (site.aliases || []).map((alias) => alias.value + ' (' + alias.source + ')').join(', ') || '-'; dl.append(aliasesLabel, aliases);
      const nextLabel = document.createElement('dt'); nextLabel.textContent = 'Next actions'; const next = document.createElement('dd'); next.textContent = (payload.next_actions || []).join(', ') || '-'; dl.append(nextLabel, next);
      const conflictsLabel = document.createElement('dt'); conflictsLabel.textContent = 'Conflicts'; const conflicts = document.createElement('dd'); conflicts.textContent = (payload.conflicts || []).map(String).join(', ') || 'None'; dl.append(conflictsLabel, conflicts);
      detailEl.appendChild(dl);
    }

    function setSelectValue(id, nextValue) {
      const select = document.getElementById(id);
      const wanted = nextValue == null ? '' : String(nextValue);
      if (wanted && !Array.from(select.options).some((option) => option.value === wanted)) { const option = document.createElement('option'); option.value = wanted; option.textContent = wanted; select.appendChild(option); }
      select.value = wanted;
    }

    function setChecked(id, nextValue) { document.getElementById(id).checked = Boolean(nextValue); }
    function setClearControl(id, clearValue, inputId) {
      setChecked(id, clearValue);
      const input = document.getElementById(inputId);
      if (clearValue) {
        clearDraftValues[inputId] = input.value;
        input.value = '';
      } else if (Object.prototype.hasOwnProperty.call(clearDraftValues, inputId)) {
        input.value = clearDraftValues[inputId];
        delete clearDraftValues[inputId];
      }
      input.disabled = Boolean(clearValue);
    }

    function setDraftDirty(dirty) {
      draftDirty = Boolean(dirty);
      draftStateEl.textContent = draftDirty ? 'Unsaved changes' : 'No unsaved changes';
      draftStateEl.classList.toggle('dirty', draftDirty);
      draftStateEl.title = draftDirty ? 'Preview or discard this draft before leaving it.' : 'The form matches the last loaded registry state.';
      discardButton.disabled = mutationBusy || !draftDirty;
    }

    function confirmDiscardDraft() {
      if (!draftDirty) return true;
      const discard = window.confirm('Discard unsaved registry change?');
      if (discard) setDraftDirty(false);
      return discard;
    }

    function populateFormFromSite(site, selectAsExisting = true) {
      if (!site) return;
      selectedSite = selectAsExisting ? site : null;
      if (!selectAsExisting) {
        selectedReference = null;
        existingSiteEl.value = '';
        setValue('reference', '');
      }
      clearDraftValues = {};
      setValue('site-id', site.site_id);
      setValue('root', site.site_root);
      setSelectValue('variant', site.variant);
      setValue('substrate', site.substrate);
      setValue('control-endpoint', site.control_endpoint);
      setValue('aliases', (site.aliases || []).map((alias) => alias.value).join(', '));
      setValue('aim-json', typeof site.aim_json === 'string' ? site.aim_json : site.aim_json ? JSON.stringify(site.aim_json) : '');
      originalEditValues = { endpoint: value('control-endpoint'), aim: value('aim-json') };
      setClearControl('clear-control-endpoint', false, 'control-endpoint');
      setClearControl('clear-aliases', false, 'aliases');
      setClearControl('clear-aim-json', false, 'aim-json');
      document.getElementById('advanced-fields').open = Boolean(value('aim-json'));
      const source = Array.isArray(site.sources) ? site.sources[0] : undefined;
      setValue('source', source?.kind);
      setValue('source-ref', source?.ref);
      updateRootGuidance();
      setDraftDirty(false);
    }

    async function loadList() {
      try {
        const payload = await request('/console/registry/api/sites', { headers: { Accept: 'application/json' } });
        renderList(payload);
        if (selectedReference) await selectSite(selectedReference, false, !draftDirty);
      } catch (error) { showError(listEl, error.message); }
    }

    async function selectSite(reference, redraw = true, populate = true) {
      invalidatePlan();
      selectedReference = reference;
      selectedSite = siteRecords.find((site) => site.site_id === reference) || null;
      setValue('reference', reference);
      existingSiteEl.value = reference;
      try {
        const payload = await request('/console/registry/api/sites/' + encodeURIComponent(reference), { headers: { Accept: 'application/json' } });
        renderDetail(payload);
        selectedSite = payload.site || selectedSite;
        if (populate && value('operation') !== 'add') populateFormFromSite(payload.site);
        setOperationState();
        if (redraw) await loadList();
      } catch (error) { showError(detailEl, error.message); }
    }

    function setFieldError(id, message) {
      const input = document.getElementById(id);
      const error = document.getElementById(id + '-error');
      if (input) {
        input.setAttribute('aria-invalid', message ? 'true' : 'false');
        if (error?.id) {
          const describedBy = new Set((input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
          describedBy.add(error.id);
          input.setAttribute('aria-describedby', Array.from(describedBy).join(' '));
        }
      }
      if (error) error.textContent = message || '';
    }

    function clearValidation() {
      clear(validationEl);
      document.querySelectorAll('.field-error').forEach((node) => { node.textContent = ''; });
      document.querySelectorAll('[aria-invalid="true"]').forEach((node) => node.setAttribute('aria-invalid', 'false'));
    }

    function showValidation(errors) {
      clearValidation();
      if (!errors.length) return;
      const list = document.createElement('ul');
      for (const error of errors) { setFieldError(error.field, error.message); const item = document.createElement('li'); item.textContent = error.message; list.appendChild(item); }
      validationEl.appendChild(list);
      document.getElementById(errors[0].field)?.focus();
    }

    function resetAddDraft() {
      selectedReference = null;
      selectedSite = null;
      clearDraftValues = {};
      existingSiteEl.value = '';
      setValue('reference', '');
      setValue('site-id', '');
      setValue('root', '');
      setValue('reason', '');
      setSelectValue('variant', 'native');
      setValue('substrate', '');
      setValue('source', 'manual');
      setValue('source-ref', '');
      setValue('control-endpoint', '');
      setValue('aliases', '');
      setValue('aim-json', '');
      originalEditValues = { endpoint: '', aim: '' };
      setClearControl('clear-control-endpoint', false, 'control-endpoint');
      setClearControl('clear-aliases', false, 'aliases');
      setClearControl('clear-aim-json', false, 'aim-json');
      document.getElementById('advanced-fields').open = false;
      setReAdmitRecoveryAvailable(false);
      updateRootGuidance();
      setDraftDirty(false);
    }

    function allowedOperations() {
      const allowed = new Set(['add']);
      if (selectedSite?.lifecycle_status === 'active') ['edit', 'retire'].forEach((operation) => allowed.add(operation));
      if (selectedSite?.lifecycle_status === 'retired') ['restore', 'purge'].forEach((operation) => allowed.add(operation));
      return allowed;
    }

    function operationUnavailableMessage(operation) {
      if (operation === 'add') return '';
      if (!selectedSite) return 'Choose an existing Site before using this operation.';
      if (selectedSite.lifecycle_status === 'active') return 'This active Site supports Edit or Retire. Choose one of those operations.';
      if (selectedSite.lifecycle_status === 'retired') return 'This retired Site supports Restore or Purge. Choose one of those operations.';
      return 'Select an existing Site with a known lifecycle state first.';
    }

    function updateOperationAvailability() {
      const allowed = allowedOperations();
      for (const option of operationEl.options) option.disabled = !allowed.has(option.value);
      const operationAllowed = allowed.has(value('operation'));
      planButton.disabled = mutationBusy || !operationAllowed;
      return operationAllowed;
    }

    function setRequiredMarker(fieldId, required) {
      const input = document.getElementById(fieldId);
      const label = input?.closest('.field');
      const title = label ? Array.from(label.children).find((node) => node.tagName === 'SPAN' && !node.classList.contains('field-error')) : null;
      if (!input || !title) return;
      let marker = title.querySelector('.required-marker');
      if (required && !marker) { marker = document.createElement('span'); marker.className = 'required-marker'; marker.textContent = ' *'; marker.setAttribute('aria-hidden', 'true'); title.appendChild(marker); }
      if (marker) marker.hidden = !required;
      input.required = required;
      input.setAttribute('aria-required', String(required));
    }

    function setOperationState() {
      const operation = value('operation');
      const operationAllowed = updateOperationAvailability();
      const config = operationConfig[operation] || operationConfig.add;
      operationSummaryEl.textContent = config.summary;
      const availabilityHelp = operationAllowed ? '' : ' ' + operationUnavailableMessage(operation);
      operationHelpEl.textContent = config.help + (config.required.length ? ' Required fields are marked *.' : '') + availabilityHelp;
      const visible = new Set(config.visible);
      document.querySelectorAll('[data-field]').forEach((node) => { node.hidden = !visible.has(node.id); });
      ['site-id', 'reference', 'root', 'reason'].forEach((field) => setRequiredMarker(field, config.required.includes(field)));
      const unchangedVariant = variantEl.options[0];
      unchangedVariant.hidden = operation === 'add';
      unchangedVariant.textContent = operation === 'add' ? 'Choose a variant' : 'Leave unchanged';
      document.querySelectorAll('.edit-only-clear').forEach((node) => { node.hidden = operation !== 'edit'; });
      if (operation !== 'edit') {
        setClearControl('clear-control-endpoint', false, 'control-endpoint');
        setClearControl('clear-aliases', false, 'aliases');
        setClearControl('clear-aim-json', false, 'aim-json');
      }
      if (operation === 'add') {
        if (!value('variant')) setSelectValue('variant', 'native');
        if (!value('source')) setValue('source', 'manual');
      } else setReAdmitRecoveryAvailable(false);
      if (operation !== 'purge') { purgeConfirmField.hidden = true; purgeConfirmEl.value = ''; }
      syncReAdmitRecovery();
      updateRootGuidance();
      updateActionLabels();
      clearValidation();
      if (!operationAllowed) setFieldError('operation', operationUnavailableMessage(operation));
    }

    function mutationInput() {
      const operation = value('operation');
      const aliases = value('aliases') ? value('aliases').split(',').map((item) => item.trim()).filter(Boolean) : undefined;
      const input = { operation, reference: value('reference') || undefined, reason: value('reason') || undefined };
      if (operation === 'add') Object.assign(input, { site_id: value('site-id') || undefined, root: value('root') || undefined, variant: value('variant') || undefined, substrate: value('substrate') || undefined, aim_json: value('aim-json') || undefined, control_endpoint: value('control-endpoint') || undefined, aliases, source: value('source') || undefined, source_ref: value('source-ref') || undefined, re_admit: checked('re-admit') || undefined });
      if (operation === 'edit') Object.assign(input, { root: value('root') || undefined, variant: value('variant') || undefined, substrate: value('substrate') || undefined, aim_json: checked('clear-aim-json') ? undefined : value('aim-json') || undefined, control_endpoint: checked('clear-control-endpoint') ? undefined : value('control-endpoint') || undefined, aliases: checked('clear-aliases') ? undefined : aliases, clear_aim_json: checked('clear-aim-json') || undefined, clear_control_endpoint: checked('clear-control-endpoint') || undefined, clear_aliases: checked('clear-aliases') || undefined, source: value('source') || undefined, source_ref: value('source-ref') || undefined });
      return input;
    }

    function validateMutation(forApply = false) {
      const operation = value('operation');
      const config = operationConfig[operation] || operationConfig.add;
      const errors = [];
      if (!allowedOperations().has(operation)) errors.push({ field: 'operation', message: operationUnavailableMessage(operation) });
      for (const field of config.required) if (!value(field)) errors.push({ field, message: field === 'site-id' ? 'Enter a canonical Site ID.' : field === 'root' ? 'Enter the absolute Site root folder.' : field === 'reference' ? 'Choose an existing Site first.' : 'Enter a reason for this change.' });
      if (operation === 'add' || operation === 'edit') {
        if (operation === 'add' && value('site-id') && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value('site-id'))) errors.push({ field: 'site-id', message: 'Use letters, numbers, dots, underscores, or hyphens for the Site ID, starting with a letter or number.' });
        const root = value('root');
        const slash = String.fromCharCode(92);
        const absoluteRoot = root.startsWith('/') || root.startsWith(slash + slash) || (root.length >= 3 && /^[A-Za-z]$/.test(root[0]) && root[1] === ':' && (root[2] === '/' || root[2] === slash)) || root.startsWith('http://') || root.startsWith('https://');
        if (operation === 'add' && root && !absoluteRoot) errors.push({ field: 'root', message: 'Enter an absolute Site root, such as D:/code/my-site or /home/andrey/my-site.' });
        const endpoint = value('control-endpoint');
        const endpointChanged = operation === 'add' || endpoint !== originalEditValues.endpoint;
        if (endpoint && !checked('clear-control-endpoint') && endpointChanged) { try { const parsed = new URL(endpoint); if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') errors.push({ field: 'control-endpoint', message: 'Control endpoint must use http:// or https://.' }); } catch { errors.push({ field: 'control-endpoint', message: 'Enter a complete control endpoint URL, for example https://example.invalid/control.' }); } }
        const aim = value('aim-json');
        const aimChanged = operation === 'add' || aim !== originalEditValues.aim;
        if (aim && !checked('clear-aim-json') && aimChanged) { try { JSON.parse(aim); } catch { errors.push({ field: 'aim-json', message: 'Purpose metadata must be valid JSON.' }); } }
      }
      if (forApply && operation === 'purge') {
        const target = plannedMutation?.confirm_site_id;
        if (!target || value('purge-confirm-site-id') !== target) errors.push({ field: 'purge-confirm-site-id', message: 'Type the exact canonical Site ID shown in the purge preview.' });
      }
      return errors;
    }

    function previewRevision(payload) { return Number.isInteger(payload.before?.revision) ? payload.before.revision : undefined; }

    function renderMutationPreview(node, payload) {
      clear(node);
      const status = document.createElement('div');
      status.className = 'preview-status';
      const title = document.createElement('strong');
      title.textContent = (payload.operation || 'Change') + (payload.mutation_performed ? ' applied' : ' planned');
      const meta = document.createElement('span');
      meta.textContent = 'Site: ' + text(payload.site_id) + ' | Registry changed: ' + (payload.mutation_performed ? 'yes' : 'no');
      status.append(title, meta);
      node.appendChild(status);
      const changes = Array.isArray(payload.changes) ? payload.changes : [];
      const before = payload.before && typeof payload.before === 'object' ? payload.before : {};
      const after = payload.after && typeof payload.after === 'object' ? payload.after : {};
      const keys = Array.from(new Set(Object.keys(before).concat(Object.keys(after)))).filter((key) => key !== 'revision' && !sameValue(before[key], after[key]));
      if (keys.length) {
        const heading = document.createElement('h3'); heading.className = 'preview-heading'; heading.textContent = 'What will change'; node.appendChild(heading);
        const table = document.createElement('table'); table.className = 'preview-table'; table.innerHTML = '<thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>';
        const body = document.createElement('tbody');
        for (const key of keys) { const row = document.createElement('tr'); for (const item of [labelForKey(key), formatPreviewValue(before[key]), formatPreviewValue(after[key])]) { const cell = document.createElement('td'); cell.textContent = item; row.appendChild(cell); } body.appendChild(row); }
        table.appendChild(body); node.appendChild(table);
      } else if (!changes.length) { const p = document.createElement('p'); p.className = 'help'; p.textContent = 'No field-level changes were reported.'; node.appendChild(p); }
      if (changes.length) {
        const heading = document.createElement('h3'); heading.className = 'preview-heading'; heading.textContent = 'Registry notes'; node.appendChild(heading);
        const list = document.createElement('ul'); list.className = 'preview-list'; for (const change of changes) { const item = document.createElement('li'); item.textContent = typeof change === 'string' ? change : formatPreviewValue(change); list.appendChild(item); } node.appendChild(list);
      }
      if (Array.isArray(payload.conflicts) && payload.conflicts.length) { const p = document.createElement('p'); p.className = 'error'; p.textContent = 'Conflicts: ' + payload.conflicts.map(String).join(', '); node.appendChild(p); }
      if (Array.isArray(payload.refusals) && payload.refusals.length) { const p = document.createElement('p'); p.className = 'error'; p.textContent = 'Refused: ' + payload.refusals.map(String).join(', '); node.appendChild(p); }
      if (payload.confirmation_required) { const p = document.createElement('p'); p.className = 'danger-note'; p.textContent = 'To apply this purge, type "' + payload.confirmation_required + '" in the confirmation field above.'; node.appendChild(p); }
      const technical = document.createElement('details'); technical.className = 'technical'; const summary = document.createElement('summary'); summary.textContent = 'Technical response'; const pre = document.createElement('pre'); pre.textContent = JSON.stringify(payload, null, 2); technical.append(summary, pre); node.appendChild(technical);
    }

    function invalidatePlan() {
      const hadPlan = Boolean(plannedMutation);
      plannedMutation = null;
      confirmApply.checked = false;
      confirmApply.disabled = true;
      applyButton.disabled = true;
      applyActions.hidden = true;
      reviewStatus.hidden = true;
      if (!hadPlan || mutationOutput.querySelector('.preview-stale-note')) return;
      const note = document.createElement('p'); note.className = 'help preview-stale-note'; note.textContent = 'The form changed. Preview the registration again before applying it.'; mutationOutput.prepend(note);
    }

    function updateApplyState() {
      const purgeReady = value('operation') !== 'purge' || (plannedMutation?.confirm_site_id && value('purge-confirm-site-id') === plannedMutation.confirm_site_id);
      confirmApply.disabled = mutationBusy || !plannedMutation;
      applyButton.disabled = mutationBusy || !plannedMutation || !confirmApply.checked || !purgeReady;
    }

    async function previewMutation(event) {
      event.preventDefault();
      if (mutationBusy) return;
      invalidatePlan();
      clearValidation();
      const errors = validateMutation(false);
      if (errors.length) { showValidation(errors); return; }
      setMutationBusy(true);
      try {
        const input = mutationInput();
        const payload = await request('/console/registry/api/operations/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
        plannedMutation = { input, expected_revision: previewRevision(payload), confirm_site_id: typeof payload.confirmation_required === 'string' ? payload.confirmation_required : undefined };
        renderMutationPreview(mutationOutput, payload);
        if (value('operation') === 'purge' && plannedMutation.confirm_site_id) { purgeConfirmField.hidden = false; purgeConfirmEl.value = ''; purgeConfirmEl.placeholder = plannedMutation.confirm_site_id; }
        applyActions.hidden = false;
        reviewStatus.hidden = false;
        reviewStatus.textContent = value('operation') === 'add' ? 'Preview ready. Review the registration before applying it.' : 'Preview ready. Review the change before applying it.';
        updateApplyState();
        mutationOutput.focus();
      } catch (error) { showMutationError(error); }
      finally { setMutationBusy(false); }
    }

    async function discardDraft() {
      invalidatePlan();
      if (value('operation') !== 'add' && selectedReference) await selectSite(selectedReference, false, true);
      else resetAddDraft();
      setOperationState();
    }

    async function applyMutation() {
      if (mutationBusy || !plannedMutation || !confirmApply.checked) return;
      const errors = validateMutation(true);
      if (errors.length) { showValidation(errors); updateApplyState(); return; }
      setMutationBusy(true);
      try {
        const appliedOperation = value('operation');
        const input = { ...plannedMutation.input, expected_revision: plannedMutation.expected_revision, confirm_site_id: value('operation') === 'purge' ? value('purge-confirm-site-id') : plannedMutation.confirm_site_id, confirm_apply: true };
        const payload = await request('/console/registry/api/operations/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
        renderMutationPreview(mutationOutput, payload);
        plannedMutation = null;
        applyActions.hidden = true;
        reviewStatus.hidden = true;
        confirmApply.checked = false;
        confirmApply.disabled = true;
        purgeConfirmField.hidden = true;
        purgeConfirmEl.value = '';
        applyButton.disabled = true;
        setDraftDirty(false);
        if (appliedOperation === 'add' || appliedOperation === 'purge') {
          resetAddDraft();
          operationEl.value = 'add';
          lastOperation = 'add';
          setOperationState();
        }
        await loadList();
        mutationOutput.focus();
      } catch (error) { showMutationError(error); }
      finally { setMutationBusy(false); }
    }

    function renderDiscoveryPreview(node, payload) {
      clear(node);
      const counts = payload.counts || {};
      const summary = document.createElement('div');
      summary.className = 'discovery-summary';
      for (const item of [['Candidates', Array.isArray(payload.entries) ? payload.entries.length : 0], ['New', counts.added || 0], ['Updated', counts.updated || 0], ['Unchanged', counts.unchanged || 0], ['Conflicts', counts.conflicted || 0]]) { const span = document.createElement('span'); span.textContent = item[0] + ': ' + item[1]; summary.appendChild(span); }
      node.appendChild(summary);
      const entries = Array.isArray(payload.entries) ? payload.entries : [];
      if (!entries.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'Discovery found no candidate changes.'; node.appendChild(p); return; }
      const table = document.createElement('table');
      table.className = 'discovery-table';
      table.innerHTML = '<thead><tr><th>Site</th><th>Planned operation</th><th>Root</th><th>Changes</th><th></th></tr></thead>';
      const body = document.createElement('tbody');
      for (const entry of entries) {
        const row = document.createElement('tr');
        const after = entry.after || {};
        for (const item of [entry.site_id, entry.operation, after.site_root, (entry.changes || []).join(', ') || '-']) { const cell = document.createElement('td'); cell.textContent = text(item); row.appendChild(cell); }
        const actionCell = document.createElement('td');
        const loadButton = document.createElement('button');
        loadButton.type = 'button';
        loadButton.textContent = 'Load draft';
        loadButton.addEventListener('click', () => loadDiscoveryEntry(entry));
        actionCell.appendChild(loadButton);
        row.appendChild(actionCell);
        body.appendChild(row);
      }
      table.appendChild(body);
      const tableWrap = document.createElement('div');
      tableWrap.className = 'table-wrap';
      tableWrap.appendChild(table);
      node.appendChild(tableWrap);
      const technical = document.createElement('details');
      technical.className = 'technical';
      const summaryElement = document.createElement('summary');
      summaryElement.textContent = 'Technical discovery response';
      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify(payload, null, 2);
      technical.append(summaryElement, pre);
      node.appendChild(technical);
    }

    async function loadDiscoveryEntry(entry) {
      if (!confirmDiscardDraft()) return;
      invalidatePlan();
      const nextOperation = entry.operation === 'edit' ? 'edit' : 'add';
      if (nextOperation === 'add' && lastOperation !== 'add') resetAddDraft();
      operationEl.value = nextOperation;
      lastOperation = nextOperation;
      if (nextOperation === 'edit' && entry.site_id) await selectSite(entry.site_id, false);
      if (entry.after) {
        if (nextOperation === 'edit') {
          selectedReference = entry.site_id || entry.after.site_id;
          setValue('reference', selectedReference);
          existingSiteEl.value = selectedReference;
        }
        populateFormFromSite(entry.after, nextOperation === 'edit');
      }
      setValue('reason', '');
      setOperationState();
      document.getElementById('mutation-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById(nextOperation === 'add' ? 'site-id' : 'reference').focus();
    }

    async function previewDiscovery() { clear(discoveryEl); try { const payload = await request('/console/registry/api/discover-plan', { headers: { Accept: 'application/json' } }); renderDiscoveryPreview(discoveryEl, payload); } catch (error) { showError(discoveryEl, error.message); } }

    operationEl.addEventListener('change', () => {
      const nextOperation = value('operation');
      if (nextOperation !== lastOperation && !confirmDiscardDraft()) { operationEl.value = lastOperation; return; }
      invalidatePlan();
      if (nextOperation === 'add' && lastOperation !== 'add') resetAddDraft();
      lastOperation = nextOperation;
      setOperationState();
      if (nextOperation !== 'add' && selectedReference) selectSite(selectedReference, false);
    });
    existingSiteSearchEl.addEventListener('input', renderSitePicker);
    existingSiteEl.addEventListener('change', () => {
      if (!confirmDiscardDraft()) { existingSiteEl.value = selectedReference || ''; return; }
      if (existingSiteEl.value) selectSite(existingSiteEl.value);
      else { resetAddDraft(); setOperationState(); }
    });
    variantEl.addEventListener('change', updateRootGuidance);
    mutationForm.addEventListener('input', (event) => {
      const ignored = ['purge-confirm-site-id', 'existing-site-search', 'existing-site', 'operation', 'confirm-apply'];
      if (!ignored.includes(event.target.id)) {
        setDraftDirty(true);
        invalidatePlan();
        if (event.target.id !== 're-admit') setReAdmitRecoveryAvailable(false);
      }
      updateApplyState();
    });
    document.getElementById('refresh')?.addEventListener('click', loadList);
    document.getElementById('discover')?.addEventListener('click', previewDiscovery);
    mutationForm.addEventListener('submit', previewMutation);
    confirmApply.addEventListener('change', updateApplyState);
    purgeConfirmEl.addEventListener('input', updateApplyState);
    for (const [toggle, input] of [[clearAimJsonEl, 'aim-json'], [clearControlEndpointEl, 'control-endpoint'], [clearAliasesEl, 'aliases']]) toggle.addEventListener('change', () => { setClearControl(toggle.id, toggle.checked, input); setDraftDirty(true); invalidatePlan(); updateApplyState(); });
    applyButton.addEventListener('click', applyMutation);
    discardButton.addEventListener('click', discardDraft);
    if (pageMode === 'add') {
      operationEl.value = 'add';
      operationEl.disabled = true;
    }
    lastOperation = value('operation');
    setDraftDirty(false);
    setOperationState();
    if (pageMode !== 'add') loadList();
  </script>
</body>
</html>`;
}
