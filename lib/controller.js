// Background coordination: validates runtime messages from the popup,
// resolves the sender, runs API calls, deduplicates in-flight requests and
// keeps session-only results keyed by message + sender.

import { resolveSender, SenderError } from "./sender.js";
import { getApiKey } from "./settings.js";
import { API_ORIGIN, checkSender, reportSender } from "./api.js";

export const ACTIONS = ["check", "report"];
const MAX_ENTRIES = 50;

export function createController({ messenger, fetchImpl = globalThis.fetch }) {
  // key -> { check?: Entry, report?: Entry }, Entry = { pending, result, promise }
  const entries = new Map();

  const keyOf = (messageId, email) => `${messageId}\u0000${email}`;

  function slot(key) {
    let value = entries.get(key);
    if (!value) {
      value = {};
      entries.set(key, value);
      while (entries.size > MAX_ENTRIES) {
        const oldest = entries.keys().next().value;
        const old = entries.get(oldest);
        if (ACTIONS.some((a) => old[a]?.pending)) break;
        entries.delete(oldest);
      }
    } else {
      // Refresh insertion order so recently used entries survive pruning.
      entries.delete(key);
      entries.set(key, value);
    }
    return value;
  }

  function snapshot(key) {
    const value = entries.get(key) ?? {};
    const out = {};
    for (const action of ACTIONS) {
      const entry = value[action];
      if (entry) out[action] = entry.pending ? { pending: true } : { result: entry.result };
    }
    return out;
  }

  async function hasHostPermission() {
    if (!messenger.permissions?.contains) return true;
    try {
      return await messenger.permissions.contains({ origins: [`${API_ORIGIN}/*`] });
    } catch {
      return false;
    }
  }

  async function context(tabId) {
    let sender;
    try {
      sender = await resolveSender(messenger, tabId);
    } catch (e) {
      return { ok: false, code: e instanceof SenderError ? e.code : "no-message" };
    }
    const apiKey = await getApiKey(messenger.storage);
    return {
      ok: true,
      messageId: sender.messageId,
      email: sender.email,
      hasKey: apiKey !== null,
      results: snapshot(keyOf(sender.messageId, sender.email)),
    };
  }

  async function execute(action, email) {
    const apiKey = await getApiKey(messenger.storage);
    if (apiKey === null) return { status: "error", code: "no-key" };
    if (!(await hasHostPermission())) return { status: "error", code: "permission-denied" };
    const call = action === "check" ? checkSender : reportSender;
    try {
      return await call({ apiKey, email, fetchImpl });
    } catch {
      return { status: "error", code: "internal" };
    }
  }

  async function run({ action, tabId, messageId, email }) {
    // Re-resolve so the action applies to the message the popup showed.
    let current;
    try {
      current = await resolveSender(messenger, tabId);
    } catch {
      return { status: "error", code: "message-changed" };
    }
    if (current.messageId !== messageId || current.email !== email) {
      return { status: "error", code: "message-changed" };
    }
    const key = keyOf(messageId, email);
    const value = slot(key);
    if (value[action]?.pending) return value[action].promise;

    const entry = { pending: true, result: undefined, promise: undefined };
    entry.promise = execute(action, email).then((result) => {
      entry.pending = false;
      entry.result = result;
      entry.promise = undefined;
      return result;
    });
    value[action] = entry;
    return entry.promise;
  }

  /** Waits for an in-flight action started earlier (e.g. before the popup closed). */
  async function wait({ action, messageId, email }) {
    const entry = entries.get(keyOf(messageId, email))?.[action];
    if (!entry) return null;
    return entry.pending ? entry.promise : entry.result;
  }

  function isTrustedSender(sender) {
    if (!sender || sender.id !== messenger.runtime.id) return false;
    const popupUrl = messenger.runtime.getURL("popup/popup.html");
    return typeof sender.url === "string" && sender.url.split(/[?#]/)[0] === popupUrl;
  }

  const isInt = (v) => Number.isInteger(v) && v >= 0;
  const isEmail = (v) => typeof v === "string" && v.length > 0 && v.length <= 512;

  /** runtime.onMessage handler; returns a promise for valid requests, else undefined. */
  function handleMessage(message, sender) {
    if (!isTrustedSender(sender) || !message || typeof message !== "object") return undefined;
    const { type, action, tabId, messageId, email } = message;
    if (type === "context" && isInt(tabId)) {
      return context(tabId);
    }
    if (type === "run" && ACTIONS.includes(action) && isInt(tabId) &&
        isInt(messageId) && isEmail(email)) {
      if (action === "report" && message.confirmed !== true) return undefined;
      return run({ action, tabId, messageId, email });
    }
    if (type === "wait" && ACTIONS.includes(action) && isInt(messageId) && isEmail(email)) {
      return wait({ action, messageId, email });
    }
    return undefined;
  }

  /** Enables the toolbar button only when exactly one message is displayed. */
  async function updateButton(tab, displayed) {
    const messages = Array.isArray(displayed) ? displayed : displayed?.messages;
    const single = Array.isArray(messages) && messages.length === 1 && !displayed?.id;
    try {
      if (single) await messenger.messageDisplayAction.enable(tab.id);
      else await messenger.messageDisplayAction.disable(tab.id);
    } catch {
      // Tab may have closed; nothing to update.
    }
  }

  return { handleMessage, updateButton, _entries: entries };
}
