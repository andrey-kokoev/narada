# Mailbox-Charter Knowledge Sources

## Mission
Define a coherent knowledge-source architecture for mailbox agents where knowledge is bound to a mailbox-plus-charter combination, but the knowledge itself does not live in the repo as canonical operational content.

This task defines the contract for three supported knowledge source types:

- `url`
- `local_path`
- `sqlite`

## Why This Exists
Mailbox-specific and organization-specific knowledge is usually deployment-specific, mutable, and operational. It should not be embedded in the code repository as if it were product source.

The repo should define:

- how knowledge sources are declared
- how they are attached to mailbox-plus-charter bindings
- how they are normalized and retrieved
- how provenance is preserved

The repo should not assume that mailbox knowledge itself is stored in-repo.

## Scope

- coordinator configuration contract for knowledge sources
- mailbox-plus-charter binding model
- supported source types
- retrieval and normalization contract
- provenance expectations
- implications for foreman and charter invocation

This is a spec and interface-definition task, not a full ingestion implementation task.

## Core Principles

1. Knowledge is attached to a mailbox-plus-charter combination, not globally by default.
2. Knowledge content is external to the repo unless it is sample or test data.
3. The foreman consumes normalized retrieved knowledge, not raw arbitrary sources directly.
4. Every retrieved knowledge item must preserve provenance.
5. Normative policy knowledge and descriptive reference knowledge should remain distinguishable.

## Canonical Binding Model

Mailbox-to-charter coordinator config should be able to declare knowledge sources per charter.

Illustrative shape:

```typescript
type KnowledgeSourceType = "url" | "local_path" | "sqlite";

interface MailboxKnowledgeBinding {
  mailbox_id: string;
  charter_knowledge: Record<string, KnowledgeSourceRef[]>;
}

interface KnowledgeSourceRef {
  id: string;
  type: KnowledgeSourceType;
  enabled: boolean;
  purpose?: string;
}
```

JSON shape:

```json
{
  "mailbox_bindings": {
    "help@global-maxima.com": {
      "available_charters": ["support_steward", "obligation_keeper"],
      "default_primary_charter": "support_steward",
      "knowledge_sources": {
        "support_steward": [
          {
            "id": "gm_support_docs",
            "type": "url",
            "enabled": true,
            "purpose": "Product support procedures and FAQs"
          },
          {
            "id": "gm_local_playbook",
            "type": "local_path",
            "enabled": true,
            "purpose": "Locally maintained support playbook"
          }
        ],
        "obligation_keeper": [
          {
            "id": "gm_commitments_db",
            "type": "sqlite",
            "enabled": true,
            "purpose": "Historical obligations and follow-up context"
          }
        ]
      }
    }
  }
}
```

## Source Type Definitions

### 1. `url`

Use for:

- documentation websites
- internal knowledge pages exposed by URL
- published FAQs or reference docs

Illustrative config:

```typescript
interface UrlKnowledgeSource extends KnowledgeSourceRef {
  type: "url";
  urls: string[];
}
```

Rules:

- URLs are references to ingest or retrieve from, not prompt-time browsing permissions
- retrieval should cache normalized results locally
- fetch time and source URL must be preserved as provenance

### 2. `local_path`

Use for:

- local documentation directories
- mounted knowledge folders
- exported notes or markdown trees
- operational files maintained outside the repo

Illustrative config:

```typescript
interface LocalPathKnowledgeSource extends KnowledgeSourceRef {
  type: "local_path";
  paths: string[];
}
```

Rules:

- paths are deployment-local, not repo-relative by default
- local path contents should be normalized into retrievable knowledge records
- source path and read timestamp must be preserved

### 3. `sqlite`

Use for:

- structured local knowledge stores
- historical obligation databases
- indexed notes or prior decisions
- mailbox-specific operational records

Illustrative config:

```typescript
interface SqliteKnowledgeSource extends KnowledgeSourceRef {
  type: "sqlite";
  database_path: string;
  query_templates?: string[];
  tables?: string[];
}
```

Rules:

- SQLite sources should be queried through controlled read interfaces
- the foreman and charters should consume normalized result records, not arbitrary SQL results
- query templates or whitelisted tables should be explicit
- source database path and query provenance must be preserved

## Normalized Knowledge Item Contract

Regardless of source type, retrieved knowledge should normalize to a common shape.

Illustrative contract:

```typescript
interface KnowledgeItem {
  knowledge_id: string;
  source_id: string;
  mailbox_id: string;
  charter_id: string;
  title: string;
  body: string;
  kind: "policy" | "reference" | "history" | "example";
  authority_level: "low" | "medium" | "high";
  provenance: KnowledgeProvenance;
  tags: string[];
  retrieved_at: string;
}

interface KnowledgeProvenance {
  source_type: "url" | "local_path" | "sqlite";
  locator: string;
  detail?: string;
}
```

Rules:

- every knowledge item must carry provenance
- `kind` must distinguish normative policy from descriptive material
- `authority_level` should be available for ranking and conflict handling

## Foreman And Charter Implications

The foreman should:

- resolve which knowledge sources apply for a mailbox-plus-charter invocation
- retrieve or load normalized knowledge items
- pass selected items into charter invocation context
- preserve which items were used when recording charter outputs

Charters should:

- consume normalized knowledge context
- not directly fetch arbitrary URLs, files, or databases on their own
- be able to cite which knowledge items informed a classification or action proposal

## Deliverables

### 1. Knowledge Source Config Contract

Define TypeScript and/or spec-level schema for:

- mailbox-plus-charter knowledge bindings
- `url` sources
- `local_path` sources
- `sqlite` sources

### 2. Normalized Knowledge Item Contract

Define the common representation that all source types normalize into.

### 3. Provenance Rules

Specify what provenance fields are mandatory and how they should be retained through foreman and charter flows.

### 4. Retrieval Boundary

Define where retrieval happens:

- foreman or dedicated knowledge subsystem
- not inside charter definitions themselves

### 5. Future Implementation Guidance

Clarify likely future responsibilities:

- config parsing
- source adapters
- local caching or indexing
- retrieval into charter invocation context

## Architectural Rules

- Do not treat repo markdown as the canonical store for mailbox-specific operational knowledge
- Do not let charters read arbitrary sources directly as part of their role definition
- Do not lose provenance when normalizing knowledge
- Do not mix normative policy knowledge with descriptive reference material without tagging them distinctly

## Definition Of Done

- [x] mailbox-plus-charter knowledge binding model is defined (`MailboxKnowledgeBinding`, `MailboxCharterBinding`)
- [x] `url` source contract is defined (`UrlKnowledgeSource`)
- [x] `local_path` source contract is defined (`LocalPathKnowledgeSource`)
- [x] `sqlite` source contract is defined (`SqliteKnowledgeSource`)
- [x] normalized knowledge item contract is defined (`KnowledgeItem`)
- [x] provenance expectations are defined (`KnowledgeProvenance`)
- [x] foreman and charter boundaries for retrieval are defined (spec + `CoordinatorConfig`)

## Follow-On Work

1. Update foreman architecture to reference external knowledge-source bindings.
2. Add coordinator config support for knowledge sources.
3. Add a future knowledge subsystem or package implementing source adapters and normalization.
