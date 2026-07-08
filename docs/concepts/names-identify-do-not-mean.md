# Names Identify; They Do Not Mean

## Principle

Names are stable identifiers. They may be used for lookup, routing to an explicitly declared object, correlation, logging, display, and exact reference.

Names must not be parsed to infer semantics.

Semantic classification must come from explicit schema, config, registry metadata, or authority records. It must not come from prefixes, suffixes, substrings, regular expressions, package basenames, path basenames, or other spelling conventions.

## Why

Name-derived semantics make authority and behavior implicit. They create silent coupling between spelling and policy, make review brittle, and let accidental naming shape runtime consequences.

Narada treats names as references, not doctrine. If a system needs to know whether something is read-only, mutating, credential-bearing, site-owned, task-governed, inbox-governed, or otherwise semantically meaningful, that fact must be present as data.

## Allowed

- Exact lookup by declared identifier.
- Routing to the object explicitly registered under that identifier.
- Correlation, logging, audit evidence, display, and stable references.
- Explicit alias maps declared as data.
- Compatibility aliases when they are explicit, temporary, documented, and covered by tests.

## Forbidden

- Inferring read-only posture from names such as `*_read`, `*_show`, `*_list`, or `*_doctor`.
- Inferring mutation posture from names such as `*_write`, `*_run`, `*_claim`, `*_send`, or `*_execute`.
- Inferring credential authority from names containing `token`, `auth`, `secret`, `password`, or `api_key`.
- Inferring surface/domain kind from tool prefixes such as `agent_context_`, `task_lifecycle_`, or `graph_mail_`.
- Inferring capability or authority from package names, server names, file names, path basenames, or suffixes such as `-mcp`.

## Test Invariant

For any classifier that outputs authority, capability, effect, domain, policy, type, or behavior:

> Replacing only a name with another valid name while keeping explicit metadata/config unchanged must not change the semantic output, except for echoed identifiers.

The useful regression shape is pairwise:

- neutral name plus metadata
- suspicious name plus the same metadata
- compare outputs after stripping echoed identifier fields

Payload-content checks are different. For example, a request may be refused because an argument contains a secret-shaped field. It must not be refused merely because the tool name contains a secret-shaped word.

## Review Smell

Any use of `startsWith`, `endsWith`, `includes`, `match`, regular expressions, basename parsing, or string splitting near semantic classification needs explicit review.

The first question is:

> Is this code using the name as an identifier, or is it making the name mean something?

Identifier use is acceptable. Semantic inference is not.

