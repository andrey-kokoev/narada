<script setup lang="ts">
import { ref } from 'vue';
import ProjectionVerbositySelect from './ProjectionVerbositySelect.vue';
import type { AgentActivityState } from '../composables/useAgentActivity';
import type { useCloudflareProjection } from '../composables/useCloudflareProjection';
import type { ProjectionVerbosity } from '../composables/useProjectionVerbosity';

const props = defineProps<{
  eventEndpoint: string | null;
  healthEndpoint: string | null;
  healthTransport: string;
  streamText: string;
  healthText: string;
  summarizedStateSampleCount: number;
  verbosity: ProjectionVerbosity;
  verbosityLevels: readonly ProjectionVerbosity[];
  agentActivity: AgentActivityState;
  authorityTransition: Record<string, unknown> | null;
  cloudflareProjection: ReturnType<typeof useCloudflareProjection>;
}>();
const emit = defineEmits<{
  'update:verbosity': [value: ProjectionVerbosity];
  'publish-cloudflare': [cloudflareApiBaseUrl: string];
}>();
const cloudflareApiBaseUrl = ref(props.cloudflareProjection.defaultApiBaseUrl.value);
const copyLabel = ref('Copy');

async function copyRemoteUrl(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    copyLabel.value = 'Copied';
    setTimeout(() => { copyLabel.value = 'Copy'; }, 1400);
  } catch {
    copyLabel.value = 'Copy failed';
    setTimeout(() => { copyLabel.value = 'Copy'; }, 1800);
  }
}

function authorityText(authority: Record<string, unknown> | null): string {
  if (!authority) return 'not advertised';
  const host = typeof authority.authority_runtime_host === 'string' ? authority.authority_runtime_host : 'unknown';
  const epoch = Number.isInteger(authority.authority_epoch) ? ` e${authority.authority_epoch}` : '';
  const transition = typeof authority.authority_transition_state === 'string' && authority.authority_transition_state ? ` · ${authority.authority_transition_state}` : '';
  const writes = typeof authority.source_write_admission === 'string' && authority.source_write_admission ? ` · writes ${authority.source_write_admission}` : '';
  return `${host}${epoch}${transition}${writes}`;
}

function reattachText(authority: Record<string, unknown> | null): string | null {
  if (!authority?.stale_source) return null;
  const reattach = authority.reattach && typeof authority.reattach === 'object' && !Array.isArray(authority.reattach) ? authority.reattach as Record<string, unknown> : null;
  const target = typeof reattach?.target_session_id === 'string' && reattach.target_session_id
    ? reattach.target_session_id
    : typeof authority.superseded_by_session_id === 'string' && authority.superseded_by_session_id
      ? authority.superseded_by_session_id
      : typeof authority.authority_locator_ref === 'string' && authority.authority_locator_ref
        ? authority.authority_locator_ref
        : 'target authority';
  return `Stale authority; reattach to ${target}.`;
}
</script>

<template>
  <section class="status" :class="{ 'status-has-projection-control': cloudflareProjection.available.value }" aria-label="Session status">
    <div>
      <span class="label">Events</span>
      <span>{{ eventEndpoint ?? 'not configured' }}</span>
    </div>
    <div>
      <span class="label">Health</span>
      <span>{{ healthEndpoint ? `${healthEndpoint} (${healthTransport})` : 'not configured' }}</span>
    </div>
    <div>
      <span class="label">Stream</span>
      <span>{{ streamText }}</span>
    </div>
    <div>
      <span class="label">State</span>
      <span>{{ healthText }}</span>
      <span v-if="agentActivity.active" class="activity-chip" :data-activity-state="agentActivity.state">
        {{ agentActivity.state }}<template v-if="agentActivity.elapsedSeconds >= 5"> · {{ agentActivity.elapsedSeconds }}s</template>
      </span>
    </div>
    <div>
      <span class="label">Authority</span>
      <span>{{ authorityText(authorityTransition) }}</span>
      <span v-if="reattachText(authorityTransition)" class="retention-note">{{ reattachText(authorityTransition) }}</span>
    </div>
    <div>
      <label class="label" for="projection-verbosity">View</label>
      <ProjectionVerbositySelect :model-value="verbosity" :levels="verbosityLevels" @update:model-value="emit('update:verbosity', $event)" />
      <span v-if="summarizedStateSampleCount && (verbosity === 'diagnostics' || verbosity === 'raw')" class="retention-note">{{ summarizedStateSampleCount }} routine status update{{ summarizedStateSampleCount === 1 ? '' : 's' }} folded into State</span>
    </div>
    <div v-if="cloudflareProjection.available.value" class="projection-control">
      <label class="label" for="cloudflare-api-base-url">Cloudflare</label>
      <div class="projection-control-row">
        <input
          id="cloudflare-api-base-url"
          v-model="cloudflareApiBaseUrl"
          :disabled="cloudflareProjection.busy.value"
          placeholder="Cloudflare projection Worker URL"
        />
        <button type="button" :disabled="cloudflareProjection.busy.value || !cloudflareApiBaseUrl.trim()" @click="emit('publish-cloudflare', cloudflareApiBaseUrl)">
          {{ cloudflareProjection.busy.value ? 'Publishing' : 'Publish' }}
        </button>
      </div>
      <span>{{ cloudflareProjection.statusText.value }}</span>
      <div v-if="cloudflareProjection.remoteUrl.value" class="projection-actions">
        <a class="projection-link" :href="cloudflareProjection.remoteUrl.value" target="_blank" rel="noreferrer">Open remote UI</a>
        <button type="button" class="projection-copy" @click="copyRemoteUrl(cloudflareProjection.remoteUrl.value)">{{ copyLabel }}</button>
      </div>
    </div>
  </section>
</template>
