// Maps result/error codes to user-facing text. Never includes server text.

const MESSAGES = {
  "no-message": "Open a single message to use IsEmailSpam.",
  "multiple-messages": "Select just one message. Checking several messages at once isn't supported.",
  "no-sender": "This message has no From address.",
  "multiple-senders": "The From header lists more than one address, so there's no single sender to use.",
  "group-sender": "The From header contains an address group, which can't be used.",
  "invalid-sender": "The From address couldn't be read as a valid email address.",
  "no-key": "Add your API key in Settings.",
  "permission-denied": "IsEmailSpam isn't allowed to contact isemailspam.com. Grant access in Settings.",
  "message-changed": "The displayed message changed. Reopen IsEmailSpam and try again.",
  "bad-request": "The service rejected the request.",
  unauthorized: "Your API key wasn't accepted. Check it in Settings.",
  forbidden: "Your account or network isn't allowed to use the API. Check Settings or contact IsEmailSpam support.",
  invalid: "The service rejected this address. It may be invalid or not supported.",
  "rate-limited": "Usage limit reached. Try again later.",
  server: "IsEmailSpam had a server problem. Try again later.",
  http: "The service returned an unexpected status.",
  network: "Couldn't reach isemailspam.com. Check your connection and try again.",
  timeout: "The request timed out. Try again.",
  aborted: "The request was cancelled.",
  redirect: "The service tried to redirect the request, so it was stopped.",
  "bad-response": "The service returned an unexpected response.",
  mismatch: "The service's response was for a different address, so it can't be trusted.",
  internal: "Something went wrong. Try again.",
};

const SETTINGS_CODES = new Set(["no-key", "unauthorized", "forbidden", "permission-denied"]);

export function needsSettings(code) {
  return SETTINGS_CODES.has(code);
}

export function formatWait(seconds) {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 120) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hours`;
}

export function describeError(action, result) {
  const code = result?.code ?? "internal";
  if (code === "rate-limited" && Number.isFinite(result.retryAfter)) {
    return `Usage limit reached. Try again in ${formatWait(result.retryAfter)}.`;
  }
  if (action === "report") {
    if (code === "network") {
      return "Couldn't reach isemailspam.com. The report was not confirmed; you can try again.";
    }
  }
  if (action === "check" && code === "timeout") {
    return "The check timed out. Try again.";
  }
  return MESSAGES[code] ?? MESSAGES.internal;
}

/** Text for a report result. */
export function describeReport(result) {
  if (result?.status === "ok") return "Reported as spam.";
  if (result?.status === "unknown") {
    return "Outcome unknown; the report may have been received.";
  }
  return describeError("report", result);
}
