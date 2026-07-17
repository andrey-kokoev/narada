<script setup lang="ts">
import { computed, type HTMLAttributes } from 'vue';
import { DialogDescription as RekaDialogDescription, type DialogDescriptionProps, useForwardProps } from 'reka-ui';
import { cn } from '../../lib/utils';

defineOptions({
  inheritAttrs: false,
});

interface Props extends DialogDescriptionProps {
  class?: HTMLAttributes['class'];
}

const props = defineProps<Props>();
const delegatedProps = computed(() => {
  const { class: _class, ...delegated } = props;
  return delegated;
});
const forwarded = useForwardProps(delegatedProps);
</script>

<template>
  <RekaDialogDescription
    v-bind="{ ...forwarded, ...$attrs }"
    :class="cn('narada-dialog-description', props.class)"
  >
    <slot />
  </RekaDialogDescription>
</template>
