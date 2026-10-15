import { test } from "node:test";
import assert from "node:assert/strict";
import { getApiKey, removeApiKey, saveApiKey } from "../lib/settings.js";
import { createStorage } from "./helpers.js";

test("saves a trimmed key and reads it back", async () => {
  const storage = createStorage();
  assert.deepEqual(await saveApiKey(storage, "  abc123  "), { ok: true });
  assert.equal(await getApiKey(storage), "abc123");
  assert.deepEqual(storage.data, { apiKey: "abc123" });
});

test("blank save does not erase an existing key", async () => {
  const storage = createStorage({ apiKey: "keep" });
  assert.deepEqual(await saveApiKey(storage, "   "), { ok: false, code: "empty" });
  assert.deepEqual(await saveApiKey(storage, undefined), { ok: false, code: "empty" });
  assert.equal(await getApiKey(storage), "keep");
});

test("rejects keys with inner whitespace or control characters", async () => {
  const storage = createStorage({ apiKey: "keep" });
  assert.equal((await saveApiKey(storage, "a b")).code, "invalid");
  assert.equal((await saveApiKey(storage, "a\u0007b")).code, "invalid");
  assert.equal(await getApiKey(storage), "keep");
});

test("remove actually deletes the key", async () => {
  const storage = createStorage({ apiKey: "x" });
  await removeApiKey(storage);
  assert.equal("apiKey" in storage.data, false);
  assert.equal(await getApiKey(storage), null);
});

test("missing or non-string stored values read as no key", async () => {
  assert.equal(await getApiKey(createStorage()), null);
  assert.equal(await getApiKey(createStorage({ apiKey: "" })), null);
  assert.equal(await getApiKey(createStorage({ apiKey: 42 })), null);
});
