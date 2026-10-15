// Options page: API-key management and host-permission check.

import { getApiKey, removeApiKey, saveApiKey } from "../lib/settings.js";
import { API_ORIGIN } from "../lib/api.js";

const $ = (id) => document.getElementById(id);
const input = $("api-key");
const toggle = $("toggle");
const status = $("key-status");
const origins = [`${API_ORIGIN}/*`];

function setStatus(text, kind) {
  status.textContent = text;
  status.className = kind ?? "";
}

// Shows the stored key (masked unless Show is pressed) so a saved key is visible.
async function refreshStatus() {
  const key = await getApiKey(messenger.storage);
  input.value = key ?? "";
  setStatus(key ? "A key is saved." : "No key saved.");
}

async function refreshPermission() {
  let granted = true;
  try {
    granted = await messenger.permissions.contains({ origins });
  } catch {
    granted = false;
  }
  $("permission").hidden = granted;
}

$("key-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const result = await saveApiKey(messenger.storage, input.value);
    if (result.ok) {
      await refreshStatus();
      setStatus("Key saved.", "success");
    } else if (result.code === "empty") {
      setStatus("Enter a key to save. To delete the saved key, use Remove key.", "error");
    } else {
      setStatus("That key contains spaces or invalid characters.", "error");
    }
  } catch {
    setStatus("The key couldn't be saved.", "error");
  }
});

$("remove").addEventListener("click", async () => {
  try {
    await removeApiKey(messenger.storage);
    await refreshStatus();
    setStatus("Key removed.", "success");
  } catch {
    setStatus("The key couldn't be removed.", "error");
  }
});

toggle.addEventListener("click", () => {
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  toggle.textContent = show ? "Hide" : "Show";
  toggle.setAttribute("aria-pressed", String(show));
});

$("grant").addEventListener("click", async () => {
  try {
    await messenger.permissions.request({ origins });
  } catch {
    // Declined or unavailable; state is refreshed below.
  }
  await refreshPermission();
});

refreshStatus();
refreshPermission();
