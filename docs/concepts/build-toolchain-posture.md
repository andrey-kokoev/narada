# Build Toolchain Posture

Narada's build authority is conservative by default:

- `tsc --noEmit` is the authoritative semantic typecheck.
- `tsc` is the authoritative package build and declaration emit path.
- Faster emit tools may be evaluated only as non-authoritative probes until they preserve Narada's package contracts.

## Oxbuild

`oxbuild` is currently allowed only as an experimental emit probe.

The probe command is:

```bash
pnpm toolchain:oxbuild-probe
```

It currently targets `@narada2/intent-zones` because that package is small and low-risk. The probe:

1. builds the package with `tsc`;
2. builds the package with `oxbuild`;
3. compares emitted JavaScript;
4. checks declaration output;
5. restores the package to canonical `tsc` output.

The probe does not replace `pnpm build`, `pnpm typecheck`, or `pnpm verify`.

## Promotion Rule

An alternate build tool can become package-authoritative only after:

1. semantic typecheck remains covered by `tsc --noEmit` or an equivalent TypeScript checker;
2. declaration output is complete and equivalent for the package exports;
3. runtime smoke tests pass against the alternate output;
4. the package has an explicit fallback to `tsc`;
5. verification records both speed benefit and authority preservation.

Until then, faster build tools are advisory acceleration candidates, not authority-bearing build surfaces.
