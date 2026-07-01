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
