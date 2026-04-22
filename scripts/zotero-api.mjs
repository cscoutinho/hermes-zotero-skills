#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

const HELP = `zotero-api.mjs

Usage:
  node zotero-api.mjs config show
  node zotero-api.mjs schema item-types
  node zotero-api.mjs schema item-template --item-type book
  node zotero-api.mjs collections list [--top] [--limit 25]
  node zotero-api.mjs collections get --collection <key>
  node zotero-api.mjs collections create --name "To Read" [--parent <key>]
  node zotero-api.mjs collections update --collection <key> --json <file|-> [--mode merge|replace]
  node zotero-api.mjs items list [--q <text>] [--collection <key>] [--tag <tag>] [--item-type <type>] [--limit 25] [--include-trashed]
  node zotero-api.mjs items get --item <key> [--include data]
  node zotero-api.mjs items create --json <file|->
  node zotero-api.mjs items patch --item <key> --json <file|->
  node zotero-api.mjs items update --item <key> --json <file|-> [--mode merge|replace]
  node zotero-api.mjs items delete --item <key>
  node zotero-api.mjs fulltext get --item <key>

Environment:
  ZOTERO_API_KEY       required
  ZOTERO_LIBRARY_TYPE  user|group (default: user)
  ZOTERO_LIBRARY_ID    required for group libraries, optional for user libraries
  ZOTERO_API_BASE_URL  default: https://api.zotero.org
`;

function fail(message, details) {
  console.error(message);
  if (details) {
    console.error(details);
  }
  process.exit(1);
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function parseArgs(argv) {
  const positionals = [];
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    index += 1;
  }

  return { positionals, options };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonInput(inputPath) {
  if (!inputPath) {
    fail("Missing --json <file|->");
  }

  const raw = inputPath === "-" ? await readStdin() : await readFile(inputPath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`Invalid JSON in ${inputPath}`, error.message);
  }
}

function deepMerge(baseValue, incomingValue) {
  if (Array.isArray(incomingValue)) {
    return incomingValue;
  }

  if (!isPlainObject(baseValue) || !isPlainObject(incomingValue)) {
    return incomingValue;
  }

  const merged = { ...baseValue };
  for (const [key, value] of Object.entries(incomingValue)) {
    if (key in merged) {
      merged[key] = deepMerge(merged[key], value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

class ZoteroClient {
  constructor() {
    this.apiKey = process.env.ZOTERO_API_KEY;
    this.baseUrl = process.env.ZOTERO_API_BASE_URL || "https://api.zotero.org";
    this.libraryType = process.env.ZOTERO_LIBRARY_TYPE || "user";
    this.libraryId = process.env.ZOTERO_LIBRARY_ID || null;
    this.cachedKeyInfo = null;

    if (!this.apiKey) {
      fail("Missing ZOTERO_API_KEY");
    }

    if (!["user", "group"].includes(this.libraryType)) {
      fail("ZOTERO_LIBRARY_TYPE must be 'user' or 'group'");
    }
  }

  headers(extraHeaders = {}) {
    return {
      Accept: "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      "Zotero-API-Version": "3",
      ...extraHeaders,
    };
  }

  async keyInfo() {
    if (this.cachedKeyInfo) {
      return this.cachedKeyInfo;
    }

    const response = await this.request(`/keys/${encodeURIComponent(this.apiKey)}`);
    this.cachedKeyInfo = response.data;
    return this.cachedKeyInfo;
  }

  async resolvedLibraryId() {
    if (this.libraryId) {
      return this.libraryId;
    }

    if (this.libraryType === "group") {
      fail("Missing ZOTERO_LIBRARY_ID for group library");
    }

    const keyInfo = await this.keyInfo();
    const userId = keyInfo.userID ?? keyInfo.userId ?? keyInfo.user?.id;
    if (!userId) {
      fail("Unable to resolve Zotero user id from API key", JSON.stringify(keyInfo, null, 2));
    }

    this.libraryId = String(userId);
    return this.libraryId;
  }

  async libraryPrefix() {
    const resolvedId = await this.resolvedLibraryId();
    return `/${this.libraryType === "group" ? "groups" : "users"}/${encodeURIComponent(resolvedId)}`;
  }

  async request(path, { method = "GET", query = {}, body, headers = {}, expectJson = true } = {}) {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === false) {
        continue;
      }
      url.searchParams.set(key, String(value));
    }

    const response = await fetch(url, {
      method,
      headers: this.headers(headers),
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();
    let parsed = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!response.ok) {
      fail(
        `Zotero API request failed: ${method} ${url} -> ${response.status} ${response.statusText}`,
        typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2),
      );
    }

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      data: expectJson ? parsed : text,
    };
  }

  async getCollection(collectionKey) {
    const prefix = await this.libraryPrefix();
    return this.request(`${prefix}/collections/${encodeURIComponent(collectionKey)}`);
  }

  async getItem(itemKey, include = "data") {
    const prefix = await this.libraryPrefix();
    return this.request(`${prefix}/items/${encodeURIComponent(itemKey)}`, {
      query: { format: "json", include },
    });
  }
}

async function handleConfig(client) {
  const keyInfo = await client.keyInfo();
  const libraryId = await client.resolvedLibraryId();
  printJson({
    baseUrl: client.baseUrl,
    libraryType: client.libraryType,
    libraryId,
    keyInfo,
  });
}

async function handleSchema(client, action, options) {
  if (action === "item-types") {
    const response = await client.request("/itemTypes");
    printJson(response.data);
    return;
  }

  if (action === "item-template") {
    const itemType = options["item-type"];
    if (!itemType) {
      fail("Missing --item-type");
    }
    const response = await client.request("/items/new", {
      query: { itemType },
    });
    printJson(response.data);
    return;
  }

  fail(`Unknown schema action: ${action}`);
}

async function handleCollections(client, action, options) {
  const prefix = await client.libraryPrefix();

  if (action === "list") {
    const top = Boolean(options.top);
    const response = await client.request(`${prefix}/collections${top ? "/top" : ""}`, {
      query: {
        format: "json",
        limit: options.limit ?? 25,
      },
    });
    printJson(response.data);
    return;
  }

  if (action === "get") {
    const collectionKey = options.collection;
    if (!collectionKey) {
      fail("Missing --collection");
    }
    const response = await client.getCollection(collectionKey);
    printJson(response.data);
    return;
  }

  if (action === "create") {
    const name = options.name;
    if (!name) {
      fail("Missing --name");
    }

    const payload = [
      {
        name,
        parentCollection: options.parent || false,
      },
    ];

    const response = await client.request(`${prefix}/collections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Zotero-Write-Token": randomUUID(),
      },
      body: payload,
    });
    printJson(response.data);
    return;
  }

  if (action === "update") {
    const collectionKey = options.collection;
    const mode = options.mode || "merge";
    if (!collectionKey) {
      fail("Missing --collection");
    }
    if (!["merge", "replace"].includes(mode)) {
      fail("collections update --mode must be merge or replace");
    }

    const incoming = await readJsonInput(options.json);
    const current = (await client.getCollection(collectionKey)).data.data;
    const editable =
      mode === "replace"
        ? { ...incoming, key: current.key, version: current.version }
        : deepMerge(current, incoming);

    editable.key = current.key;
    editable.version = current.version;

    const response = await client.request(`${prefix}/collections/${encodeURIComponent(collectionKey)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: editable,
    });
    printJson({
      ok: true,
      status: response.status,
      collectionKey,
    });
    return;
  }

  fail(`Unknown collections action: ${action}`);
}

async function handleItems(client, action, options) {
  const prefix = await client.libraryPrefix();

  if (action === "list") {
    const collectionKey = options.collection;
    const path = collectionKey
      ? `${prefix}/collections/${encodeURIComponent(collectionKey)}/items`
      : `${prefix}/items`;
    const response = await client.request(path, {
      query: {
        format: "json",
        include: options.include ?? "data",
        limit: options.limit ?? 25,
        q: options.q,
        qmode: options.qmode,
        tag: options.tag,
        itemType: options["item-type"],
        itemKey: options["item-key"],
        includeTrashed: options["include-trashed"] ? 1 : undefined,
      },
    });
    printJson(response.data);
    return;
  }

  if (action === "get") {
    const itemKey = options.item;
    if (!itemKey) {
      fail("Missing --item");
    }
    const response = await client.getItem(itemKey, options.include ?? "data");
    printJson(response.data);
    return;
  }

  if (action === "create") {
    const incoming = await readJsonInput(options.json);
    const payload = Array.isArray(incoming) ? incoming : [incoming];
    const response = await client.request(`${prefix}/items`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Zotero-Write-Token": randomUUID(),
      },
      body: payload,
    });
    printJson(response.data);
    return;
  }

  if (action === "patch") {
    const itemKey = options.item;
    if (!itemKey) {
      fail("Missing --item");
    }

    const incoming = await readJsonInput(options.json);
    const current = (await client.getItem(itemKey)).data.data;
    const response = await client.request(`${prefix}/items/${encodeURIComponent(itemKey)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "If-Unmodified-Since-Version": String(current.version),
      },
      body: incoming,
    });
    printJson({
      ok: true,
      status: response.status,
      itemKey,
      mode: "patch",
    });
    return;
  }

  if (action === "update") {
    const itemKey = options.item;
    const mode = options.mode || "merge";
    if (!itemKey) {
      fail("Missing --item");
    }
    if (!["merge", "replace"].includes(mode)) {
      fail("items update --mode must be merge or replace");
    }

    const incoming = await readJsonInput(options.json);
    const current = (await client.getItem(itemKey)).data.data;
    const editable =
      mode === "replace"
        ? { ...incoming, key: current.key, version: current.version }
        : deepMerge(current, incoming);

    editable.key = current.key;
    editable.version = current.version;

    const response = await client.request(`${prefix}/items/${encodeURIComponent(itemKey)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: editable,
    });
    printJson({
      ok: true,
      status: response.status,
      itemKey,
      mode,
    });
    return;
  }

  if (action === "delete") {
    const itemKey = options.item;
    if (!itemKey) {
      fail("Missing --item");
    }

    const current = (await client.getItem(itemKey)).data.data;
    const response = await client.request(`${prefix}/items/${encodeURIComponent(itemKey)}`, {
      method: "DELETE",
      headers: {
        "If-Unmodified-Since-Version": String(current.version),
      },
      expectJson: false,
    });
    printJson({
      ok: true,
      status: response.status,
      itemKey,
    });
    return;
  }

  fail(`Unknown items action: ${action}`);
}

async function handleFulltext(client, action, options) {
  if (action !== "get") {
    fail(`Unknown fulltext action: ${action}`);
  }

  const itemKey = options.item;
  if (!itemKey) {
    fail("Missing --item");
  }

  const prefix = await client.libraryPrefix();
  const response = await client.request(`${prefix}/items/${encodeURIComponent(itemKey)}/fulltext`);
  printJson(response.data);
}

async function main() {
  const { positionals, options } = parseArgs(process.argv.slice(2));
  if (positionals.length === 0 || options.help) {
    console.log(HELP);
    return;
  }

  const [domain, action] = positionals;
  const client = new ZoteroClient();

  if (domain === "config" && action === "show") {
    await handleConfig(client);
    return;
  }

  if (domain === "schema") {
    await handleSchema(client, action, options);
    return;
  }

  if (domain === "collections") {
    await handleCollections(client, action, options);
    return;
  }

  if (domain === "items") {
    await handleItems(client, action, options);
    return;
  }

  if (domain === "fulltext") {
    await handleFulltext(client, action, options);
    return;
  }

  fail(`Unknown command: ${positionals.join(" ")}`);
}

main().catch((error) => {
  fail("Unexpected error", error?.stack || error?.message || String(error));
});
