# @narada2/site-operating-loop

Shared Site Operating Loop substrate for Narada Sites.

This package owns the reusable storage operations for loop runs, steps, locks,
health, pause/resume control, attention records, and directive outcomes. Its
public records use canonical `narada.site_operating_loop.*` schemas. It also
owns generic policy loading, merging, validation, and quiet-hours evaluation. It
does not own a Site's source adapters, resident agent identity, or concrete loop
steps.

Site-specific code is expected to:

- open the Site-local task lifecycle SQLite database using that Site's DB
  discipline;
- call `ensureSiteLoopTables(db)`;
- load policy with `loadSiteOperatingLoopPolicy()` or wrap it with
  Site-specific defaults;
- compose source-specific loop steps;
- pass the resulting store into the exported run/status/control helpers.

For simple loops, use `runSiteOperatingLoop()` from `@narada2/site-operating-loop/runner`.
For mature loops that need custom branching or domain-specific reconciliation,
compose directly with the store helpers.

The package exports from `dist`. Run `pnpm --filter @narada2/site-operating-loop build`
after changing `src` or `bin` files.

The Sonar email resident loop is currently the first consumer. Its email intake,
resident dispatch policy, and escalation semantics remain in `narada.sonar`; the
table/control/health/outcome substrate lives here.
