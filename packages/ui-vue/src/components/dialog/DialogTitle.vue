<script setup lang="ts">
import { computed, type HTMLAttributes } from 'vue';
import { DialogTitle as RekaDialogTitle, type DialogTitleProps, useForwardProps } from 'reka-ui';
import { cn } from '../../lib/utils';

defineOptions({
  inheritAttrs: false,
});

interface Props extends DialogTitleProps {
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
  <RekaDialogTitle
    v-bind="{ ...forwarded, ...$attrs }"
    :class="cn('narada-dialog-title', props.class)"
  >
    <slot />
  </RekaDialogTitle>
</template>
