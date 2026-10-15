// Sender extraction: resolve the single displayed message and parse its
// author (From) into one normalized email address.

const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/;

export class SenderError extends Error {
  constructor(code) {
    super(code);
    this.name = "SenderError";
    this.code = code;
  }
}

/**
 * Returns the one message displayed in a tab, or throws a SenderError.
 * Accepts both the MV3 MessageList shape and a plain array.
 */
export async function getSingleDisplayedMessage(messenger, tabId) {
  let list;
  try {
    list = await messenger.messageDisplay.getDisplayedMessages(tabId);
  } catch {
    throw new SenderError("no-message");
  }
  const messages = Array.isArray(list) ? list : list?.messages;
  const moreId = Array.isArray(list) ? null : list?.id;
  if (moreId) {
    // More pages follow, so there are certainly several messages.
    try {
      await messenger.messages.abortList(moreId);
    } catch {
      // Ignore: the list is discarded either way.
    }
    throw new SenderError("multiple-messages");
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new SenderError("no-message");
  }
  if (messages.length > 1) {
    throw new SenderError("multiple-messages");
  }
  return messages[0];
}

/**
 * Normalizes a bare addr-spec: trims, rejects control characters and
 * missing parts, and lowercases only the domain.
 */
export function normalizeAddress(raw) {
  if (typeof raw !== "string") {
    throw new SenderError("invalid-sender");
  }
  const email = raw.trim();
  if (CONTROL_CHARS.test(email)) {
    throw new SenderError("invalid-sender");
  }
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) {
    throw new SenderError("invalid-sender");
  }
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (/\s/.test(domain) || domain.startsWith(".") || domain.endsWith(".")) {
    throw new SenderError("invalid-sender");
  }
  return `${local}@${domain.toLowerCase()}`;
}

/**
 * Parses a MessageHeader's author into exactly one email address.
 * `parseMailboxString` is messenger.messengerUtilities.parseMailboxString.
 */
export async function extractSender(header, parseMailboxString) {
  const author = header?.author;
  if (typeof author !== "string" || author.trim() === "") {
    throw new SenderError("no-sender");
  }
  if (CONTROL_CHARS.test(author)) {
    throw new SenderError("invalid-sender");
  }
  let parsed;
  try {
    parsed = await parseMailboxString(author, {
      expandMailingLists: false,
      preserveGroups: true,
    });
  } catch {
    throw new SenderError("invalid-sender");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new SenderError("no-sender");
  }
  if (parsed.length > 1) {
    throw new SenderError("multiple-senders");
  }
  const [mailbox] = parsed;
  if (Array.isArray(mailbox?.group)) {
    throw new SenderError("group-sender");
  }
  if (typeof mailbox?.email !== "string" || mailbox.email.trim() === "") {
    throw new SenderError("invalid-sender");
  }
  return normalizeAddress(mailbox.email);
}

/** Resolves {messageId, email} for the message displayed in a tab. */
export async function resolveSender(messenger, tabId) {
  const header = await getSingleDisplayedMessage(messenger, tabId);
  const email = await extractSender(
    header,
    (s, o) => messenger.messengerUtilities.parseMailboxString(s, o),
  );
  return { messageId: header.id, email };
}
