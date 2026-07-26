<script setup lang="ts">
import { computed, type HTMLAttributes } from 'vue';
import {
  DropdownMenuItem as RekaDropdownMenuItem,
  type DropdownMenuItemEmits,
  type DropdownMenuItemProps,
  useForwardPropsEmits,
} from 'reka-ui';
import { cn } from '../../lib/utils';

defineOptions({
  inheritAttrs: false,
});

interface Props extends DropdownMenuItemProps {
  class?: HTMLAttributes['class'];
}

const props = defineProps<Props>();
const emits = defineEmits<DropdownMenuItemEmits>();

const delegatedProps = computed(() => {
  const { class: _class, ...delegated } = props;
  return delegated;
});
const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <RekaDropdownMenuItem
    v-bind="{ ...forwarded, ...$attrs }"
    :class="cn('narada-dropdown-menu-item', props.class)"
  >
    <slot />
  </RekaDropdownMenuItem>
</template>
