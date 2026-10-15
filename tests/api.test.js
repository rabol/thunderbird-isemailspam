import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHECK_URL, REPORT_URL, checkSender, parseRetryAfter, reportSender,
} from "../lib/api.js";
import {
  API_KEY, checkOk, createFetch, jsonResponse, reportOk,
} from "./helpers.js";

const EMAIL = "John+Tag&x@example.com";

function assertNoSecret(value) {
  assert.ok(!JSON.stringify(value).includes(API_KEY), "result leaks the API key");
}

test("check: GET with encoded api_key and email query only", async () => {
  const email = "jörg+a&b=c@bücher.de";
  const { fetchImpl, calls } = createFetch(() => jsonResponse(checkOk(email)));
  const result = await checkSender({ apiKey: API_KEY, email, fetchImpl });
  assert.equal(result.status, "ok");
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  const parsed = new URL(url);
  assert.equal(`${parsed.origin}${parsed.pathname}`, CHECK_URL);
  assert.deepEqual([...parsed.searchParams.keys()], ["api_key", "email"]);
  assert.equal(parsed.searchParams.get("email"), email);
  assert.equal(parsed.searchParams.get("api_key"), API_KEY);
  assert.ok(!url.includes("+a&b"), "special characters are encoded");
  assert.equal(init.method, "GET");
  assert.equal(init.body, undefined);
  assert.equal(init.headers.Accept, "application/json");
  assert.equal(init.headers.Authorization, undefined);
  assert.equal(init.redirect, "manual");
  assert.equal(init.credentials, "omit");
});

test("check: parses email and domain results separately", async () => {
  const email = "spam@bad.example";
  const { fetchImpl } = createFetch(() =>
    jsonResponse(checkOk(email, { emailSpam: false, domainSpam: true })));
  const result = await checkSender({ apiKey: API_KEY, email, fetchImpl });
  assert.deepEqual(result, {
    status: "ok",
    email: { checked: email, isSpam: false },
    domain: { checked: "bad.example", isSpam: true },
  });
});

test("check: missing or non-boolean is_spam is a bad response, never 'not spam'", async () => {
  const email = "a@example.com";
  const bodies = [
    { data: { spam_email: { checked_email: email }, spam_domain: { checked_domain: "example.com", is_spam: false } } },
    { data: { spam_email: { checked_email: email, is_spam: "false" }, spam_domain: { checked_domain: "example.com", is_spam: false } } },
    { data: { spam_email: { checked_email: email, is_spam: false } } },
    { data: null },
    {},
    [],
  ];
  for (const body of bodies) {
    const { fetchImpl } = createFetch(() => jsonResponse(body));
    const result = await checkSender({ apiKey: API_KEY, email, fetchImpl });
    assert.equal(result.code, "bad-response", JSON.stringify(body));
  }
});

test("check: mismatched checked address is rejected", async () => {
  const { fetchImpl } = createFetch(() => jsonResponse(checkOk("other@example.com")));
  const result = await checkSender({ apiKey: API_KEY, email: "a@example.com", fetchImpl });
  assert.equal(result.code, "mismatch");
});

test("check: case differences in the echoed address are accepted", async () => {
  const { fetchImpl } = createFetch(() => jsonResponse(checkOk("john@example.com")));
  const result = await checkSender({ apiKey: API_KEY, email: "John@example.com", fetchImpl });
  assert.equal(result.status, "ok");
});

test("report: POST form body with exactly api_key and email", async () => {
  const { fetchImpl, calls } = createFetch(() => jsonResponse(reportOk(EMAIL)));
  const result = await reportSender({ apiKey: API_KEY, email: EMAIL, fetchImpl });
  assert.deepEqual(result, { status: "ok", email: EMAIL });
  const { url, init } = calls[0];
  assert.equal(url, REPORT_URL);
  assert.equal(init.method, "POST");
  assert.match(init.headers["Content-Type"], /^application\/x-www-form-urlencoded/);
  assert.equal(init.headers.Accept, "application/json");
  assert.equal(init.headers.Authorization, undefined);
  const body = new URLSearchParams(init.body);
  assert.deepEqual([...body.keys()], ["api_key", "email"]);
  assert.equal(body.get("email"), EMAIL);
  assert.equal(body.get("domain"), null);
  assert.match(init.body, /John%2BTag%26x%40example\.com/);
});

test("report: Unicode address is encoded as UTF-8", async () => {
  const email = "用户@例子.广告";
  const { fetchImpl, calls } = createFetch(() => jsonResponse(reportOk(email)));
  await reportSender({ apiKey: API_KEY, email, fetchImpl });
  assert.equal(new URLSearchParams(calls[0].init.body).get("email"), email);
});

test("report: requires the documented success envelope", async () => {
  const bad = [
    { data: { status: "error", type: "email", data: { email: EMAIL } } },
    { data: { status: "ok", type: "domain", data: { email: EMAIL } } },
    { data: { status: "ok", type: "email", data: {} } },
    { ok: true },
  ];
  for (const body of bad) {
    const { fetchImpl } = createFetch(() => jsonResponse(body));
    const result = await reportSender({ apiKey: API_KEY, email: EMAIL, fetchImpl });
    assert.equal(result.code, "bad-response", JSON.stringify(body));
  }
});

test("report: mismatched reported address is rejected", async () => {
  const { fetchImpl } = createFetch(() => jsonResponse(reportOk("someone@else.com")));
  const result = await reportSender({ apiKey: API_KEY, email: EMAIL, fetchImpl });
  assert.equal(result.code, "mismatch");
});

const statusCases = [
  [400, "bad-request"], [401, "unauthorized"], [403, "forbidden"], [422, "invalid"],
  [429, "rate-limited"], [500, "server"], [503, "server"], [404, "http"],
  [201, "http"],
];

for (const [status, code] of statusCases) {
  test(`HTTP ${status} maps to ${code} for both actions`, async () => {
    for (const call of [checkSender, reportSender]) {
      const { fetchImpl } = createFetch(() =>
        jsonResponse({ message: `secret server text ${API_KEY}` }, { status }));
      const result = await call({ apiKey: API_KEY, email: "a@example.com", fetchImpl });
      assert.equal(result.status, "error");
      assert.equal(result.code, code);
      assert.ok(!JSON.stringify(result).includes("secret server text"));
      assertNoSecret(result);
    }
  });
}

test("429 exposes Retry-After seconds", async () => {
  const { fetchImpl } = createFetch(() =>
    jsonResponse({ message: "Too Many Attempts." }, { status: 429, headers: { "Retry-After": "3600" } }));
  const result = await checkSender({ apiKey: API_KEY, email: "a@example.com", fetchImpl });
  assert.equal(result.retryAfter, 3600);
});

test("parseRetryAfter handles seconds, dates and junk", () => {
  const now = Date.parse("2026-10-15T12:00:00Z");
  assert.equal(parseRetryAfter("120", now), 120);
  assert.equal(parseRetryAfter("Thu, 15 Oct 2026 12:01:00 GMT", now), 60);
  assert.equal(parseRetryAfter("Thu, 15 Oct 2026 11:00:00 GMT", now), 0);
  assert.equal(parseRetryAfter("soon", now), null);
  assert.equal(parseRetryAfter(null, now), null);
});

test("redirects are refused", async () => {
  for (const make of [
    () => ({ type: "opaqueredirect", status: 0, headers: new Headers() }),
    () => new Response(null, { status: 302, headers: { Location: "https://evil.example/" } }),
  ]) {
    const { fetchImpl } = createFetch(make);
    assert.equal((await checkSender({ apiKey: API_KEY, email: "a@example.com", fetchImpl })).code, "redirect");
    assert.equal((await reportSender({ apiKey: API_KEY, email: "a@example.com", fetchImpl })).code, "redirect");
  }
});

test("HTML and invalid JSON responses are bad responses", async () => {
  const responses = [
    () => new Response("<html>hi</html>", { status: 200, headers: { "Content-Type": "text/html" } }),
    () => new Response("{not json", { status: 200, headers: { "Content-Type": "application/json" } }),
    () => new Response("", { status: 200 }),
  ];
  for (const make of responses) {
    const { fetchImpl } = createFetch(make);
    assert.equal((await checkSender({ apiKey: API_KEY, email: "a@example.com", fetchImpl })).code, "bad-response");
    assert.equal((await reportSender({ apiKey: API_KEY, email: "a@example.com", fetchImpl })).code, "bad-response");
  }
});

test("network failures (offline/DNS/TLS) map to network", async () => {
  const { fetchImpl } = createFetch(() => { throw new TypeError("NetworkError when attempting to fetch resource."); });
  const check = await checkSender({ apiKey: API_KEY, email: "a@example.com", fetchImpl });
  const report = await reportSender({ apiKey: API_KEY, email: "a@example.com", fetchImpl });
  assert.deepEqual(check, { status: "error", code: "network" });
  assert.deepEqual(report, { status: "error", code: "network" });
});

function hangingFetch() {
  return createFetch((url, init) => new Promise((_, reject) => {
    init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  }));
}

test("timeout: check errors, report is unknown", async () => {
  const check = await checkSender({ apiKey: API_KEY, email: "a@example.com", fetchImpl: hangingFetch().fetchImpl, timeoutMs: 10 });
  assert.deepEqual(check, { status: "error", code: "timeout" });
  const report = await reportSender({ apiKey: API_KEY, email: "a@example.com", fetchImpl: hangingFetch().fetchImpl, timeoutMs: 10 });
  assert.deepEqual(report, { status: "unknown", code: "timeout" });
});

test("default timeout is 15 seconds", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = checkSender({ apiKey: API_KEY, email: "a@example.com", fetchImpl: hangingFetch().fetchImpl });
  await Promise.resolve();
  t.mock.timers.tick(14999);
  let settled = false;
  pending.then(() => { settled = true; });
  await new Promise((r) => setImmediate(r));
  assert.equal(settled, false);
  t.mock.timers.tick(1);
  assert.equal((await pending).code, "timeout");
});

test("external abort: check aborted, report unknown", async () => {
  const c1 = new AbortController();
  const p1 = checkSender({ apiKey: API_KEY, email: "a@example.com", fetchImpl: hangingFetch().fetchImpl, signal: c1.signal });
  c1.abort();
  assert.deepEqual(await p1, { status: "error", code: "aborted" });
  const c2 = new AbortController();
  const p2 = reportSender({ apiKey: API_KEY, email: "a@example.com", fetchImpl: hangingFetch().fetchImpl, signal: c2.signal });
  c2.abort();
  assert.deepEqual(await p2, { status: "unknown", code: "aborted" });
});

test("no automatic retry on failure", async () => {
  const { fetchImpl, calls } = createFetch(() => jsonResponse({}, { status: 500 }));
  await reportSender({ apiKey: API_KEY, email: "a@example.com", fetchImpl });
  await checkSender({ apiKey: API_KEY, email: "a@example.com", fetchImpl });
  assert.equal(calls.length, 2);
});

test("oversized bodies are rejected", async () => {
  const big = JSON.stringify({ data: "x".repeat(70 * 1024) });
  const { fetchImpl } = createFetch(() =>
    new Response(big, { status: 200, headers: { "Content-Type": "application/json" } }));
  assert.equal((await checkSender({ apiKey: API_KEY, email: "a@example.com", fetchImpl })).code, "bad-response");
});
