<script setup lang="ts">
import type { AffordanceConfirmationItem } from '../composables/useAffordanceConfirmations';

const props = defineProps<{
  items: AffordanceConfirmationItem[];
}>();

const emit = defineEmits<{
  confirm: [item: AffordanceConfirmationItem];
  cancel: [item: AffordanceConfirmationItem];
}>();

function targetLine(item: AffordanceConfirmationItem): string {
  return [item.surfaceId, item.actionId].filter(Boolean).join(' / ') || item.confirmationId;
}
</script>

<template>
  <section v-if="props.items.length" class="affordance-confirmations" aria-label="Pending confirmations">
    <article v-for="item in props.items" :key="item.confirmationId" class="affordance-confirmation-item">
      <div class="affordance-confirmation-copy">
        <span class="affordance-confirmation-label">Confirmation Required</span>
        <strong>{{ targetLine(item) }}</strong>
        <span v-if="item.message" class="affordance-confirmation-message">{{ item.message }}</span>
      </div>
      <div class="affordance-confirmation-actions">
        <button type="button" class="affordance-confirmation-cancel" @click="emit('cancel', item)">Cancel</button>
        <button type="button" class="affordance-confirmation-confirm" @click="emit('confirm', item)">Confirm</button>
      </div>
    </article>
  </section>
</template>
