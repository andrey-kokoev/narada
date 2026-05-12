# Narada Proper Inbox

Narada proper inbox machinery is not initialized yet. This directory provides only a manual v0 intake surface for external handoff packets.

External handoff packets from narada-andrey should be placed in or referenced from:

```text
.narada/inbox/external-handoffs/
```

Incoming packets are pending evidence. They are not Narada proper truth, task authority, inbox authority, checkpoint memory, roster authority, runtime state, or capability grants.

Every received packet must be listed in `.narada/admission/pending-handoffs.json` with source, reference, received time, status, and summary. Admission, defer, and reject decisions are recorded locally in `.narada/admission/admission-ledger.jsonl`.

Do not grant narada-andrey mutation authority. Do not copy narada-andrey `.ai` databases, task history, inbox history, checkpoints, rosters, operator-surface bindings, PC-locus state, or secrets here.
