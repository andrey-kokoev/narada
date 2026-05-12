# @narada2/site-config

Descriptor contracts for Site registry awareness and read-only registered Site probe reports.

This package models known-Site registry entries, capability edges/denials, probe requests, probe reports, and refusal behavior. It does not mutate target Site config, scan arbitrary client/project files, import target task/inbox DBs, copy secrets, or grant authority from relationship labels.

## First Slice

- Validate local Site registry awareness entries.
- Distinguish relationship labels from explicit capability edges.
- Build read-only registered Site probe reports.
- Refuse unregistered roots without explicit basis, target mutation, arbitrary scans, runtime state import, and credentials.

Receiving Sites own their own config files, probe execution, trust records, MCP registration, and target-rooted mutation authorities.
