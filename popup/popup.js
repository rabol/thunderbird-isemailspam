// Action popup: shows the sender, runs Check / Report via the background
// script and renders results as plain text.

import { describeError, describeReport, needsSettings } from "../lib/describe.js";

const $ = (id) => document.getElementById(id);
const els = {
  status: $("status"),
  details: $("details"),
  email: $("email"),
  actions: $("actions"),
  check: $("check"),
  report: $("report"),
  confirm: $("confirm"),
  confirmEmail: $("confirm-email"),
  confirmReport: $("confirm-report"),
  cancelReport: $("cancel-report"),
  checkResult: $("check-result"),
  reportResult: $("report-result"),
  settings: $("settings"),
};

// The message and sender this popup is bound to; never changes after load.
let ctx = null;
const busy = { check: false, report: false };

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function setStatus(text, isError = false) {
  els.status.textContent = text;
  els.status.classList.toggle("error", isError);
}

function updateButtons() {
  const ready = ctx?.hasKey === true;
  els.check.disabled = !ready || busy.check;
  els.report.disabled = !ready || busy.report;
  els.confirmReport.disabled = busy.report;
  els.check.textContent = busy.check ? "Checking…" : "Check sender";
  els.report.textContent = busy.report ? "Reporting…" : "Report sender as spam";
}

function settingsHint(container) {
  const p = el("p");
  const button = el("button", "Open Settings", "link");
  button.type = "button";
  button.addEventListener("click", openSettings);
  p.append(button);
  container.append(p);
}

function renderPending(action) {
  const container = action === "check" ? els.checkResult : els.reportResult;
  container.replaceChildren(el("p", action === "check" ? "Checking…" : "Reporting…"));
  container.setAttribute("aria-busy", "true");
  container.hidden = false;
}

function renderCheck(result) {
  const c = els.checkResult;
  c.removeAttribute("aria-busy");
  c.hidden = false;
  if (result?.status !== "ok") {
    c.replaceChildren(el("h2", "Check failed"), el("p", describeError("check", result), "error"));
    if (needsSettings(result?.code)) settingsHint(c);
    return;
  }
  const list = el("ul");
  const line = (label, value, isSpam) => {
    const li = el("li");
    li.append(`${label} `, el("span", value, "address"), ": ",
      el("strong", isSpam ? "listed as spam" : "not listed", isSpam ? "error" : undefined));
    return li;
  };
  list.append(
    line("Address", result.email.checked, result.email.isSpam),
    line("Domain", result.domain.checked, result.domain.isSpam),
  );
  c.replaceChildren(el("h2", "Check result"), list,
    el("p", "Not being listed doesn't prove that a message is safe.", "note"));
}

function renderReport(result) {
  const c = els.reportResult;
  c.removeAttribute("aria-busy");
  c.hidden = false;
  const ok = result?.status === "ok";
  const unknown = result?.status === "unknown";
  c.replaceChildren(
    el("h2", ok ? "Report sent" : unknown ? "Report status unknown" : "Report failed"),
    el("p", describeReport(result), ok ? "success" : "error"),
  );
  if (!ok && !unknown && needsSettings(result?.code)) settingsHint(c);
}

const renderers = { check: renderCheck, report: renderReport };

async function follow(action, request) {
  busy[action] = true;
  updateButtons();
  renderPending(action);
  let result;
  try {
    result = await messenger.runtime.sendMessage(request);
  } catch {
    result = { status: "error", code: "internal" };
  }
  busy[action] = false;
  if (result === null || result === undefined) {
    // Nothing in flight (e.g. background restarted); clear the pending view.
    const c = action === "check" ? els.checkResult : els.reportResult;
    c.hidden = true;
    c.removeAttribute("aria-busy");
  } else {
    renderers[action](result);
  }
  updateButtons();
}

function run(action) {
  if (!ctx || busy[action]) return;
  return follow(action, {
    type: "run",
    action,
    tabId: ctx.tabId,
    messageId: ctx.messageId,
    email: ctx.email,
    confirmed: action === "report" ? true : undefined,
  });
}

function showConfirm(show) {
  els.confirm.hidden = !show;
  els.actions.hidden = show;
  if (show) els.confirmReport.focus();
  else els.report.focus();
}

async function openSettings() {
  try {
    await messenger.runtime.openOptionsPage();
  } finally {
    window.close();
  }
}

async function init() {
  els.settings.addEventListener("click", openSettings);
  els.check.addEventListener("click", () => run("check"));
  els.report.addEventListener("click", () => {
    els.confirmEmail.textContent = ctx.email;
    showConfirm(true);
  });
  els.cancelReport.addEventListener("click", () => showConfirm(false));
  els.confirmReport.addEventListener("click", () => {
    showConfirm(false);
    run("report");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.confirm.hidden) {
      event.preventDefault();
      showConfirm(false);
    }
  });

  let tab;
  try {
    [tab] = await messenger.tabs.query({ active: true, currentWindow: true });
  } catch {
    tab = undefined;
  }
  if (!tab) {
    setStatus(describeError(null, { code: "no-message" }), true);
    return;
  }

  let response;
  try {
    response = await messenger.runtime.sendMessage({ type: "context", tabId: tab.id });
  } catch {
    response = { ok: false, code: "internal" };
  }
  if (!response?.ok) {
    setStatus(describeError(null, response), true);
    return;
  }

  ctx = {
    tabId: tab.id,
    messageId: response.messageId,
    email: response.email,
    hasKey: response.hasKey,
  };
  els.email.textContent = ctx.email;
  els.details.hidden = false;
  if (ctx.hasKey) {
    setStatus("");
  } else {
    setStatus(describeError(null, { code: "no-key" }), true);
  }
  updateButtons();

  // Restore results or in-flight requests from earlier in this session.
  for (const [action, state] of Object.entries(response.results ?? {})) {
    if (!renderers[action]) continue;
    if (state.pending) {
      follow(action, { type: "wait", action, messageId: ctx.messageId, email: ctx.email });
    } else if (state.result) {
      renderers[action](state.result);
    }
  }
}

init();
