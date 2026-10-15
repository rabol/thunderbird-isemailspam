// HTTP client for the IsEmailSpam API (https://isemailspam.com/use-api).
// All functions resolve to a result object and never reject. Results and
// errors never contain the API key, request URL or raw server text.

export const API_ORIGIN = "https://isemailspam.com";
export const CHECK_URL = `${API_ORIGIN}/api/check`;
export const REPORT_URL = `${API_ORIGIN}/api/report`;
export const TIMEOUT_MS = 15000;

const MAX_BODY_CHARS = 64 * 1024;

function sameAddress(a, b) {
  return typeof a === "string" && typeof b === "string" &&
    a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Parses Retry-After (delta-seconds or HTTP date) into seconds, or null. */
export function parseRetryAfter(value, now = Date.now()) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) {
    return null;
  }
  return Math.max(0, Math.ceil((date - now) / 1000));
}

function errorForStatus(response) {
  const status = response.status;
  if (status === 400) return { status: "error", code: "bad-request" };
  if (status === 401) return { status: "error", code: "unauthorized" };
  if (status === 403) return { status: "error", code: "forbidden" };
  if (status === 422) return { status: "error", code: "invalid" };
  if (status === 429) {
    return {
      status: "error",
      code: "rate-limited",
      retryAfter: parseRetryAfter(response.headers?.get?.("Retry-After")),
    };
  }
  if (status >= 500 && status <= 599) return { status: "error", code: "server" };
  return { status: "error", code: "http", httpStatus: status };
}

async function readJson(response) {
  const type = response.headers?.get?.("Content-Type") ?? "";
  if (!/^application\/(?:[\w.+-]+\+)?json\b/i.test(type.trim())) {
    return undefined;
  }
  let text;
  try {
    text = await response.text();
  } catch {
    return undefined;
  }
  if (typeof text !== "string" || text.length > MAX_BODY_CHARS) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Performs one fetch with a timeout, no redirects and no cookies.
 * Returns {response} or {error}.
 */
async function send(fetchImpl, url, init, { timeoutMs, signal }) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  try {
    const response = await fetchImpl(url, {
      ...init,
      redirect: "manual",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    if (response.type === "opaqueredirect" ||
        (response.status >= 300 && response.status < 400)) {
      return { error: { status: "error", code: "redirect" } };
    }
    return { response };
  } catch {
    if (timedOut) return { error: { status: "error", code: "timeout" } };
    if (controller.signal.aborted) return { error: { status: "error", code: "aborted" } };
    return { error: { status: "error", code: "network" } };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

function validCheck(json) {
  const data = json?.data;
  const e = data?.spam_email;
  const d = data?.spam_domain;
  if (typeof e?.is_spam !== "boolean" || typeof d?.is_spam !== "boolean") {
    return null;
  }
  if (typeof e.checked_email !== "string" || typeof d.checked_domain !== "string") {
    return null;
  }
  return { e, d };
}

/** Read-only blacklist lookup: GET /api/check?api_key=&email= */
export async function checkSender({
  apiKey, email, fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS, signal,
}) {
  const url = new URL(CHECK_URL);
  url.search = new URLSearchParams({ api_key: apiKey, email }).toString();
  const { response, error } = await send(fetchImpl, url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  }, { timeoutMs, signal });
  if (error) return error;
  if (response.status !== 200) return errorForStatus(response);

  const json = await readJson(response);
  const parsed = validCheck(json);
  if (!parsed) return { status: "error", code: "bad-response" };
  const domain = email.slice(email.lastIndexOf("@") + 1);
  if (!sameAddress(parsed.e.checked_email, email) ||
      !sameAddress(parsed.d.checked_domain, domain)) {
    return { status: "error", code: "mismatch" };
  }
  return {
    status: "ok",
    email: { checked: parsed.e.checked_email, isSpam: parsed.e.is_spam },
    domain: { checked: parsed.d.checked_domain, isSpam: parsed.d.is_spam },
  };
}

/** Spam report: POST /api/report with form fields api_key and email. */
export async function reportSender({
  apiKey, email, fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS, signal,
}) {
  const body = new URLSearchParams({ api_key: apiKey, email });
  const { response, error } = await send(fetchImpl, REPORT_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: body.toString(),
  }, { timeoutMs, signal });
  if (error) {
    // The request may have reached the server before the timeout/abort.
    if (error.code === "timeout" || error.code === "aborted") {
      return { status: "unknown", code: error.code };
    }
    return error;
  }
  if (response.status !== 200) return errorForStatus(response);

  const json = await readJson(response);
  const data = json?.data;
  if (data?.status !== "ok" || data?.type !== "email" ||
      typeof data?.data?.email !== "string") {
    return { status: "error", code: "bad-response" };
  }
  if (!sameAddress(data.data.email, email)) {
    return { status: "error", code: "mismatch" };
  }
  return { status: "ok", email: data.data.email };
}
