# Mailbox To Task Admission Standard

Mailbox sync is not task creation by itself.

A mailbox-enabled Site needs a bounded pipeline:

1. Sync or read mail through an admitted mailbox connector.
2. Project bounded message metadata and evidence references.
3. Classify whether the message is actionable.
4. Admit a task, ticket, draft, or no-action disposition through Site-local authority.
5. Preserve raw mailbox bodies, raw Graph ids, tokens, and attachments outside task authority unless separately admitted.

## Required Surfaces

A mailbox-enabled Site should expose:

- mailbox or site-mail surface for provider interaction;
- inbox surface for local admission or candidate intake;
- task-lifecycle surface when messages can become governed tasks;
- draft/reply/send tools only when the Site has explicit outbound authority.

## Evidence Shape

Mailbox evidence may include:

- subject;
- sender display/address when allowed by Site policy;
- received timestamp;
- bounded body summary;
- hashed or opaque provider ids;
- local evidence folder reference;
- disposition and task/draft/ticket reference.

Mailbox evidence must not include:

- raw OAuth tokens;
- raw Graph ids as task authority;
- unrestricted body dumps;
- unbounded attachments;
- send authority implied by draft creation.

## Site Posture

Staccato is the reference implementation family for mailbox processing strength, but each Site must own its own mailbox authority and admission path.

Utz, Sonar, Timour Marketing Agent, Revolution, Smart Scheduling, Thoughts, and User Site should be evaluated by the adjacent gate and by Site-local mailbox doctors where available.

The adjacent coherence gate is intentionally shallow for mailbox posture: it checks surface presence and reports unclassified mailbox tool contracts. It does not prove live sync, body admission, draft creation, send authority, or task creation. Those require Site-local mailbox doctors and bounded live smoke evidence.
