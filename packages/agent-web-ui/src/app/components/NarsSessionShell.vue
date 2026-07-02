<script setup lang="ts">
import ConversationTranscript from './ConversationTranscript.vue';
import OperatorComposer from './OperatorComposer.vue';
import SessionStatusBar from './SessionStatusBar.vue';
import type { AgentActivityState } from '../composables/useAgentActivity';
import type { useCloudflareProjection } from '../composables/useCloudflareProjection';
import type { ProjectionVerbosity } from '../composables/useProjectionVerbosity';
import type { SessionIdentitySummary } from '../composables/useNarsEvents';
import type { ProjectedEventRow } from '../lib/eventProjection';

const props = defineProps<{
  eventEndpoint: string | null;
  healthEndpoint: string | null;
  healthTransport: string;
  streamText: string;
  healthText: string;
  summarizedStateSampleCount: number;
  verbosity: ProjectionVerbosity;
  verbosityLevels: readonly ProjectionVerbosity[];
  rows: ProjectedEventRow[];
  sessionIdentity: SessionIdentitySummary;
  agentActivity: AgentActivityState;
  authorityTransition: Record<string, unknown> | null;
  cloudflareProjection: ReturnType<typeof useCloudflareProjection>;
  followLatestRevision: number;
}>();
const draft = defineModel<string>('draft', { required: true });
const emit = defineEmits<{
  'update:verbosity': [value: ProjectionVerbosity];
  'publish-cloudflare': [cloudflareApiBaseUrl: string];
  submit: [];
}>();
</script>

<template>
  <main class="shell" aria-label="Narada Agent Web UI">
    <header class="shell-header">
      <div class="brand-lockup">
        <span class="brand-mark" aria-hidden="true">N</span>
        <div>
          <h1>{{ sessionIdentity.title }}</h1>
          <p>{{ sessionIdentity.subtitle }}</p>
        </div>
      </div>
      <div class="session-chip" :data-state="healthText.split(' ')[0]">
        <span class="chip-dot" aria-hidden="true"></span>
        <span>{{ healthText }}</span>
      </div>
    </header>
    <SessionStatusBar
      :event-endpoint="eventEndpoint"
      :health-endpoint="healthEndpoint"
      :health-transport="healthTransport"
      :stream-text="streamText"
      :health-text="healthText"
      :summarized-state-sample-count="summarizedStateSampleCount"
      :verbosity="verbosity"
      :verbosity-levels="verbosityLevels"
      :agent-activity="agentActivity"
      :authority-transition="authorityTransition"
      :cloudflare-projection="cloudflareProjection"
      @update:verbosity="emit('update:verbosity', $event)"
      @publish-cloudflare="emit('publish-cloudflare', $event)"
    />
    <ConversationTranscript :rows="rows" :verbosity="verbosity" :agent-activity="agentActivity" :follow-latest-revision="followLatestRevision" />
    <OperatorComposer v-model="draft" :disabled="authorityTransition?.input_policy === 'disabled_source_sealed'" disabled-reason="Source authority is sealed. Reattach to the target authority before sending." @submit="emit('submit')" />
  </main>
</template>
