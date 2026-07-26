<script setup lang="ts">
import {
  Command,
  CommandEmpty,
  CommandItem,
  CommandList,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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

  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <button type="button">Open menu</button>
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      <DropdownMenuItem>Menu item</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
