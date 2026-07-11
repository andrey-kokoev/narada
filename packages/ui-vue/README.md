# @narada2/ui-vue

Narada-owned Vue primitives built from shadcn-vue-generated source and Reka UI runtime primitives.

Initial exported set:

- `Tooltip`, `TooltipContent`, `TooltipProvider`, `TooltipTrigger`
- `Command`, `CommandEmpty`, `CommandItem`, `CommandList`
- `cn`

The current Agent Web UI components are all generic enough for this initial export. The operator command palette, session shell, panels, composables, and protocol-facing components remain Agent Web UI-local. Future generated primitives are added here only when they have no session or site-domain semantics.

`shadcn-vue` is a development-time source generator. It is retained in `devDependencies` and `components.json` is authoritative; it is not required at runtime by this package.

Consumers import the shared foundation and primitives explicitly:

```ts
import '@narada2/ui/styles.css';
import '@narada2/ui-vue/components.css';
import { Command, CommandItem } from '@narada2/ui-vue';
```

The convenience `@narada2/ui-vue/styles.css` entry imports both stylesheets for standalone Vue consumers.
