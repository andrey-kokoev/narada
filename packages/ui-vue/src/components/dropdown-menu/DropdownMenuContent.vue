<script setup lang="ts">
import { computed, type HTMLAttributes } from 'vue';
import {
  DropdownMenuContent as RekaDropdownMenuContent,
  DropdownMenuPortal,
  type DropdownMenuContentEmits,
  type DropdownMenuContentProps,
  useForwardPropsEmits,
} from 'reka-ui';
import { cn } from '../../lib/utils';

defineOptions({
  inheritAttrs: false,
});

interface Props extends DropdownMenuContentProps {
  class?: HTMLAttributes['class'];
}

const props = withDefaults(defineProps<Props>(), {
  sideOffset: 4,
});
const emits = defineEmits<DropdownMenuContentEmits>();

const delegatedProps = computed(() => {
  const { class: _class, ...delegated } = props;
  return delegated;
});
const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <DropdownMenuPortal>
    <RekaDropdownMenuContent
      v-bind="{ ...forwarded, ...$attrs }"
      :class="cn('narada-dropdown-menu-content', props.class)"
    >
      <slot />
    </RekaDropdownMenuContent>
  </DropdownMenuPortal>
</template>
