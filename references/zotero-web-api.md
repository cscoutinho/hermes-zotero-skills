# Zotero Web API Notes

Use this file only when you need endpoint details that are too specific for `SKILL.md`.

## Authentication

- Base URL: `https://api.zotero.org`
- Send `Zotero-API-Version: 3`
- Send `Authorization: Bearer <API_KEY>` or `Zotero-API-Key: <API_KEY>`
- Public libraries can be read without auth, but private libraries and all writes require a key

## Library Prefixes

- User library: `/users/<userID>`
- Group library: `/groups/<groupID>`
- The `/keys/<key>` endpoint returns information about a given key and can be used to resolve the owning user id

## Read Endpoints

- `GET /users/<id>/collections`
- `GET /users/<id>/collections/top`
- `GET /users/<id>/items`
- `GET /users/<id>/items/top`
- `GET /users/<id>/items/<itemKey>`
- `GET /users/<id>/items/<itemKey>/children`
- `GET /users/<id>/collections/<collectionKey>/items`
- `GET /users/<id>/items/<itemKey>/fulltext`

Useful query params:

- `format=json`
- `include=data,bib,citation`
- `q=<phrase>`
- `qmode=titleCreatorYear|everything`
- `tag=<tag>`
- `itemType=<type>`
- `itemKey=<comma-separated keys>`
- `includeTrashed=1`
- `limit=<n>`

## Schema Endpoints

- `GET /itemTypes`
- `GET /itemFields`
- `GET /itemTypeFields?itemType=book`
- `GET /itemTypeCreatorTypes?itemType=book`
- `GET /items/new?itemType=book`

Use `GET /items/new?itemType=<type>` before creating new items when you want a valid editable template.

## Write Endpoints

Create items:

```http
POST <libraryPrefix>/items
Content-Type: application/json
Zotero-Write-Token: <token>
```

- Send an array of item objects
- Fetch an item template first when possible

Patch items:

```http
PATCH <libraryPrefix>/items/<itemKey>
If-Unmodified-Since-Version: <current version>
Content-Type: application/json
```

- Send only changed properties
- Arrays are treated as complete replacement lists

Replace items:

```http
PUT <libraryPrefix>/items/<itemKey>
Content-Type: application/json
```

- Include the current item `version` in the JSON body
- Any omitted normal field is removed

Delete items:

```http
DELETE <libraryPrefix>/items/<itemKey>
If-Unmodified-Since-Version: <current version>
```

Collections:

- `POST <libraryPrefix>/collections` with an array of collection objects
- `PUT <libraryPrefix>/collections/<collectionKey>` with full collection JSON including `version`

Full-text:

- `GET <libraryPrefix>/items/<itemKey>/fulltext`
- `PUT <libraryPrefix>/items/<itemKey>/fulltext`

## Concurrency Rules

- Zotero rejects stale writes with `412 Precondition Failed`
- Item deletes require `If-Unmodified-Since-Version`
- Item and collection updates should be based on freshly retrieved editable JSON

## Sources

- Basics: https://www.zotero.org/support/dev/web_api/v3/basics
- Types and fields: https://www.zotero.org/support/dev/web_api/v3/types_and_fields
- Write requests: https://www.zotero.org/support/dev/web_api/v3/write_requests
- Full-text content: https://www.zotero.org/support/dev/web_api/v3/fulltext_content
