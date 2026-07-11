# @narada2/ui

Shared, renderer-neutral Narada UI foundation.

The package owns semantic color and typography tokens, universal base rules, generic CSS helpers, and the compiled stylesheet consumed by Narada browser surfaces.

```ts
import '@narada2/ui/styles.css';
```

This package does not own Vue components, session transport, operator panels, or site-specific layout. Vue primitives belong in `@narada2/ui-vue`; a consumer owns its application shell and domain behavior.
