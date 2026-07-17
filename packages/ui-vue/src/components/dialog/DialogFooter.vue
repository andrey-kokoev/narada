<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '../../lib/utils';

const props = defineProps<{ class?: HTMLAttributes['class'] }>();
</script>

<template>
  <div v-bind="$attrs" :class="cn('narada-dialog-footer', props.class)">
    <slot />
  </div>
</template>
