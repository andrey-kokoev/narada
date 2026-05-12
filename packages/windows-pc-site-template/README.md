# @narada2/windows-pc-site-template

Parameterized descriptor template for a Windows PC Site embodiment.

It describes layout, runtime path conventions, admission checklist, and health/repair command contracts. It does not import desktop-sunroom-2 runtime state, Komorebi/YASB live state, logs, PIDs, socket paths, monitor names, display IDs, or operator preferences as authority.

## Greenfield Plan

The `narada.windows_pc_site_template.plan.v0` contract builds a descriptor-only plan for a future Windows PC Site from selected template slices: operator surface, shell MCP, test MCP, OSL, and Komorebi/YASB. It lists planned directories and required local admissions without creating files.

Plans refuse source runtime import, PC-locus state import, and credentials. Windows profile mutation is reported as a warning because it requires a separate admitted local execution.
