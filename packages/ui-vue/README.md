# @narada2/ui-vue

Narada-owned Vue primitives built from shadcn-vue-generated source and Reka UI runtime primitives.

This is an internal workspace package, not an independently published npm
library. Its TypeScript and Vue source exports are intentional: Narada Vue
applications compile them as part of their own renderer build. External or
framework-neutral consumers use the public compiled stylesheet from
`@narada2/ui` instead.

Initial exported set:

- `Tooltip`, `TooltipContent`, `TooltipProvider`, `TooltipTrigger`
- `Command`, `CommandEmpty`, `CommandItem`, `CommandList`
- `Dialog`, `DialogClose`, `DialogContent`, `DialogDescription`, `DialogFooter`, `DialogHeader`, `DialogTitle`, `DialogTrigger`
- `cn`

The current Agent Web UI components are all generic enough for this initial export. The operator command palette, session shell, panels, composables, and protocol-facing components remain Agent Web UI-local. Future generated primitives are added here only when they have no session or site-domain semantics.

`shadcn-vue` is a development-time source generator. It is retained in `devDependencies` and `components.json` is authoritative; it is not required at runtime by this package.

Consumers import the shared foundation and primitives explicitly:

```ts
import '@narada2/ui/styles.css';
import '@narada2/ui-vue/components.css';
import { Command, CommandItem, Dialog, DialogContent } from '@narada2/ui-vue';
```

The convenience `@narada2/ui-vue/styles.css` entry imports both stylesheets for standalone Vue consumers.
