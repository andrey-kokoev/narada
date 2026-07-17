<script setup lang="ts">
import { computed, type HTMLAttributes } from 'vue';
import {
  DialogClose,
  DialogContent as RekaDialogContent,
  type DialogContentEmits,
  type DialogContentProps,
  DialogOverlay,
  DialogPortal,
  useForwardPropsEmits,
} from 'reka-ui';
import { X } from 'lucide-vue-next';
import { cn } from '../../lib/utils';

defineOptions({
  inheritAttrs: false,
});

interface Props extends DialogContentProps {
  class?: HTMLAttributes['class'];
}

const props = defineProps<Props>();
const emits = defineEmits<DialogContentEmits>();

const delegatedProps = computed(() => {
  const { class: _class, ...delegated } = props;
  return delegated;
});
const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <DialogPortal>
    <DialogOverlay class="narada-dialog-overlay" />
    <RekaDialogContent
      v-bind="{ ...forwarded, ...$attrs }"
      :class="cn('narada-dialog-content', props.class)"
    >
      <slot />
      <DialogClose class="narada-dialog-close">
        <X class="narada-dialog-close-icon" aria-hidden="true" />
        <span class="narada-sr-only">Close</span>
      </DialogClose>
    </RekaDialogContent>
  </DialogPortal>
</template>
