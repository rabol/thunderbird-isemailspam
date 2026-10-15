import { test } from "node:test";
import assert from "node:assert/strict";
import { createController } from "../lib/controller.js";
import { CHECK_URL, REPORT_URL } from "../lib/api.js";
import {
  API_KEY, POPUP_SENDER, checkOk, createFetch, createMessenger, createStorage,
  deferred, jsonResponse, reportOk, withOwner,
} from "./helpers.js";

const EMAIL = "spammer@example.com";
const MSG = { id: 42, author: `Spammer <${EMAIL}>`, subject: "Buy now", recipients: ["me@example.org"] };

function setup({ apiKey = API_KEY, respond, permitted = true, tabs } = {}) {
  const storage = createStorage(apiKey ? { apiKey } : {});
  const messenger = withOwner(createMessenger({ tabs: tabs ?? { 1: [MSG] }, storage, permitted }));
  const fetch = createFetch(respond ?? ((url) =>
    url.startsWith(CHECK_URL) ? jsonResponse(checkOk(EMAIL)) : jsonResponse(reportOk(EMAIL))));
  const controller = createController({ messenger, fetchImpl: fetch.fetchImpl });
  const send = (message) => controller.handleMessage(message, POPUP_SENDER);
  return { messenger, fetch, controller, send, storage };
}

const run = (action, extra = {}) => ({
  type: "run", action, tabId: 1, messageId: 42, email: EMAIL,
  confirmed: action === "report" ? true : undefined, ...extra,
});

test("opening the popup (context) makes no network request", async () => {
  const { send, fetch } = setup();
  const ctx = await send({ type: "context", tabId: 1 });
  assert.deepEqual(ctx, { ok: true, messageId: 42, email: EMAIL, hasKey: true, results: {} });
  assert.equal(fetch.calls.length, 0);
});

test("context reports sender problems and missing key", async () => {
  const { send } = setup({ apiKey: null, tabs: { 1: [MSG], 2: [{ id: 1, author: "a@x.com, b@x.com" }], 3: [] } });
  assert.equal((await send({ type: "context", tabId: 1 })).hasKey, false);
  assert.deepEqual(await send({ type: "context", tabId: 2 }), { ok: false, code: "multiple-senders" });
  assert.deepEqual(await send({ type: "context", tabId: 3 }), { ok: false, code: "no-message" });
});

test("check calls only the check endpoint", async () => {
  const { send, fetch } = setup();
  const result = await send(run("check"));
  assert.equal(result.status, "ok");
  assert.equal(fetch.calls.length, 1);
  assert.ok(fetch.calls[0].url.startsWith(CHECK_URL));
});

test("report calls only the report endpoint, and only when confirmed", async () => {
  const { send, fetch } = setup();
  assert.equal(send(run("report", { confirmed: undefined })), undefined);
  assert.equal(send(run("report", { confirmed: "yes" })), undefined);
  assert.equal(fetch.calls.length, 0);
  const result = await send(run("report"));
  assert.equal(result.status, "ok");
  assert.equal(fetch.calls.length, 1);
  assert.equal(fetch.calls[0].url, REPORT_URL);
});

test("no subject, body or recipients are sent", async () => {
  const { send, fetch } = setup();
  await send(run("check"));
  await send(run("report"));
  for (const { url, init } of fetch.calls) {
    const text = `${url} ${init.body ?? ""}`;
    assert.ok(!text.includes("Buy"));
    assert.ok(!text.includes("me%40example.org") && !text.includes("me@example.org"));
  }
});

test("either action can run after the other", async () => {
  const { send, fetch } = setup();
  await send(run("report"));
  await send(run("check"));
  await send(run("report"));
  assert.deepEqual(fetch.calls.map((c) => c.url.split("?")[0]), [REPORT_URL, CHECK_URL, REPORT_URL]);
});

test("missing key: no request", async () => {
  const { send, fetch } = setup({ apiKey: null });
  assert.deepEqual(await send(run("check")), { status: "error", code: "no-key" });
  assert.deepEqual(await send(run("report")), { status: "error", code: "no-key" });
  assert.equal(fetch.calls.length, 0);
});

test("missing host permission: no request", async () => {
  const { send, fetch } = setup({ permitted: false });
  assert.equal((await send(run("check"))).code, "permission-denied");
  assert.equal(fetch.calls.length, 0);
});

test("duplicate clicks share one in-flight request", async () => {
  const gate = deferred();
  const { send, fetch } = setup({ respond: () => gate.promise });
  const a = send(run("report"));
  const b = send(run("report"));
  await new Promise((r) => setImmediate(r));
  assert.equal(fetch.calls.length, 1);
  gate.resolve(jsonResponse(reportOk(EMAIL)));
  assert.deepEqual(await a, await b);
});

test("message changed before submit: refused, nothing sent", async () => {
  const { send, fetch, messenger } = setup();
  messenger.tabs[1] = [{ id: 43, author: "other@example.com" }];
  assert.equal((await send(run("report"))).code, "message-changed");
  messenger.tabs[1] = [];
  assert.equal((await send(run("check"))).code, "message-changed");
  assert.equal(fetch.calls.length, 0);
});

test("result stays bound to the original message when selection changes mid-request", async () => {
  const gate = deferred();
  const { send, messenger } = setup({ respond: () => gate.promise });
  const pending = send(run("check"));
  await new Promise((r) => setImmediate(r));
  messenger.tabs[1] = [{ id: 99, author: "new@example.com" }];
  gate.resolve(jsonResponse(checkOk(EMAIL, { emailSpam: true })));
  const result = await pending;
  assert.equal(result.email.checked, EMAIL);
  const newCtx = await send({ type: "context", tabId: 1 });
  assert.deepEqual(newCtx.results, {}, "result must not appear for the new message");
});

test("popup closed and reopened mid-request: shows pending, then result, no resubmit", async () => {
  const gate = deferred();
  const { send, fetch } = setup({ respond: () => gate.promise });
  send(run("report")); // popup closes; its promise is abandoned
  await new Promise((r) => setImmediate(r));

  const reopened = await send({ type: "context", tabId: 1 });
  assert.deepEqual(reopened.results, { report: { pending: true } });
  const waiting = send({ type: "wait", action: "report", messageId: 42, email: EMAIL });
  gate.resolve(jsonResponse(reportOk(EMAIL)));
  assert.equal((await waiting).status, "ok");
  assert.equal(fetch.calls.length, 1);

  const again = await send({ type: "context", tabId: 1 });
  assert.deepEqual(again.results, { report: { result: { status: "ok", email: EMAIL } } });
  assert.equal(fetch.calls.length, 1);
});

test("wait for unknown action returns null", async () => {
  const { send } = setup();
  assert.equal(await send({ type: "wait", action: "check", messageId: 42, email: EMAIL }), null);
});

test("in-flight state clears after failure so the user can retry", async () => {
  let n = 0;
  const { send, fetch } = setup({
    respond: () => (++n === 1 ? jsonResponse({}, { status: 500 }) : jsonResponse(checkOk(EMAIL))),
  });
  assert.equal((await send(run("check"))).code, "server");
  assert.equal((await send(run("check"))).status, "ok");
  assert.equal(fetch.calls.length, 2);
});

test("untrusted senders and malformed messages are ignored", async () => {
  const { controller, fetch } = setup();
  const good = run("check");
  assert.equal(controller.handleMessage(good, { id: "other-ext", url: POPUP_SENDER.url }), undefined);
  assert.equal(controller.handleMessage(good, { id: POPUP_SENDER.id, url: "moz-extension://uuid/options/options.html" }), undefined);
  assert.equal(controller.handleMessage(good, { id: POPUP_SENDER.id, url: "https://evil.example/popup/popup.html" }), undefined);
  assert.equal(controller.handleMessage(good, undefined), undefined);
  for (const bad of [
    null, "run", { type: "run", action: "delete", tabId: 1, messageId: 42, email: EMAIL },
    { ...good, tabId: "1" }, { ...good, messageId: -1 }, { ...good, email: "" },
    { ...good, email: 5 }, { type: "nope" },
  ]) {
    assert.equal(controller.handleMessage(bad, POPUP_SENDER), undefined, JSON.stringify(bad));
  }
  assert.equal(fetch.calls.length, 0);
});

test("API key never appears in results or logs", async (t) => {
  const logs = [];
  for (const level of ["log", "info", "warn", "error", "debug"]) {
    t.mock.method(console, level, (...args) => logs.push(args.join(" ")));
  }
  const responders = [
    () => jsonResponse({ message: API_KEY }, { status: 401 }),
    () => { throw new TypeError(`failed ${API_KEY}`); },
    () => new Response(`<p>${API_KEY}</p>`, { status: 200, headers: { "Content-Type": "text/html" } }),
  ];
  for (const respond of responders) {
    const { send } = setup({ respond });
    for (const action of ["check", "report"]) {
      const result = await send(run(action));
      assert.ok(!JSON.stringify(result).includes(API_KEY));
    }
  }
  assert.ok(!logs.join("\n").includes(API_KEY));
});

test("toolbar button is enabled only for a single displayed message", async () => {
  const { controller, messenger } = setup();
  await controller.updateButton({ id: 1 }, { id: null, messages: [MSG] });
  await controller.updateButton({ id: 2 }, { id: null, messages: [MSG, MSG] });
  await controller.updateButton({ id: 3 }, { id: "more", messages: [MSG] });
  await controller.updateButton({ id: 4 }, { id: null, messages: [] });
  await controller.updateButton({ id: 5 }, [MSG]);
  assert.deepEqual(messenger.calls.enable, [1, 5]);
  assert.deepEqual(messenger.calls.disable, [2, 3, 4]);
});
