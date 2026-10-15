import { test } from "node:test";
import assert from "node:assert/strict";
import { describeError, describeReport, formatWait, needsSettings } from "../lib/describe.js";

test("timeout on report says outcome unknown", () => {
  assert.equal(describeReport({ status: "unknown", code: "timeout" }),
    "Outcome unknown; the report may have been received.");
});

test("failed report is never described as reported", () => {
  for (const code of ["network", "server", "unauthorized", "bad-response", "mismatch", "redirect"]) {
    assert.doesNotMatch(describeReport({ status: "error", code }), /^Reported/);
  }
});

test("missing key text", () => {
  assert.equal(describeError("check", { code: "no-key" }), "Add your API key in Settings.");
});

test("settings link for auth-related errors only", () => {
  assert.ok(needsSettings("unauthorized"));
  assert.ok(needsSettings("no-key"));
  assert.ok(needsSettings("forbidden"));
  assert.ok(!needsSettings("server"));
});

test("rate limit wording uses Retry-After", () => {
  assert.equal(describeError("check", { code: "rate-limited", retryAfter: 3600 }),
    "Usage limit reached. Try again in 60 minutes.");
  assert.equal(describeError("check", { code: "rate-limited", retryAfter: null }),
    "Usage limit reached. Try again later.");
  assert.equal(formatWait(1), "1 second");
  assert.equal(formatWait(7200), "2 hours");
});

test("unknown codes fall back to a generic message", () => {
  assert.equal(describeError("check", { code: "weird" }), "Something went wrong. Try again.");
  assert.equal(describeError("check", undefined), "Something went wrong. Try again.");
});
