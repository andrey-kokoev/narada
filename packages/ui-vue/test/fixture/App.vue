<script setup lang="ts">
import {
  Command,
  CommandEmpty,
  CommandItem,
  CommandList,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@narada2/ui-vue';
</script>

<template>
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger as-child>
        <button type="button">Help</button>
      </TooltipTrigger>
      <TooltipContent>Shared tooltip</TooltipContent>
    </Tooltip>
  </TooltipProvider>

  <Command>
    <CommandList label="Actions">
      <CommandItem option-id="action-one" :active="true">Action one</CommandItem>
      <CommandEmpty>No actions</CommandEmpty>
    </CommandList>
  </Command>
</template>
