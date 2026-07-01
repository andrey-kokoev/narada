<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';
import { ArtifactRenderingConfigKey, artifactContentPath, artifactMetadataPath } from '../../lib/artifactConfig';

interface ArtifactRefContent {
  type: 'artifact_ref';
  artifact_id: string;
  kind?: string;
  title?: string;
  render_hint?: string;
}

const props = defineProps<{
  artifact?: ArtifactRefContent;
  sessionId?: string | null;
}>();

const config = inject(ArtifactRenderingConfigKey, { artifactBasePath: null, artifactTransport: null });
const status = ref<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
const message = ref('');
const metadata = ref<Record<string, unknown> | null>(null);
const collapsed = ref(false);
const copied = ref(false);

const artifactId = computed(() => props.artifact?.artifact_id ?? '');
const metadataUrl = computed(() => artifactMetadataPath(config, props.sessionId, artifactId.value));
const contentUrl = computed(() => artifactContentPath(config, props.sessionId, artifactId.value));
const title = computed(() => String(metadata.value?.title ?? props.artifact?.title ?? artifactId.value));
const kind = computed(() => String(metadata.value?.kind ?? props.artifact?.kind ?? 'artifact'));
const canPreviewHtml = computed(() => kind.value === 'html' && Boolean(contentUrl.value) && status.value === 'ready');

onMounted(() => {
  void refreshArtifact();
});

async function refreshArtifact() {
  if (!metadataUrl.value) {
    status.value = 'unavailable';
    message.value = props.sessionId ? 'Artifact endpoint is not configured for this session.' : 'Artifact session is not available for this message.';
    return;
  }
  status.value = 'loading';
  copied.value = false;
  try {
    const response = await fetch(metadataUrl.value, { method: 'GET' });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      status.value = 'unavailable';
      message.value = body?.message ?? body?.error ?? `Artifact unavailable (${response.status})`;
      return;
    }
    metadata.value = body?.artifact ?? body;
    status.value = 'ready';
    message.value = '';
  } catch (error) {
    status.value = 'unavailable';
    message.value = error instanceof Error ? error.message : String(error);
  }
}

async function copyUrl() {
  if (!contentUrl.value) return;
  await navigator.clipboard?.writeText?.(contentUrl.value);
  copied.value = true;
}
</script>

<template>
  <section class="artifact-card" :data-state="status" :data-kind="kind" :data-artifact-id="artifactId">
    <header class="artifact-card-header">
      <div>
        <div class="artifact-title">{{ title }}</div>
        <div class="artifact-meta">{{ kind }} artifact</div>
      </div>
      <div class="artifact-actions">
        <button type="button" @click="collapsed = !collapsed">{{ collapsed ? 'Expand' : 'Collapse' }}</button>
        <button type="button" :disabled="!contentUrl" @click="copyUrl">{{ copied ? 'Copied' : 'Copy link' }}</button>
        <a v-if="contentUrl" :href="contentUrl" target="_blank" rel="noreferrer">Open</a>
        <button type="button" @click="refreshArtifact">Refresh</button>
      </div>
    </header>
    <p v-if="status === 'loading'" class="artifact-status">Loading artifact...</p>
    <p v-else-if="status === 'unavailable'" class="artifact-status artifact-status-error">{{ message }}</p>
    <iframe
      v-else-if="canPreviewHtml && !collapsed"
      class="artifact-html-preview"
      sandbox="allow-scripts allow-forms"
      :src="contentUrl ?? undefined"
      :title="title"
    ></iframe>
    <p v-else-if="status === 'ready' && !collapsed" class="artifact-status">Preview is not available for this artifact type. Use Open to view it.</p>
  </section>
</template>
