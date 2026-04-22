---
name: zotero-library
description: Read, search, and write Zotero user or group libraries through the Zotero Web API v3. Use when an agent needs to inspect collections, query items, fetch templates or full-text, or create, patch, update, and delete Zotero items or collections. Prefer this skill for interoperable Zotero workflows that should work in Codex and be easy to reuse from Hermes Agent through the bundled CLI and shared environment variables.
---

# Zotero Library

Use the bundled Node CLI to work with Zotero metadata safely and predictably. Prefer the script over ad hoc HTTP calls so that library resolution, auth headers, version checks, and JSON output stay consistent across agents.

## Quick Start

Set these environment variables before using the skill:

- `ZOTERO_API_KEY`: Zotero API key with the needed read or write scope
- `ZOTERO_LIBRARY_TYPE`: `user` or `group` (`user` by default)
- `ZOTERO_LIBRARY_ID`: required for group libraries; optional for user libraries because the CLI can resolve the user id from the API key
- `ZOTERO_API_BASE_URL`: optional, defaults to `https://api.zotero.org`

Use the CLI:

```powershell
node .\scripts\zotero-api.mjs config show
node .\scripts\zotero-api.mjs collections list --top
node .\scripts\zotero-api.mjs items list --q "foucault" --limit 10
node .\scripts\zotero-api.mjs schema item-template --item-type journalArticle
```

## Core Workflow

1. Resolve library access first with `config show`.
2. For new items, fetch a template with `schema item-template --item-type ...`.
3. For updates, prefer `items patch` when changing a few fields and `items update --mode merge` when you want the script to merge your JSON into the current editable item.
4. For deletes, let the script fetch the current version first so the Zotero concurrency check is satisfied.
5. Keep payloads as JSON files when the change is more than a tiny one-liner.

## Common Operations

List collections:

```powershell
node .\scripts\zotero-api.mjs collections list --limit 50
```

Get one item:

```powershell
node .\scripts\zotero-api.mjs items get --item ABCD1234
```

Search items:

```powershell
node .\scripts\zotero-api.mjs items list --q "actor-network theory" --qmode everything --limit 20
node .\scripts\zotero-api.mjs items list --collection 9KH9TNSJ --tag theory
```

Create an item from JSON:

```powershell
node .\scripts\zotero-api.mjs items create --json .\new-item.json
```

Patch an item:

```powershell
node .\scripts\zotero-api.mjs items patch --item ABCD1234 --json .\patch.json
```

Merge-update an item:

```powershell
node .\scripts\zotero-api.mjs items update --item ABCD1234 --json .\changes.json --mode merge
```

Delete an item:

```powershell
node .\scripts\zotero-api.mjs items delete --item ABCD1234
```

Create a collection:

```powershell
node .\scripts\zotero-api.mjs collections create --name "To Read"
```

Fetch attachment full-text:

```powershell
node .\scripts\zotero-api.mjs fulltext get --item EFGH5678
```

## Hermes Interop

Keep interoperability simple:

- Reuse the same four environment variables in Hermes.
- Call the bundled CLI directly from Hermes instead of re-implementing HTTP logic.
- Treat the CLI JSON output as the contract between agents and Zotero.
- Prefer file-based JSON payloads for writes so agent handoffs are auditable and reproducible.

If Hermes has its own skill or tool wrapper system, point it at `scripts/zotero-api.mjs` and preserve the same command names and flags.

## Guardrails

- Prefer API version 3 behavior and leave `Zotero-API-Version: 3` in place.
- Use `Authorization: Bearer` auth headers instead of query-string keys.
- Remember that Zotero requires current object versions for updates and deletes; the CLI handles that automatically for `patch`, `update`, and `delete`.
- Treat attachment binary upload as a separate workflow. This skill covers library metadata plus full-text reads and writes, not the multipart attachment-upload sequence.
- Read [references/zotero-web-api.md](C:\Users\csc\Documents\zotero-skill\references\zotero-web-api.md) only when you need endpoint details or payload rules.
