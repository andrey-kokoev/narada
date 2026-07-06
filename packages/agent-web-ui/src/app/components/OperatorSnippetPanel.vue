<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { OperatorSnippet } from '../composables/useOperatorSnippets';

const props = defineProps<{
  snippets: OperatorSnippet[];
  exportJson: string;
}>();
const emit = defineEmits<{
  save: [name: string, body: string, mode: 'save' | 'edit'];
  rename: [oldName: string, newName: string, body: string];
  delete: [name: string];
  pin: [name: string];
  import: [json: string];
  run: [snippet: OperatorSnippet, deliveryMode?: 'default' | 'enqueue'];
  fill: [snippet: OperatorSnippet];
}>();

const open = defineModel<boolean>('open', { default: false });
const search = ref('');
const name = ref('');
const body = ref('');
const importText = ref('');
const editingName = ref<string | null>(null);
const searchInput = ref<HTMLInputElement | null>(null);
const bodyInput = ref<HTMLTextAreaElement | null>(null);
const status = ref('');
const pendingDeleted = ref<OperatorSnippet | null>(null);
let statusTimer: ReturnType<typeof setTimeout> | null = null;

const visibleSnippets = computed(() => {
  const query = search.value.trim().toLowerCase();
  return props.snippets.filter((snippet) => !query || snippet.name.includes(query) || snippet.body.toLowerCase().includes(query));
});
const triggerLabel = computed(() => `Snippets: ${props.snippets.length}`);
const formMode = computed<'save' | 'edit'>(() => editingName.value ? 'edit' : 'save');
const formTitle = computed(() => editingName.value ? `Edit ${editingName.value}` : 'New snippet');
const emptyText = computed(() => props.snippets.length ? `No snippets match "${search.value.trim()}".` : 'Save your first reusable operator input. Snippets are local to this browser/operator.');
const normalizedPreview = computed(() => normalizePreviewName(name.value));

watch(open, async (value) => {
  if (!value) return;
  await nextTick();
  searchInput.value?.focus();
});

function startEdit(snippet: OperatorSnippet) {
  editingName.value = snippet.name;
  name.value = snippet.name;
  body.value = snippet.body;
  nextTick(() => bodyInput.value?.focus());
}

function clearForm() {
  editingName.value = null;
  name.value = '';
  body.value = '';
}

function saveForm() {
  if (editingName.value && normalizedPreview.value !== editingName.value) emit('rename', editingName.value, name.value, body.value);
  else emit('save', name.value, body.value, formMode.value);
  setStatus(`${editingName.value ? normalizedPreview.value === editingName.value ? 'Updated' : 'Renamed' : 'Saved'} ${normalizedPreview.value}`);
  clearForm();
}

function deleteSnippet(snippet: OperatorSnippet) {
  pendingDeleted.value = snippet;
  emit('delete', snippet.name);
  if (editingName.value === snippet.name) clearForm();
  setStatus(`Deleted ${snippet.name}. Undo available.`);
}

function undoDelete() {
  if (!pendingDeleted.value) return;
  emit('save', pendingDeleted.value.name, pendingDeleted.value.body, 'save');
  setStatus(`Restored ${pendingDeleted.value.name}`);
  pendingDeleted.value = null;
}

async function copyBody(snippet: OperatorSnippet) {
  try {
    await navigator.clipboard.writeText(snippet.body);
    setStatus(`Copied ${snippet.name}`);
  } catch {
    setStatus('Copy failed');
  }
}

async function copyExport() {
  try {
    await navigator.clipboard.writeText(props.exportJson);
    setStatus('Copied snippets JSON');
  } catch {
    importText.value = props.exportJson;
    setStatus('Clipboard unavailable; export JSON placed in import box');
  }
}

function importJson() {
  emit('import', importText.value);
  setStatus('Import submitted');
  importText.value = '';
}

function fillSnippet(snippet: OperatorSnippet) {
  emit('fill', snippet);
  setStatus(`Filled composer with ${snippet.name}`);
}

function setStatus(message: string) {
  status.value = message;
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { status.value = ''; }, 2600);
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    open.value = false;
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    const target = event.target as HTMLElement | null;
    if (target?.closest?.('.operator-snippet-form')) {
      event.preventDefault();
      if (name.value.trim() && body.value.trim()) saveForm();
    }
  }
}

function normalizePreviewName(value: string): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
</script>

<template>
  <div class="operator-snippet-panel-shell">
    <button type="button" class="mcp-panel-trigger operator-snippet-trigger" :aria-expanded="open" aria-controls="operator-snippet-panel" @click="open = !open">
      <span class="chip-dot" aria-hidden="true"></span>
      <span>{{ triggerLabel }}</span>
    </button>
    <Teleport to="body">
      <Transition name="mcp-drawer">
        <div v-if="open" class="mcp-drawer-layer" role="presentation" @keydown="handleKeydown">
          <button type="button" class="mcp-drawer-backdrop" aria-label="Close snippets" @click="open = false"></button>
          <aside id="operator-snippet-panel" class="mcp-panel operator-snippet-panel" aria-label="Operator snippets">
            <header class="mcp-panel-header">
              <div>
                <h2>Snippets</h2>
                <p>Browser/operator local saved inputs.</p>
              </div>
              <button type="button" class="mcp-panel-close" aria-label="Close snippets" @click="open = false">Close</button>
            </header>
            <div class="mcp-panel-actions operator-snippet-actions">
              <label class="mcp-panel-search operator-snippet-search">
                <span>Search</span>
                <input ref="searchInput" v-model="search" type="search" autocomplete="off" spellcheck="false" placeholder="Name or body" />
              </label>
              <button type="button" @click="copyExport">Export JSON</button>
            </div>
            <p v-if="status || pendingDeleted" class="operator-snippet-status" role="status">
              <span>{{ status }}</span>
              <button v-if="pendingDeleted" type="button" @click="undoDelete">Undo</button>
            </p>
            <form class="operator-snippet-form" @submit.prevent="saveForm">
              <h3>{{ formTitle }}</h3>
              <label>
                <span>Name</span>
                <input v-model="name" type="text" autocomplete="off" spellcheck="false" placeholder="launch" />
              </label>
              <small v-if="name.trim() && normalizedPreview !== name.trim()" class="operator-snippet-normalized">Will save as <code>{{ normalizedPreview }}</code></small>
              <label>
                <span>Body</span>
                <textarea ref="bodyInput" v-model="body" rows="7" spellcheck="true" placeholder="run startup sequence"></textarea>
              </label>
              <div class="operator-snippet-form-meta">
                <span>{{ body.length }} chars</span>
                <span>{{ body.split(/\r?\n/).length }} line(s)</span>
                <span>Ctrl+Enter saves</span>
              </div>
              <div class="operator-snippet-form-actions">
                <button type="submit" :disabled="!name.trim() || !body.trim()">{{ editingName ? 'Update' : 'Save' }}</button>
                <button type="button" @click="clearForm">Clear</button>
              </div>
            </form>
            <section class="operator-snippet-import" aria-label="Import snippets">
              <label>
                <span>Import JSON</span>
                <textarea v-model="importText" rows="3" spellcheck="false" placeholder='{"snippets":[{"name":"launch","body":"run startup sequence"}]}'></textarea>
              </label>
              <button type="button" :disabled="!importText.trim()" @click="importJson">Import</button>
            </section>
            <ol v-if="visibleSnippets.length" class="operator-snippet-list">
              <li v-for="snippet in visibleSnippets" :key="snippet.id" class="operator-snippet-item" :data-pinned="snippet.pinned === true">
                <div class="operator-snippet-main">
                  <strong><span v-if="snippet.pinned" class="operator-snippet-pin" aria-label="Pinned">PIN</span>{{ snippet.name }}</strong>
                  <p>{{ snippet.body }}</p>
                  <small>
                    Updated {{ snippet.updated_at }}
                    <template v-if="snippet.last_used_at"> · used {{ snippet.use_count ?? 0 }} · last {{ snippet.last_used_at }}</template>
                  </small>
                </div>
                <div class="operator-snippet-row-actions">
                  <button type="button" @click="emit('run', snippet, 'default')">Run</button>
                  <button type="button" @click="emit('run', snippet, 'enqueue')">Queue</button>
                  <button type="button" @click="fillSnippet(snippet)">Fill</button>
                  <button type="button" @click="copyBody(snippet)">Copy</button>
                  <button type="button" @click="emit('pin', snippet.name)">{{ snippet.pinned ? 'Unpin' : 'Pin' }}</button>
                  <button type="button" @click="startEdit(snippet)">Edit</button>
                  <button type="button" @click="deleteSnippet(snippet)">Delete</button>
                </div>
              </li>
            </ol>
            <p v-else class="mcp-panel-empty">{{ emptyText }}</p>
          </aside>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
