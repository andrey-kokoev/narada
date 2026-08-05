# @narada-core/ui

Shared, renderer-neutral Narada UI foundation.

The package owns semantic color and typography tokens, universal base rules, generic CSS helpers, and the compiled stylesheet consumed by Narada browser surfaces.

```ts
import '@narada-core/ui/styles.css';
```

This package does not own Vue components, session transport, operator panels, or site-specific layout. Vue primitives belong in `@narada-core/ui-vue`; a consumer owns its application shell and domain behavior.

## Runtime posture

Build, typecheck, and tests are Bun-first; the `*:node` scripts retain the Node
compatibility paths. Publication admission remains the existing Node lifecycle
check until that workspace publishing boundary is separately verified under Bun.
