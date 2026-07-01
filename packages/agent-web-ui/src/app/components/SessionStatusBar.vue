<script setup lang="ts">
import ProjectionVerbositySelect from './ProjectionVerbositySelect.vue';
import type { AgentActivityState } from '../composables/useAgentActivity';
import type { ProjectionVerbosity } from '../composables/useProjectionVerbosity';

defineProps<{
  eventEndpoint: string | null;
  healthEndpoint: string | null;
  healthTransport: string;
  streamText: string;
  healthText: string;
  summarizedStateSampleCount: number;
  verbosity: ProjectionVerbosity;
  verbosityLevels: readonly ProjectionVerbosity[];
  agentActivity: AgentActivityState;
}>();
const emit = defineEmits<{
  'update:verbosity': [value: ProjectionVerbosity];
}>();
</script>

<template>
  <section class="status" aria-label="Session status">
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
  </section>
</template>
