// API-key persistence in storage.local. Never logs or exports the key.

const KEY = "apiKey";

export async function getApiKey(storage) {
  const stored = await storage.local.get(KEY);
  const value = stored?.[KEY];
  return typeof value === "string" && value !== "" ? value : null;
}

/** Saves a trimmed key. A blank value is rejected and leaves any stored key alone. */
export async function saveApiKey(storage, raw) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value === "") {
    return { ok: false, code: "empty" };
  }
  if (/[\u0000-\u001F\u007F\s]/.test(value)) {
    return { ok: false, code: "invalid" };
  }
  await storage.local.set({ [KEY]: value });
  return { ok: true };
}

export async function removeApiKey(storage) {
  await storage.local.remove(KEY);
}
