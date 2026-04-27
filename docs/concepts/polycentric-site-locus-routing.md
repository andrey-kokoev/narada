# Polycentric Site Locus Routing

Polycentric Site locus routing is the rule for deciding where a client, project, data, or automation observation belongs when several Narada-capable loci are involved.

The rule is:

> Route each observation, request, or proposal to the locus whose authority can interpret or act on it. Do not broadcast everywhere.

A locus is not selected because it is nearby, convenient, or currently open in an assistant session. It is selected because its authority grammar owns the state, policy, or action at issue.

## Why This Exists

The Staccato setup exposed a recurring pattern: real client work can involve a client service repository, local data storage, ELT work, the operator's User Site, and Narada proper at the same time.

Treating that as one large "client Site" smears authority. Treating it as a hierarchy also fails, because information does not always flow downward from Narada proper. The coherent shape is polycentric: multiple loci exist, each with a narrower authority domain, connected by explicit routing.

## Locus Taxonomy

| Locus | Owns | Does Not Own |
| --- | --- | --- |
| User Site | Operator memory, preferences, intake, agent/session continuity, user-scoped policy | Client data truth, service repo code truth, machine/session recovery |
| PC Site | Machine/session state: display topology, services, scheduled tasks, drivers, recovery actions | Operator memory, client business truth, project code semantics |
| Project Site | Project-specific source, backlog, construction traces, local project doctrine | Cross-client operator memory, raw client data unless explicitly admitted |
| Client Service Site | Client-facing service repo structure, service-specific runbooks, repo governance posture | Local data storage truth, ELT-derived datasets, Narada proper doctrine |
| Data Site | Local/raw/curated data files, data residency, dataset provenance, defensive access posture | Service code behavior, ELT transform ownership, operator global memory |
| ELT Site | Extract/load/transform jobs, transform provenance, pipeline run traces, derived-data handoff | Raw data authority outside its admitted inputs, client service repo policy |
| Narada Proper | General doctrine, reusable tooling, Site templates, kernel semantics | Case-specific client facts unless promoted through governed intake |

## Routing Examples

| Observation | Route To | Reason |
| --- | --- | --- |
| "This client repo needs a deny-by-default Git posture" | Client Service Site | The service repo owns its Git admission policy. |
| "This raw export should not become a Git repo" | Data Site | Data residency and local data posture are data-locus authority. |
| "This transform needs a provenance trace" | ELT Site | The transform side owns run evidence and output lineage. |
| "Agents need a durable place to send help requests" | User Site | Operator intake and working memory are user-locus authority. |
| "This pattern recurs across clients and should become a template" | Narada Proper | Reusable doctrine and templates belong in Narada proper. |

## Routing Discipline

- Do not broadcast a message to every plausible Site.
- Do not make a single client Site own service code, data residency, ELT, and operator memory by default.
- Do not infer authority from filesystem proximity alone.
- Prefer the smallest locus that can interpret and act.
- Promote reusable patterns to Narada proper only after the originating case can still run through the lifted form.

## Client-Sensitive Bootstrap Posture

Client-sensitive folders should start defensive:

- Git deny-by-default.
- Admit only governance paths that are intentionally shareable.
- Keep local data and ELT metadata possible without requiring the folder itself to become a Git repo.
- Use simple authored Markdown envelopes when canonical Site-local inbox/task machinery is not yet installed.

This is an Inhabited Evolution posture: build what the operation has earned, keep unearned machinery out, and route residuals to the locus that can own them.
