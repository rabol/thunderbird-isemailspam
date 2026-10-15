// Test doubles for Thunderbird APIs and fetch.

/**
 * Simplified stand-in for messengerUtilities.parseMailboxString: splits on
 * top-level commas (outside quotes/angles), supports groups and
 * "Name <addr>" forms. Enough to exercise our handling of its output.
 */
export async function fakeParseMailboxString(input, options = {}) {
  const items = [];
  let cur = "";
  let quoted = false;
  let angle = false;
  let groupName = null;
  let groupMembers = null;
  const flush = () => {
    const text = cur.trim();
    cur = "";
    if (text === "") return;
    const mailbox = parseOne(text);
    if (groupMembers) groupMembers.push(mailbox);
    else items.push(mailbox);
  };
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "\\" && quoted) { cur += ch + (input[++i] ?? ""); continue; }
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === "<") angle = true;
    else if (!quoted && ch === ">") angle = false;
    if (!quoted && !angle && ch === "," ) { flush(); continue; }
    if (!quoted && !angle && ch === ":" && groupMembers === null) {
      groupName = cur.trim(); cur = ""; groupMembers = []; continue;
    }
    if (!quoted && !angle && ch === ";" && groupMembers) {
      flush();
      if (options.preserveGroups) items.push({ name: groupName, group: groupMembers });
      else items.push(...groupMembers);
      groupMembers = null;
      continue;
    }
    cur += ch;
  }
  flush();
  return items;
}

function parseOne(text) {
  const m = text.match(/^(.*)<([^>]*)>\s*$/s);
  if (m) {
    const name = m[1].trim().replace(/^"(.*)"$/s, "$1").replace(/\\(.)/g, "$1");
    return { name, email: m[2].trim() };
  }
  return { name: "", email: text };
}

export function createStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    local: {
      async get(key) {
        return key in data ? { [key]: data[key] } : {};
      },
      async set(obj) { Object.assign(data, obj); },
      async remove(key) { delete data[key]; },
    },
  };
}

export const EXT_ID = "test@example";
export const POPUP_URL = "moz-extension://uuid/popup/popup.html";
export const POPUP_SENDER = { id: EXT_ID, url: POPUP_URL };

/** Fake `messenger` with per-tab displayed messages. */
export function createMessenger({ tabs = {}, storage = createStorage(), permitted = true } = {}) {
  const calls = { enable: [], disable: [], abortList: [] };
  return {
    calls,
    tabs: { ...tabs },
    storage,
    runtime: {
      id: EXT_ID,
      getURL: (path) => `moz-extension://uuid/${path}`,
    },
    permissions: {
      async contains() { return permitted; },
    },
    messages: {
      async abortList(id) { calls.abortList.push(id); },
    },
    messageDisplay: {
      async getDisplayedMessages(tabId) {
        const value = this._owner.tabs[tabId];
        if (value instanceof Error) throw value;
        if (value === undefined) throw new Error("Invalid tab");
        return Array.isArray(value) ? { id: null, messages: value } : value;
      },
    },
    messengerUtilities: { parseMailboxString: fakeParseMailboxString },
    messageDisplayAction: {
      async enable(tabId) { calls.enable.push(tabId); },
      async disable(tabId) { calls.disable.push(tabId); },
    },
  };
}

export function withOwner(messenger) {
  messenger.messageDisplay._owner = messenger;
  return messenger;
}

export function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/** Records fetch calls; `respond` builds each response (may throw / return a promise). */
export function createFetch(respond) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return respond(String(url), init, calls.length);
  };
  return { fetchImpl, calls };
}

/** A promise with external resolve. */
export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

export const API_KEY = "test-key-SECRET-123";

export const checkOk = (email, { emailSpam = false, domainSpam = false } = {}) => ({
  data: {
    spam_email: { checked_email: email, is_spam: emailSpam },
    spam_domain: { checked_domain: email.slice(email.lastIndexOf("@") + 1), is_spam: domainSpam },
  },
});

export const reportOk = (email) => ({
  data: { status: "ok", type: "email", data: { email, is_active: true } },
});
