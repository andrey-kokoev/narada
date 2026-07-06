<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { GitSummary } from '../composables/useGitSummary';

const props = defineProps<{
  available: boolean;
  summary: GitSummary;
  triggerless?: boolean;
}>();
const emit = defineEmits<{
  refresh: [];
}>();

const open = defineModel<boolean>('open', { default: false });
const copyLabel = ref('Copy diagnostics');
const expandedSections = ref(new Set<string>(['changed_files']));

const visibleCount = computed(() => props.summary.changedFiles.count + props.summary.recentCommits.count);
const gitLabel = computed(() => `Git: ${props.summary.status === 'not_loaded' ? 'ready' : props.summary.status} · ${visibleCount.value} visible`);
const subtitle = computed(() => props.summary.serverName ? `${props.summary.serverName} · worktree posture` : 'worktree posture');
const repository = computed(() => props.summary.repository ?? {});
const branchLabel = computed(() => textField(repository.value, 'branch') || (booleanField(repository.value, 'detached') ? 'detached' : 'not advertised'));
const cleanLabel = computed(() => booleanField(repository.value, 'clean') ? 'clean' : 'dirty or unknown');
const upstreamLabel = computed(() => textField(repository.value, 'upstream') || 'not configured');
const aheadBehindLabel = computed(() => `${countValue(repository.value, 'ahead')} ahead / ${countValue(repository.value, 'behind')} behind`);
const sections = computed(() => [
  { key: 'changed_files', title: 'Changed files', collection: props.summary.changedFiles },
  { key: 'recent_commits', title: 'Recent commits', collection: props.summary.recentCommits },
]);

watch(open, (value) => {
  if (value) emit('refresh');
});

function isExpanded(key: string): boolean {
  return expandedSections.value.has(key);
}

function toggleSection(key: string) {
  const next = new Set(expandedSections.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedSections.value = next;
}

function countValue(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '0';
}

function countLabel(key: string): string {
  const value = props.summary.counts[key];
  return typeof value === 'number' || typeof value === 'string' ? String(value) : '0';
}

function changedFileKey(row: Record<string, unknown>, index: number): string {
  return textField(row, 'path', 'display_path') || String(index);
}

function changedFileTitle(row: Record<string, unknown>): string {
  return textField(row, 'display_path', 'path') || '(unknown path)';
}

function changedFileMeta(row: Record<string, unknown>): string {
  return [textField(row, 'status'), booleanField(row, 'conflict') ? 'conflict' : null].filter(Boolean).join(' · ');
}

function commitKey(row: Record<string, unknown>, index: number): string {
  return textField(row, 'hash', 'short_hash') || String(index);
}

function commitTitle(row: Record<string, unknown>): string {
  const shortHash = textField(row, 'short_hash');
  const subject = textField(row, 'subject') || '(no subject)';
  return shortHash ? `${shortHash} ${subject}` : subject;
}

function commitMeta(row: Record<string, unknown>): string {
  return [textField(row, 'author_name'), textField(row, 'author_date')].filter(Boolean).join(' · ');
}

function textField(record: Record<string, unknown>, ...fields: string[]): string {
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string' && value) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
  }
  return '';
}

function booleanField(record: Record<string, unknown>, field: string): boolean {
  return record[field] === true;
}

async function copyDiagnostics() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(props.summary, null, 2));
    copyLabel.value = 'Copied';
    setTimeout(() => { copyLabel.value = 'Copy diagnostics'; }, 1400);
  } catch {
    copyLabel.value = 'Copy failed';
    setTimeout(() => { copyLabel.value = 'Copy diagnostics'; }, 1800);
  }
}
</script>

<template>
  <div v-if="available && !triggerless" class="git-panel-shell">
    <button v-if="!triggerless" type="button" class="mcp-panel-trigger git-panel-trigger" :aria-expanded="open" aria-controls="git-panel" @click="open = !open">
      <span class="chip-dot" aria-hidden="true"></span>
      <span>{{ gitLabel }}</span>
    </button>
  </div>
  <Teleport v-if="available" to="body">
      <Transition name="mcp-drawer">
        <div v-if="open" class="mcp-drawer-layer" role="presentation">
          <button type="button" class="mcp-drawer-backdrop" aria-label="Close Git panel" @click="open = false"></button>
          <aside id="git-panel" class="mcp-panel git-panel" aria-label="Git worktree projection">
            <header class="mcp-panel-header">
              <div>
                <h2>Git</h2>
                <p>{{ subtitle }}</p>
              </div>
              <button type="button" class="mcp-panel-close" aria-label="Close Git panel" @click="open = false">Close</button>
            </header>
            <dl class="mcp-panel-summary">
              <div><dt>State</dt><dd>{{ summary.status }}</dd></div>
              <div><dt>Branch</dt><dd>{{ branchLabel }}</dd></div>
              <div><dt>Worktree</dt><dd>{{ cleanLabel }}</dd></div>
              <div><dt>Upstream</dt><dd>{{ upstreamLabel }}</dd></div>
              <div><dt>Ahead/behind</dt><dd>{{ aheadBehindLabel }}</dd></div>
            </dl>
            <div class="mcp-panel-actions">
              <button type="button" @click="emit('refresh')">Refresh</button>
              <button type="button" @click="copyDiagnostics">{{ copyLabel }}</button>
            </div>
            <dl class="mcp-panel-summary git-counts" aria-label="Git dirty-state counts">
              <div><dt>Tracked</dt><dd>{{ countLabel('tracked_changed') }}</dd></div>
              <div><dt>Staged</dt><dd>{{ countLabel('staged') }}</dd></div>
              <div><dt>Unstaged</dt><dd>{{ countLabel('unstaged') }}</dd></div>
              <div><dt>Untracked</dt><dd>{{ countLabel('untracked') }}</dd></div>
              <div><dt>Conflicts</dt><dd>{{ countLabel('conflicts') }}</dd></div>
            </dl>
            <div class="sop-items-scroll git-items-scroll">
              <section v-for="section in sections" :key="section.key" class="sop-section git-section">
                <button type="button" class="mcp-server-row git-section-row" :aria-expanded="isExpanded(section.key)" @click="toggleSection(section.key)">
                  <span class="mcp-server-main"><strong>{{ section.title }}</strong><span>{{ section.collection.count }} item(s)<template v-if="section.collection.truncated"> · truncated</template></span></span>
                  <span class="mcp-server-chevron" aria-hidden="true">{{ isExpanded(section.key) ? '-' : '+' }}</span>
                </button>
                <ol v-if="isExpanded(section.key) && section.collection.items.length" class="mcp-server-list git-list">
                  <li v-for="(item, index) in section.collection.items" :key="section.key === 'changed_files' ? changedFileKey(item, index) : commitKey(item, index)" class="mcp-server-item git-item">
                    <span class="mcp-server-main">
                      <strong>{{ section.key === 'changed_files' ? changedFileTitle(item) : commitTitle(item) }}</strong>
                      <span>{{ section.key === 'changed_files' ? changedFileMeta(item) : commitMeta(item) }}</span>
                    </span>
                  </li>
                </ol>
                <p v-else-if="isExpanded(section.key)" class="mcp-panel-empty">No {{ section.title.toLowerCase() }} reported.</p>
              </section>
              <p v-if="summary.errors.length" class="mcp-panel-empty">{{ summary.errors.map((error) => error.message ?? error.code ?? 'Git read error').join('; ') }}</p>
            </div>
          </aside>
        </div>
      </Transition>
  </Teleport>
</template>
