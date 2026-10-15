import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractSender, getSingleDisplayedMessage, normalizeAddress, resolveSender, SenderError,
} from "../lib/sender.js";
import { createMessenger, fakeParseMailboxString, withOwner } from "./helpers.js";

const extract = (author) => extractSender({ author }, fakeParseMailboxString);

async function rejectsWith(promise, code) {
  await assert.rejects(promise, (e) => e instanceof SenderError && e.code === code);
}

test("parses bare and named mailboxes", async () => {
  assert.equal(await extract("alice@example.com"), "alice@example.com");
  assert.equal(await extract("Alice <alice@example.com>"), "alice@example.com");
  assert.equal(await extract("  Alice   <  alice@example.com > "), "alice@example.com");
});

test("quoted display name with comma is one mailbox", async () => {
  assert.equal(await extract('"Doe, John" <john@example.com>'), "john@example.com");
});

test("encoded and Unicode display names", async () => {
  assert.equal(await extract("=?UTF-8?B?w4XDuMOm?= <x@example.com>"), "x@example.com");
  assert.equal(await extract("Søren Ærø <soren@example.dk>"), "soren@example.dk");
});

test("plus addresses and local-part case are preserved; domain lowercased", async () => {
  assert.equal(await extract("<John.Doe+Tag@Example.COM>"), "John.Doe+Tag@example.com");
});

test("international addresses are accepted", async () => {
  assert.equal(await extract("<jörg@bücher.de>"), "jörg@bücher.de");
  assert.equal(await extract("用户@例子.广告"), "用户@例子.广告");
});

test("rejects missing author", async () => {
  await rejectsWith(extractSender({}, fakeParseMailboxString), "no-sender");
  await rejectsWith(extract(""), "no-sender");
  await rejectsWith(extract("   "), "no-sender");
});

test("rejects multiple authors", async () => {
  await rejectsWith(extract("a@example.com, b@example.com"), "multiple-senders");
});

test("rejects groups", async () => {
  await rejectsWith(extract("Team: a@example.com, b@example.com;"), "group-sender");
  await rejectsWith(extract("Undisclosed recipients:;"), "group-sender");
});

test("rejects malformed and control characters", async () => {
  await rejectsWith(extract("not an address"), "invalid-sender");
  await rejectsWith(extract("Name <@example.com>"), "invalid-sender");
  await rejectsWith(extract("Name <user@>"), "invalid-sender");
  await rejectsWith(extract("a@exa\u0000mple.com"), "invalid-sender");
  await rejectsWith(extract("Evil\r\nBcc: x <a@example.com>"), "invalid-sender");
});

test("passes options that disable mailing-list expansion and keep groups", async () => {
  let seen;
  await extractSender({ author: "a@example.com" }, async (s, o) => {
    seen = o;
    return [{ email: s }];
  });
  assert.deepEqual(seen, { expandMailingLists: false, preserveGroups: true });
});

test("parser failure becomes invalid-sender", async () => {
  await rejectsWith(
    extractSender({ author: "a@b.c" }, async () => { throw new Error("boom"); }),
    "invalid-sender",
  );
});

test("normalizeAddress rejects non-strings", () => {
  assert.throws(() => normalizeAddress(undefined), SenderError);
});

test("getSingleDisplayedMessage handles MessageList, arrays and pagination", async () => {
  const m = withOwner(createMessenger({
    tabs: {
      1: [{ id: 10, author: "a@example.com" }],
      2: [],
      3: [{ id: 1 }, { id: 2 }],
      4: { id: "list-1", messages: [{ id: 1 }] },
      5: new Error("gone"),
    },
  }));
  assert.equal((await getSingleDisplayedMessage(m, 1)).id, 10);
  await rejectsWith(getSingleDisplayedMessage(m, 2), "no-message");
  await rejectsWith(getSingleDisplayedMessage(m, 3), "multiple-messages");
  await rejectsWith(getSingleDisplayedMessage(m, 4), "multiple-messages");
  assert.deepEqual(m.calls.abortList, ["list-1"]);
  await rejectsWith(getSingleDisplayedMessage(m, 5), "no-message");

  const plain = { messageDisplay: { getDisplayedMessages: async () => [{ id: 7 }] } };
  assert.equal((await getSingleDisplayedMessage(plain, 1)).id, 7);
});

test("resolveSender uses only the author header", async () => {
  const m = withOwner(createMessenger({
    tabs: {
      1: [{
        id: 5,
        author: "Real <real@example.com>",
        recipients: ["other@example.com"],
        subject: "hello",
      }],
    },
  }));
  assert.deepEqual(await resolveSender(m, 1), { messageId: 5, email: "real@example.com" });
});
