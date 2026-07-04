<script setup lang="ts">
import type { TooltipContentEmits, TooltipContentProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { TooltipContent, TooltipPortal, useForwardPropsEmits } from 'reka-ui';
import { cn } from '@/app/lib/utils';

defineOptions({
  inheritAttrs: false,
});

interface Props extends TooltipContentProps {
  class?: HTMLAttributes['class'];
}

const props = withDefaults(defineProps<Props>(), {
  sideOffset: 8,
});
const emits = defineEmits<TooltipContentEmits>();

const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <TooltipPortal>
    <TooltipContent
      v-bind="{ ...forwarded, ...$attrs }"
      :class="cn('narada-tooltip-content', props.class)"
    >
      <slot />
    </TooltipContent>
  </TooltipPortal>
</template>
