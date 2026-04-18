# @narada2/exchange-fs-sync-search

Full-text search index for Narada compiled local state.

> **How to read this package**: This is a vertical-specific search utility for the mailbox vertical, indexing normalized messages produced by the kernel. Future verticals may provide their own search surfaces.

## Overview

Builds an inverted index from normalized messages and provides fast full-text search.

## Usage

```bash
# Build the search index
exchange-fs-sync-search build

# Search for messages
exchange-fs-sync-search search "meeting notes"

# Search with filters
exchange-fs-sync-search search -q "urgent" -f subject --unread

# Show index stats
exchange-fs-sync-search stats
```

## Commands

### build

Scans `messages/` directory and builds inverted index at `search-index/`.

```bash
exchange-fs-sync-search build
exchange-fs-sync-search build --config ./custom-config.json
```

### search

Query the index with filters.

```bash
# Basic search
exchange-fs-sync-search search "project alpha"

# Search specific fields
exchange-fs-sync-search search -q "john" -f from,to

# Filter by folder
exchange-fs-sync-search search -q "invoice" --folder inbox

# Unread only
exchange-fs-sync-search search -q "urgent" -u

# Limit results
exchange-fs-sync-search search -q "report" -n 10
```

### stats

Show index statistics.

```bash
exchange-fs-sync-search stats
```

## Search Features

- **AND logic**: All query terms must match
- **Field boosting**: Subject has 2x weight by default
- **Field filters**: subject, body, from, to
- **Metadata filters**: folder, read status, flagged status
- **Date range**: (via API, CLI coming soon)
- **Pagination**: offset/limit support

## Index Storage

Located at `{root_dir}/search-index/`:
- `index.json` - Inverted index and document metadata
- Simple JSON format for portability and debugging

## Implementation

- **Tokenizer**: Word-based with stop word removal
- **Scoring**: Term frequency with field boosts
- **Index**: Inverted index in memory, JSON on disk
